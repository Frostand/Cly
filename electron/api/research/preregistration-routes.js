import { z } from "zod";
import { preregistrationContentSchema } from "./preregistration.js";

const snapshotBodySchema = z
  .object({
    content: preregistrationContentSchema,
    amendsSnapshotId: z.string().trim().min(1).nullable().optional(),
    actorType: z
      .enum(["human", "agent", "system", "integration"])
      .default("human"),
    actorId: z.string().trim().min(1).max(200).default("local-user"),
    origin: z
      .enum(["human", "imported", "inferred", "system"])
      .default("human"),
  })
  .strict();

const actorBodySchema = z
  .object({
    actorId: z.string().trim().min(1).max(200).default("local-user"),
  })
  .strict();

const deviationBodySchema = z
  .object({
    fieldPath: z.enum([
      "/hypothesis",
      "/primaryMetrics",
      "/exclusionRules",
      "/analysisPlan",
      "/successCriteria",
      "/dataset",
      "/intendedDesign",
    ]),
    afterValue: z.unknown(),
    rationale: z.string().trim().min(1).max(10_000),
    actorId: z.string().trim().min(1).max(200).default("local-user"),
  })
  .strict();

const comparisonBodySchema = z
  .object({ content: preregistrationContentSchema })
  .strict();

async function parseBody(c, schema) {
  try {
    const parsed = schema.safeParse(await c.req.json());
    return parsed.success
      ? { data: parsed.data }
      : { error: c.text(parsed.error.message, 400) };
  } catch {
    return { error: c.text("Invalid JSON payload.", 400) };
  }
}

const failure = (c, error, fallback) =>
  c.text(error instanceof Error ? error.message : fallback, 400);

export function registerPreregistrationRoutes(app, { getRepository }) {
  app.get("/api/projects/:projectId/preregistrations", (c) => {
    try {
      return c.json(
        getRepository().listPreregistrations(c.req.param("projectId")),
      );
    } catch (error) {
      return failure(c, error, "Preregistrations could not be loaded.");
    }
  });

  app.get(
    "/api/projects/:projectId/experiments/:experimentId/preregistrations",
    (c) => {
      try {
        return c.json(
          getRepository().listPreregistrations(
            c.req.param("projectId"),
            c.req.param("experimentId"),
          ),
        );
      } catch (error) {
        return failure(c, error, "Preregistrations could not be loaded.");
      }
    },
  );

  app.post(
    "/api/projects/:projectId/experiments/:experimentId/preregistrations",
    async (c) => {
      const body = await parseBody(c, snapshotBodySchema);
      if (body.error) return body.error;
      try {
        return c.json(
          getRepository().createPreregistration({
            ...body.data,
            projectId: c.req.param("projectId"),
            experimentId: c.req.param("experimentId"),
          }),
          201,
        );
      } catch (error) {
        return failure(c, error, "Preregistration could not be saved.");
      }
    },
  );

  app.post(
    "/api/projects/:projectId/preregistrations/:snapshotId/compare",
    async (c) => {
      const body = await parseBody(c, comparisonBodySchema);
      if (body.error) return body.error;
      try {
        return c.json(
          getRepository().comparePreregistration(
            c.req.param("projectId"),
            c.req.param("snapshotId"),
            body.data.content,
          ),
        );
      } catch (error) {
        return failure(c, error, "Preregistration comparison failed.");
      }
    },
  );

  app.post(
    "/api/projects/:projectId/preregistrations/:snapshotId/final-evaluation",
    async (c) => {
      const body = await parseBody(c, actorBodySchema);
      if (body.error) return body.error;
      try {
        return c.json(
          getRepository().markPreregistrationEvaluated({
            ...body.data,
            projectId: c.req.param("projectId"),
            snapshotId: c.req.param("snapshotId"),
          }),
          201,
        );
      } catch (error) {
        return failure(c, error, "Final evaluation could not be recorded.");
      }
    },
  );

  app.post(
    "/api/projects/:projectId/preregistrations/:snapshotId/deviations",
    async (c) => {
      const body = await parseBody(c, deviationBodySchema);
      if (body.error) return body.error;
      try {
        return c.json(
          getRepository().declareAnalysisDeviation({
            ...body.data,
            projectId: c.req.param("projectId"),
            snapshotId: c.req.param("snapshotId"),
          }),
          201,
        );
      } catch (error) {
        return failure(c, error, "Analysis deviation could not be recorded.");
      }
    },
  );

  app.post(
    "/api/projects/:projectId/deviations/:deviationId/acknowledgements",
    async (c) => {
      const body = await parseBody(c, actorBodySchema);
      if (body.error) return body.error;
      try {
        return c.json(
          getRepository().acknowledgeAnalysisDeviation({
            ...body.data,
            projectId: c.req.param("projectId"),
            deviationId: c.req.param("deviationId"),
          }),
          201,
        );
      } catch (error) {
        return failure(
          c,
          error,
          "Analysis deviation could not be acknowledged.",
        );
      }
    },
  );
}
