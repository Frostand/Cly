import { z } from "zod";

export const CLY_DEV_SCHEMA_VERSION = 1;
export const CLY_DEV_PAYLOAD_VERSION = 1;

export const clyDevSessionStates = [
  "queued",
  "running",
  "awaiting_approval",
  "completed",
  "canceled",
  "failed",
  "interrupted",
  "resumable",
];

export const clyDevSessionStateSchema = z.enum(clyDevSessionStates);
const versionSchema = z.literal(CLY_DEV_SCHEMA_VERSION);
const idSchema = z.string().trim().min(1).max(500);

export const repositoryIdentitySchema = z
  .object({ id: idSchema, remoteUrl: z.url().optional() })
  .strict();
export const worktreeIdentitySchema = z
  .object({
    id: idSchema,
    branch: z.string().trim().min(1).max(500),
    baseRef: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
export const commitIdentitySchema = z
  .object({ sha: z.string().regex(/^[a-f0-9]{7,64}$/i) })
  .strict();
export const machineIdentitySchema = z
  .object({
    id: idSchema,
    platform: z.enum(["darwin", "linux", "win32"]),
    architecture: z.string().trim().min(1).max(100).optional(),
  })
  .strict();
export const providerIdentitySchema = z
  .object({ id: idSchema, model: z.string().trim().min(1).max(500) })
  .strict();

const localWorkspaceSchema = z
  .object({
    repositoryPath: z.string().trim().min(1).max(4_000),
    worktreePath: z.string().trim().min(1).max(4_000),
  })
  .strict();

export const clyDevWorkspaceInputSchema = z
  .object({
    schemaVersion: versionSchema,
    idempotencyKey: idSchema,
    id: idSchema.optional(),
    name: z.string().trim().min(1).max(500),
    repository: repositoryIdentitySchema,
    worktree: worktreeIdentitySchema,
    machine: machineIdentitySchema,
    localOnly: localWorkspaceSchema,
  })
  .strict();

const transferableContextEntrySchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("research_object"), researchObjectId: idSchema })
    .strict(),
  z
    .object({
      kind: z.literal("repository_file"),
      repositoryId: idSchema,
      relativePath: z.string().trim().min(1).max(4_000),
      commitSha: commitIdentitySchema.shape.sha,
    })
    .strict(),
  z
    .object({
      kind: z.literal("commit"),
      commitSha: commitIdentitySchema.shape.sha,
    })
    .strict(),
  z
    .object({
      kind: z.literal("note"),
      title: z.string().trim().min(1).max(500),
    })
    .strict(),
]);

export const clyDevContextManifestInputSchema = z
  .object({
    schemaVersion: versionSchema,
    idempotencyKey: idSchema,
    id: idSchema.optional(),
    localOnly: z
      .object({
        absolutePaths: z.array(z.string().trim().min(1).max(4_000)).default([]),
        environmentVariableNames: z.array(idSchema).default([]),
        notes: z.array(z.string().trim().min(1).max(10_000)).default([]),
        uncommittedFilePaths: z
          .array(z.string().trim().min(1).max(4_000))
          .default([]),
      })
      .strict(),
    transferable: z
      .object({
        summary: z.string().trim().min(1).max(10_000),
        entries: z.array(transferableContextEntrySchema).max(10_000),
      })
      .strict(),
  })
  .strict();

export const clyDevTaskInputSchema = z
  .object({
    schemaVersion: versionSchema,
    idempotencyKey: idSchema,
    id: idSchema.optional(),
    title: z.string().trim().min(1).max(500),
    objective: z.string().trim().min(1).max(20_000),
    researchObjectIds: z.array(idSchema).default([]),
  })
  .strict();

export const clyDevSessionInputSchema = z
  .object({
    schemaVersion: versionSchema,
    idempotencyKey: idSchema,
    id: idSchema.optional(),
    title: z.string().trim().min(1).max(500),
    contextManifestId: idSchema,
    provider: providerIdentitySchema,
    commit: commitIdentitySchema,
    state: clyDevSessionStateSchema.default("queued"),
  })
  .strict();

export const clyDevSessionAggregateInputSchema = z
  .object({
    workspace: clyDevWorkspaceInputSchema,
    contextManifest: clyDevContextManifestInputSchema,
    task: clyDevTaskInputSchema,
    session: clyDevSessionInputSchema.omit({ contextManifestId: true }),
  })
  .strict();

const actorSchema = z
  .object({ kind: z.enum(["user", "agent", "tool", "system"]), id: idSchema })
  .strict();
const eventBase = {
  schemaVersion: versionSchema,
  payloadVersion: z.literal(CLY_DEV_PAYLOAD_VERSION),
  idempotencyKey: idSchema,
  occurredAt: z.iso.datetime(),
  actor: actorSchema,
  transferability: z.literal("local-only"),
};
const localEvent = (type, payload) =>
  z.object({ ...eventBase, type: z.literal(type), payload }).strict();

const messagePayload = z
  .object({
    role: z.enum(["user", "agent", "system"]),
    body: z.string().max(100_000),
  })
  .strict();
const summaryPayload = z
  .object({
    title: z.string().trim().min(1).max(500),
    sections: z.array(z.string().max(20_000)),
  })
  .strict();
const planPayload = z
  .object({
    steps: z.array(
      z
        .object({
          id: idSchema,
          text: z.string().max(10_000),
          status: z.enum(["pending", "in_progress", "completed", "blocked"]),
        })
        .strict(),
    ),
  })
  .strict();
const progressPayload = z
  .object({
    completed: z.number().int().min(0),
    total: z.number().int().min(0),
    label: z.string().max(500),
  })
  .strict();
const toolPayload = z
  .object({
    toolCallId: idSchema,
    tool: idSchema,
    status: z.enum(["started", "completed", "failed"]),
    exitCode: z.number().int().nullable().optional(),
  })
  .strict();
const decisionPayload = z
  .object({
    decisionId: idSchema,
    summary: z.string().max(10_000),
    rationale: z.string().max(20_000),
  })
  .strict();
const costPayload = z
  .object({
    amountMinor: z.number().int().min(0),
    currency: z.string().length(3),
    category: idSchema,
  })
  .strict();
const diffPayload = z
  .object({
    relativePaths: z.array(z.string().trim().min(1).max(4_000)),
    additions: z.number().int().min(0),
    deletions: z.number().int().min(0),
    commitSha: commitIdentitySchema.shape.sha,
  })
  .strict();
const testPayload = z
  .object({
    commandId: idSchema,
    passed: z.number().int().min(0),
    failed: z.number().int().min(0),
    durationMs: z.number().int().min(0),
  })
  .strict();
const failurePayload = z
  .object({
    code: idSchema,
    message: z.string().max(20_000),
    retryable: z.boolean(),
  })
  .strict();
const remainingWorkPayload = z
  .object({ items: z.array(z.string().trim().min(1).max(10_000)) })
  .strict();
const approvalRequestPayload = z
  .object({
    approvalId: idSchema,
    title: z.string().max(500),
    detail: z.string().max(20_000),
    requestedAction: idSchema,
  })
  .strict();
const approvalResolvedPayload = z
  .object({
    approvalId: idSchema,
    state: z.enum(["approved", "rejected", "canceled"]),
    resolvedBy: idSchema,
  })
  .strict();
const recoveryPayload = z
  .object({
    reason: z.literal("application_restart"),
    processRevived: z.literal(false),
  })
  .strict();

const transferableManifestEventSchema = z
  .object({
    ...eventBase,
    transferability: z.literal("transferable"),
    type: z.literal("context.manifest.recorded"),
    payload: z.object({ manifestId: idSchema }).strict(),
  })
  .strict();

export const clyDevEventInputSchema = z.discriminatedUnion("type", [
  localEvent("message.recorded", messagePayload),
  localEvent("summary.recorded", summaryPayload),
  localEvent("plan.recorded", planPayload),
  localEvent("progress.recorded", progressPayload),
  localEvent("tool.recorded", toolPayload),
  localEvent("decision.recorded", decisionPayload),
  localEvent("cost.recorded", costPayload),
  localEvent("diff.recorded", diffPayload),
  localEvent("test.recorded", testPayload),
  localEvent("failure.recorded", failurePayload),
  localEvent("remaining_work.recorded", remainingWorkPayload),
  localEvent("approval.requested", approvalRequestPayload),
  localEvent("approval.resolved", approvalResolvedPayload),
  localEvent(
    "session.state.changed",
    z.object({ state: clyDevSessionStateSchema }).strict(),
  ),
  localEvent("session.interrupted", recoveryPayload),
  localEvent("session.resumable", recoveryPayload),
  transferableManifestEventSchema,
]);

export const clyDevEventsQuerySchema = z.object({
  afterSequence: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
