import { z } from "zod";
import { getStateDatabase } from "../../persisted-state.js";
import { createCodeResearchLinker } from "./code-linker.js";
import { registerContextRoutes } from "./context-routes.js";
import { createCostLedgerRepository } from "./cost-ledger-repository.js";
import { registerCostLedgerRoutes } from "./cost-ledger-routes.js";
import { registerExperimentProvenanceRoutes } from "./experiment-provenance-routes.js";
import { createLineageReconstructor } from "./lineage-reconstructor.js";
import { createNextStepPlanner } from "./next-step-planner.js";
import { registerNextStepPlannerRoutes } from "./next-step-planner-routes.js";
import { createNotebookImporter } from "./notebook-importer.js";
import { registerNotebookRoutes } from "./notebook-routes.js";
import { registerObligationRoutes } from "./obligation-routes.js";
import { createObligationService } from "./obligation-service.js";
import { createOnboardingDiagnosticsService } from "./onboarding-diagnostics.js";
import { registerPreregistrationRoutes } from "./preregistration-routes.js";
import { createResearchRepository } from "./repository.js";
import { createRepositoryObserver } from "./repository-observer.js";
import { createRepositoryWorkflowCoordinator } from "./repository-workflow-coordinator.js";
import { createReproducibilityAuditService } from "./reproducibility-audit.js";
import { createReviewerCapsuleService } from "./reviewer-capsule.js";
import { registerStalenessRoutes } from "./staleness-routes.js";

const objectBodySchema = z.object({
  type: z.enum([
    "artifact",
    "source",
    "claim",
    "experiment",
    "run",
    "notebook",
    "notebook-cell",
    "notebook-output",
    "dependency",
    "dataset",
    "metric",
    "figure",
    "table",
    "risk",
    "method",
    "objective",
  ]),
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(10_000).default(""),
  payload: z.record(z.string(), z.unknown()),
  origin: z.enum(["human", "imported", "inferred", "system"]).default("human"),
});

const relationshipBodySchema = z.object({
  fromObjectId: z.string().trim().min(1),
  toObjectId: z.string().trim().min(1),
  type: z.enum([
    "supports",
    "contradicts",
    "contains",
    "generated-by",
    "uses",
    "tests",
    "implements",
    "contains",
    "produces",
    "depends-on",
    "documents",
    "has-risk",
    "part-of",
  ]),
  verificationState: z.literal("unverified").optional(),
  evidence: z
    .array(
      z.object({
        kind: z.string().trim().min(1).max(100),
        path: z.string().trim().min(1).max(4_000),
        locator: z.string().trim().min(1).max(500),
        excerpt: z.string().max(1_000),
        contentHash: z.string().regex(/^[a-f0-9]{64}$/i),
      }),
    )
    .max(100)
    .optional(),
  origin: z.enum(["human", "imported", "inferred", "system"]).default("human"),
});

const evidenceLinkBodySchema = z.object({
  sourceId: z.string().trim().min(1),
  claimId: z.string().trim().min(1),
  quote: z.string().trim().min(1).max(20_000),
  locator: z.string().trim().min(1).max(1_000).optional(),
  type: z.enum(["supports", "contradicts"]),
  origin: z.enum(["human", "imported", "inferred", "system"]).default("human"),
  actorId: z.string().trim().min(1).max(200).optional(),
  confidence: z.number().finite().min(0).max(1).nullable().default(null),
});

const evidenceVerificationBodySchema = z.object({
  verificationState: z.enum(["verified", "rejected"]),
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

const repositoryApprovalDecisionSchema = z
  .object({ actorId: z.string().trim().min(1).max(200) })
  .strict();

const repositoryObservationSettingSchema = z
  .object({
    approvalId: z.string().trim().min(1).max(500),
    enabled: z.boolean(),
  })
  .strict();

const repositoryReferenceSchema = z
  .object({
    approvalId: z.string().trim().min(1).max(500),
    reference: z.unknown(),
    researchObjectIds: z.array(z.unknown()),
  })
  .strict();

const codeContextQuerySchema = z.object({
  path: z.string().trim().min(1).max(4_000),
  symbol: z.string().trim().min(1).max(4_000).nullable().optional(),
});

const codeEntityQuerySchema = z.object({
  kind: z.enum(["file", "symbol"]).optional(),
});

const codeLinkBodySchema = z.object({
  codeEntityId: z.string().trim().min(1).max(500),
  targetKind: z.enum([
    "objective",
    "method",
    "dataset",
    "experiment",
    "run",
    "claim",
    "test",
    "risk",
    "commit",
    "issue",
    "source",
    "artifact",
  ]),
  targetId: z.string().trim().min(1).max(4_000),
  targetTitle: z.string().trim().min(1).max(500).optional(),
  linkRole: z.enum([
    "implements",
    "uses",
    "produces",
    "tests",
    "supports",
    "affects",
    "discusses",
  ]),
  source: z.enum(["manual", "execution", "agent-proposed"]),
  origin: z.string().trim().min(1).max(500),
  confidence: z.number().finite().min(0).max(1).nullable().optional(),
  evidence: z
    .array(
      z
        .object({
          type: z.enum([
            "source-location",
            "notebook-cell",
            "execution-trace",
            "git-commit",
            "user-assertion",
          ]),
          locator: z.string().trim().min(1).max(4_000),
          description: z.string().trim().min(1).max(2_000),
          contentHash: z
            .string()
            .regex(/^[a-f0-9]{64}$/i)
            .optional(),
        })
        .strict(),
    )
    .max(50)
    .default([]),
});

const codeLinkReviewBodySchema = z
  .object({ verificationState: z.enum(["verified", "rejected"]) })
  .strict();

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

const reproducibilityFindingBodySchema = z
  .object({
    actorId: z.string().trim().min(1).max(200).default("local-user"),
  })
  .strict();

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
      (() => {
        const database = getStateDatabase();
        const repository = createResearchRepository(database);
        const linker = createCodeResearchLinker(database, repository);
        return createRepositoryObserver(repository, {
          onChanges: (...args) => linker.recordRepositoryChanges(...args),
        });
      })(),
    getCodeLinker = () => {
      const database = getStateDatabase();
      return createCodeResearchLinker(
        database,
        createResearchRepository(database),
      );
    },
    getRepositoryWorkflowCoordinator,
    getLineageReconstructor = () =>
      createLineageReconstructor(createResearchRepository(getStateDatabase())),
    getNotebookImporter = () =>
      createNotebookImporter(createResearchRepository(getStateDatabase())),
    getReviewerCapsuleService = () =>
      createReviewerCapsuleService(
        createResearchRepository(getStateDatabase()),
      ),
    getCostLedgerRepository = () =>
      createCostLedgerRepository(getStateDatabase()),
    getObligationService = () => createObligationService(getStateDatabase()),
    getReproducibilityAuditService = () => {
      const database = getStateDatabase();
      return createReproducibilityAuditService(
        database,
        createResearchRepository(database),
      );
    },
    getNextStepPlanner = () => createNextStepPlanner(getStateDatabase()),
    getOnboardingDiagnostics = () =>
      createOnboardingDiagnosticsService(
        createResearchRepository(getStateDatabase()),
      ),
  } = {},
) {
  let repositoryWorkflowCoordinator;
  const resolveRepositoryWorkflowCoordinator = () => {
    if (getRepositoryWorkflowCoordinator) {
      return getRepositoryWorkflowCoordinator();
    }
    repositoryWorkflowCoordinator ??= createRepositoryWorkflowCoordinator(
      getRepository(),
    );
    return repositoryWorkflowCoordinator;
  };

  registerCostLedgerRoutes(app, {
    getRepository: getCostLedgerRepository,
  });
  registerContextRoutes(app);
  registerExperimentProvenanceRoutes(app, { getRepository });
  registerPreregistrationRoutes(app, { getRepository });
  registerObligationRoutes(app, { getService: getObligationService });
  registerNotebookRoutes(app, { getImporter: getNotebookImporter });
  registerStalenessRoutes(app, { getRepository });
  registerNextStepPlannerRoutes(app, { getPlanner: getNextStepPlanner });

  app.get("/api/projects/:projectId/onboarding/diagnostics", async (c) => {
    try {
      return c.json(
        await getOnboardingDiagnostics().diagnose(c.req.param("projectId")),
      );
    } catch (error) {
      return c.text(
        error instanceof Error
          ? error.message
          : "Project readiness checks failed.",
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

  app.get("/api/projects/:projectId/reproducibility-audits/latest", (c) => {
    try {
      return c.json(
        getReproducibilityAuditService().latest(c.req.param("projectId")),
      );
    } catch (error) {
      return c.text(
        error instanceof Error
          ? error.message
          : "Reproducibility audit query failed.",
        400,
      );
    }
  });

  app.post("/api/projects/:projectId/reproducibility-audits", async (c) => {
    if (
      (c.req.header("content-length") &&
        c.req.header("content-length") !== "0") ||
      c.req.header("transfer-encoding")
    ) {
      return c.text(
        "Reproducibility audit requests do not accept a body.",
        400,
      );
    }
    try {
      return c.json(
        getReproducibilityAuditService().run(c.req.param("projectId")),
        201,
      );
    } catch (error) {
      return c.text(
        error instanceof Error
          ? error.message
          : "Reproducibility audit failed.",
        400,
      );
    }
  });

  app.patch(
    "/api/projects/:projectId/reproducibility-audits/:auditId/findings/:findingId",
    async (c) => {
      const body = await readJson(c);
      if (body.error) return body.error;
      const parsed = reproducibilityFindingBodySchema.safeParse(body.data);
      if (!parsed.success) return c.text(parsed.error.message, 400);
      try {
        return c.json(
          getReproducibilityAuditService().resolve(
            c.req.param("projectId"),
            c.req.param("auditId"),
            c.req.param("findingId"),
            parsed.data.actorId,
          ),
        );
      } catch (error) {
        return c.text(
          error instanceof Error
            ? error.message
            : "Reproducibility finding update failed.",
          400,
        );
      }
    },
  );

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

  app.post(
    "/api/projects/:projectId/repository-action-approvals",
    async (c) => {
      const body = await readJson(c);
      if (body.error) return body.error;
      try {
        return c.json(
          resolveRepositoryWorkflowCoordinator().requestApproval(
            c.req.param("projectId"),
            body.data,
          ),
          201,
        );
      } catch (error) {
        return c.text(
          error instanceof Error
            ? error.message
            : "Repository approval request failed.",
          400,
        );
      }
    },
  );

  app.post(
    "/api/projects/:projectId/repository-action-approvals/:approvalId/approve",
    async (c) => {
      const body = await readJson(c);
      if (body.error) return body.error;
      const parsed = repositoryApprovalDecisionSchema.safeParse(body.data);
      if (!parsed.success) return c.text(parsed.error.message, 400);
      try {
        return c.json(
          resolveRepositoryWorkflowCoordinator().approveAction(
            c.req.param("projectId"),
            c.req.param("approvalId"),
            parsed.data.actorId,
          ),
        );
      } catch (error) {
        return c.text(
          error instanceof Error
            ? error.message
            : "Repository action approval failed.",
          409,
        );
      }
    },
  );

  app.put(
    "/api/projects/:projectId/repository-observation-setting",
    async (c) => {
      const body = await readJson(c);
      if (body.error) return body.error;
      const parsed = repositoryObservationSettingSchema.safeParse(body.data);
      if (!parsed.success) return c.text(parsed.error.message, 400);
      try {
        return c.json(
          resolveRepositoryWorkflowCoordinator().setObservationEnabled(
            c.req.param("projectId"),
            parsed.data,
          ),
        );
      } catch (error) {
        return c.text(
          error instanceof Error
            ? error.message
            : "Repository observation setting failed.",
          error?.code ? 409 : 400,
        );
      }
    },
  );

  app.post("/api/projects/:projectId/repository-links", async (c) => {
    const body = await readJson(c);
    if (body.error) return body.error;
    const parsed = repositoryReferenceSchema.safeParse(body.data);
    if (!parsed.success) return c.text(parsed.error.message, 400);
    try {
      return c.json(
        resolveRepositoryWorkflowCoordinator().linkReference(
          c.req.param("projectId"),
          parsed.data,
        ),
        201,
      );
    } catch (error) {
      return c.text(
        error instanceof Error
          ? error.message
          : "Repository reference link failed.",
        error?.code ? 409 : 400,
      );
    }
  });

  app.post("/api/projects/:projectId/code-context/scan", async (c) => {
    if (
      (c.req.header("content-length") &&
        c.req.header("content-length") !== "0") ||
      c.req.header("transfer-encoding")
    ) {
      return c.text("Code scan requests do not accept a body.", 400);
    }
    try {
      return c.json(await getCodeLinker().scan(c.req.param("projectId")), 201);
    } catch (error) {
      return c.text(
        error instanceof Error ? error.message : "Code scan failed.",
        400,
      );
    }
  });

  app.get("/api/projects/:projectId/code-context", (c) => {
    const parsed = codeContextQuerySchema.safeParse({
      path: c.req.query("path"),
      symbol: c.req.query("symbol") ?? undefined,
    });
    if (!parsed.success) return c.text(parsed.error.message, 400);
    try {
      return c.json(
        getCodeLinker().getContext(c.req.param("projectId"), parsed.data),
      );
    } catch (error) {
      return c.text(
        error instanceof Error ? error.message : "Code context failed.",
        400,
      );
    }
  });

  app.get("/api/projects/:projectId/code-context/entities", (c) => {
    const parsed = codeEntityQuerySchema.safeParse({
      kind: c.req.query("kind") ?? undefined,
    });
    if (!parsed.success) return c.text(parsed.error.message, 400);
    try {
      return c.json(
        getCodeLinker().listEntities(c.req.param("projectId"), parsed.data),
      );
    } catch (error) {
      return c.text(
        error instanceof Error ? error.message : "Code entity list failed.",
        400,
      );
    }
  });

  app.post("/api/projects/:projectId/code-context/links", async (c) => {
    const body = await readJson(c);
    if (body.error) return body.error;
    const parsed = codeLinkBodySchema.safeParse(body.data);
    if (!parsed.success) return c.text(parsed.error.message, 400);
    try {
      return c.json(
        getCodeLinker().createLink({
          ...parsed.data,
          projectId: c.req.param("projectId"),
        }),
        201,
      );
    } catch (error) {
      return c.text(
        error instanceof Error ? error.message : "Code link creation failed.",
        400,
      );
    }
  });

  app.patch(
    "/api/projects/:projectId/code-context/links/:linkId/review",
    async (c) => {
      const body = await readJson(c);
      if (body.error) return body.error;
      const parsed = codeLinkReviewBodySchema.safeParse(body.data);
      if (!parsed.success) return c.text(parsed.error.message, 400);
      try {
        return c.json(
          getCodeLinker().reviewLink({
            ...parsed.data,
            id: c.req.param("linkId"),
            projectId: c.req.param("projectId"),
            reviewerId: "local-user",
          }),
        );
      } catch (error) {
        return c.text(
          error instanceof Error ? error.message : "Code link review failed.",
          400,
        );
      }
    },
  );

  app.get("/api/projects/:projectId/code-context/stale", (c) => {
    try {
      return c.json(getCodeLinker().listStaleImpact(c.req.param("projectId")));
    } catch (error) {
      return c.text(
        error instanceof Error ? error.message : "Stale code context failed.",
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

  app.post("/api/projects/:projectId/research/evidence-links", async (c) => {
    const body = await readJson(c);
    if (body.error) return body.error;
    const parsed = evidenceLinkBodySchema.safeParse(body.data);
    if (!parsed.success) return c.text(parsed.error.message, 400);
    try {
      return c.json(
        getRepository().createEvidenceLink({
          ...parsed.data,
          projectId: c.req.param("projectId"),
        }),
        201,
      );
    } catch (error) {
      return c.text(
        error instanceof Error
          ? error.message
          : "Evidence link creation failed.",
        400,
      );
    }
  });

  app.patch(
    "/api/projects/:projectId/research/evidence/:evidenceId/verification",
    async (c) => {
      const body = await readJson(c);
      if (body.error) return body.error;
      const parsed = evidenceVerificationBodySchema.safeParse(body.data);
      if (!parsed.success) return c.text(parsed.error.message, 400);
      try {
        return c.json(
          getRepository().reviewEvidence({
            ...parsed.data,
            id: c.req.param("evidenceId"),
            projectId: c.req.param("projectId"),
            reviewerId: "local-user",
          }),
        );
      } catch (error) {
        return c.text(
          error instanceof Error ? error.message : "Evidence review failed.",
          400,
        );
      }
    },
  );

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
