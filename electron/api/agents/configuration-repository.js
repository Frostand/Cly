import { randomUUID } from "node:crypto";
import { parseAgentConfigurationInput } from "./configuration-schema.js";

const parseJson = (value) => JSON.parse(value);

const mapRole = (row) => ({
  id: row.id,
  role: row.role,
  instanceCount: row.instance_count,
  maxParallel: row.max_parallel,
  provider: row.provider,
  model: row.model,
  reasoningLevel: row.reasoning_level,
  budget: {
    maxInputTokens: row.max_input_tokens,
    maxOutputTokens: row.max_output_tokens,
    maxCostMinorUnits: row.max_cost_minor_units,
    maxRuntimeMs: row.max_runtime_ms,
  },
  allowedTools: parseJson(row.allowed_tools_json),
  allowedContextSources: parseJson(row.allowed_context_sources_json),
  allowedFileGlobs: parseJson(row.allowed_file_globs_json),
  permissions: parseJson(row.permissions_json),
  approvalCheckpoints: parseJson(row.approval_checkpoints_json),
  ...(row.fallback_model ? { fallbackModel: row.fallback_model } : {}),
});

const mapConfiguration = (db, row) =>
  row
    ? {
        id: row.id,
        projectId: row.project_id,
        name: row.name,
        maxParallel: row.max_parallel,
        maxTotalBudget: {
          maxInputTokens: row.max_input_tokens,
          maxOutputTokens: row.max_output_tokens,
          maxCostMinorUnits: row.max_cost_minor_units,
          maxRuntimeMs: row.max_runtime_ms,
        },
        partialFailurePolicy: row.partial_failure_policy,
        roles: db
          .prepare(
            `SELECT * FROM agent_role_configurations
             WHERE configuration_id = ? AND project_id = ?
             ORDER BY position, id`,
          )
          .all(row.id, row.project_id)
          .map(mapRole),
        revision: row.revision,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    : null;

const ensureProject = (db, projectId) => {
  if (!db.prepare("SELECT id FROM projects WHERE id = ?").get(projectId)) {
    throw new Error("Project was not found.");
  }
};

const insertRoles = (db, projectId, configurationId, roles) => {
  const statement = db.prepare(
    `INSERT INTO agent_role_configurations
     (configuration_id, project_id, id, position, role, instance_count,
      max_parallel, provider, model, reasoning_level, max_input_tokens,
      max_output_tokens, max_cost_minor_units, max_runtime_ms,
      allowed_tools_json, allowed_context_sources_json,
      allowed_file_globs_json, permissions_json, approval_checkpoints_json,
      fallback_model)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  roles.forEach((role, position) => {
    statement.run(
      configurationId,
      projectId,
      role.id,
      position,
      role.role,
      role.instanceCount,
      role.maxParallel,
      role.provider,
      role.model,
      role.reasoningLevel,
      role.budget.maxInputTokens,
      role.budget.maxOutputTokens,
      role.budget.maxCostMinorUnits,
      role.budget.maxRuntimeMs,
      JSON.stringify(role.allowedTools),
      JSON.stringify(role.allowedContextSources),
      JSON.stringify(role.allowedFileGlobs),
      JSON.stringify(role.permissions),
      JSON.stringify(role.approvalCheckpoints),
      role.fallbackModel ?? null,
    );
  });
};

const revisionConflict = () =>
  new Error("Agent configuration revision conflict.");

const validateExpectedRevision = (expectedRevision) => {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    throw new TypeError("expectedRevision must be a positive integer.");
  }
};

export function createAgentConfigurationRepository({
  db,
  clock = () => new Date().toISOString(),
  createId = randomUUID,
}) {
  const get = (projectId, configurationId) =>
    mapConfiguration(
      db,
      db
        .prepare(
          `SELECT * FROM agent_configurations
           WHERE id = ? AND project_id = ?`,
        )
        .get(configurationId, projectId),
    );

  return {
    list(projectId) {
      ensureProject(db, projectId);
      return db
        .prepare(
          `SELECT * FROM agent_configurations
           WHERE project_id = ? ORDER BY updated_at DESC, id`,
        )
        .all(projectId)
        .map((row) => mapConfiguration(db, row));
    },

    get,

    create(projectId, input) {
      const parsed = parseAgentConfigurationInput(input);
      ensureProject(db, projectId);
      const id = createId();
      const now = clock();
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare(
          `INSERT INTO agent_configurations
           (id, project_id, name, max_parallel, max_input_tokens,
            max_output_tokens, max_cost_minor_units, max_runtime_ms,
            partial_failure_policy, revision, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        ).run(
          id,
          projectId,
          parsed.name,
          parsed.maxParallel,
          parsed.maxTotalBudget.maxInputTokens,
          parsed.maxTotalBudget.maxOutputTokens,
          parsed.maxTotalBudget.maxCostMinorUnits,
          parsed.maxTotalBudget.maxRuntimeMs,
          parsed.partialFailurePolicy,
          now,
          now,
        );
        insertRoles(db, projectId, id, parsed.roles);
        db.exec("COMMIT");
        return get(projectId, id);
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },

    update(projectId, configurationId, expectedRevision, input) {
      const parsed = parseAgentConfigurationInput(input);
      validateExpectedRevision(expectedRevision);
      ensureProject(db, projectId);
      const now = clock();
      db.exec("BEGIN IMMEDIATE");
      try {
        const update = db
          .prepare(
            `UPDATE agent_configurations
             SET name = ?, max_parallel = ?, max_input_tokens = ?,
                 max_output_tokens = ?, max_cost_minor_units = ?,
                 max_runtime_ms = ?, partial_failure_policy = ?,
                 revision = revision + 1, updated_at = ?
             WHERE id = ? AND project_id = ? AND revision = ?`,
          )
          .run(
            parsed.name,
            parsed.maxParallel,
            parsed.maxTotalBudget.maxInputTokens,
            parsed.maxTotalBudget.maxOutputTokens,
            parsed.maxTotalBudget.maxCostMinorUnits,
            parsed.maxTotalBudget.maxRuntimeMs,
            parsed.partialFailurePolicy,
            now,
            configurationId,
            projectId,
            expectedRevision,
          );
        if (update.changes !== 1) throw revisionConflict();
        db.prepare(
          `DELETE FROM agent_role_configurations
           WHERE configuration_id = ? AND project_id = ?`,
        ).run(configurationId, projectId);
        insertRoles(db, projectId, configurationId, parsed.roles);
        db.exec("COMMIT");
        return get(projectId, configurationId);
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },

    remove(projectId, configurationId, expectedRevision) {
      validateExpectedRevision(expectedRevision);
      ensureProject(db, projectId);
      db.exec("BEGIN IMMEDIATE");
      try {
        const result = db
          .prepare(
            `DELETE FROM agent_configurations
             WHERE id = ? AND project_id = ? AND revision = ?`,
          )
          .run(configurationId, projectId, expectedRevision);
        if (result.changes !== 1) throw revisionConflict();
        db.exec("COMMIT");
        return { id: configurationId, revision: expectedRevision };
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
