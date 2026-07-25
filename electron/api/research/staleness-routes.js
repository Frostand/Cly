import { z } from "zod";
import { projectStalenessInputSchema } from "./staleness.js";

const listQuerySchema = z.object({
  includeCurrent: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .default(false),
});

const failure = (c, error, fallback) =>
  c.text(error instanceof Error ? error.message : fallback, 400);

export function registerStalenessRoutes(app, { getRepository }) {
  app.post("/api/projects/:projectId/staleness/assessments", async (c) => {
    let input;
    try {
      input = await c.req.json();
    } catch {
      return c.text("Invalid JSON payload.", 400);
    }
    const parsed = projectStalenessInputSchema.safeParse({
      ...input,
      projectId: c.req.param("projectId"),
    });
    if (!parsed.success) return c.text(z.prettifyError(parsed.error), 400);
    try {
      return c.json(getRepository().assessProjectStaleness(parsed.data));
    } catch (error) {
      return failure(c, error, "Project staleness could not be assessed.");
    }
  });

  app.get("/api/projects/:projectId/staleness", (c) => {
    const parsed = listQuerySchema.safeParse({
      includeCurrent: c.req.query("includeCurrent") ?? undefined,
    });
    if (!parsed.success) return c.text(z.prettifyError(parsed.error), 400);
    try {
      return c.json(
        getRepository().listStaleness(c.req.param("projectId"), parsed.data),
      );
    } catch (error) {
      return failure(c, error, "Project staleness could not be loaded.");
    }
  });

  app.get("/api/projects/:projectId/staleness/:objectId/transitions", (c) => {
    try {
      return c.json(
        getRepository().listStalenessTransitions(
          c.req.param("projectId"),
          c.req.param("objectId"),
        ),
      );
    } catch (error) {
      return failure(c, error, "Staleness transitions could not be loaded.");
    }
  });
}
