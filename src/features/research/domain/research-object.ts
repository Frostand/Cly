import { z } from "zod";

import type {
  ArtifactPayload,
  ClaimPayload,
  EvidencePayload,
  ExperimentPayload,
  ProjectLifecycleObjectType,
  ProjectLifecyclePayload,
  RunPayload,
  SourcePayload,
} from "./research-types";

const lifecyclePayloadSchemas = [
  "question",
  "objective",
  "hypothesis",
  "method",
  "risk",
  "task",
  "collaborator",
  "agent",
] as const satisfies readonly ProjectLifecycleObjectType[];

const extractedSourceValueSchema = z.object({
  value: z.string().trim().min(1).max(20_000),
  passage: z.object({
    quote: z.string().trim().min(1).max(20_000),
    locator: z.string().trim().min(1).max(1_000).optional(),
    sourceId: z.string().trim().min(1).max(500).optional(),
  }),
  confidence: z.number().finite().min(0).max(100),
  verificationState: z.enum(["unverified", "verified", "rejected"]),
  verifiedBy: z.string().trim().min(1).max(500).optional(),
  verifiedAt: z.iso.datetime().optional(),
});

const literatureProviderCallSchema = z.object({
  attempts: z
    .array(
      z.object({
        attempt: z.number().int().min(1),
        durationMs: z.number().finite().min(0),
        outcome: z.string().trim().min(1).max(200),
        retryAfterMs: z.number().int().min(0).nullable(),
        status: z.number().int().min(100).max(599).nullable(),
      }),
    )
    .min(1)
    .max(10),
  durationMs: z.number().finite().min(0),
  operation: z.string().trim().min(1).max(200),
  provider: z.string().trim().min(1).max(200),
  status: z.enum(["completed", "failed"]),
});

const payloadSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("artifact"),
    mediaType: z.string().trim().min(1).optional(),
    path: z.string().trim().min(1).optional(),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .optional(),
  }),
  z.object({
    kind: z.literal("source"),
    sourceType: z
      .enum([
        "paper",
        "pdf",
        "webpage",
        "book",
        "dataset",
        "documentation",
        "repository",
        "hugging-face",
        "note",
        "import",
      ])
      .optional(),
    status: z.enum(["placeholder", "resolved"]).default("resolved"),
    authors: z.array(z.string().trim().min(1)).optional(),
    citation: z.string().trim().min(1).optional(),
    doi: z.string().trim().min(1).optional(),
    url: z.url().optional(),
    providerId: z.string().trim().min(1).optional(),
    abstract: z.string().trim().min(1).max(20_000).optional(),
    year: z.number().int().min(1000).max(9999).optional(),
    provider: z.string().trim().min(1).optional(),
    query: z.string().trim().min(1).max(2_000).optional(),
    rankingScore: z.number().finite().min(0).max(1).optional(),
    rankingMethod: z.string().trim().min(1).max(200).optional(),
    rankingModel: z.string().trim().min(1).max(500).optional(),
    rankingComponents: z.record(z.string(), z.number().finite()).optional(),
    rankingExplanation: z.string().trim().min(1).max(2_000).optional(),
    retrievedAt: z.iso.datetime().optional(),
    providerCalls: z.array(literatureProviderCallSchema).max(100).optional(),
    researchProblem: z.string().trim().min(1).max(10_000).optional(),
    methods: z.array(z.string().trim().min(1)).optional(),
    findings: z.array(z.string().trim().min(1)).optional(),
    limitations: z.array(z.string().trim().min(1)).optional(),
    fullTextStatus: z
      .enum([
        "parsed",
        "not_available",
        "not_attempted_limit",
        "download_failed",
        "parse_failed",
      ])
      .optional(),
    pdfFailure: z
      .object({
        kind: z.string().trim().min(1).max(200),
        message: z.string().trim().min(1).max(2_000),
        retryable: z.boolean(),
        retryAfterMs: z.number().int().min(0).nullable(),
        action: z.string().trim().min(1).max(2_000),
      })
      .optional(),
    pdfAcquisition: z
      .object({
        attempts: z.number().int().min(1),
        finalUrl: z.url().max(4_000).optional(),
        redirects: z.number().int().min(0).optional(),
      })
      .optional(),
    folder: z.string().trim().min(1).max(500).optional(),
    extractedFields: z
      .record(
        z.string().trim().min(1),
        z.object({
          value: z.string().trim().min(1).max(20_000),
          passage: z.object({
            quote: z.string().trim().min(1).max(20_000),
            locator: z.string().trim().min(1).max(1_000).optional(),
            sourceId: z.string().trim().min(1).max(500).optional(),
          }),
          confidence: z.number().finite().min(0).max(100),
          verificationState: z.enum(["unverified", "verified", "rejected"]),
          verifiedBy: z.string().trim().min(1).max(500).optional(),
          verifiedAt: z.iso.datetime().optional(),
        }),
      )
      .optional(),
    extractedValues: z
      .record(
        z.string().trim().min(1),
        z.array(extractedSourceValueSchema).max(1_000),
      )
      .optional(),
    contradictoryEvidence: z
      .array(
        z.object({
          quote: z.string().trim().min(1).max(20_000),
          locator: z.string().trim().min(1).max(1_000).optional(),
          sourceId: z.string().trim().min(1).max(500).optional(),
        }),
      )
      .optional(),
    customReviewFields: z
      .record(
        z.string().trim().min(1),
        z.object({
          value: z.string().trim().min(1).max(20_000),
          passage: z.object({
            quote: z.string().trim().min(1).max(20_000),
            locator: z.string().trim().min(1).max(1_000).optional(),
            sourceId: z.string().trim().min(1).max(500).optional(),
          }),
          confidence: z.number().finite().min(0).max(100),
          verificationState: z.enum(["unverified", "verified", "rejected"]),
          verifiedBy: z.string().trim().min(1).max(500).optional(),
          verifiedAt: z.iso.datetime().optional(),
        }),
      )
      .optional(),
    enrichmentMethod: z.string().trim().min(1).max(200).optional(),
    enrichedAt: z.iso.datetime().optional(),
  }),
  z.object({
    kind: z.literal("evidence"),
    sourceId: z.string().trim().min(1),
    quote: z.string().trim().min(1).max(20_000),
    locator: z.string().trim().min(1).max(1_000).optional(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/i),
    verificationState: z
      .enum(["unverified", "verified", "rejected"])
      .default("unverified"),
  }),
  z.object({
    kind: z.literal("claim"),
    status: z.enum(["draft", "supported", "contradicted", "needs-evidence"]),
    reviewStatus: z
      .enum([
        "Unsupported",
        "Weak",
        "Medium",
        "Strong",
        "Paper-ready",
        "Invalidated",
        "Needs review",
      ])
      .optional(),
    reproducibilityStatus: z
      .enum(["not-assessed", "passed", "failed"])
      .optional(),
    openRiskCount: z.number().int().min(0).optional(),
  }),
  z.object({
    kind: z.literal("experiment"),
    hypothesis: z.string().trim().min(1).optional(),
  }),
  z.object({
    kind: z.literal("run"),
    commitSha: z
      .string()
      .regex(/^[a-f0-9]{7,64}$/i)
      .optional(),
    status: z.enum(["planned", "running", "completed", "failed"]),
  }),
  ...lifecyclePayloadSchemas.map((kind) =>
    z.object({
      kind: z.literal(kind),
      status: z
        .enum(["draft", "active", "blocked", "completed", "archived"])
        .default("draft"),
      ownerId: z.string().trim().min(1).max(500).nullable().optional(),
      dueAt: z.iso.datetime().optional(),
      role: z.string().trim().min(1).max(500).optional(),
      provider: z.string().trim().min(1).max(500).optional(),
      model: z.string().trim().min(1).max(500).optional(),
      severity: z.enum(["low", "medium", "high", "blocking"]).optional(),
    }),
  ),
]);

export const researchObjectInputSchema = z
  .object({
    id: z.string().trim().min(1),
    projectId: z.string().trim().min(1),
    title: z.string().trim().min(1).max(500),
    description: z.string().trim().max(10_000).default(""),
    origin: z
      .enum(["human", "imported", "inferred", "system"])
      .default("human"),
    reviewState: z
      .enum(["unreviewed", "approved", "rejected"])
      .default("unreviewed"),
    reviewedBy: z.string().trim().min(1).nullable().default(null),
    reviewedAt: z.iso.datetime().nullable().default(null),
    payload: payloadSchema,
  })
  .superRefine((value, context) => {
    if (
      value.payload.kind === "source" &&
      value.payload.status !== "placeholder" &&
      !value.payload.url &&
      !value.payload.citation
    ) {
      context.addIssue({
        code: "custom",
        message: "A source requires a URL or citation.",
        path: ["payload"],
      });
    }
  });

interface ResearchObjectBase {
  id: string;
  projectId: string;
  title: string;
  description: string;
  origin: "human" | "imported" | "inferred" | "system";
  reviewState: "unreviewed" | "approved" | "rejected";
  reviewedBy: string | null;
  reviewedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type Artifact = ResearchObjectBase & {
  type: "artifact";
  payload: ArtifactPayload;
};

export type Source = ResearchObjectBase & {
  type: "source";
  payload: SourcePayload;
};

export type Evidence = ResearchObjectBase & {
  type: "evidence";
  payload: EvidencePayload;
};

export type Claim = ResearchObjectBase & {
  type: "claim";
  payload: ClaimPayload;
};

export type Experiment = ResearchObjectBase & {
  type: "experiment";
  payload: ExperimentPayload;
};

export type Run = ResearchObjectBase & {
  type: "run";
  payload: RunPayload;
};

export type ProjectLifecycleObject = ResearchObjectBase &
  {
    [Kind in ProjectLifecycleObjectType]: {
      type: Kind;
      payload: ProjectLifecyclePayload<Kind>;
    };
  }[ProjectLifecycleObjectType];

export type ResearchObject =
  | Artifact
  | Source
  | Evidence
  | Claim
  | Experiment
  | Run
  | ProjectLifecycleObject;

export type ResearchObjectInput = z.input<typeof researchObjectInputSchema>;

export function createResearchObject(
  input: ResearchObjectInput,
  now = new Date(),
): ResearchObject {
  const parsed = researchObjectInputSchema.parse(input);
  const timestamp = now.toISOString();

  return {
    ...parsed,
    type: parsed.payload.kind,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  } as ResearchObject;
}
