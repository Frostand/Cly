import { z } from "zod";
import { getStateDatabase } from "../../persisted-state.js";
import {
  createObligationService,
  datasetObligationInputSchema,
  obligationOperationSchema,
} from "./obligation-service.js";

const actorSchema = z.string().trim().min(1).max(200);
const approvalSchema = z
  .object({
    operation: obligationOperationSchema,
    actorId: actorSchema.default("local-user"),
    rationale: z.string().trim().min(1).max(10_000),
  })
  .strict();
const transitionSchema = z
  .object({
    state: z.enum(["acknowledged", "resolved"]),
    actorId: actorSchema.default("local-user"),
    note: z.string().trim().min(1).max(10_000),
  })
  .strict();

async function parse(c, schema) {
  try {
    const result = schema.safeParse(await c.req.json());
    return result.success
      ? { data: result.data }
      : { error: c.text(result.error.message, 400) };
  } catch {
    return { error: c.text("Invalid JSON payload.", 400) };
  }
}

const failure = (c, error, fallback, status = 400) =>
  c.text(error instanceof Error ? error.message : fallback, status);

export function registerObligationRoutes(
  app,
  { getService = () => createObligationService(getStateDatabase()) } = {},
) {
  app.get("/api/projects/:projectId/obligations", (c) => {
    try {
      return c.json(getService().getSummary(c.req.param("projectId")));
    } catch (error) {
      return failure(c, error, "Obligation query failed.");
    }
  });

  app.put(
    "/api/projects/:projectId/datasets/:datasetObjectId/obligation",
    async (c) => {
      const body = await parse(c, datasetObligationInputSchema);
      if (body.error) return body.error;
      try {
        return c.json(
          getService().saveObligation(
            c.req.param("projectId"),
            c.req.param("datasetObjectId"),
            body.data,
          ),
        );
      } catch (error) {
        return failure(c, error, "Obligation update failed.");
      }
    },
  );

  app.post("/api/projects/:projectId/obligations/evaluate", async (c) => {
    const body = await parse(c, obligationOperationSchema);
    if (body.error) return body.error;
    return c.json(
      getService().safeEvaluateOperation(c.req.param("projectId"), body.data),
    );
  });

  app.post("/api/projects/:projectId/obligations/approvals", async (c) => {
    const body = await parse(c, approvalSchema);
    if (body.error) return body.error;
    try {
      return c.json(
        getService().approveOperation(
          c.req.param("projectId"),
          body.data.operation,
          body.data,
        ),
        201,
      );
    } catch (error) {
      return failure(c, error, "Operation approval failed.", 409);
    }
  });

  app.patch(
    "/api/projects/:projectId/obligations/alerts/:alertId",
    async (c) => {
      const body = await parse(c, transitionSchema);
      if (body.error) return body.error;
      try {
        return c.json(
          getService().transitionAlert(
            c.req.param("projectId"),
            c.req.param("alertId"),
            body.data,
          ),
        );
      } catch (error) {
        return failure(c, error, "Alert update failed.", 409);
      }
    },
  );
}
