import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

const objectPayloadSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("artifact"),
    mediaType: z.string().trim().min(1).optional(),
    path: z.string().trim().min(1).optional(),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .optional(),
  }),
  z.object({
    kind: z.literal("source"),
    status: z.enum(["placeholder", "resolved"]).default("resolved"),
    authors: z.array(z.string().trim().min(1)).optional(),
    citation: z.string().trim().min(1).optional(),
    doi: z.string().trim().min(1).optional(),
    url: z.url().optional(),
    providerId: z.string().trim().min(1).optional(),
    abstract: z.string().trim().min(1).max(20_000).optional(),
    year: z.number().int().min(1000).max(9999).optional(),
    provider: z.string().trim().min(1).optional(),
    query: z.string().trim().min(1).max(2_000).optional(),
    rankingScore: z.number().finite().min(0).max(1).optional(),
    rankingMethod: z.string().trim().min(1).max(200).optional(),
    rankingModel: z.string().trim().min(1).max(500).optional(),
    rankingComponents: z.record(z.string(), z.number().finite()).optional(),
    rankingExplanation: z.string().trim().min(1).max(2_000).optional(),
    retrievedAt: z.iso.datetime().optional(),
    researchProblem: z.string().trim().min(1).max(10_000).optional(),
    methods: z.array(z.string().trim().min(1)).optional(),
    findings: z.array(z.string().trim().min(1)).optional(),
    limitations: z.array(z.string().trim().min(1)).optional(),
    enrichmentMethod: z.string().trim().min(1).max(200).optional(),
    enrichedAt: z.iso.datetime().optional(),
  }),
  z.object({
    kind: z.literal("claim"),
    status: z.enum(["draft", "supported", "contradicted", "needs-evidence"]),
    reviewStatus: z
      .enum([
        "Unsupported",
        "Weak",
        "Medium",
        "Strong",
        "Paper-ready",
        "Invalidated",
        "Needs review",
      ])
      .optional(),
    reproducibilityStatus: z
      .enum(["not-assessed", "passed", "failed"])
      .optional(),
    openRiskCount: z.number().int().min(0).optional(),
  }),
  z.object({
    kind: z.literal("experiment"),
    hypothesis: z.string().trim().min(1).optional(),
  }),
  z.object({
    kind: z.literal("run"),
    commitSha: z
      .string()
      .regex(/^[a-f0-9]{7,64}$/i)
      .optional(),
    status: z.enum(["planned", "running", "completed", "failed"]),
  }),
]);

const objectInputSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    projectId: z.string().trim().min(1),
    type: z.enum(["artifact", "source", "claim", "experiment", "run"]),
    title: z.string().trim().min(1).max(500),
    description: z.string().trim().max(10_000).default(""),
    origin: z
      .enum(["human", "imported", "inferred", "system"])
      .default("human"),
    payload: objectPayloadSchema,
  })
  .superRefine((value, context) => {
    if (value.type !== value.payload.kind) {
      context.addIssue({
        code: "custom",
        message: "Object type must match payload kind.",
        path: ["payload", "kind"],
      });
    }
    if (
      value.payload.kind === "source" &&
      value.payload.status !== "placeholder" &&
      !value.payload.url &&
      !value.payload.citation
    ) {
      context.addIssue({
        code: "custom",
        message: "A source requires a URL or citation.",
        path: ["payload"],
      });
    }
  });

const relationshipInputSchema = z.object({
  id: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1),
  fromObjectId: z.string().trim().min(1),
  toObjectId: z.string().trim().min(1),
  type: z.enum([
    "supports",
    "contradicts",
    "generated-by",
    "uses",
    "tests",
    "implements",
  ]),
  origin: z.enum(["human", "imported", "inferred", "system"]).default("human"),
});

const relationshipReviewInputSchema = z.object({
  id: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  reviewState: z.enum(["approved", "rejected"]),
  reviewerId: z.string().trim().min(1).max(200),
  confidence: z.number().finite().min(0).max(1).nullable().default(null),
});

const claimStatusInputSchema = z.object({
  id: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  reviewStatus: z.enum([
    "Unsupported",
    "Weak",
    "Medium",
    "Strong",
    "Paper-ready",
    "Invalidated",
    "Needs review",
  ]),
  reviewerId: z.string().trim().min(1).max(200).default("local-user"),
});

const canonicalClaimStatus = (reviewStatus) => {
  if (reviewStatus === "Strong" || reviewStatus === "Paper-ready") {
    return "supported";
  }
  if (reviewStatus === "Invalidated") return "contradicted";
  if (
    reviewStatus === "Weak" ||
    reviewStatus === "Medium" ||
    reviewStatus === "Needs review"
  ) {
    return "needs-evidence";
  }
  return "draft";
};

const projectInputSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).max(500),
  path: z.string().trim().min(1).max(4_000),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const provenanceInputSchema = z.object({
  projectId: z.string().trim().min(1),
  objectId: z.string().trim().min(1).nullable().optional(),
  action: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/),
  actorType: z.enum(["human", "system", "agent", "integration"]),
  actorId: z.string().trim().min(1).max(200).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const provenanceListSchema = z
  .object({
    limit: z.number().int().min(1).max(500).default(100),
  })
  .default({});

const provenanceEventInputSchema = z.object({
  id: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1),
  objectId: z.string().trim().min(1).optional(),
  action: z.string().trim().min(1).max(200),
  actorType: z.enum(["human", "agent", "system"]),
  actorId: z.string().trim().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const lineageStepSchema = z.object({
  kind: z.enum([
    "objective",
    "notebook",
    "commit",
    "experiment",
    "artifact",
    "claim",
  ]),
  id: z.string().trim().min(1).max(4_000),
  label: z.string().trim().min(1).max(10_000),
  coordinates: z.record(z.string(), z.unknown()).default({}),
});

const lineageEvidenceInputSchema = z.object({
  evidenceType: z.string().trim().min(1).max(100),
  path: z.string().trim().min(1).max(4_000).nullable().optional(),
  coordinates: z.record(z.string(), z.unknown()),
  excerpt: z.string().max(4_000).nullable().optional(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i),
});

const lineageSuggestionInputSchema = z.object({
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/i),
  chain: z.array(lineageStepSchema).length(6),
  confidence: z.number().finite().min(0).max(1),
  rationale: z.string().trim().min(1).max(10_000),
  evidence: z.array(lineageEvidenceInputSchema).min(1).max(100),
});

const lineageReviewDecisionSchema = z
  .object({
    id: z.string().trim().min(1),
    action: z.enum(["approve", "reject", "edit"]),
    edit: z
      .object({
        chain: z.array(lineageStepSchema).length(6).optional(),
        confidence: z.number().finite().min(0).max(1).optional(),
        rationale: z.string().trim().min(1).max(10_000).optional(),
      })
      .optional(),
  })
  .superRefine((value, context) => {
    if (
      value.action === "edit" &&
      (!value.edit ||
        (!value.edit.chain &&
          value.edit.confidence === undefined &&
          !value.edit.rationale))
    ) {
      context.addIssue({
        code: "custom",
        message: "An edit decision requires at least one correction.",
        path: ["edit"],
      });
    }
  });

const lineageReviewInputSchema = z.object({
  projectId: z.string().trim().min(1),
  decisions: z.array(lineageReviewDecisionSchema).min(1).max(100),
  actor: z.string().trim().min(1).max(200),
});

const parseJson = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const normalizeProjectPath = (value) => {
  const trimmed = value.trim();
  const withoutTrailingSeparators = trimmed.replace(/[\\/]+$/, "") || trimmed;
  const normalized = withoutTrailingSeparators.replace(/\\/g, "/");
  const isWindowsPath =
    /^[a-zA-Z]:\//.test(normalized) || trimmed.includes("\\");
  return isWindowsPath ? normalized.toLowerCase() : normalized;
};

const mapObject = (row) => ({
  id: row.id,
  projectId: row.project_id,
  type: row.type,
  title: row.title,
  description: row.description,
  payload: parseJson(row.payload),
  origin: row.origin ?? "human",
  reviewState: row.review_state ?? "unreviewed",
  reviewedBy: row.reviewed_by ?? null,
  reviewedAt: row.reviewed_at ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapRelationship = (row) => ({
  id: row.id,
  projectId: row.project_id,
  fromObjectId: row.from_object_id,
  toObjectId: row.to_object_id,
  type: row.type,
  origin: row.origin ?? "human",
  reviewState: row.review_state ?? "unreviewed",
  confidence: typeof row.confidence === "number" ? row.confidence : null,
  reviewedBy: row.reviewed_by ?? null,
  reviewedAt: row.reviewed_at ?? null,
  createdAt: row.created_at,
});

const mapProject = (row) => ({
  id: row.id,
  name: row.name,
  path: row.path,
  metadata: parseJson(row.metadata),
});

const mapProvenanceEvent = (row) => ({
  id: row.id,
  projectId: row.project_id,
  ...(row.object_id ? { objectId: row.object_id } : {}),
  action: row.action,
  actorType: row.actor_type,
  ...(row.actor_id ? { actorId: row.actor_id } : {}),
  metadata: parseJson(row.metadata),
  createdAt: row.created_at,
  ...(Number.isInteger(row.sequence) ? { sequence: row.sequence } : {}),
  ...(row.previous_hash !== undefined
    ? { previousHash: row.previous_hash }
    : {}),
  ...(row.event_hash ? { eventHash: row.event_hash } : {}),
});

const mapLineageEvidence = (row) => ({
  id: row.id,
  projectId: row.project_id,
  suggestionId: row.suggestion_id,
  evidenceType: row.evidence_type,
  path: row.path ?? null,
  coordinates: parseJson(row.coordinates),
  excerpt: row.excerpt ?? null,
  contentHash: row.content_hash,
  createdAt: row.created_at,
});

const mapLineageSuggestion = (row, evidence = []) => ({
  id: row.id,
  projectId: row.project_id,
  fingerprint: row.fingerprint,
  chain: parseJson(row.chain_json),
  confidence: row.confidence,
  rationale: row.rationale,
  origin: row.origin ?? "inferred",
  reviewState: row.review_state ?? "unreviewed",
  reviewedBy: row.reviewed_by ?? null,
  reviewedAt: row.reviewed_at ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  evidence,
});

const hashProvenanceRow = (row, sequence, previousHash) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        row.id,
        row.project_id,
        row.object_id ?? null,
        row.action,
        row.actor_type,
        row.actor_id ?? null,
        row.metadata,
        row.created_at,
        sequence,
        previousHash,
      ]),
    )
    .digest("hex");

export function createResearchRepository(database) {
  const provenanceColumns = database
    .prepare("PRAGMA table_info(provenance_events)")
    .all();
  const hasProvenanceChain = ["sequence", "previous_hash", "event_hash"].every(
    (column) => provenanceColumns.some((row) => row.name === column),
  );

  if (hasProvenanceChain) {
    database.exec("BEGIN IMMEDIATE");
    try {
      const projectRows = database.prepare("SELECT id FROM projects").all();
      for (const { id: projectId } of projectRows) {
        const rows = database
          .prepare(
            `SELECT * FROM provenance_events
             WHERE project_id = ? ORDER BY created_at, rowid`,
          )
          .all(projectId);
        const needsBackfill = rows.some(
          (row) =>
            !Number.isInteger(row.sequence) ||
            !row.event_hash ||
            row.previous_hash === undefined,
        );
        let previousHash = null;
        let sequence = 0;
        for (const row of rows) {
          sequence += 1;
          const eventHash = needsBackfill
            ? hashProvenanceRow(row, sequence, previousHash)
            : row.event_hash;
          if (needsBackfill) {
            database
              .prepare(
                `UPDATE provenance_events
                 SET sequence = ?, previous_hash = ?, event_hash = ?
                 WHERE id = ?`,
              )
              .run(sequence, previousHash, eventHash, row.id);
          }
          previousHash = eventHash;
        }
        const existingHead = database
          .prepare(
            "SELECT project_id FROM provenance_heads WHERE project_id = ?",
          )
          .get(projectId);
        if (sequence > 0 && (needsBackfill || !existingHead)) {
          database
            .prepare(
              `INSERT INTO provenance_heads
                 (project_id, event_count, last_sequence, last_hash)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(project_id) DO UPDATE SET
                 event_count = excluded.event_count,
                 last_sequence = excluded.last_sequence,
                 last_hash = excluded.last_hash`,
            )
            .run(projectId, sequence, sequence, previousHash);
        }
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    database.exec(`
      CREATE TRIGGER IF NOT EXISTS provenance_events_immutable_update
      BEFORE UPDATE ON provenance_events
      BEGIN
        SELECT RAISE(ABORT, 'Provenance events are immutable');
      END;
      CREATE TRIGGER IF NOT EXISTS provenance_events_immutable_delete
      BEFORE DELETE ON provenance_events
      BEGIN
        SELECT RAISE(ABORT, 'Provenance events are immutable');
      END;
    `);
  }

  const ensureProject = (projectId) => {
    const project = database
      .prepare("SELECT id FROM projects WHERE id = ?")
      .get(projectId);
    if (!project) {
      throw new Error("Research project does not exist.");
    }
  };

  const insertProvenance = (
    {
      action,
      actorId = "local-user",
      actorType = "human",
      id = randomUUID(),
      metadata = {},
      objectId,
      projectId,
    },
    now,
  ) => {
    const metadataJson = JSON.stringify(metadata);
    if (hasProvenanceChain) {
      const head = database
        .prepare("SELECT * FROM provenance_heads WHERE project_id = ?")
        .get(projectId);
      const sequence = (head?.last_sequence ?? 0) + 1;
      const previousHash = head?.last_hash ?? null;
      const row = {
        id,
        project_id: projectId,
        object_id: objectId ?? null,
        action,
        actor_type: actorType,
        actor_id: actorId ?? null,
        metadata: metadataJson,
        created_at: now,
      };
      const eventHash = hashProvenanceRow(row, sequence, previousHash);
      database
        .prepare(
          `INSERT INTO provenance_events
            (id, project_id, object_id, action, actor_type, actor_id, metadata,
             created_at, sequence, previous_hash, event_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          projectId,
          objectId ?? null,
          action,
          actorType,
          actorId ?? null,
          metadataJson,
          now,
          sequence,
          previousHash,
          eventHash,
        );
      database
        .prepare(
          `INSERT INTO provenance_heads
             (project_id, event_count, last_sequence, last_hash)
           VALUES (?, 1, ?, ?)
           ON CONFLICT(project_id) DO UPDATE SET
             event_count = provenance_heads.event_count + 1,
             last_sequence = excluded.last_sequence,
             last_hash = excluded.last_hash`,
        )
        .run(projectId, sequence, eventHash);
    } else {
      database
        .prepare(
          `INSERT INTO provenance_events
            (id, project_id, object_id, action, actor_type, actor_id, metadata, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          projectId,
          objectId ?? null,
          action,
          actorType,
          actorId ?? null,
          metadataJson,
          now,
        );
    }
    return mapProvenanceEvent(
      database.prepare("SELECT * FROM provenance_events WHERE id = ?").get(id),
    );
  };

  const listLineageSuggestions = (projectId) => {
    ensureProject(projectId);
    const rows = database
      .prepare(
        `SELECT * FROM lineage_suggestions
         WHERE project_id = ? ORDER BY created_at, id`,
      )
      .all(projectId);
    const evidenceBySuggestion = new Map();
    for (const row of database
      .prepare(
        `SELECT * FROM lineage_evidence
         WHERE project_id = ? ORDER BY suggestion_id, evidence_type, path, id`,
      )
      .all(projectId)) {
      const evidence = evidenceBySuggestion.get(row.suggestion_id) ?? [];
      evidence.push(mapLineageEvidence(row));
      evidenceBySuggestion.set(row.suggestion_id, evidence);
    }
    return rows.map((row) =>
      mapLineageSuggestion(row, evidenceBySuggestion.get(row.id) ?? []),
    );
  };

  const lineageAcceptanceMetrics = (projectId) => {
    const counts = database
      .prepare(
        `SELECT
           SUM(CASE WHEN review_state = 'approved' THEN 1 ELSE 0 END) AS accepted_count,
           SUM(CASE WHEN review_state = 'rejected' THEN 1 ELSE 0 END) AS rejected_count
         FROM lineage_suggestions WHERE project_id = ?`,
      )
      .get(projectId);
    const corrections = database
      .prepare(
        `SELECT COUNT(*) AS correction_count FROM provenance_events
         WHERE project_id = ? AND action = 'lineage.suggestion.edited'`,
      )
      .get(projectId);
    return {
      acceptedCount: Number(counts?.accepted_count ?? 0),
      rejectedCount: Number(counts?.rejected_count ?? 0),
      correctionCount: Number(corrections?.correction_count ?? 0),
    };
  };

  return {
    upsertProject(input) {
      const parsed = projectInputSchema.parse(input);
      const normalizedPath = normalizeProjectPath(parsed.path);
      const conflictingProject = database
        .prepare(
          "SELECT id FROM projects WHERE normalized_path = ? AND id <> ?",
        )
        .get(normalizedPath, parsed.id);
      if (conflictingProject) {
        throw new Error("Another project already uses this path.");
      }
      const existing = database
        .prepare("SELECT metadata, created_at FROM projects WHERE id = ?")
        .get(parsed.id);
      const now = new Date().toISOString();
      const metadata = JSON.stringify({
        ...parseJson(existing?.metadata),
        ...parsed.metadata,
      });
      database
        .prepare(
          `INSERT INTO projects
            (id, path, normalized_path, name, status, sort_order, metadata, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'open', 0, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             path = excluded.path,
             normalized_path = excluded.normalized_path,
             name = excluded.name,
             metadata = excluded.metadata,
             updated_at = excluded.updated_at`,
        )
        .run(
          parsed.id,
          parsed.path,
          normalizedPath,
          parsed.name,
          metadata,
          existing?.created_at ?? now,
          now,
        );
      return {
        id: parsed.id,
        name: parsed.name,
        path: parsed.path,
        metadata: JSON.parse(metadata),
      };
    },

    createObject(input) {
      const parsed = objectInputSchema.parse(input);
      ensureProject(parsed.projectId);
      const id = parsed.id ?? randomUUID();
      const now = new Date().toISOString();
      database.exec("BEGIN IMMEDIATE");
      try {
        database
          .prepare(
            `INSERT INTO research_objects
              (id, project_id, type, title, description, payload, origin, review_state,
               reviewed_by, reviewed_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'unreviewed', NULL, NULL, ?, ?)`,
          )
          .run(
            id,
            parsed.projectId,
            parsed.type,
            parsed.title,
            parsed.description,
            JSON.stringify(parsed.payload),
            parsed.origin,
            now,
            now,
          );
        insertProvenance(
          {
            action: `${parsed.type}.created`,
            objectId: id,
            projectId: parsed.projectId,
            metadata:
              parsed.type === "source"
                ? {
                    provider: parsed.payload.provider,
                    providerId: parsed.payload.providerId,
                    query: parsed.payload.query,
                    rankingMethod: parsed.payload.rankingMethod,
                    rankingModel: parsed.payload.rankingModel,
                    rankingComponents: parsed.payload.rankingComponents,
                    rankingScore: parsed.payload.rankingScore,
                    retrievedAt: parsed.payload.retrievedAt,
                  }
                : {},
          },
          now,
        );
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      return mapObject(
        database.prepare("SELECT * FROM research_objects WHERE id = ?").get(id),
      );
    },

    updateSource(input) {
      ensureProject(input.projectId);
      const existing = database
        .prepare(
          "SELECT * FROM research_objects WHERE id = ? AND project_id = ? AND type = 'source'",
        )
        .get(input.id, input.projectId);
      if (!existing) throw new Error("Source does not belong to the project.");
      const now = new Date().toISOString();
      const payload = objectPayloadSchema.parse({
        ...parseJson(existing.payload),
        ...input.payload,
      });
      if (payload.kind !== "source") {
        throw new Error("Source payload kind cannot be changed.");
      }
      if (
        payload.status !== "placeholder" &&
        !payload.url &&
        !payload.citation
      ) {
        throw new Error("A source requires a URL or citation.");
      }
      database.exec("BEGIN IMMEDIATE");
      try {
        database
          .prepare(
            "UPDATE research_objects SET description = ?, payload = ?, updated_at = ? WHERE id = ? AND project_id = ?",
          )
          .run(
            input.description,
            JSON.stringify(payload),
            now,
            input.id,
            input.projectId,
          );
        insertProvenance(
          {
            action: "source.enriched",
            objectId: input.id,
            projectId: input.projectId,
            metadata: {
              enrichmentMethod: payload.enrichmentMethod,
              enrichedAt: payload.enrichedAt,
            },
          },
          now,
        );
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      return mapObject(
        database
          .prepare("SELECT * FROM research_objects WHERE id = ?")
          .get(input.id),
      );
    },

    updateClaimStatus(input) {
      const parsed = claimStatusInputSchema.parse(input);
      ensureProject(parsed.projectId);
      const existing = database
        .prepare(
          "SELECT * FROM research_objects WHERE id = ? AND project_id = ? AND type = 'claim'",
        )
        .get(parsed.id, parsed.projectId);
      if (!existing) throw new Error("Claim does not belong to the project.");
      const previousPayload = objectPayloadSchema.parse(
        parseJson(existing.payload),
      );
      if (previousPayload.kind !== "claim") {
        throw new Error("Claim payload kind cannot be changed.");
      }
      if (
        parsed.reviewStatus === "Strong" ||
        parsed.reviewStatus === "Paper-ready"
      ) {
        const reviewedEvidence = database
          .prepare(
            `SELECT COUNT(*) AS count
             FROM research_relationships
             WHERE project_id = ? AND to_object_id = ?
               AND type IN ('supports', 'tests') AND review_state = 'approved'`,
          )
          .get(parsed.projectId, parsed.id);
        if (!reviewedEvidence || reviewedEvidence.count < 1) {
          throw new Error(
            "Strong and Paper-ready claims require reviewed supporting evidence.",
          );
        }
        const reviewedContradictions = database
          .prepare(
            `SELECT COUNT(*) AS count
             FROM research_relationships
             WHERE project_id = ? AND to_object_id = ?
               AND type = 'contradicts' AND review_state = 'approved'`,
          )
          .get(parsed.projectId, parsed.id);
        if (reviewedContradictions?.count > 0) {
          throw new Error(
            "Strong and Paper-ready claims cannot have unresolved reviewed contradictions.",
          );
        }
      }
      if (parsed.reviewStatus === "Paper-ready") {
        if (previousPayload.reproducibilityStatus !== "passed") {
          throw new Error(
            "Paper-ready claims require a passed reproducibility assessment.",
          );
        }
        if ((previousPayload.openRiskCount ?? 0) > 0) {
          throw new Error(
            "Paper-ready claims cannot have open blocking risks.",
          );
        }
        const completedEvidenceRun = database
          .prepare(
            `SELECT COUNT(*) AS count
             FROM research_relationships tests
             JOIN research_objects experiment
               ON experiment.id = tests.from_object_id
              AND experiment.project_id = tests.project_id
              AND experiment.type = 'experiment'
             JOIN research_relationships generated
               ON generated.to_object_id = experiment.id
               AND generated.project_id = experiment.project_id
               AND generated.type = 'generated-by'
               AND generated.review_state = 'approved'
             JOIN research_objects run
               ON run.id = generated.from_object_id
              AND run.project_id = generated.project_id
              AND run.type = 'run'
             WHERE tests.project_id = ? AND tests.to_object_id = ?
               AND tests.type = 'tests' AND tests.review_state = 'approved'
               AND json_extract(run.payload, '$.status') = 'completed'`,
          )
          .get(parsed.projectId, parsed.id);
        if (!completedEvidenceRun || completedEvidenceRun.count < 1) {
          throw new Error(
            "Paper-ready claims require a completed reviewed experiment run.",
          );
        }
      }
      const payload = objectPayloadSchema.parse({
        ...previousPayload,
        status: canonicalClaimStatus(parsed.reviewStatus),
        reviewStatus: parsed.reviewStatus,
      });
      const now = new Date().toISOString();
      database.exec("BEGIN IMMEDIATE");
      try {
        database
          .prepare(
            "UPDATE research_objects SET payload = ?, updated_at = ? WHERE id = ? AND project_id = ?",
          )
          .run(JSON.stringify(payload), now, parsed.id, parsed.projectId);
        insertProvenance(
          {
            action: "claim.status.updated",
            objectId: parsed.id,
            projectId: parsed.projectId,
            metadata: {
              from: previousPayload.reviewStatus ?? previousPayload.status,
              to: parsed.reviewStatus,
              reviewerId: parsed.reviewerId,
            },
          },
          now,
        );
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      return mapObject(
        database
          .prepare("SELECT * FROM research_objects WHERE id = ?")
          .get(parsed.id),
      );
    },

    createRelationship(input) {
      const parsed = relationshipInputSchema.parse(input);
      if (parsed.fromObjectId === parsed.toObjectId) {
        throw new Error("A research relationship cannot point to itself.");
      }
      const objects = database
        .prepare(
          `SELECT id FROM research_objects
           WHERE project_id = ? AND id IN (?, ?)`,
        )
        .all(parsed.projectId, parsed.fromObjectId, parsed.toObjectId);
      if (objects.length !== 2) {
        throw new Error("Both research objects must belong to the project.");
      }
      const id = parsed.id ?? randomUUID();
      const now = new Date().toISOString();
      database.exec("BEGIN IMMEDIATE");
      try {
        database
          .prepare(
            `INSERT INTO research_relationships
              (id, project_id, from_object_id, to_object_id, type, origin,
               review_state, confidence, reviewed_by, reviewed_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 'unreviewed', NULL, NULL, NULL, ?)`,
          )
          .run(
            id,
            parsed.projectId,
            parsed.fromObjectId,
            parsed.toObjectId,
            parsed.type,
            parsed.origin,
            now,
          );
        insertProvenance(
          {
            action: `relationship.${parsed.type}.created`,
            objectId: parsed.toObjectId,
            projectId: parsed.projectId,
          },
          now,
        );
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      return mapRelationship(
        database
          .prepare("SELECT * FROM research_relationships WHERE id = ?")
          .get(id),
      );
    },

    reviewRelationship(input) {
      const parsed = relationshipReviewInputSchema.parse(input);
      ensureProject(parsed.projectId);
      const existing = database
        .prepare(
          "SELECT id FROM research_relationships WHERE id = ? AND project_id = ?",
        )
        .get(parsed.id, parsed.projectId);
      if (!existing) {
        throw new Error(
          "Research relationship does not belong to the project.",
        );
      }
      const now = new Date().toISOString();
      database.exec("BEGIN IMMEDIATE");
      try {
        database
          .prepare(
            `UPDATE research_relationships
             SET review_state = ?, confidence = ?, reviewed_by = ?, reviewed_at = ?
             WHERE id = ? AND project_id = ?`,
          )
          .run(
            parsed.reviewState,
            parsed.confidence,
            parsed.reviewerId,
            now,
            parsed.id,
            parsed.projectId,
          );
        insertProvenance(
          {
            action: "relationship.reviewed",
            objectId: null,
            projectId: parsed.projectId,
            actorId: parsed.reviewerId,
            metadata: {
              relationshipId: parsed.id,
              reviewState: parsed.reviewState,
              confidence: parsed.confidence,
            },
          },
          now,
        );
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      return mapRelationship(
        database
          .prepare("SELECT * FROM research_relationships WHERE id = ?")
          .get(parsed.id),
      );
    },

    createProvenanceEvent(input) {
      const parsed = provenanceEventInputSchema.parse(input);
      ensureProject(parsed.projectId);
      if (parsed.objectId) {
        const object = database
          .prepare(
            "SELECT id FROM research_objects WHERE id = ? AND project_id = ?",
          )
          .get(parsed.objectId, parsed.projectId);
        if (!object) {
          throw new Error("Provenance object does not belong to the project.");
        }
      }
      return insertProvenance(parsed, new Date().toISOString());
    },

    upsertLineageSuggestions(projectId, suggestions) {
      ensureProject(projectId);
      const parsedSuggestions = z
        .array(lineageSuggestionInputSchema)
        .max(100)
        .parse(suggestions);
      const duplicateFingerprint = new Set();
      for (const suggestion of parsedSuggestions) {
        if (duplicateFingerprint.has(suggestion.fingerprint)) {
          throw new Error("Lineage scan produced a duplicate suggestion.");
        }
        duplicateFingerprint.add(suggestion.fingerprint);
      }
      const now = new Date().toISOString();
      database.exec("BEGIN IMMEDIATE");
      try {
        for (const suggestion of parsedSuggestions) {
          const existing = database
            .prepare(
              `SELECT * FROM lineage_suggestions
               WHERE project_id = ? AND fingerprint = ?`,
            )
            .get(projectId, suggestion.fingerprint);
          if (existing) {
            // A later inference must never replace an explicit reviewer
            // decision while retaining its approved or rejected state.
            if (existing.review_state !== "unreviewed") continue;
            const existingEvidence = database
              .prepare(
                `SELECT content_hash FROM lineage_evidence
                 WHERE suggestion_id = ? ORDER BY content_hash`,
              )
              .all(existing.id)
              .map((row) => row.content_hash);
            const nextEvidence = suggestion.evidence
              .map((evidence) => evidence.contentHash)
              .sort();
            const unchanged =
              existing.chain_json === JSON.stringify(suggestion.chain) &&
              existing.confidence === suggestion.confidence &&
              existing.rationale === suggestion.rationale &&
              JSON.stringify(existingEvidence) === JSON.stringify(nextEvidence);
            if (unchanged) continue;
            database
              .prepare(
                `UPDATE lineage_suggestions
                 SET chain_json = ?, confidence = ?, rationale = ?, updated_at = ?
                 WHERE id = ? AND project_id = ?`,
              )
              .run(
                JSON.stringify(suggestion.chain),
                suggestion.confidence,
                suggestion.rationale,
                now,
                existing.id,
                projectId,
              );
            database
              .prepare("DELETE FROM lineage_evidence WHERE suggestion_id = ?")
              .run(existing.id);
            for (const evidence of suggestion.evidence) {
              database
                .prepare(
                  `INSERT INTO lineage_evidence
                   (id, project_id, suggestion_id, evidence_type, path, coordinates,
                    excerpt, content_hash, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                )
                .run(
                  randomUUID(),
                  projectId,
                  existing.id,
                  evidence.evidenceType,
                  evidence.path ?? null,
                  JSON.stringify(evidence.coordinates),
                  evidence.excerpt ?? null,
                  evidence.contentHash,
                  now,
                );
            }
            continue;
          }

          const id = randomUUID();
          database
            .prepare(
              `INSERT INTO lineage_suggestions
               (id, project_id, fingerprint, chain_json, confidence, rationale, origin,
                review_state, reviewed_by, reviewed_at, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 'inferred', 'unreviewed', NULL, NULL, ?, ?)`,
            )
            .run(
              id,
              projectId,
              suggestion.fingerprint,
              JSON.stringify(suggestion.chain),
              suggestion.confidence,
              suggestion.rationale,
              now,
              now,
            );
          for (const evidence of suggestion.evidence) {
            database
              .prepare(
                `INSERT INTO lineage_evidence
                 (id, project_id, suggestion_id, evidence_type, path, coordinates,
                  excerpt, content_hash, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              )
              .run(
                randomUUID(),
                projectId,
                id,
                evidence.evidenceType,
                evidence.path ?? null,
                JSON.stringify(evidence.coordinates),
                evidence.excerpt ?? null,
                evidence.contentHash,
                now,
              );
          }
        }
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      return listLineageSuggestions(projectId);
    },

    listLineageSuggestions(projectId) {
      return listLineageSuggestions(projectId);
    },

    recordLineageScanMeasurement(projectId, input) {
      ensureProject(projectId);
      const parsed = z
        .object({
          scanDurationMs: z.number().int().min(0),
          timeToFirstChainMs: z.number().int().min(0).nullable(),
          suggestionCount: z.number().int().min(0),
          manualConfig: z.record(z.string(), z.unknown()),
        })
        .parse(input);
      const metrics = lineageAcceptanceMetrics(projectId);
      const measurement = {
        id: randomUUID(),
        projectId,
        ...parsed,
        ...metrics,
        createdAt: new Date().toISOString(),
      };
      database
        .prepare(
          `INSERT INTO lineage_scan_measurements
           (id, project_id, scan_duration_ms, time_to_first_chain_ms, suggestion_count,
            accepted_count, rejected_count, correction_count, manual_config_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          measurement.id,
          projectId,
          measurement.scanDurationMs,
          measurement.timeToFirstChainMs,
          measurement.suggestionCount,
          measurement.acceptedCount,
          measurement.rejectedCount,
          measurement.correctionCount,
          JSON.stringify(measurement.manualConfig),
          measurement.createdAt,
        );
      return measurement;
    },

    reviewLineageSuggestions(input) {
      const parsed = lineageReviewInputSchema.parse(input);
      ensureProject(parsed.projectId);
      const ids = parsed.decisions.map((decision) => decision.id);
      if (new Set(ids).size !== ids.length) {
        throw new Error(
          "A lineage suggestion can only be reviewed once per batch.",
        );
      }
      const rows = database
        .prepare(
          `SELECT * FROM lineage_suggestions
           WHERE project_id = ? AND id IN (${ids.map(() => "?").join(", ")})`,
        )
        .all(parsed.projectId, ...ids);
      if (rows.length !== ids.length) {
        throw new Error("A lineage suggestion does not belong to the project.");
      }
      const rowsById = new Map(rows.map((row) => [row.id, row]));
      const now = new Date().toISOString();
      database.exec("BEGIN IMMEDIATE");
      try {
        for (const decision of parsed.decisions) {
          const existing = rowsById.get(decision.id);
          const reviewState =
            decision.action === "reject" ? "rejected" : "approved";
          const chain = decision.edit?.chain ?? parseJson(existing.chain_json);
          const confidence = decision.edit?.confidence ?? existing.confidence;
          const rationale = decision.edit?.rationale ?? existing.rationale;
          database
            .prepare(
              `UPDATE lineage_suggestions
               SET chain_json = ?, confidence = ?, rationale = ?, review_state = ?,
                   reviewed_by = ?, reviewed_at = ?, updated_at = ?
               WHERE id = ? AND project_id = ?`,
            )
            .run(
              JSON.stringify(chain),
              confidence,
              rationale,
              reviewState,
              parsed.actor,
              now,
              now,
              decision.id,
              parsed.projectId,
            );
          insertProvenance(
            {
              action: `lineage.suggestion.${
                decision.action === "approve"
                  ? "approved"
                  : decision.action === "reject"
                    ? "rejected"
                    : "edited"
              }`,
              actorId: parsed.actor,
              actorType: "human",
              projectId: parsed.projectId,
              metadata: {
                action: decision.action,
                suggestionId: decision.id,
                reviewState,
                ...(decision.edit ? { correction: decision.edit } : {}),
              },
            },
            now,
          );
        }
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      const reviewed = listLineageSuggestions(parsed.projectId);
      return ids.map((id) =>
        reviewed.find((suggestion) => suggestion.id === id),
      );
    },

    listProject(projectId) {
      ensureProject(projectId);
      const objects = database
        .prepare(
          "SELECT * FROM research_objects WHERE project_id = ? ORDER BY created_at, id",
        )
        .all(projectId)
        .map(mapObject);
      const relationships = database
        .prepare(
          "SELECT * FROM research_relationships WHERE project_id = ? ORDER BY created_at, id",
        )
        .all(projectId)
        .map(mapRelationship);
      return { objects, relationships };
    },

    getProject(projectId) {
      ensureProject(projectId);
      return mapProject(
        database.prepare("SELECT * FROM projects WHERE id = ?").get(projectId),
      );
    },

    appendProvenance(input) {
      const parsed = provenanceInputSchema.parse(input);
      ensureProject(parsed.projectId);
      if (parsed.objectId) {
        const object = database
          .prepare(
            "SELECT id FROM research_objects WHERE id = ? AND project_id = ?",
          )
          .get(parsed.objectId, parsed.projectId);
        if (!object) {
          throw new Error("Research object does not belong to the project.");
        }
      }
      return insertProvenance(parsed, new Date().toISOString());
    },

    listProvenance(projectId, options) {
      ensureProject(projectId);
      if (options === undefined) {
        return database
          .prepare(
            "SELECT * FROM provenance_events WHERE project_id = ? ORDER BY created_at, id",
          )
          .all(projectId)
          .map(mapProvenanceEvent);
      }
      const { limit } = provenanceListSchema.parse(options);
      return database
        .prepare(
          `SELECT * FROM provenance_events
           WHERE project_id = ?
           ORDER BY created_at DESC, rowid DESC
           LIMIT ?`,
        )
        .all(projectId, limit)
        .map(mapProvenanceEvent);
    },

    verifyProvenance(projectId) {
      ensureProject(projectId);
      if (!hasProvenanceChain) {
        return { valid: false, reason: "Provenance chain is unavailable." };
      }
      const rows = database
        .prepare(
          `SELECT * FROM provenance_events
           WHERE project_id = ? ORDER BY sequence`,
        )
        .all(projectId);
      const head = database
        .prepare("SELECT * FROM provenance_heads WHERE project_id = ?")
        .get(projectId);
      let previousHash = null;
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const sequence = index + 1;
        const expectedHash = hashProvenanceRow(row, sequence, previousHash);
        if (
          row.sequence !== sequence ||
          row.previous_hash !== previousHash ||
          row.event_hash !== expectedHash
        ) {
          return {
            valid: false,
            reason: `Provenance chain mismatch at sequence ${sequence}.`,
          };
        }
        previousHash = expectedHash;
      }
      const valid =
        (head?.event_count ?? 0) === rows.length &&
        (head?.last_sequence ?? 0) === rows.length &&
        (head?.last_hash ?? null) === previousHash;
      return valid
        ? { valid: true, eventCount: rows.length, headHash: previousHash }
        : { valid: false, reason: "Provenance head does not match the chain." };
    },
  };
}
