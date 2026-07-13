import { z } from "zod";
import { getStateDatabase } from "../../persisted-state.js";
import { createCostLedgerRepository } from "./cost-ledger-repository.js";
import { registerCostLedgerRoutes } from "./cost-ledger-routes.js";
import { createLineageReconstructor } from "./lineage-reconstructor.js";
import { registerPreregistrationRoutes } from "./preregistration-routes.js";
import { createResearchRepository } from "./repository.js";
import { createRepositoryObserver } from "./repository-observer.js";
import { createReviewerCapsuleService } from "./reviewer-capsule.js";

const objectBodySchema = z.object({
  type: z.enum(["artifact", "source", "claim", "experiment", "run"]),
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(10_000).default(""),
  payload: z.record(z.string(), z.unknown()),
});

const relationshipBodySchema = z.object({
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

const relationshipReviewBodySchema = z.object({
  reviewState: z.enum(["approved", "rejected"]),
  confidence: z.number().finite().min(0).max(1).nullable().default(null),
});

const claimStatusBodySchema = z.object({
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

const reviewerCapsuleBodySchema = z
  .object({
    claimIds: z
      .array(z.string().trim().min(1).max(200))
      .min(1)
      .max(25)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Claim IDs must be unique.",
      ),
  })
  .strict();

const lineageCorrectionBodySchema = z
  .object({
    confidence: z.number().finite().min(0).max(1).optional(),
    rationale: z.string().trim().min(1).max(10_000).optional(),
  })
  .strict()
  .refine(
    (value) => value.confidence !== undefined || value.rationale !== undefined,
    "An edit decision requires at least one correction.",
  );

const lineageReviewDecisionBodySchema = z.discriminatedUnion("action", [
  z
    .object({ id: z.string().trim().min(1), action: z.literal("approve") })
    .strict(),
  z
    .object({ id: z.string().trim().min(1), action: z.literal("reject") })
    .strict(),
  z
    .object({
      id: z.string().trim().min(1),
      action: z.literal("edit"),
      edit: lineageCorrectionBodySchema,
    })
    .strict(),
]);

const lineageReviewBodySchema = z.object({
  actor: z.string().trim().min(1).max(200).default("local-user"),
  decisions: z.array(lineageReviewDecisionBodySchema).min(1).max(100),
});

const decisionBriefGenerateBodySchema = z
  .object({ actor: z.string().trim().min(1).max(200).default("local-user") })
  .strict();

const decisionBriefTransitionBodySchema = z
  .object({
    status: z.enum(["open", "assigned", "resolved", "deferred"]),
    owner: z.string().trim().min(1).max(200).nullable().optional(),
    reason: z.string().trim().min(1).max(10_000).nullable().optional(),
    actor: z.string().trim().min(1).max(200).default("local-user"),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === "assigned" && !value.owner) {
      context.addIssue({
        code: "custom",
        message: "Assigning a finding requires an owner.",
        path: ["owner"],
      });
    }
    if (value.status === "deferred" && !value.reason) {
      context.addIssue({
        code: "custom",
        message: "Deferring a finding requires a reason.",
        path: ["reason"],
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

export function registerResearchRoutes(
  app,
  {
    getRepository = () => createResearchRepository(getStateDatabase()),
    getRepositoryObserver = () =>
      createRepositoryObserver(createResearchRepository(getStateDatabase())),
    getLineageReconstructor = () =>
      createLineageReconstructor(createResearchRepository(getStateDatabase())),
    getReviewerCapsuleService = () =>
      createReviewerCapsuleService(
        createResearchRepository(getStateDatabase()),
      ),
    getCostLedgerRepository = () =>
      createCostLedgerRepository(getStateDatabase()),
  } = {},
) {
  registerCostLedgerRoutes(app, {
    getRepository: getCostLedgerRepository,
  });
  registerPreregistrationRoutes(app, { getRepository });

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

  app.get("/api/projects/:projectId/provenance/integrity", (c) => {
    try {
      const result = getRepository().verifyProvenance(c.req.param("projectId"));
      return c.json(result);
    } catch (error) {
      return c.text(
        error instanceof Error
          ? error.message
          : "Provenance verification failed.",
        400,
      );
    }
  });

  app.get("/api/projects/:projectId/decision-briefs", (c) => {
    try {
      return c.json(
        getRepository().listDecisionBriefs(c.req.param("projectId")),
      );
    } catch (error) {
      return c.text(
        error instanceof Error ? error.message : "Decision briefs failed.",
        400,
      );
    }
  });

  app.post("/api/projects/:projectId/decision-briefs", async (c) => {
    const body = await readJson(c);
    if (body.error) return body.error;
    const parsed = decisionBriefGenerateBodySchema.safeParse(body.data);
    if (!parsed.success) return c.text(parsed.error.message, 400);
    try {
      return c.json(
        getRepository().generateDecisionBrief(
          c.req.param("projectId"),
          parsed.data.actor,
        ),
        201,
      );
    } catch (error) {
      return c.text(
        error instanceof Error
          ? error.message
          : "Decision brief generation failed.",
        400,
      );
    }
  });

  app.patch(
    "/api/projects/:projectId/decision-briefs/:briefId/findings/:findingId",
    async (c) => {
      const body = await readJson(c);
      if (body.error) return body.error;
      const parsed = decisionBriefTransitionBodySchema.safeParse(body.data);
      if (!parsed.success) return c.text(parsed.error.message, 400);
      try {
        return c.json(
          getRepository().transitionDecisionBriefFinding({
            ...parsed.data,
            projectId: c.req.param("projectId"),
            briefId: c.req.param("briefId"),
            findingId: c.req.param("findingId"),
          }),
        );
      } catch (error) {
        return c.text(
          error instanceof Error
            ? error.message
            : "Decision brief finding update failed.",
          400,
        );
      }
    },
  );

  for (const [path, operation] of [
    ["preview", "preview"],
    ["export", "export"],
  ]) {
    app.post(`/api/projects/:projectId/reviewer-capsule/${path}`, async (c) => {
      const body = await readJson(c);
      if (body.error) return body.error;
      const parsed = reviewerCapsuleBodySchema.safeParse(body.data);
      if (!parsed.success) return c.text(parsed.error.message, 400);
      try {
        const service = getReviewerCapsuleService();
        const capsule =
          operation === "export"
            ? service.export(c.req.param("projectId"), parsed.data.claimIds)
            : service.preview(c.req.param("projectId"), parsed.data.claimIds);
        return c.json(capsule);
      } catch (error) {
        return c.text(
          error instanceof Error
            ? error.message
            : "Reviewer capsule generation failed.",
          400,
        );
      }
    });
  }

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

  app.get("/api/projects/:projectId/lineage-suggestions", (c) => {
    try {
      return c.json(
        getRepository().listLineageSuggestions(c.req.param("projectId")),
      );
    } catch (error) {
      return c.text(
        error instanceof Error ? error.message : "Lineage suggestions failed.",
        400,
      );
    }
  });

  app.post("/api/projects/:projectId/lineage-suggestions/scan", async (c) => {
    if (
      (c.req.header("content-length") &&
        c.req.header("content-length") !== "0") ||
      c.req.header("transfer-encoding")
    ) {
      return c.text("Lineage scan requests do not accept a body.", 400);
    }
    try {
      return c.json(
        await getLineageReconstructor().scanLineage(c.req.param("projectId")),
        201,
      );
    } catch (error) {
      return c.text(
        error instanceof Error
          ? error.message
          : "Lineage reconstruction failed.",
        400,
      );
    }
  });

  app.post("/api/projects/:projectId/lineage-suggestions/review", async (c) => {
    const body = await readJson(c);
    if (body.error) return body.error;
    const parsed = lineageReviewBodySchema.safeParse(body.data);
    if (!parsed.success) return c.text(parsed.error.message, 400);
    try {
      return c.json({
        suggestions: getLineageReconstructor().reviewLineageSuggestions(
          c.req.param("projectId"),
          parsed.data.decisions,
          parsed.data.actor,
        ),
      });
    } catch (error) {
      return c.text(
        error instanceof Error ? error.message : "Lineage review failed.",
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
    "/api/projects/:projectId/research/relationships/:relationshipId/review",
    async (c) => {
      const body = await readJson(c);
      if (body.error) return body.error;
      const parsed = relationshipReviewBodySchema.safeParse(body.data);
      if (!parsed.success) return c.text(parsed.error.message, 400);
      try {
        return c.json(
          getRepository().reviewRelationship({
            ...parsed.data,
            id: c.req.param("relationshipId"),
            projectId: c.req.param("projectId"),
            reviewerId: "local-user",
          }),
        );
      } catch (error) {
        return c.text(
          error instanceof Error
            ? error.message
            : "Relationship review failed.",
          400,
        );
      }
    },
  );

  app.patch("/api/projects/:projectId/research/claims/:claimId", async (c) => {
    const body = await readJson(c);
    if (body.error) return body.error;
    const parsed = claimStatusBodySchema.safeParse(body.data);
    if (!parsed.success) return c.text(parsed.error.message, 400);
    try {
      return c.json(
        getRepository().updateClaimStatus({
          ...parsed.data,
          id: c.req.param("claimId"),
          projectId: c.req.param("projectId"),
        }),
      );
    } catch (error) {
      return c.text(
        error instanceof Error ? error.message : "Claim update failed.",
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
