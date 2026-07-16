import { z } from "zod";

const record = z.record(z.string(), z.unknown());
const actor = z
  .object({
    kind: z.enum(["user", "agent", "tool", "system"]),
    id: z.string().min(1),
  })
  .strict();

export const clyDevHandoffEventSchema = z
  .object({
    id: z.string().min(1),
    sequence: z.number().int().positive(),
    schemaVersion: z.literal(1),
    payloadVersion: z.literal(1),
    idempotencyKey: z.string().min(1),
    type: z.string().min(1),
    transferability: z.literal("transferable"),
    occurredAt: z.iso.datetime(),
    actor,
    payload: record,
    recordedAt: z.iso.datetime(),
  })
  .strict();

export const clyDevHandoffEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    handoffId: z.string().min(1),
    projectId: z.string().min(1),
    sessionId: z.string().min(1),
    revision: z.number().int().positive(),
    previousRevision: z.number().int().nonnegative(),
    sourceMachine: z
      .object({
        id: z.string().min(1),
        platform: z.enum(["darwin", "linux", "win32"]),
      })
      .strict(),
    repository: z
      .object({
        id: z.string().min(1),
        remoteUrl: z.string().min(1).optional(),
      })
      .strict(),
    worktree: z
      .object({
        id: z.string().min(1),
        branch: z.string().min(1),
        baseRef: z.string().min(1).optional(),
      })
      .strict(),
    commit: z.object({ sha: z.string().regex(/^[0-9a-f]{40}$/i) }).strict(),
    task: z
      .object({
        id: z.string().min(1),
        title: z.string().min(1),
        objective: z.string().min(1),
        researchObjectIds: z.array(z.string()),
      })
      .strict(),
    session: z
      .object({
        id: z.string().min(1),
        title: z.string().min(1),
        provider: record,
        state: z.string().min(1),
        createdAt: z.iso.datetime(),
        updatedAt: z.iso.datetime(),
      })
      .strict(),
    context: record,
    events: z.array(clyDevHandoffEventSchema),
    createdAt: z.iso.datetime(),
  })
  .strict();

const prohibitedKeys = new Set([
  "localOnly",
  "repositoryPath",
  "worktreePath",
  "absolutePaths",
  "environmentVariableNames",
  "notes",
  "uncommittedFilePaths",
]);

export function assertTransferableHandoffEnvelope(value) {
  const envelope = clyDevHandoffEnvelopeSchema.parse(value);
  const visit = (current, path = "handoff") => {
    if (!current || typeof current !== "object") return;
    if (Array.isArray(current)) {
      current.forEach((entry, index) => {
        visit(entry, `${path}[${index}]`);
      });
      return;
    }
    for (const [key, child] of Object.entries(current)) {
      if (prohibitedKeys.has(key)) {
        throw new Error(`Restricted handoff field at ${path}.${key}.`);
      }
      visit(child, `${path}.${key}`);
    }
  };
  visit(envelope);
  return envelope;
}
