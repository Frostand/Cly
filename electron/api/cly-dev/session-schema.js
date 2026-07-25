import { isIP } from "node:net";
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
const fullGitObjectIdSchema = z
  .string()
  .regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i);
const repositoryRelativePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(4_000)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.startsWith("\\") &&
      !/^[a-zA-Z]:/.test(value) &&
      !value.includes("\\") &&
      value
        .split("/")
        .every((segment) => segment && segment !== "." && segment !== ".."),
    "Path must be a normalized repository-relative path without traversal.",
  );
const normalizeHostname = (hostname) => {
  const unbracketed =
    hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;
  return unbracketed.toLowerCase().replace(/\.+$/, "");
};
const ipv4Bytes = (hostname) =>
  hostname.split(".").map((segment) => Number.parseInt(segment, 10));
const isLocalIpv4 = (bytes) => {
  const [first, second] = bytes;
  return (
    first === 0 ||
    first === 10 ||
    (first === 100 && second >= 64 && second <= 127) ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first >= 224
  );
};
const ipv6Bytes = (hostname) => {
  const [head = "", tail = "", ...extra] = hostname.split("::");
  if (extra.length) return null;
  const parse = (part) =>
    part ? part.split(":").map((segment) => Number.parseInt(segment, 16)) : [];
  const headGroups = parse(head);
  const tailGroups = parse(tail);
  const compressed = hostname.includes("::");
  const omitted = 8 - headGroups.length - tailGroups.length;
  if ((!compressed && omitted !== 0) || (compressed && omitted < 1)) {
    return null;
  }
  return [
    ...headGroups,
    ...Array.from({ length: omitted }, () => 0),
    ...tailGroups,
  ].flatMap((group) => [group >> 8, group & 0xff]);
};
const isLocalIpv6 = (bytes) => {
  if (!bytes) return true;
  const allButLastAreZero = bytes.slice(0, 15).every((byte) => byte === 0);
  if (allButLastAreZero && (bytes[15] === 0 || bytes[15] === 1)) return true;
  if ((bytes[0] & 0xfe) === 0xfc) return true;
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) >= 0x80) return true;
  if (bytes[0] === 0xff) return true;
  const mappedIpv4 =
    bytes.slice(0, 10).every((byte) => byte === 0) &&
    bytes[10] === 0xff &&
    bytes[11] === 0xff;
  const compatibleIpv4 = bytes.slice(0, 12).every((byte) => byte === 0);
  return (mappedIpv4 || compatibleIpv4) && isLocalIpv4(bytes.slice(12));
};
const isLocalRepositoryHost = (rawHostname) => {
  const hostname = normalizeHostname(rawHostname);
  if (
    ["localhost", "local", "localdomain", "home.arpa", "internal"].includes(
      hostname,
    ) ||
    [".localhost", ".local", ".localdomain", ".home.arpa", ".internal"].some(
      (suffix) => hostname.endsWith(suffix),
    )
  ) {
    return true;
  }
  const addressKind = isIP(hostname);
  if (addressKind === 4) return isLocalIpv4(ipv4Bytes(hostname));
  if (addressKind === 6) return isLocalIpv6(ipv6Bytes(hostname));
  return false;
};
const safeRemoteUrlSchema = z.url().superRefine((value, context) => {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    context.addIssue({
      code: "custom",
      message: "Repository remotes must use credential-free HTTPS.",
    });
  }
  if (url.username || url.password) {
    context.addIssue({
      code: "custom",
      message: "Repository remotes must not contain userinfo.",
    });
  }
  if (isLocalRepositoryHost(url.hostname)) {
    context.addIssue({
      code: "custom",
      message:
        "Repository remotes must not target loopback, link-local, or private/local hosts.",
    });
  }
});

export const repositoryIdentitySchema = z
  .object({ id: idSchema, remoteUrl: safeRemoteUrlSchema.optional() })
  .strict();
export const worktreeIdentitySchema = z
  .object({
    id: idSchema,
    branch: z.string().trim().min(1).max(500),
    baseRef: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
export const commitIdentitySchema = z
  .object({ sha: fullGitObjectIdSchema })
  .strict();
export const machineIdentitySchema = z
  .object({
    id: idSchema,
    platform: z.enum(["darwin", "linux", "win32"]),
    architecture: z.string().trim().min(1).max(100).optional(),
  })
  .strict();
export const clyDevReasoningEffortSchema = z.enum([
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
]);
export const providerIdentitySchema = z
  .object({
    id: idSchema,
    model: z.string().trim().min(1).max(500),
    reasoningEffort: clyDevReasoningEffortSchema.optional(),
  })
  .strict();

export const clyDevSessionLaunchInputSchema = z
  .object({
    schemaVersion: versionSchema,
    payloadVersion: versionSchema,
    idempotencyKey: idSchema,
    title: z.string().trim().min(1).max(500),
    objective: z.string().trim().min(1).max(20_000),
    mode: z.enum(["read_only", "workspace_write"]),
    provider: providerIdentitySchema,
  })
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
      relativePath: repositoryRelativePathSchema,
      commitSha: fullGitObjectIdSchema,
      objectHash: fullGitObjectIdSchema,
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
  id: idSchema.optional(),
  schemaVersion: versionSchema,
  payloadVersion: z.literal(CLY_DEV_PAYLOAD_VERSION),
  idempotencyKey: idSchema,
  occurredAt: z.iso.datetime(),
  actor: actorSchema,
};
const localEvent = (type, payload) =>
  z
    .object({
      ...eventBase,
      type: z.literal(type),
      transferability: z.literal("local-only"),
      payload,
    })
    .strict();
const syncableEvent = (type, payload) =>
  z
    .object({
      ...eventBase,
      type: z.literal(type),
      transferability: z.enum(["local-only", "transferable"]),
      payload,
    })
    .strict();

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

const publicEventSchemas = [
  syncableEvent("message.recorded", messagePayload),
  syncableEvent("summary.recorded", summaryPayload),
  syncableEvent("plan.recorded", planPayload),
  syncableEvent("progress.recorded", progressPayload),
  localEvent("tool.recorded", toolPayload),
  syncableEvent("decision.recorded", decisionPayload),
  localEvent("cost.recorded", costPayload),
  localEvent("diff.recorded", diffPayload),
  localEvent("test.recorded", testPayload),
  localEvent("failure.recorded", failurePayload),
  syncableEvent("remaining_work.recorded", remainingWorkPayload),
  syncableEvent("approval.requested", approvalRequestPayload),
  syncableEvent("approval.resolved", approvalResolvedPayload),
  syncableEvent(
    "session.state.changed",
    z.object({ state: clyDevSessionStateSchema }).strict(),
  ),
  localEvent("session.interrupted", recoveryPayload),
  localEvent("session.resumable", recoveryPayload),
];

export const clyDevEventInputSchema = z.discriminatedUnion(
  "type",
  publicEventSchemas,
);

export const clyDevInternalEventInputSchema = z.discriminatedUnion("type", [
  ...publicEventSchemas,
  transferableManifestEventSchema,
]);

export const clyDevEventsQuerySchema = z.object({
  afterSequence: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export const clyDevSessionOverviewQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
