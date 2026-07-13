import { createHash } from "node:crypto";
import { z } from "zod";

export const preregistrationContentSchema = z
  .object({
    hypothesis: z.string().trim().min(1).max(10_000),
    primaryMetrics: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
    exclusionRules: z.string().trim().min(1).max(10_000),
    analysisPlan: z.string().trim().min(1).max(20_000),
    successCriteria: z.string().trim().min(1).max(10_000),
    dataset: z.string().trim().min(1).max(4_000),
    intendedDesign: z.string().trim().min(1).max(4_000),
  })
  .strict();

const actorTypeSchema = z.enum(["human", "agent", "system", "integration"]);
const originSchema = z.enum(["human", "imported", "inferred", "system"]);

export const snapshotInputSchema = z
  .object({
    projectId: z.string().trim().min(1),
    experimentId: z.string().trim().min(1),
    amendsSnapshotId: z.string().trim().min(1).nullable().optional(),
    content: preregistrationContentSchema,
    actorType: actorTypeSchema.default("human"),
    actorId: z.string().trim().min(1).max(200).default("local-user"),
    origin: originSchema.default("human"),
  })
  .strict();

const fieldPaths = [
  "/hypothesis",
  "/primaryMetrics",
  "/exclusionRules",
  "/analysisPlan",
  "/successCriteria",
  "/dataset",
  "/intendedDesign",
];

export const deviationInputSchema = z
  .object({
    projectId: z.string().trim().min(1),
    snapshotId: z.string().trim().min(1),
    fieldPath: z.enum(fieldPaths),
    afterValue: z.unknown(),
    rationale: z.string().trim().min(1).max(10_000),
    actorId: z.string().trim().min(1).max(200).default("local-user"),
  })
  .strict();

const evaluationInputSchema = z
  .object({
    projectId: z.string().trim().min(1),
    snapshotId: z.string().trim().min(1),
    actorId: z.string().trim().min(1).max(200).default("local-user"),
  })
  .strict();

const acknowledgementInputSchema = z
  .object({
    projectId: z.string().trim().min(1),
    deviationId: z.string().trim().min(1),
    actorId: z.string().trim().min(1).max(200).default("local-user"),
  })
  .strict();

const contentKeys = [
  "hypothesis",
  "primaryMetrics",
  "exclusionRules",
  "analysisPlan",
  "successCriteria",
  "dataset",
  "intendedDesign",
];

const canonicalJson = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const canonicalContent = (content) => {
  const parsed = preregistrationContentSchema.parse(content);
  const normalized = {
    analysisPlan: parsed.analysisPlan,
    dataset: parsed.dataset,
    exclusionRules: parsed.exclusionRules,
    hypothesis: parsed.hypothesis,
    intendedDesign: parsed.intendedDesign,
    primaryMetrics: parsed.primaryMetrics,
    successCriteria: parsed.successCriteria,
  };
  const json = canonicalJson(normalized);
  return {
    content: normalized,
    json,
    hash: createHash("sha256").update(json).digest("hex"),
  };
};

const parseJson = (value) => JSON.parse(value);

const normalizeAfterValue = (fieldPath, value) => {
  if (fieldPath === "/primaryMetrics") {
    return z
      .array(z.string().trim().min(1).max(500))
      .min(1)
      .max(20)
      .parse(value);
  }
  return z.string().trim().min(1).max(20_000).parse(value);
};

export function comparePreregistrationContent(snapshotContent, currentContent) {
  const before = preregistrationContentSchema.parse(snapshotContent);
  const after = preregistrationContentSchema.parse(currentContent);
  return contentKeys.flatMap((key) => {
    const beforeJson = canonicalJson(before[key]);
    const afterJson = canonicalJson(after[key]);
    return beforeJson === afterJson
      ? []
      : [
          {
            fieldPath: `/${key}`,
            beforeValue: before[key],
            afterValue: after[key],
          },
        ];
  });
}

export function createPreregistrationMethods({
  database,
  ensureProject,
  insertProvenance,
  clock,
  createId,
}) {
  const getSnapshotRow = (projectId, snapshotId) => {
    const row = database
      .prepare(
        "SELECT * FROM preregistration_snapshots WHERE id = ? AND project_id = ?",
      )
      .get(snapshotId, projectId);
    if (!row) {
      throw new Error(
        "Preregistration snapshot does not belong to the project.",
      );
    }
    return row;
  };

  const mapAcknowledgement = (row) =>
    row
      ? {
          id: row.id,
          state: row.state,
          actorId: row.actor_id,
          provenanceEventId: row.provenance_event_id,
          acknowledgedAt: row.acknowledged_at,
        }
      : null;

  const mapDeviation = (row) => ({
    id: row.id,
    projectId: row.project_id,
    snapshotId: row.snapshot_id,
    fieldPath: row.field_path,
    beforeValue: parseJson(row.before_json),
    afterValue: parseJson(row.after_json),
    rationale: row.rationale,
    declarationTiming: row.declaration_timing,
    actorId: row.actor_id,
    provenanceEventId: row.provenance_event_id,
    declaredAt: row.declared_at,
    acknowledgement: mapAcknowledgement(
      database
        .prepare(
          "SELECT * FROM analysis_deviation_acknowledgements WHERE deviation_id = ?",
        )
        .get(row.id),
    ),
  });

  const mapSnapshot = (row) => {
    const evaluation = database
      .prepare(
        "SELECT * FROM preregistration_evaluations WHERE snapshot_id = ?",
      )
      .get(row.id);
    const deviations = database
      .prepare(
        `SELECT * FROM analysis_deviations
         WHERE snapshot_id = ? ORDER BY declared_at, id`,
      )
      .all(row.id)
      .map(mapDeviation);
    return {
      id: row.id,
      projectId: row.project_id,
      experimentId: row.experiment_id,
      version: row.version,
      amendsSnapshotId: row.amends_snapshot_id ?? null,
      content: parseJson(row.content_json),
      contentHash: row.content_hash,
      actorType: row.actor_type,
      actorId: row.actor_id,
      origin: row.origin,
      provenanceEventId: row.provenance_event_id,
      createdAt: row.created_at,
      finalEvaluation: evaluation
        ? {
            id: evaluation.id,
            actorId: evaluation.actor_id,
            provenanceEventId: evaluation.provenance_event_id,
            evaluatedAt: evaluation.evaluated_at,
          }
        : null,
      deviations,
    };
  };

  const insertEvent = (input, now) =>
    insertProvenance({ ...input, id: createId() }, now);

  return {
    listPreregistrations(projectId, experimentId) {
      ensureProject(projectId);
      if (experimentId) {
        const experiment = database
          .prepare(
            "SELECT id FROM research_objects WHERE id = ? AND project_id = ? AND type = 'experiment'",
          )
          .get(experimentId, projectId);
        if (!experiment) {
          throw new Error("Experiment does not belong to the project.");
        }
      }
      return database
        .prepare(
          `SELECT * FROM preregistration_snapshots
           WHERE project_id = ? ${experimentId ? "AND experiment_id = ?" : ""}
           ORDER BY experiment_id, version DESC, created_at DESC, id DESC`,
        )
        .all(...(experimentId ? [projectId, experimentId] : [projectId]))
        .map(mapSnapshot);
    },

    createPreregistration(input) {
      const parsed = snapshotInputSchema.parse(input);
      ensureProject(parsed.projectId);
      const experiment = database
        .prepare(
          "SELECT id FROM research_objects WHERE id = ? AND project_id = ? AND type = 'experiment'",
        )
        .get(parsed.experimentId, parsed.projectId);
      if (!experiment) {
        throw new Error("Experiment does not belong to the project.");
      }
      const latest = database
        .prepare(
          `SELECT * FROM preregistration_snapshots
           WHERE project_id = ? AND experiment_id = ?
           ORDER BY version DESC LIMIT 1`,
        )
        .get(parsed.projectId, parsed.experimentId);
      if (!latest && parsed.amendsSnapshotId) {
        throw new Error("The first preregistration cannot amend a snapshot.");
      }
      if (latest && parsed.amendsSnapshotId !== latest.id) {
        throw new Error("An amendment must link to the latest snapshot.");
      }
      const canonical = canonicalContent(parsed.content);
      if (latest?.content_hash === canonical.hash) {
        throw new Error("An amendment must change preregistration content.");
      }
      const id = createId();
      const version = (latest?.version ?? 0) + 1;
      const now = clock();
      database.exec("BEGIN IMMEDIATE");
      try {
        const event = insertEvent(
          {
            action:
              version === 1
                ? "preregistration.snapshot.created"
                : "preregistration.snapshot.amended",
            actorId: parsed.actorId,
            actorType: parsed.actorType,
            objectId: parsed.experimentId,
            projectId: parsed.projectId,
            metadata: {
              snapshotId: id,
              version,
              amendsSnapshotId: parsed.amendsSnapshotId ?? null,
              contentHash: canonical.hash,
              origin: parsed.origin,
            },
          },
          now,
        );
        database
          .prepare(
            `INSERT INTO preregistration_snapshots
             (id, project_id, experiment_id, version, amends_snapshot_id,
              content_json, content_hash, actor_type, actor_id, origin,
              provenance_event_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            id,
            parsed.projectId,
            parsed.experimentId,
            version,
            parsed.amendsSnapshotId ?? null,
            canonical.json,
            canonical.hash,
            parsed.actorType,
            parsed.actorId,
            parsed.origin,
            event.id,
            now,
          );
        const snapshot = mapSnapshot(
          database
            .prepare("SELECT * FROM preregistration_snapshots WHERE id = ?")
            .get(id),
        );
        database.exec("COMMIT");
        return snapshot;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },

    comparePreregistration(projectId, snapshotId, currentContent) {
      ensureProject(projectId);
      const snapshot = getSnapshotRow(projectId, snapshotId);
      return comparePreregistrationContent(
        parseJson(snapshot.content_json),
        currentContent,
      );
    },

    markPreregistrationEvaluated(input) {
      const parsed = evaluationInputSchema.parse(input);
      ensureProject(parsed.projectId);
      const snapshot = getSnapshotRow(parsed.projectId, parsed.snapshotId);
      const existing = database
        .prepare(
          "SELECT id FROM preregistration_evaluations WHERE snapshot_id = ?",
        )
        .get(parsed.snapshotId);
      if (existing) {
        throw new Error("Final evaluation is already recorded.");
      }
      const id = createId();
      const now = clock();
      database.exec("BEGIN IMMEDIATE");
      try {
        const event = insertEvent(
          {
            action: "preregistration.final-evaluation.recorded",
            actorId: parsed.actorId,
            actorType: "human",
            objectId: snapshot.experiment_id,
            projectId: parsed.projectId,
            metadata: { snapshotId: parsed.snapshotId },
          },
          now,
        );
        database
          .prepare(
            `INSERT INTO preregistration_evaluations
             (id, project_id, snapshot_id, actor_id, provenance_event_id, evaluated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(
            id,
            parsed.projectId,
            parsed.snapshotId,
            parsed.actorId,
            event.id,
            now,
          );
        const result = mapSnapshot(snapshot);
        database.exec("COMMIT");
        return result;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },

    declareAnalysisDeviation(input) {
      const parsed = deviationInputSchema.parse(input);
      ensureProject(parsed.projectId);
      const snapshot = getSnapshotRow(parsed.projectId, parsed.snapshotId);
      const content = parseJson(snapshot.content_json);
      const key = parsed.fieldPath.slice(1);
      const beforeValue = content[key];
      const afterValue = normalizeAfterValue(
        parsed.fieldPath,
        parsed.afterValue,
      );
      const beforeJson = canonicalJson(beforeValue);
      const afterJson = canonicalJson(afterValue);
      if (beforeJson === afterJson) {
        throw new Error("A deviation must change the preregistered value.");
      }
      const finalEvaluation = database
        .prepare(
          "SELECT evaluated_at FROM preregistration_evaluations WHERE snapshot_id = ?",
        )
        .get(parsed.snapshotId);
      const declarationTiming = finalEvaluation
        ? "retrospective"
        : "pre-evaluation";
      const id = createId();
      const now = clock();
      database.exec("BEGIN IMMEDIATE");
      try {
        const event = insertEvent(
          {
            action: "analysis-deviation.declared",
            actorId: parsed.actorId,
            actorType: "human",
            objectId: snapshot.experiment_id,
            projectId: parsed.projectId,
            metadata: {
              deviationId: id,
              snapshotId: parsed.snapshotId,
              fieldPath: parsed.fieldPath,
              declarationTiming,
              beforeValue,
              afterValue,
              rationale: parsed.rationale,
            },
          },
          now,
        );
        database
          .prepare(
            `INSERT INTO analysis_deviations
             (id, project_id, snapshot_id, field_path, before_json, after_json,
              rationale, declaration_timing, actor_id, provenance_event_id, declared_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            id,
            parsed.projectId,
            parsed.snapshotId,
            parsed.fieldPath,
            beforeJson,
            afterJson,
            parsed.rationale,
            declarationTiming,
            parsed.actorId,
            event.id,
            now,
          );
        const deviation = mapDeviation(
          database
            .prepare("SELECT * FROM analysis_deviations WHERE id = ?")
            .get(id),
        );
        database.exec("COMMIT");
        return deviation;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },

    acknowledgeAnalysisDeviation(input) {
      const parsed = acknowledgementInputSchema.parse(input);
      ensureProject(parsed.projectId);
      const deviation = database
        .prepare(
          `SELECT deviation.*, snapshot.experiment_id
           FROM analysis_deviations deviation
           JOIN preregistration_snapshots snapshot ON snapshot.id = deviation.snapshot_id
           WHERE deviation.id = ? AND deviation.project_id = ?`,
        )
        .get(parsed.deviationId, parsed.projectId);
      if (!deviation) {
        throw new Error("Analysis deviation does not belong to the project.");
      }
      const existing = database
        .prepare(
          "SELECT id FROM analysis_deviation_acknowledgements WHERE deviation_id = ?",
        )
        .get(parsed.deviationId);
      if (existing) {
        throw new Error("Analysis deviation is already acknowledged.");
      }
      const id = createId();
      const now = clock();
      database.exec("BEGIN IMMEDIATE");
      try {
        const event = insertEvent(
          {
            action: "analysis-deviation.acknowledged",
            actorId: parsed.actorId,
            actorType: "human",
            objectId: deviation.experiment_id,
            projectId: parsed.projectId,
            metadata: { deviationId: parsed.deviationId },
          },
          now,
        );
        database
          .prepare(
            `INSERT INTO analysis_deviation_acknowledgements
             (id, project_id, deviation_id, state, actor_id, provenance_event_id, acknowledged_at)
             VALUES (?, ?, ?, 'acknowledged', ?, ?, ?)`,
          )
          .run(
            id,
            parsed.projectId,
            parsed.deviationId,
            parsed.actorId,
            event.id,
            now,
          );
        const acknowledged = mapDeviation(deviation);
        database.exec("COMMIT");
        return acknowledged;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
