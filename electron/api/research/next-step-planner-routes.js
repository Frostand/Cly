import { z } from "zod";

const generateSchema = z
  .object({ actor: z.string().trim().min(1).max(200).default("local-user") })
  .strict();

const proposedActionSchema = z
  .object({
    kind: z.enum(["review", "resolve", "rerun", "regenerate"]),
    description: z.string().trim().min(1).max(2_000),
  })
  .strict();

const editSchema = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    rationale: z.string().trim().min(1).max(10_000).optional(),
    expectedBenefit: z.string().trim().min(1).max(2_000).optional(),
    effort: z.enum(["small", "medium", "large"]).optional(),
    dependencies: z
      .array(z.string().trim().min(1).max(500))
      .max(100)
      .optional(),
    proposedAction: proposedActionSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "An edit cannot be empty.");

const decisionSchema = z
  .object({
    action: z.enum(["accept", "edit", "defer", "dismiss"]),
    actor: z.string().trim().min(1).max(200).default("local-user"),
    reason: z.string().trim().min(1).max(10_000).nullable().optional(),
    edit: editSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (["defer", "dismiss"].includes(value.action) && !value.reason) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: `${value.action === "defer" ? "Deferring" : "Dismissing"} a recommendation requires a reason.`,
      });
    }
    if (value.action === "edit" && !value.edit) {
      context.addIssue({
        code: "custom",
        path: ["edit"],
        message: "Editing a recommendation requires corrected content.",
      });
    }
    if (value.action !== "edit" && value.edit) {
      context.addIssue({
        code: "custom",
        path: ["edit"],
        message: "Corrected content is only valid for an edit decision.",
      });
    }
  });

async function readJson(c) {
  try {
    return { data: await c.req.json() };
  } catch {
    return { error: c.text("Invalid JSON payload.", 400) };
  }
}

export function registerNextStepPlannerRoutes(app, { getPlanner }) {
  app.get("/api/projects/:projectId/next-step-plans", (c) => {
    try {
      return c.json(getPlanner().list(c.req.param("projectId")));
    } catch (error) {
      return c.text(
        error instanceof Error ? error.message : "Next-step plan query failed.",
        400,
      );
    }
  });

  app.post("/api/projects/:projectId/next-step-plans", async (c) => {
    const body = await readJson(c);
    if (body.error) return body.error;
    const parsed = generateSchema.safeParse(body.data);
    if (!parsed.success) return c.text(parsed.error.message, 400);
    try {
      return c.json(
        getPlanner().generate(c.req.param("projectId"), parsed.data.actor),
        201,
      );
    } catch (error) {
      return c.text(
        error instanceof Error
          ? error.message
          : "Next-step plan generation failed.",
        400,
      );
    }
  });

  app.post(
    "/api/projects/:projectId/next-step-plans/recommendations/:recommendationId/decisions",
    async (c) => {
      const body = await readJson(c);
      if (body.error) return body.error;
      const parsed = decisionSchema.safeParse(body.data);
      if (!parsed.success) return c.text(parsed.error.message, 400);
      try {
        return c.json(
          getPlanner().decide({
            projectId: c.req.param("projectId"),
            recommendationId: c.req.param("recommendationId"),
            ...parsed.data,
            reason: parsed.data.reason ?? null,
            edit: parsed.data.edit ?? null,
          }),
        );
      } catch (error) {
        return c.text(
          error instanceof Error
            ? error.message
            : "Next-step review decision failed.",
          400,
        );
      }
    },
  );
}
