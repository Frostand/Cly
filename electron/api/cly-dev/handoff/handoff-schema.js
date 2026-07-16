import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { hashHandoffPayload } from "./canonical-json.js";

export const CLY_DEV_HANDOFF_PROTOCOL = "cly.dev.handoff";
export const CLY_DEV_HANDOFF_SCHEMA_VERSION = 1;
export const CLY_DEV_HANDOFF_MINIMUM_READER_VERSION = 1;

const id = z.string().trim().min(1).max(500);
const text = (maximum = 20_000) => z.string().max(maximum);
const timestamp = z.iso.datetime();
const gitHash = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i);
const contentHash = z.string().regex(/^[a-f0-9]{40,128}$/i);
const relativePath = z
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
    "Path must be normalized and repository-relative.",
  );

const normalizeKey = (key) => key.replaceAll(/[^a-zA-Z0-9]/g, "").toLowerCase();
export const isRestrictedHandoffKey = (key) => {
  const normalized = normalizeKey(key);
  return (
    /credential|password|passwd|secret|token|apikey|privatekey|authorization|cookie/.test(
      normalized,
    ) ||
    /terminal|pty|processid|cache|dataset|environment|machinepath|absolutepath|repositorypath|worktreepath|localonly/.test(
      normalized,
    ) ||
    /providerconfig|provideroptions|rawprovider/.test(normalized) ||
    normalized === "env" ||
    normalized === "pid"
  );
};
const isRecognizedRootRelativeWebRoute = (value) =>
  typeof value === "string" &&
  /^\/(?:api|v\d+|assets|static)(?:\/|$)[^\s]*$/i.test(value);
export const isAbsoluteMachinePath = (value) =>
  typeof value === "string" &&
  ((value.startsWith("/") && !isRecognizedRootRelativeWebRoute(value)) ||
    value.startsWith("\\\\") ||
    /^[a-zA-Z]:[\\/]/.test(value) ||
    /^file:\/\//i.test(value));
const containsCredentialValue = (value) =>
  typeof value === "string" &&
  (/\b(?:proxy-)?authorization\s*:\s*[^\s\r\n][^\r\n]*/i.test(value) ||
    /\b(?:set-cookie|cookie)\s*:\s*[^\s\r\n][^\r\n]*/i.test(value) ||
    /(?:^|[;\s])(?:session(?:_?id)?|connect\.sid|auth|jwt|remember_token)\s*=\s*[^;\s]+/i.test(
      value,
    ) ||
    /\b(?:bearer|basic)\s+[a-z0-9+/_.=-]{8,}/i.test(value) ||
    /\b(?:gh[pousr]_[a-z0-9]{20,}|xox[baprs]-[a-z0-9-]{16,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,}|sk-[a-z0-9_-]{16,}|glpat-[a-z0-9_-]{16,}|npm_[a-z0-9]{16,})\b/i.test(
      value,
    ) ||
    /\beyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{4,}\b/i.test(value) ||
    /\b(?:api[_-]?key|access[_-]?token|password|client[_-]?secret)\s*[:=]/i.test(
      value,
    ) ||
    /\b(?:openai|anthropic|azure|aws|google|github|gitlab|slack)[_-](?:api[_-])?(?:key|token|secret)\s*=/i.test(
      value,
    ) ||
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(value));
const posixAssignment = String.raw`[A-Za-z_][A-Za-z0-9_]*\s*=\s*[^\s;&|]+`;
const assignmentTerminator = String.raw`(?=\s|$|;|&&|\|\||\|)`;
const commandFieldPath = /\.(?:command|commands)(?:\.|$)/;
const containsEnvironmentAssignment = (value, location) => {
  if (typeof value !== "string") return false;
  const assignmentInCommandField = new RegExp(
    String.raw`(?:^|\s|&&|\|\||[;|])\s*${posixAssignment}`,
  );
  if (commandFieldPath.test(location) && assignmentInCommandField.test(value)) {
    return true;
  }
  const assignmentBeforeCommand = new RegExp(
    String.raw`^\s*${posixAssignment}${assignmentTerminator}`,
  );
  const exportedAssignment = new RegExp(
    String.raw`(?:^|&&|\|\||[;|])\s*export\s+${posixAssignment}${assignmentTerminator}`,
  );
  const assignmentAfterSeparator = new RegExp(
    String.raw`(?:&&|\|\||[;|])\s*${posixAssignment}${assignmentTerminator}`,
  );
  const assignmentBeforeKnownExecutable = new RegExp(
    String.raw`(?:^|\s)${posixAssignment}\s+(?:pnpm|npm|npx|yarn|bun|node|tsx|tsc|vitest|jest|python3?|bash|sh|zsh|git|make|cargo|go|ruby|java|mvn|gradle|dotnet|pytest|\.\.?\/)\S*\b`,
    "i",
  );
  return (
    assignmentBeforeCommand.test(value) ||
    exportedAssignment.test(value) ||
    assignmentAfterSeparator.test(value) ||
    assignmentBeforeKnownExecutable.test(value)
  );
};
const containsEmbeddedMachinePath = (value) =>
  typeof value === "string" &&
  (/(?:^|[\s"'`=:(])\/(?!\/)(?!(?:api|v\d+|assets|static)(?:\/|$))(?:[^/\s"'`]+\/)+[^\s"'`]*/i.test(
    value,
  ) ||
    /(?:^|[\s"'`=:(])[a-zA-Z]:\\(?:Users|Documents and Settings|Windows|ProgramData|Temp)\\[^\s"'`]*/i.test(
      value,
    ) ||
    /(?:^|[\s"'`=:(])\\\\[^\\\s]+\\[^\\\s]+/.test(value));

export function findRestrictedHandoffData(
  value,
  location = "$",
  seen = new Set(),
) {
  if (isAbsoluteMachinePath(value)) {
    return { path: location, reason: "absolute machine path" };
  }
  if (containsCredentialValue(value)) {
    return { path: location, reason: "credential or secret value" };
  }
  if (containsEnvironmentAssignment(value, location)) {
    return { path: location, reason: "environment assignment" };
  }
  if (containsEmbeddedMachinePath(value)) {
    return { path: location, reason: "embedded machine path" };
  }
  if (value === null || typeof value !== "object") return null;
  if (seen.has(value)) return { path: location, reason: "cyclic data" };
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (isRestrictedHandoffKey(key)) {
      return {
        path: `${location}.${key}`,
        reason: "restricted/local-only key",
      };
    }
    const found = findRestrictedHandoffData(child, `${location}.${key}`, seen);
    if (found) return found;
  }
  seen.delete(value);
  return null;
}

export function assertNoRestrictedHandoffData(value) {
  const restricted = findRestrictedHandoffData(value);
  if (restricted) {
    throw new Error(
      `Handoff contains ${restricted.reason} at ${restricted.path}.`,
    );
  }
  return value;
}

const messageSchema = z
  .object({
    id,
    role: z.enum(["user", "agent", "system", "tool"]),
    body: text(100_000),
    createdAt: timestamp,
  })
  .strict();
const summarySchema = z
  .object({
    id,
    title: text(500),
    sections: z.array(text()),
    createdAt: timestamp,
  })
  .strict();
const planStepSchema = z
  .object({
    id,
    text: text(10_000),
    status: z.enum(["pending", "in_progress", "completed", "blocked"]),
  })
  .strict();
const contextEntrySchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("repository_file"),
      repositoryId: id,
      relativePath,
      commitSha: gitHash,
      objectHash: gitHash,
    })
    .strict(),
  z
    .object({
      kind: z.literal("research_object"),
      researchObjectId: id,
      version: id,
      contentHash,
    })
    .strict(),
  z.object({ kind: z.literal("commit"), commitSha: gitHash }).strict(),
  z.object({ kind: z.literal("note"), title: text(500) }).strict(),
]);
const repositoryFileSchema = z
  .object({ relativePath, objectHash: gitHash })
  .strict();
const repositorySymbolSchema = z
  .object({ relativePath, name: id, kind: id })
  .strict();
const researchObjectSchema = z
  .object({ id, version: id, contentHash })
  .strict();

export const clyDevHandoffPayloadSchema = z
  .object({
    task: z
      .object({
        id,
        title: text(500),
        sessionId: id,
        state: z.enum([
          "queued",
          "running",
          "awaiting_approval",
          "completed",
          "canceled",
          "failed",
          "interrupted",
          "resumable",
        ]),
      })
      .strict(),
    messages: z.array(messageSchema).max(10_000),
    conversationSync: z.enum(["included", "excluded"]),
    summaries: z.array(summarySchema).max(1_000),
    goal: z
      .object({ objective: text(), successCriteria: z.array(text(10_000)) })
      .strict(),
    plan: z.object({ steps: z.array(planStepSchema).max(10_000) }).strict(),
    progress: z
      .object({
        status: z.enum(["not_started", "in_progress", "blocked", "completed"]),
        completedItems: z.array(text(10_000)),
        currentItem: text(10_000).optional(),
      })
      .strict(),
    decisions: z.array(
      z
        .object({
          id,
          summary: text(10_000),
          rationale: text(),
          decidedAt: timestamp,
        })
        .strict(),
    ),
    openQuestions: z.array(
      z
        .object({
          id,
          question: text(10_000),
          status: z.enum(["open", "answered", "blocked"]),
          answer: text().optional(),
        })
        .strict(),
    ),
    remainingWork: z.array(
      z
        .object({
          id,
          description: text(10_000),
          status: z.enum(["pending", "in_progress", "blocked"]),
        })
        .strict(),
    ),
    contextManifest: z
      .object({
        id,
        summary: text(),
        entries: z.array(contextEntrySchema).max(10_000),
      })
      .strict(),
    repository: z
      .object({
        id,
        remoteUrl: z
          .url()
          .refine((raw) => {
            const url = new URL(raw);
            return (
              url.protocol === "https:" &&
              !url.username &&
              !url.password &&
              !url.search &&
              !url.hash
            );
          }, "Repository remote must be credential-free HTTPS.")
          .optional(),
        branch: id,
        worktreeId: id,
        commitSha: gitHash,
        files: z.array(repositoryFileSchema).max(100_000),
        symbols: z.array(repositorySymbolSchema).max(100_000),
      })
      .strict(),
    approvals: z.array(
      z
        .object({
          evidenceOnly: z.literal(true),
          id,
          state: z.enum(["pending", "approved", "rejected", "canceled"]),
          title: text(500),
          requestedAction: id,
          requestedAt: timestamp,
          resolvedAt: timestamp.optional(),
        })
        .strict(),
    ),
    permissions: z
      .object({
        evidenceOnly: z.literal(true),
        filesystem: z.enum(["read-only", "workspace-write", "unrestricted"]),
        network: z.enum(["disabled", "restricted", "unrestricted"]),
        commands: z.array(text(2_000)),
      })
      .strict(),
    constraints: z.array(text(10_000)),
    diffs: z.array(
      z
        .object({
          id,
          relativePaths: z.array(relativePath),
          additions: z.number().int().min(0),
          deletions: z.number().int().min(0),
          baseCommitSha: gitHash,
          resultHash: contentHash,
        })
        .strict(),
    ),
    tests: z.array(
      z
        .object({
          id,
          command: text(2_000),
          status: z.enum(["passed", "failed", "skipped"]),
          passed: z.number().int().min(0),
          failed: z.number().int().min(0),
          durationMs: z.number().int().min(0),
        })
        .strict(),
    ),
    failures: z.array(
      z
        .object({ id, code: id, message: text(), retryable: z.boolean() })
        .strict(),
    ),
    costs: z
      .object({
        currency: z.string().length(3),
        totalMinor: z.number().int().min(0),
        items: z.array(
          z
            .object({ category: id, amountMinor: z.number().int().min(0) })
            .strict(),
        ),
      })
      .strict(),
    research: z
      .object({
        objects: z.array(researchObjectSchema),
        impact: z.array(
          z
            .object({
              objectId: id,
              summary: text(),
              level: z.enum(["none", "informational", "material", "blocking"]),
            })
            .strict(),
        ),
      })
      .strict(),
    providerRequirements: z.discriminatedUnion("required", [
      z
        .object({
          required: z.literal(true),
          capabilities: z.array(id).max(1_000),
        })
        .strict(),
      z
        .object({
          required: z.literal(false),
          capabilities: z.array(id).length(0),
        })
        .strict(),
    ]),
  })
  .strict()
  .superRefine((payload, context) => {
    const restricted = findRestrictedHandoffData(payload);
    if (restricted) {
      context.addIssue({
        code: "custom",
        message: `Handoff contains ${restricted.reason} at ${restricted.path}.`,
      });
    }
    if (payload.conversationSync === "excluded" && payload.messages.length) {
      context.addIssue({
        code: "custom",
        path: ["messages"],
        message: "Messages must be empty when conversation sync is excluded.",
      });
    }
    if (
      [
        "queued",
        "running",
        "awaiting_approval",
        "interrupted",
        "resumable",
      ].includes(payload.task.state) &&
      !payload.providerRequirements.required
    ) {
      context.addIssue({
        code: "custom",
        path: ["providerRequirements"],
        message:
          "Provider requirements must be explicit for resumable task state.",
      });
    }
  });

const integritySchema = z
  .object({
    algorithm: z.literal("sha256"),
    canonicalization: z.literal("cly-json-v1"),
    digest: z.string().regex(/^[a-f0-9]{64}$/i),
  })
  .strict();

export const clyDevHandoffEnvelopeSchema = z
  .object({
    protocol: z.literal(CLY_DEV_HANDOFF_PROTOCOL),
    schemaVersion: z.literal(CLY_DEV_HANDOFF_SCHEMA_VERSION),
    minimumReaderVersion: z.literal(CLY_DEV_HANDOFF_MINIMUM_READER_VERSION),
    exportedAt: timestamp,
    payload: clyDevHandoffPayloadSchema,
    integrity: integritySchema,
  })
  .strict();

function digestMatches(expected, actual) {
  if (!/^[a-f0-9]{64}$/i.test(expected) || !/^[a-f0-9]{64}$/i.test(actual)) {
    return false;
  }
  return timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(actual, "hex"),
  );
}

const emptyV1Payload = (legacy) => ({
  task: {
    id: legacy.task.id,
    title: legacy.task.title,
    sessionId: legacy.task.sessionId,
    state: legacy.task.state,
  },
  messages: [],
  conversationSync: "excluded",
  summaries: [
    {
      id: "legacy-summary",
      title: "Migrated summary",
      sections: [legacy.summary],
      createdAt: "1970-01-01T00:00:00.000Z",
    },
  ],
  goal: { objective: legacy.task.objective, successCriteria: [] },
  plan: { steps: [] },
  progress: { status: "not_started", completedItems: [] },
  decisions: [],
  openQuestions: [],
  remainingWork: legacy.remaining.map((description, index) => ({
    id: `legacy-work-${index + 1}`,
    description,
    status: "pending",
  })),
  contextManifest: {
    id: "legacy-context",
    summary: "No transferable context was recorded by schema v0.",
    entries: [],
  },
  repository: {
    id: "legacy-unknown",
    branch: "unknown",
    worktreeId: "legacy-unknown",
    commitSha: "0".repeat(40),
    files: [],
    symbols: [],
  },
  approvals: [],
  permissions: {
    evidenceOnly: true,
    filesystem: "read-only",
    network: "disabled",
    commands: [],
  },
  constraints: ["Repository identity must be re-inspected after v0 migration."],
  diffs: [],
  tests: [],
  failures: [],
  costs: { currency: "USD", totalMinor: 0, items: [] },
  research: { objects: [], impact: [] },
  providerRequirements: { required: true, capabilities: [] },
});

export function migrateClyDevHandoffEnvelope(rawEnvelope) {
  if (rawEnvelope?.schemaVersion === CLY_DEV_HANDOFF_SCHEMA_VERSION) {
    return clyDevHandoffEnvelopeSchema.parse(rawEnvelope);
  }
  if (rawEnvelope?.schemaVersion !== 0) {
    throw new Error(
      `Unsupported Cly Dev handoff schema version ${String(rawEnvelope?.schemaVersion)}. Upgrade Cly or re-export with schema version 1.`,
    );
  }
  const legacy = z
    .object({
      protocol: z.literal(CLY_DEV_HANDOFF_PROTOCOL),
      schemaVersion: z.literal(0),
      minimumReaderVersion: z.literal(0),
      exportedAt: timestamp,
      payload: z
        .object({
          task: z
            .object({
              id,
              title: text(500),
              sessionId: id,
              state: clyDevHandoffPayloadSchema.shape.task.shape.state,
              objective: text(),
            })
            .strict(),
          summary: text(),
          remaining: z.array(text(10_000)),
        })
        .strict(),
      integrity: integritySchema,
    })
    .strict()
    .parse(rawEnvelope);
  assertNoRestrictedHandoffData(legacy.payload);
  const payload = emptyV1Payload(legacy.payload);
  return clyDevHandoffEnvelopeSchema.parse({
    protocol: CLY_DEV_HANDOFF_PROTOCOL,
    schemaVersion: CLY_DEV_HANDOFF_SCHEMA_VERSION,
    minimumReaderVersion: CLY_DEV_HANDOFF_MINIMUM_READER_VERSION,
    exportedAt: legacy.exportedAt,
    payload,
    integrity: {
      algorithm: "sha256",
      canonicalization: "cly-json-v1",
      digest: hashHandoffPayload(payload),
    },
  });
}

export function validateHandoffEnvelope(rawEnvelope) {
  if (rawEnvelope?.protocol !== CLY_DEV_HANDOFF_PROTOCOL) {
    throw new Error("Unsupported handoff protocol. Expected cly.dev.handoff.");
  }
  if (
    !Number.isInteger(rawEnvelope?.schemaVersion) ||
    rawEnvelope.schemaVersion < 0 ||
    rawEnvelope.schemaVersion > CLY_DEV_HANDOFF_SCHEMA_VERSION ||
    rawEnvelope.minimumReaderVersion > CLY_DEV_HANDOFF_SCHEMA_VERSION
  ) {
    throw new Error(
      `Unsupported Cly Dev handoff version. Upgrade Cly or re-export with schema version ${CLY_DEV_HANDOFF_SCHEMA_VERSION}.`,
    );
  }
  const parsedIntegrity = integritySchema.parse(rawEnvelope.integrity);
  const actualDigest = hashHandoffPayload(rawEnvelope.payload);
  if (!digestMatches(parsedIntegrity.digest, actualDigest)) {
    throw new Error(
      "Handoff integrity check failed: the canonical payload digest does not match.",
    );
  }
  assertNoRestrictedHandoffData(rawEnvelope.payload);
  return migrateClyDevHandoffEnvelope(rawEnvelope);
}
