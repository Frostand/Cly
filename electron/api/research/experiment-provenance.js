import { createHash } from "node:crypto";
import { z } from "zod";

const actorSchema = z.object({
  actorType: z
    .enum(["human", "agent", "system", "integration"])
    .default("human"),
  actorId: z.string().trim().min(1).max(200).default("local-user"),
});

const datasetRefSchema = z
  .object({
    id: z.string().trim().min(1).max(4_000),
    version: z.string().trim().min(1).max(1_000),
    contentHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .optional(),
    uri: z.string().trim().min(1).max(4_000).optional(),
  })
  .strict();

const codeRefSchema = z
  .object({
    path: z.string().trim().min(1).max(4_000),
    contentHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .optional(),
  })
  .strict();

const definitionSchema = z
  .object({
    hypothesis: z.string().trim().min(1).max(10_000),
    objective: z.string().trim().max(10_000).default(""),
    configuration: z.record(z.string(), z.unknown()).default({}),
    datasets: z.array(datasetRefSchema).max(100).default([]),
    declaredMetrics: z
      .array(z.string().trim().min(1).max(500))
      .max(100)
      .default([]),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      new Set(value.datasets.map((dataset) => dataset.id)).size !==
      value.datasets.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["datasets"],
        message: "Dataset references must be unique by id.",
      });
    }
    if (new Set(value.declaredMetrics).size !== value.declaredMetrics.length) {
      context.addIssue({
        code: "custom",
        path: ["declaredMetrics"],
        message: "Declared metric names must be unique.",
      });
    }
  });

export const experimentCreateInputSchema = z
  .object({
    projectId: z.string().trim().min(1),
    id: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).max(500),
    description: z.string().trim().max(10_000).default(""),
    definition: definitionSchema,
  })
  .merge(actorSchema)
  .strict();

export const experimentDefinitionInputSchema = z
  .object({
    projectId: z.string().trim().min(1),
    experimentId: z.string().trim().min(1),
    definition: definitionSchema,
  })
  .merge(actorSchema)
  .strict();

export const runCreateInputSchema = z
  .object({
    projectId: z.string().trim().min(1),
    experimentId: z.string().trim().min(1),
    id: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).max(500),
    description: z.string().trim().max(10_000).default(""),
    status: z
      .enum(["planned", "running", "completed", "failed", "cancelled"])
      .default("running"),
    commitSha: z.string().regex(/^[a-f0-9]{7,64}$/i),
    configuration: z.record(z.string(), z.unknown()).optional(),
    datasets: z.array(datasetRefSchema).max(100).optional(),
    codeRefs: z.array(codeRefSchema).max(500).default([]),
    startedAt: z.iso.datetime().optional(),
    finishedAt: z.iso.datetime().nullable().optional(),
    exitCode: z.number().int().nullable().optional(),
  })
  .merge(actorSchema)
  .strict()
  .superRefine((value, context) => {
    const terminal = ["completed", "failed", "cancelled"].includes(
      value.status,
    );
    if (terminal && !value.finishedAt) {
      context.addIssue({
        code: "custom",
        path: ["finishedAt"],
        message: "A terminal run requires finishedAt.",
      });
    }
    if (!terminal && value.finishedAt) {
      context.addIssue({
        code: "custom",
        path: ["finishedAt"],
        message: "A non-terminal run cannot have finishedAt.",
      });
    }
    if (!terminal && value.exitCode !== undefined && value.exitCode !== null) {
      context.addIssue({
        code: "custom",
        path: ["exitCode"],
        message: "A non-terminal run cannot have an exit code.",
      });
    }
  });

export const runStatusInputSchema = z
  .object({
    projectId: z.string().trim().min(1),
    runId: z.string().trim().min(1),
    status: z.enum(["running", "completed", "failed", "cancelled"]),
    finishedAt: z.iso.datetime().nullable().optional(),
    exitCode: z.number().int().nullable().optional(),
  })
  .merge(actorSchema)
  .strict()
  .superRefine((value, context) => {
    const terminal = ["completed", "failed", "cancelled"].includes(
      value.status,
    );
    if (terminal && !value.finishedAt) {
      context.addIssue({
        code: "custom",
        path: ["finishedAt"],
        message: "A terminal run requires finishedAt.",
      });
    }
    if (!terminal && value.finishedAt) {
      context.addIssue({
        code: "custom",
        path: ["finishedAt"],
        message: "A non-terminal run cannot have finishedAt.",
      });
    }
    if (!terminal && value.exitCode !== undefined && value.exitCode !== null) {
      context.addIssue({
        code: "custom",
        path: ["exitCode"],
        message: "A non-terminal run cannot have an exit code.",
      });
    }
  });

const metricSchema = z
  .object({
    name: z.string().trim().min(1).max(500),
    value: z.number().finite(),
    unit: z.string().trim().min(1).max(100).nullable().optional(),
    step: z.number().int().min(0).nullable().optional(),
    loggedAt: z.iso.datetime().optional(),
  })
  .strict();

export const metricsInputSchema = z
  .object({
    projectId: z.string().trim().min(1),
    runId: z.string().trim().min(1),
    metrics: z.array(metricSchema).min(1).max(1_000),
  })
  .merge(actorSchema)
  .strict();

export const artifactInputSchema = z
  .object({
    projectId: z.string().trim().min(1),
    runId: z.string().trim().min(1),
    id: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).max(500),
    description: z.string().trim().max(10_000).default(""),
    kind: z.enum(["figure", "table", "file"]),
    path: z.string().trim().min(1).max(4_000),
    mediaType: z.string().trim().min(1).max(500),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/i),
    generatorPath: z.string().trim().min(1).max(4_000).nullable().optional(),
    generatorHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .nullable()
      .optional(),
    generatedAt: z.iso.datetime().optional(),
  })
  .merge(actorSchema)
  .strict();

export const stalenessInputSchema = z
  .object({
    projectId: z.string().trim().min(1),
    artifactId: z.string().trim().min(1),
    commitSha: z
      .string()
      .regex(/^[a-f0-9]{7,64}$/i)
      .optional(),
    configuration: z.record(z.string(), z.unknown()).optional(),
    datasets: z.array(datasetRefSchema).max(100).optional(),
    codeRefs: z.array(codeRefSchema).max(500).optional(),
  })
  .merge(actorSchema)
  .strict();

const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  const json = JSON.stringify(value);
  if (json === undefined) throw new Error("Values must be JSON serializable.");
  return json;
};

const hashJson = (value) =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");

const parseJson = (value) => JSON.parse(value);

const mapDefinition = (row) => ({
  id: row.id,
  projectId: row.project_id,
  experimentId: row.experiment_id,
  version: row.version,
  hypothesis: row.hypothesis,
  objective: row.objective,
  configuration: parseJson(row.configuration_json),
  datasets: parseJson(row.datasets_json),
  declaredMetrics: parseJson(row.declared_metrics_json),
  definitionHash: row.definition_hash,
  provenanceEventId: row.provenance_event_id,
  createdAt: row.created_at,
});

const mapMetric = (row) => ({
  id: row.id,
  projectId: row.project_id,
  runId: row.run_id,
  name: row.name,
  value: row.value,
  unit: row.unit ?? null,
  step: row.step ?? null,
  loggedAt: row.logged_at,
  provenanceEventId: row.provenance_event_id,
});

const mapArtifact = (row) => ({
  id: row.id,
  projectId: row.project_id,
  runId: row.run_id,
  title: row.title,
  description: row.description,
  kind: row.kind,
  path: row.path,
  mediaType: row.media_type,
  contentHash: row.content_hash,
  generatorPath: row.generator_path ?? null,
  generatorHash: row.generator_hash ?? null,
  inputFingerprint: row.input_fingerprint,
  state: row.state,
  staleReasons: parseJson(row.stale_reasons_json),
  provenanceEventId: row.provenance_event_id,
  generatedAt: row.generated_at,
  checkedAt: row.checked_at,
});

export function createExperimentProvenanceMethods({
  database,
  ensureProject,
  insertProvenance,
  clock,
  createId,
}) {
  const getExperiment = (projectId, experimentId) => {
    const experiment = database
      .prepare(
        "SELECT * FROM research_objects WHERE id = ? AND project_id = ? AND type = 'experiment'",
      )
      .get(experimentId, projectId);
    if (!experiment)
      throw new Error("Experiment does not belong to the project.");
    return experiment;
  };

  const getRun = (projectId, runId) => {
    const run = database
      .prepare("SELECT * FROM experiment_runs WHERE id = ? AND project_id = ?")
      .get(runId, projectId);
    if (!run) throw new Error("Run does not belong to the project.");
    return run;
  };

  const latestDefinition = (projectId, experimentId) => {
    const row = database
      .prepare(
        `SELECT * FROM experiment_definition_versions
         WHERE project_id = ? AND experiment_id = ?
         ORDER BY version DESC LIMIT 1`,
      )
      .get(projectId, experimentId);
    if (!row) throw new Error("Experiment does not have a definition.");
    return row;
  };

  const inputSnapshot = (
    definitionHash,
    commitSha,
    configuration,
    datasets,
    codeRefs,
  ) => ({
    definitionHash,
    commitSha: commitSha.toLowerCase(),
    configuration,
    datasets,
    codeRefs,
  });

  const mapRun = (row) => ({
    id: row.id,
    projectId: row.project_id,
    experimentId: row.experiment_id,
    title: row.title,
    description: row.description,
    definitionVersionId: row.definition_version_id,
    status: row.status,
    commitSha: row.commit_sha,
    configuration: parseJson(row.configuration_json),
    datasets: parseJson(row.datasets_json),
    codeRefs: parseJson(row.code_refs_json),
    inputFingerprint: row.input_fingerprint,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? null,
    exitCode: row.exit_code ?? null,
    provenanceEventId: row.provenance_event_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  const getRunDetail = (projectId, runId) => {
    const run = database
      .prepare(
        `SELECT run.*, object.title, object.description
         FROM experiment_runs run JOIN research_objects object ON object.id = run.id
         WHERE run.id = ? AND run.project_id = ?`,
      )
      .get(runId, projectId);
    if (!run) throw new Error("Run does not belong to the project.");
    return {
      ...mapRun(run),
      definition: mapDefinition(
        database
          .prepare("SELECT * FROM experiment_definition_versions WHERE id = ?")
          .get(run.definition_version_id),
      ),
      metrics: database
        .prepare(
          "SELECT * FROM run_metrics WHERE project_id = ? AND run_id = ? ORDER BY name, step, logged_at, id",
        )
        .all(projectId, runId)
        .map(mapMetric),
      artifacts: database
        .prepare(
          `SELECT artifact.*, object.title, object.description
           FROM run_artifacts artifact JOIN research_objects object ON object.id = artifact.id
           WHERE artifact.project_id = ? AND artifact.run_id = ?
           ORDER BY artifact.generated_at, artifact.id`,
        )
        .all(projectId, runId)
        .map(mapArtifact),
    };
  };

  const buildExperimentLineage = (projectId, experimentId) => {
    const experiment = getExperiment(projectId, experimentId);
    const definitions = database
      .prepare(
        `SELECT * FROM experiment_definition_versions
         WHERE project_id = ? AND experiment_id = ? ORDER BY version`,
      )
      .all(projectId, experimentId)
      .map(mapDefinition);
    const runIds = database
      .prepare(
        `SELECT id FROM experiment_runs WHERE project_id = ? AND experiment_id = ?
         ORDER BY started_at, id`,
      )
      .all(projectId, experimentId);
    return {
      experiment: {
        id: experiment.id,
        projectId: experiment.project_id,
        title: experiment.title,
        description: experiment.description,
      },
      definitions,
      runs: runIds.map(({ id }) => getRunDetail(projectId, id)),
    };
  };

  const insertDefinition = (parsed, experimentId, now) => {
    const version =
      Number(
        database
          .prepare(
            `SELECT MAX(version) AS version FROM experiment_definition_versions
             WHERE project_id = ? AND experiment_id = ?`,
          )
          .get(parsed.projectId, experimentId)?.version ?? 0,
      ) + 1;
    const id = createId();
    const normalized = definitionSchema.parse(parsed.definition);
    const definitionHash = hashJson(normalized);
    const event = insertProvenance(
      {
        id: createId(),
        projectId: parsed.projectId,
        objectId: experimentId,
        action:
          version === 1
            ? "experiment.definition.created"
            : "experiment.definition.revised",
        actorType: parsed.actorType,
        actorId: parsed.actorId,
        metadata: { version, definitionHash },
      },
      now,
    );
    database
      .prepare(
        `INSERT INTO experiment_definition_versions
         (id, project_id, experiment_id, version, hypothesis, objective,
          configuration_json, datasets_json, declared_metrics_json, definition_hash,
          provenance_event_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        parsed.projectId,
        experimentId,
        version,
        normalized.hypothesis,
        normalized.objective,
        canonicalJson(normalized.configuration),
        canonicalJson(normalized.datasets),
        canonicalJson(normalized.declaredMetrics),
        definitionHash,
        event.id,
        now,
      );
    return mapDefinition(
      database
        .prepare("SELECT * FROM experiment_definition_versions WHERE id = ?")
        .get(id),
    );
  };

  return {
    createExperiment(input) {
      const parsed = experimentCreateInputSchema.parse(input);
      ensureProject(parsed.projectId);
      const id = parsed.id ?? createId();
      const now = clock();
      database.exec("BEGIN IMMEDIATE");
      try {
        database
          .prepare(
            `INSERT INTO research_objects
             (id, project_id, type, title, description, payload, origin, review_state,
              reviewed_by, reviewed_at, created_at, updated_at)
             VALUES (?, ?, 'experiment', ?, ?, ?, 'human', 'unreviewed', NULL, NULL, ?, ?)`,
          )
          .run(
            id,
            parsed.projectId,
            parsed.title,
            parsed.description,
            JSON.stringify({
              kind: "experiment",
              hypothesis: parsed.definition.hypothesis,
            }),
            now,
            now,
          );
        insertProvenance(
          {
            id: createId(),
            projectId: parsed.projectId,
            objectId: id,
            action: "experiment.created",
            actorType: parsed.actorType,
            actorId: parsed.actorId,
          },
          now,
        );
        const definition = insertDefinition(parsed, id, now);
        database.exec("COMMIT");
        return {
          id,
          projectId: parsed.projectId,
          title: parsed.title,
          description: parsed.description,
          definition,
        };
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },

    reviseExperimentDefinition(input) {
      const parsed = experimentDefinitionInputSchema.parse(input);
      ensureProject(parsed.projectId);
      getExperiment(parsed.projectId, parsed.experimentId);
      const now = clock();
      database.exec("BEGIN IMMEDIATE");
      try {
        const definition = insertDefinition(parsed, parsed.experimentId, now);
        database
          .prepare(
            "UPDATE research_objects SET payload = ?, updated_at = ? WHERE id = ?",
          )
          .run(
            JSON.stringify({
              kind: "experiment",
              hypothesis: parsed.definition.hypothesis,
            }),
            now,
            parsed.experimentId,
          );
        const artifacts = database
          .prepare(
            `SELECT artifact.id, artifact.stale_reasons_json, definition.definition_hash
             FROM run_artifacts artifact
             JOIN experiment_runs run ON run.id = artifact.run_id
             JOIN experiment_definition_versions definition
               ON definition.id = run.definition_version_id
             WHERE artifact.project_id = ? AND run.experiment_id = ?
               AND definition.definition_hash <> ?`,
          )
          .all(
            parsed.projectId,
            parsed.experimentId,
            definition.definitionHash,
          );
        for (const artifact of artifacts) {
          const reasons = [
            ...parseJson(artifact.stale_reasons_json).filter(
              (reason) => reason.kind !== "experiment-definition",
            ),
            {
              kind: "experiment-definition",
              captured: artifact.definition_hash,
              current: definition.definitionHash,
            },
          ];
          database
            .prepare(
              `UPDATE run_artifacts
               SET state = 'stale', stale_reasons_json = ?, checked_at = ?
               WHERE id = ? AND project_id = ?`,
            )
            .run(canonicalJson(reasons), now, artifact.id, parsed.projectId);
          insertProvenance(
            {
              id: createId(),
              projectId: parsed.projectId,
              objectId: artifact.id,
              action: "artifact.marked-stale",
              actorType: "system",
              actorId: "experiment-definition-watcher",
              metadata: { reasons },
            },
            now,
          );
        }
        database.exec("COMMIT");
        return definition;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },

    createExperimentRun(input) {
      const parsed = runCreateInputSchema.parse(input);
      ensureProject(parsed.projectId);
      getExperiment(parsed.projectId, parsed.experimentId);
      const definition = latestDefinition(
        parsed.projectId,
        parsed.experimentId,
      );
      const definitionValue = mapDefinition(definition);
      const configuration =
        parsed.configuration ?? definitionValue.configuration;
      const datasets = parsed.datasets ?? definitionValue.datasets;
      const snapshot = inputSnapshot(
        definition.definition_hash,
        parsed.commitSha,
        configuration,
        datasets,
        parsed.codeRefs,
      );
      const id = parsed.id ?? createId();
      const now = clock();
      const startedAt = parsed.startedAt ?? now;
      database.exec("BEGIN IMMEDIATE");
      try {
        database
          .prepare(
            `INSERT INTO research_objects
             (id, project_id, type, title, description, payload, origin, review_state,
              reviewed_by, reviewed_at, created_at, updated_at)
             VALUES (?, ?, 'run', ?, ?, ?, 'system', 'unreviewed', NULL, NULL, ?, ?)`,
          )
          .run(
            id,
            parsed.projectId,
            parsed.title,
            parsed.description,
            JSON.stringify({
              kind: "run",
              commitSha: parsed.commitSha,
              status: parsed.status,
            }),
            now,
            now,
          );
        const event = insertProvenance(
          {
            id: createId(),
            projectId: parsed.projectId,
            objectId: id,
            action: "run.created",
            actorType: parsed.actorType,
            actorId: parsed.actorId,
            metadata: {
              experimentId: parsed.experimentId,
              definitionVersion: definition.version,
              inputFingerprint: hashJson(snapshot),
            },
          },
          now,
        );
        database
          .prepare(
            `INSERT INTO experiment_runs
             (id, project_id, experiment_id, definition_version_id, status, commit_sha,
              configuration_json, datasets_json, code_refs_json, input_fingerprint,
              started_at, finished_at, exit_code, provenance_event_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            id,
            parsed.projectId,
            parsed.experimentId,
            definition.id,
            parsed.status,
            parsed.commitSha.toLowerCase(),
            canonicalJson(configuration),
            canonicalJson(datasets),
            canonicalJson(parsed.codeRefs),
            hashJson(snapshot),
            startedAt,
            parsed.finishedAt ?? null,
            parsed.exitCode ?? null,
            event.id,
            now,
            now,
          );
        database
          .prepare(
            `INSERT INTO research_relationships
             (id, project_id, from_object_id, to_object_id, type, origin, review_state,
              confidence, reviewed_by, reviewed_at, created_at)
             VALUES (?, ?, ?, ?, 'generated-by', 'system', 'approved', 1, ?, ?, ?)`,
          )
          .run(
            createId(),
            parsed.projectId,
            id,
            parsed.experimentId,
            parsed.actorId,
            now,
            now,
          );
        database.exec("COMMIT");
        return getRunDetail(parsed.projectId, id);
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },

    updateExperimentRunStatus(input) {
      const parsed = runStatusInputSchema.parse(input);
      ensureProject(parsed.projectId);
      const run = getRun(parsed.projectId, parsed.runId);
      const transitions = {
        planned: ["running", "cancelled"],
        running: ["completed", "failed", "cancelled"],
      };
      if (!transitions[run.status]?.includes(parsed.status)) {
        throw new Error(
          `Run cannot transition from ${run.status} to ${parsed.status}.`,
        );
      }
      const terminal = ["completed", "failed", "cancelled"].includes(
        parsed.status,
      );
      if (terminal && !parsed.finishedAt) {
        throw new Error("A terminal run requires finishedAt.");
      }
      const now = clock();
      database.exec("BEGIN IMMEDIATE");
      try {
        database
          .prepare(
            `UPDATE experiment_runs SET status = ?, finished_at = ?, exit_code = ?, updated_at = ?
             WHERE id = ? AND project_id = ?`,
          )
          .run(
            parsed.status,
            terminal ? parsed.finishedAt : null,
            parsed.exitCode ?? null,
            now,
            parsed.runId,
            parsed.projectId,
          );
        database
          .prepare(
            "UPDATE research_objects SET payload = json_set(payload, '$.status', ?), updated_at = ? WHERE id = ?",
          )
          .run(parsed.status, now, parsed.runId);
        insertProvenance(
          {
            id: createId(),
            projectId: parsed.projectId,
            objectId: parsed.runId,
            action: `run.${parsed.status}`,
            actorType: parsed.actorType,
            actorId: parsed.actorId,
            metadata: {
              from: run.status,
              to: parsed.status,
              exitCode: parsed.exitCode ?? null,
            },
          },
          now,
        );
        database.exec("COMMIT");
        return getRunDetail(parsed.projectId, parsed.runId);
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },

    logRunMetrics(input) {
      const parsed = metricsInputSchema.parse(input);
      ensureProject(parsed.projectId);
      getRun(parsed.projectId, parsed.runId);
      const now = clock();
      const created = [];
      database.exec("BEGIN IMMEDIATE");
      try {
        for (const metric of parsed.metrics) {
          const id = createId();
          const event = insertProvenance(
            {
              id: createId(),
              projectId: parsed.projectId,
              objectId: parsed.runId,
              action: "run.metric.logged",
              actorType: parsed.actorType,
              actorId: parsed.actorId,
              metadata: {
                metricId: id,
                name: metric.name,
                value: metric.value,
                step: metric.step ?? null,
              },
            },
            metric.loggedAt ?? now,
          );
          database
            .prepare(
              `INSERT INTO run_metrics
               (id, project_id, run_id, name, value, unit, step, logged_at, provenance_event_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              id,
              parsed.projectId,
              parsed.runId,
              metric.name,
              metric.value,
              metric.unit ?? null,
              metric.step ?? null,
              metric.loggedAt ?? now,
              event.id,
            );
          created.push(
            mapMetric(
              database
                .prepare("SELECT * FROM run_metrics WHERE id = ?")
                .get(id),
            ),
          );
        }
        database.exec("COMMIT");
        return created;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },

    registerRunArtifact(input) {
      const parsed = artifactInputSchema.parse(input);
      ensureProject(parsed.projectId);
      const run = getRun(parsed.projectId, parsed.runId);
      const id = parsed.id ?? createId();
      const now = clock();
      const generatedAt = parsed.generatedAt ?? now;
      database.exec("BEGIN IMMEDIATE");
      try {
        database
          .prepare(
            `INSERT INTO research_objects
             (id, project_id, type, title, description, payload, origin, review_state,
              reviewed_by, reviewed_at, created_at, updated_at)
             VALUES (?, ?, 'artifact', ?, ?, ?, 'system', 'approved', ?, ?, ?, ?)`,
          )
          .run(
            id,
            parsed.projectId,
            parsed.title,
            parsed.description,
            JSON.stringify({
              kind: "artifact",
              mediaType: parsed.mediaType,
              path: parsed.path,
              sha256: parsed.contentHash,
            }),
            parsed.actorId,
            now,
            now,
            now,
          );
        const event = insertProvenance(
          {
            id: createId(),
            projectId: parsed.projectId,
            objectId: id,
            action: "artifact.registered",
            actorType: parsed.actorType,
            actorId: parsed.actorId,
            metadata: {
              runId: parsed.runId,
              kind: parsed.kind,
              path: parsed.path,
              contentHash: parsed.contentHash,
            },
          },
          now,
        );
        database
          .prepare(
            `INSERT INTO run_artifacts
             (id, project_id, run_id, kind, path, media_type, content_hash,
              generator_path, generator_hash, input_fingerprint, state,
              stale_reasons_json, provenance_event_id, generated_at, checked_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'current', '[]', ?, ?, ?)`,
          )
          .run(
            id,
            parsed.projectId,
            parsed.runId,
            parsed.kind,
            parsed.path,
            parsed.mediaType,
            parsed.contentHash.toLowerCase(),
            parsed.generatorPath ?? null,
            parsed.generatorHash?.toLowerCase() ?? null,
            run.input_fingerprint,
            event.id,
            generatedAt,
            now,
          );
        database
          .prepare(
            `INSERT INTO research_relationships
             (id, project_id, from_object_id, to_object_id, type, origin, review_state,
              confidence, reviewed_by, reviewed_at, created_at)
             VALUES (?, ?, ?, ?, 'generated-by', 'system', 'approved', 1, ?, ?, ?)`,
          )
          .run(
            createId(),
            parsed.projectId,
            id,
            parsed.runId,
            parsed.actorId,
            now,
            now,
          );
        database.exec("COMMIT");
        return mapArtifact(
          database
            .prepare(
              `SELECT artifact.*, object.title, object.description
               FROM run_artifacts artifact JOIN research_objects object ON object.id = artifact.id
               WHERE artifact.id = ?`,
            )
            .get(id),
        );
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },

    assessArtifactStaleness(input) {
      const parsed = stalenessInputSchema.parse(input);
      ensureProject(parsed.projectId);
      const artifact = database
        .prepare(
          `SELECT artifact.*, object.title, object.description, run.experiment_id,
                  run.definition_version_id, run.commit_sha, run.configuration_json,
                  run.datasets_json, run.code_refs_json
           FROM run_artifacts artifact
           JOIN research_objects object ON object.id = artifact.id
           JOIN experiment_runs run ON run.id = artifact.run_id
           WHERE artifact.id = ? AND artifact.project_id = ?`,
        )
        .get(parsed.artifactId, parsed.projectId);
      if (!artifact)
        throw new Error("Artifact does not belong to the project.");
      const capturedDefinition = database
        .prepare("SELECT * FROM experiment_definition_versions WHERE id = ?")
        .get(artifact.definition_version_id);
      const currentDefinition = latestDefinition(
        parsed.projectId,
        artifact.experiment_id,
      );
      const reasons = [];
      if (
        capturedDefinition.definition_hash !== currentDefinition.definition_hash
      ) {
        reasons.push({
          kind: "experiment-definition",
          captured: capturedDefinition.definition_hash,
          current: currentDefinition.definition_hash,
        });
      }
      if (
        parsed.commitSha &&
        parsed.commitSha.toLowerCase() !== artifact.commit_sha
      ) {
        reasons.push({
          kind: "git-commit",
          captured: artifact.commit_sha,
          current: parsed.commitSha.toLowerCase(),
        });
      }
      const comparisons = [
        [
          "configuration",
          parsed.configuration,
          parseJson(artifact.configuration_json),
        ],
        ["datasets", parsed.datasets, parseJson(artifact.datasets_json)],
        [
          "generating-code",
          parsed.codeRefs,
          parseJson(artifact.code_refs_json),
        ],
      ];
      for (const [kind, current, captured] of comparisons) {
        if (current !== undefined && hashJson(current) !== hashJson(captured)) {
          reasons.push({
            kind,
            capturedHash: hashJson(captured),
            currentHash: hashJson(current),
          });
        }
      }
      const state = reasons.length === 0 ? "current" : "stale";
      const now = clock();
      database.exec("BEGIN IMMEDIATE");
      try {
        database
          .prepare(
            `UPDATE run_artifacts SET state = ?, stale_reasons_json = ?, checked_at = ?
             WHERE id = ? AND project_id = ?`,
          )
          .run(
            state,
            canonicalJson(reasons),
            now,
            parsed.artifactId,
            parsed.projectId,
          );
        if (
          state !== artifact.state ||
          canonicalJson(reasons) !== artifact.stale_reasons_json
        ) {
          insertProvenance(
            {
              id: createId(),
              projectId: parsed.projectId,
              objectId: parsed.artifactId,
              action:
                state === "stale"
                  ? "artifact.marked-stale"
                  : "artifact.marked-current",
              actorType: parsed.actorType,
              actorId: parsed.actorId,
              metadata: { reasons },
            },
            now,
          );
        }
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      return mapArtifact({
        ...artifact,
        state,
        stale_reasons_json: canonicalJson(reasons),
        checked_at: now,
      });
    },

    listExperimentLineage(projectId, experimentId) {
      ensureProject(projectId);
      return buildExperimentLineage(projectId, experimentId);
    },

    listExperimentLineages(projectId) {
      ensureProject(projectId);
      return database
        .prepare(
          `SELECT id FROM research_objects
           WHERE project_id = ? AND type = 'experiment' ORDER BY created_at, id`,
        )
        .all(projectId)
        .map(({ id }) => buildExperimentLineage(projectId, id));
    },

    getArtifactLineage(projectId, artifactId) {
      ensureProject(projectId);
      const artifact = database
        .prepare(
          "SELECT run_id FROM run_artifacts WHERE id = ? AND project_id = ?",
        )
        .get(artifactId, projectId);
      if (!artifact)
        throw new Error("Artifact does not belong to the project.");
      const run = getRunDetail(projectId, artifact.run_id);
      return {
        experiment: buildExperimentLineage(projectId, run.experimentId)
          .experiment,
        definition: run.definition,
        run: { ...run, artifacts: undefined },
        artifact: run.artifacts.find(({ id }) => id === artifactId),
      };
    },
  };
}
