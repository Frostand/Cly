import { z } from "zod";
import { getStateDatabase } from "../../persisted-state.js";
import { createResearchRepository } from "./repository.js";

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

async function readJson(c) {
  try {
    return { data: await c.req.json() };
  } catch {
    return { error: c.text("Invalid JSON payload.", 400) };
  }
}

export function registerResearchRoutes(
  app,
  { getRepository = () => createResearchRepository(getStateDatabase()) } = {},
) {
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
