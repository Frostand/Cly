import { z } from "zod";
import { getStateDatabase } from "../../persisted-state.js";
import { registerContextRoutes } from "./context-routes.js";
import { createCostLedgerRepository } from "./cost-ledger-repository.js";
import { registerCostLedgerRoutes } from "./cost-ledger-routes.js";
import { registerExperimentProvenanceRoutes } from "./experiment-provenance-routes.js";
import { createLineageReconstructor } from "./lineage-reconstructor.js";
import { registerObligationRoutes } from "./obligation-routes.js";
import { createObligationService } from "./obligation-service.js";
import { registerPreregistrationRoutes } from "./preregistration-routes.js";
import { createResearchRepository } from "./repository.js";
import { createRepositoryObserver } from "./repository-observer.js";
import { createReviewerCapsuleService } from "./reviewer-capsule.js";
import { createResearchWorkflowRepository } from "./workflow-repository.js";

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
const sourceArchiveBodySchema = z.object({ archived: z.boolean() }).strict();

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
    purpose: z.string().trim().min(1).max(1_000).default("peer-review"),
    collaborators: z
      .array(z.string().trim().min(1).max(500))
      .max(100)
      .default([]),
    residency: z.string().trim().min(1).max(200).nullable().default(null),
    license: z.string().trim().min(1).max(500).nullable().default(null),
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

const decisionBodySchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    decision: z.string().trim().min(1).max(20_000),
    reason: z.string().trim().min(1).max(20_000),
    alternatives: z
      .array(z.string().trim().min(1).max(2_000))
      .max(100)
      .default([]),
    evidenceIds: z
      .array(z.string().trim().min(1).max(500))
      .max(500)
      .default([]),
    affectedIds: z
      .array(z.string().trim().min(1).max(500))
      .max(500)
      .default([]),
    status: z.enum(["Active", "Unresolved"]).default("Active"),
    outcome: z.string().trim().min(1).max(20_000).nullable().optional(),
    origin: z
      .enum(["Researcher", "Team", "Agent-assisted"])
      .default("Researcher"),
    actor: z.string().trim().min(1).max(200).default("local-user"),
  })
  .strict();
const decisionUpdateBodySchema = decisionBodySchema
  .partial()
  .extend({ actor: z.string().trim().min(1).max(200).default("local-user") })
  .strict()
  .refine(
    (value) => Object.keys(value).some((key) => key !== "actor"),
    "A decision update requires a change.",
  );
const plannerStepSchema = z
  .object({
    id: z.string().trim().min(1).max(500),
    title: z.string().trim().min(1).max(500),
    category: z.enum([
      "Claim",
      "Experiment",
      "Source",
      "Integrity",
      "Notebook",
      "Code",
    ]),
    rationale: z.string().trim().min(1).max(10_000),
    impact: z.enum(["High", "Medium", "Low"]),
    effort: z.enum(["Small", "Medium", "Large"]),
    urgency: z.enum(["Now", "Soon", "Later"]),
    evidenceIds: z
      .array(z.string().trim().min(1).max(500))
      .max(500)
      .default([]),
    claimId: z.string().trim().min(1).max(500).optional(),
    experimentId: z.string().trim().min(1).max(500).optional(),
    agentPreset: z.string().trim().min(1).max(500),
    contextPack: z.string().trim().min(1).max(500),
    status: z
      .enum(["Recommended", "Accepted", "Deferred", "Dismissed", "In progress"])
      .default("Recommended"),
  })
  .strict();
const plannerGenerateBodySchema = z
  .object({
    steps: z.array(plannerStepSchema).max(500),
    actor: z.string().trim().min(1).max(200).default("local-user"),
  })
  .strict();
const plannerStatusBodySchema = z
  .object({
    status: z.enum([
      "Accepted",
      "Deferred",
      "Dismissed",
      "In progress",
      "Recommended",
    ]),
    actor: z.string().trim().min(1).max(200).default("local-user"),
  })
  .strict();
const auditAreaSchema = z.enum([
  "Code",
  "Data",
  "Environment",
  "Experiments",
  "Outputs",
  "Claims",
]);
const auditBodySchema = z
  .object({
    audit: z
      .object({
        id: z.string().trim().min(1),
        score: z.number().int().min(0).max(100),
        status: z.enum([
          "Not reproducible",
          "Partially reproducible",
          "Mostly reproducible",
          "Artifact-ready",
          "Publication-ready",
        ]),
        createdAt: z.iso.datetime(),
        findingIds: z.array(z.string()).default([]),
        areas: z
          .array(
            z.object({
              area: auditAreaSchema,
              passed: z.boolean(),
              findingCount: z.number().int().min(0),
            }),
          )
          .optional(),
      })
      .strict(),
    findings: z
      .array(
        z
          .object({
            id: z.string().trim().min(1),
            category: z.string().trim().min(1),
            title: z.string().trim().min(1),
            detail: z.string(),
            severity: z.enum(["Blocking", "High", "Warning", "Passed"]),
            status: z.enum([
              "Open",
              "Assigned",
              "Resolved",
              "Deferred",
              "Ignored",
            ]),
            objectIds: z.array(z.string()),
            assignee: z.string().trim().min(1).optional(),
            deferredReason: z.string().trim().min(1).optional(),
            area: auditAreaSchema.optional(),
            affectedClaimIds: z.array(z.string()).optional(),
            recommendedFix: z.string().optional(),
          })
          .strict(),
      )
      .max(1000),
    actor: z.string().trim().min(1).max(200).default("local-user"),
  })
  .strict();
const findingDispositionBodySchema = z
  .object({
    status: z.enum(["Open", "Assigned", "Resolved", "Deferred", "Ignored"]),
    assignee: z.string().trim().min(1).max(200).optional(),
    reason: z.string().trim().min(1).max(10_000).optional(),
    actor: z.string().trim().min(1).max(200).default("local-user"),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === "Assigned" && !value.assignee)
      context.addIssue({
        code: "custom",
        message: "Assignment requires an assignee.",
        path: ["assignee"],
      });
    if (value.status === "Deferred" && !value.reason)
      context.addIssue({
        code: "custom",
        message: "Deferral requires a reason.",
        path: ["reason"],
      });
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
    getObligationService = () => createObligationService(getStateDatabase()),
    getWorkflowRepository = () => {
      const database = getStateDatabase();
      const researchRepository = createResearchRepository(database);
      return createResearchWorkflowRepository(database, {
        appendProvenance: (input) => researchRepository.appendProvenance(input),
      });
    },
  } = {},
) {
  registerCostLedgerRoutes(app, {
    getRepository: getCostLedgerRepository,
  });
  registerContextRoutes(app);
  registerExperimentProvenanceRoutes(app, { getRepository });
  registerPreregistrationRoutes(app, { getRepository });
  registerObligationRoutes(app, { getService: getObligationService });

  app.get("/api/research/projects", (c) => {
    try {
      return c.json(getRepository().listProjects());
    } catch (error) {
      return c.text(
        error instanceof Error ? error.message : "Project query failed.",
        400,
      );
    }
  });

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
      const projectId = c.req.param("projectId");
      return c.json({
        ...getRepository().listProject(projectId),
        ...getWorkflowRepository().listSnapshot(projectId),
      });
    } catch (error) {
      return c.text(
        error instanceof Error ? error.message : "Research query failed.",
        400,
      );
    }
  });

  app.post("/api/projects/:projectId/decisions", async (c) => {
    const body = await readJson(c);
    if (body.error) return body.error;
    const parsed = decisionBodySchema.safeParse(body.data);
    if (!parsed.success) return c.text(parsed.error.message, 400);
    try {
      return c.json(
        getWorkflowRepository().createDecision(
          c.req.param("projectId"),
          parsed.data,
        ),
        201,
      );
    } catch (error) {
      return c.text(
        error instanceof Error ? error.message : "Decision creation failed.",
        400,
      );
    }
  });
  app.patch("/api/projects/:projectId/decisions/:decisionId", async (c) => {
    const body = await readJson(c);
    if (body.error) return body.error;
    const parsed = decisionUpdateBodySchema.safeParse(body.data);
    if (!parsed.success) return c.text(parsed.error.message, 400);
    try {
      return c.json(
        getWorkflowRepository().updateDecision(
          c.req.param("projectId"),
          c.req.param("decisionId"),
          parsed.data,
        ),
      );
    } catch (error) {
      return c.text(
        error instanceof Error ? error.message : "Decision update failed.",
        400,
      );
    }
  });
  app.post(
    "/api/projects/:projectId/decisions/:decisionId/supersede",
    async (c) => {
      const body = await readJson(c);
      if (body.error) return body.error;
      const parsed = decisionBodySchema.safeParse(body.data);
      if (!parsed.success) return c.text(parsed.error.message, 400);
      try {
        return c.json(
          getWorkflowRepository().supersedeDecision(
            c.req.param("projectId"),
            c.req.param("decisionId"),
            parsed.data,
          ),
          201,
        );
      } catch (error) {
        return c.text(
          error instanceof Error
            ? error.message
            : "Decision supersession failed.",
          400,
        );
      }
    },
  );
  app.get("/api/projects/:projectId/decisions/:decisionId/history", (c) => {
    try {
      return c.json(
        getWorkflowRepository().listDecisionHistory(
          c.req.param("projectId"),
          c.req.param("decisionId"),
        ),
      );
    } catch (error) {
      return c.text(
        error instanceof Error ? error.message : "Decision history failed.",
        400,
      );
    }
  });
  app.post("/api/projects/:projectId/planner/generate", async (c) => {
    const body = await readJson(c);
    if (body.error) return body.error;
    const parsed = plannerGenerateBodySchema.safeParse(body.data);
    if (!parsed.success) return c.text(parsed.error.message, 400);
    try {
      return c.json(
        getWorkflowRepository().replacePlannerSteps(
          c.req.param("projectId"),
          parsed.data.steps,
          parsed.data.actor,
        ),
        201,
      );
    } catch (error) {
      return c.text(
        error instanceof Error ? error.message : "Planner generation failed.",
        400,
      );
    }
  });
  app.patch("/api/projects/:projectId/planner/:stepId", async (c) => {
    const body = await readJson(c);
    if (body.error) return body.error;
    const parsed = plannerStatusBodySchema.safeParse(body.data);
    if (!parsed.success) return c.text(parsed.error.message, 400);
    try {
      return c.json(
        getWorkflowRepository().transitionPlannerStep(
          c.req.param("projectId"),
          c.req.param("stepId"),
          parsed.data.status,
          parsed.data.actor,
        ),
      );
    } catch (error) {
      return c.text(
        error instanceof Error ? error.message : "Planner update failed.",
        400,
      );
    }
  });
  app.post("/api/projects/:projectId/reproducibility/audits", async (c) => {
    const body = await readJson(c);
    if (body.error) return body.error;
    const parsed = auditBodySchema.safeParse(body.data);
    if (!parsed.success) return c.text(parsed.error.message, 400);
    try {
      return c.json(
        getWorkflowRepository().saveAudit(
          c.req.param("projectId"),
          parsed.data.audit,
          parsed.data.findings,
          parsed.data.actor,
        ),
        201,
      );
    } catch (error) {
      return c.text(
        error instanceof Error
          ? error.message
          : "Reproducibility audit save failed.",
        400,
      );
    }
  });
  app.patch(
    "/api/projects/:projectId/reproducibility/findings/:findingId",
    async (c) => {
      const body = await readJson(c);
      if (body.error) return body.error;
      const parsed = findingDispositionBodySchema.safeParse(body.data);
      if (!parsed.success) return c.text(parsed.error.message, 400);
      try {
        return c.json(
          getWorkflowRepository().transitionFinding(
            c.req.param("projectId"),
            c.req.param("findingId"),
            parsed.data,
          ),
        );
      } catch (error) {
        return c.text(
          error instanceof Error ? error.message : "Finding update failed.",
          400,
        );
      }
    },
  );

  app.patch(
    "/api/projects/:projectId/research/sources/:sourceId/archive",
    async (c) => {
      const body = await readJson(c);
      if (body.error) return body.error;
      const parsed = sourceArchiveBodySchema.safeParse(body.data);
      if (!parsed.success) return c.text(parsed.error.message, 400);
      try {
        return c.json(
          getRepository().setSourceArchived(
            c.req.param("projectId"),
            c.req.param("sourceId"),
            parsed.data.archived,
          ),
        );
      } catch (error) {
        return c.text(
          error instanceof Error
            ? error.message
            : "Source archive update failed.",
          400,
        );
      }
    },
  );

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
        const evaluation = getObligationService().safeEvaluateOperation(
          c.req.param("projectId"),
          {
            kind: "export",
            integration: "reviewer-capsule",
            objectIds: parsed.data.claimIds,
            purpose: parsed.data.purpose,
            collaborators: parsed.data.collaborators,
            residency: parsed.data.residency,
            license: parsed.data.license,
            provider: null,
            external: true,
          },
        );
        if (evaluation.decision !== "allow") {
          return c.json(
            {
              error:
                evaluation.decision === "block"
                  ? "Reviewer capsule blocked by research-data obligations."
                  : "Reviewer capsule requires recorded human approval.",
              evaluation,
            },
            409,
          );
        }
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
