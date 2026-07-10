import { randomUUID } from "node:crypto";
import { z } from "zod";

const objectInputSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    projectId: z.string().trim().min(1),
    type: z.enum(["artifact", "source", "claim", "experiment", "run"]),
    title: z.string().trim().min(1).max(500),
    description: z.string().trim().max(10_000).default(""),
    payload: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine((value, context) => {
    if (value.type !== value.payload.kind) {
      context.addIssue({
        code: "custom",
        message: "Object type must match payload kind.",
        path: ["payload", "kind"],
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

const parseJson = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
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

export function createResearchRepository(database) {
  const ensureProject = (projectId) => {
    const project = database
      .prepare("SELECT id FROM projects WHERE id = ?")
      .get(projectId);
    if (!project) {
      throw new Error("Research project does not exist.");
    }
  };

  const appendProvenance = ({ action, objectId, projectId }, now) => {
    database
      .prepare(
        `INSERT INTO provenance_events
          (id, project_id, object_id, action, actor_type, actor_id, metadata, created_at)
         VALUES (?, ?, ?, ?, 'human', 'local-user', '{}', ?)`,
      )
      .run(randomUUID(), projectId, objectId ?? null, action, now);
  };

  return {
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
        appendProvenance(
          {
            action: `${parsed.type}.created`,
            objectId: id,
            projectId: parsed.projectId,
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
        appendProvenance(
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
  };
}
