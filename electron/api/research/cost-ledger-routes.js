import { z } from "zod";

const manualCostBodySchema = z
  .object({
    amountMinor: z.number().int().safe(),
    category: z.enum([
      "gpu",
      "cloud",
      "storage",
      "model-api",
      "agent",
      "rerun",
      "other",
    ]),
    confidenceBps: z.number().int().min(0).max(10_000),
    currency: z.string().regex(/^[A-Z]{3}$/),
    description: z.string().trim().max(2_000).default(""),
    endedAt: z.iso.datetime(),
    runId: z.string().trim().min(1).max(500),
    startedAt: z.iso.datetime(),
  })
  .strict();

const awsCurImportBodySchema = z
  .object({
    csv: z.string().min(1).max(10_000_000),
    fileName: z.string().trim().min(1).max(500).default("aws-cur.csv"),
  })
  .strict();

async function readJson(c) {
  try {
    return { data: await c.req.json() };
  } catch {
    return { error: c.text("Invalid JSON payload.", 400) };
  }
}

function failure(c, error, fallback) {
  return c.text(error instanceof Error ? error.message : fallback, 400);
}

export function registerCostLedgerRoutes(app, { getRepository }) {
  app.get("/api/projects/:projectId/costs", (c) => {
    try {
      return c.json(getRepository().listLedger(c.req.param("projectId")));
    } catch (error) {
      return failure(c, error, "Cost ledger query failed.");
    }
  });

  app.post("/api/projects/:projectId/costs", async (c) => {
    const body = await readJson(c);
    if (body.error) return body.error;
    const parsed = manualCostBodySchema.safeParse(body.data);
    if (!parsed.success) return c.text(parsed.error.message, 400);
    try {
      return c.json(
        getRepository().createManualEntry({
          ...parsed.data,
          projectId: c.req.param("projectId"),
        }),
        201,
      );
    } catch (error) {
      return failure(c, error, "Cost entry creation failed.");
    }
  });

  app.post("/api/projects/:projectId/costs/imports/aws-cur", async (c) => {
    const body = await readJson(c);
    if (body.error) return body.error;
    const parsed = awsCurImportBodySchema.safeParse(body.data);
    if (!parsed.success) return c.text(parsed.error.message, 400);
    try {
      return c.json(
        getRepository().importAwsCur({
          ...parsed.data,
          projectId: c.req.param("projectId"),
        }),
        201,
      );
    } catch (error) {
      return failure(c, error, "AWS CUR import failed.");
    }
  });

  app.get("/api/projects/:projectId/costs/claims", (c) => {
    try {
      return c.json(getRepository().listClaimCosts(c.req.param("projectId")));
    } catch (error) {
      return failure(c, error, "Claim cost query failed.");
    }
  });

  app.get("/api/projects/:projectId/costs/claims/:claimId", (c) => {
    try {
      return c.json(
        getRepository().getClaimCosts(
          c.req.param("projectId"),
          c.req.param("claimId"),
        ),
      );
    } catch (error) {
      return failure(c, error, "Claim cost query failed.");
    }
  });
}
