import { z } from "zod";
import { getStateDatabase } from "../../persisted-state.js";
import { createResearchRepository } from "../research/repository.js";
import { createPrImpactReviewService } from "./pr-impact-review.js";

const refSchema = z.string().trim().min(1).max(500);
const sourceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("local"),
      scope: z.enum(["working-tree", "staged"]).default("working-tree"),
      baseRef: refSchema.optional(),
      headRef: refSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("pull-request"),
      number: z.number().int().positive(),
      baseRef: refSchema,
      headRef: refSchema,
      state: z.enum(["open", "merged", "closed"]).default("open"),
      title: z.string().trim().max(500).optional(),
      url: z.url().optional(),
    })
    .strict(),
]);

const reviewBodySchema = z.object({ source: sourceSchema }).strict();
const approvalBodySchema = z
  .object({
    reviewId: z.string().regex(/^[a-f0-9]{64}$/),
    actorId: z.string().trim().min(1).max(200),
    decision: z.enum(["approved", "rejected"]),
    confirmedLinkIds: z
      .array(z.string().trim().min(1).max(500))
      .max(500)
      .default([]),
    note: z.string().trim().min(1).max(4_000),
  })
  .strict();

async function readJson(c) {
  try {
    return { data: await c.req.json() };
  } catch {
    return { error: c.text("Invalid JSON payload.", 400) };
  }
}

export function registerPrImpactReviewRoutes(
  app,
  {
    getService = () =>
      createPrImpactReviewService(createResearchRepository(getStateDatabase())),
  } = {},
) {
  app.post("/api/projects/:projectId/pr-impact-review", async (c) => {
    const body = await readJson(c);
    if (body.error) return body.error;
    const parsed = reviewBodySchema.safeParse(body.data);
    if (!parsed.success) return c.text(parsed.error.message, 400);
    try {
      return c.json(
        await getService().analyze(
          c.req.param("projectId"),
          parsed.data.source,
        ),
      );
    } catch (error) {
      return c.text(
        error instanceof Error ? error.message : "Impact review failed.",
        400,
      );
    }
  });

  app.post("/api/projects/:projectId/pr-impact-review/approvals", async (c) => {
    const body = await readJson(c);
    if (body.error) return body.error;
    const parsed = approvalBodySchema.safeParse(body.data);
    if (!parsed.success) return c.text(parsed.error.message, 400);
    try {
      return c.json(
        getService().recordHumanReview(c.req.param("projectId"), parsed.data),
        201,
      );
    } catch (error) {
      return c.text(
        error instanceof Error
          ? error.message
          : "Human review could not be recorded.",
        400,
      );
    }
  });
}
