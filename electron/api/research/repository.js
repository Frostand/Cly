import { randomUUID } from "node:crypto";
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
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapRelationship = (row) => ({
  id: row.id,
  projectId: row.project_id,
  fromObjectId: row.from_object_id,
  toObjectId: row.to_object_id,
  type: row.type,
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
});

export function createResearchRepository(database) {
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
        JSON.stringify(metadata),
        now,
      );
    return mapProvenanceEvent(
      database.prepare("SELECT * FROM provenance_events WHERE id = ?").get(id),
    );
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
              (id, project_id, type, title, description, payload, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            id,
            parsed.projectId,
            parsed.type,
            parsed.title,
            parsed.description,
            JSON.stringify(parsed.payload),
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
              (id, project_id, from_object_id, to_object_id, type, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(
            id,
            parsed.projectId,
            parsed.fromObjectId,
            parsed.toObjectId,
            parsed.type,
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
  };
}
