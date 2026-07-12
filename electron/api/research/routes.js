import { z } from "zod";
import { getStateDatabase } from "../../persisted-state.js";
import { createResearchRepository } from "./repository.js";
import { createRepositoryObserver } from "./repository-observer.js";

const objectBodySchema = z.object({
  type: z.enum(["source", "claim"]),
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(10_000).default(""),
  payload: z.record(z.string(), z.unknown()),
});

const relationshipBodySchema = z.object({
  fromObjectId: z.string().trim().min(1),
  toObjectId: z.string().trim().min(1),
  type: z.enum(["supports", "contradicts"]),
});

const sourceUpdateBodySchema = z.object({
  description: z.string().trim().max(10_000),
  payload: z.record(z.string(), z.unknown()),
});

const projectBodySchema = z.object({
  name: z.string().trim().min(1).max(500),
  path: z.string().trim().min(1).max(4_000),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const provenanceQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

async function readJson(c) {
  try {
    return { data: await c.req.json() };
  } catch {
    return { error: c.text("Invalid JSON payload.", 400) };
  }
}

export function registerResearchRoutes(
  app,
  {
    getRepository = () => createResearchRepository(getStateDatabase()),
    getRepositoryObserver = () =>
      createRepositoryObserver(createResearchRepository(getStateDatabase())),
  } = {},
) {
  app.put("/api/projects/:projectId/research", async (c) => {
    const body = await readJson(c);
    if (body.error) return body.error;
    const parsed = projectBodySchema.safeParse(body.data);
    if (!parsed.success) return c.text(parsed.error.message, 400);
    try {
      return c.json(
        getRepository().upsertProject({
          ...parsed.data,
          id: c.req.param("projectId"),
        }),
      );
    } catch (error) {
      return c.text(
        error instanceof Error ? error.message : "Project sync failed.",
        400,
      );
    }
  });

  app.get("/api/projects/:projectId/research", (c) => {
    try {
      return c.json(getRepository().listProject(c.req.param("projectId")));
    } catch (error) {
      return c.text(
        error instanceof Error ? error.message : "Research query failed.",
        400,
      );
    }
  });

  app.get("/api/projects/:projectId/provenance", (c) => {
    const parsed = provenanceQuerySchema.safeParse({
      limit: c.req.query("limit") ?? undefined,
    });
    if (!parsed.success) return c.text(parsed.error.message, 400);
    try {
      return c.json(
        getRepository().listProvenance(c.req.param("projectId"), parsed.data),
      );
    } catch (error) {
      return c.text(
        error instanceof Error ? error.message : "Provenance query failed.",
        400,
      );
    }
  });

  app.post("/api/projects/:projectId/repository-observations", async (c) => {
    if (
      (c.req.header("content-length") &&
        c.req.header("content-length") !== "0") ||
      c.req.header("transfer-encoding")
    ) {
      return c.text(
        "Repository observation requests do not accept a body.",
        400,
      );
    }
    try {
      const observation = await getRepositoryObserver().scan(
        c.req.param("projectId"),
      );
      return c.json(observation, 201);
    } catch (error) {
      return c.text(
        error instanceof Error
          ? error.message
          : "Repository observation failed.",
        400,
      );
    }
  });

  app.post("/api/projects/:projectId/research/objects", async (c) => {
    const body = await readJson(c);
    if (body.error) return body.error;
    const parsed = objectBodySchema.safeParse(body.data);
    if (!parsed.success) return c.text(parsed.error.message, 400);
    try {
      const object = getRepository().createObject({
        ...parsed.data,
        projectId: c.req.param("projectId"),
      });
      return c.json(object, 201);
    } catch (error) {
      return c.text(
        error instanceof Error
          ? error.message
          : "Research object creation failed.",
        400,
      );
    }
  });

  app.post("/api/projects/:projectId/research/relationships", async (c) => {
    const body = await readJson(c);
    if (body.error) return body.error;
    const parsed = relationshipBodySchema.safeParse(body.data);
    if (!parsed.success) return c.text(parsed.error.message, 400);
    try {
      const relationship = getRepository().createRelationship({
        ...parsed.data,
        projectId: c.req.param("projectId"),
      });
      return c.json(relationship, 201);
    } catch (error) {
      return c.text(
        error instanceof Error
          ? error.message
          : "Research relationship creation failed.",
        400,
      );
    }
  });

  app.patch(
    "/api/projects/:projectId/research/objects/:objectId",
    async (c) => {
      const body = await readJson(c);
      if (body.error) return body.error;
      const parsed = sourceUpdateBodySchema.safeParse(body.data);
      if (!parsed.success) return c.text(parsed.error.message, 400);
      try {
        return c.json(
          getRepository().updateSource({
            ...parsed.data,
            id: c.req.param("objectId"),
            projectId: c.req.param("projectId"),
          }),
        );
      } catch (error) {
        return c.text(
          error instanceof Error ? error.message : "Source update failed.",
          400,
        );
      }
    },
  );
}
