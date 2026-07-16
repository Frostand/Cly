import { z } from "zod";

export const contextOriginClassSchema = z.enum([
  "approved_fact",
  "inferred_fact",
  "source_passage",
  "file",
  "conversation",
  "graph_object",
]);
export const contextVerificationStateSchema = z.enum([
  "unverified",
  "verified",
  "stale",
  "conflicted",
]);
export const contextSensitivitySchema = z.enum([
  "standard",
  "restricted",
  "local_only",
]);
export const contextRepresentationSchema = z.enum(["raw", "summary"]);

const id = z.string().trim().min(1).max(500);
const actorSchema = z
  .object({
    actorId: id.default("local-user"),
    producerProcess: id.default("cly-ui"),
    producerModel: id.nullable().default(null),
  })
  .strict();

export const contextRevisionInputSchema = z
  .object({
    originClass: contextOriginClassSchema,
    referenceId: id,
    content: z.string().min(1).max(2_000_000),
    confidence: z.number().finite().min(0).max(1).nullable().default(null),
    evidenceRefs: z.array(id).max(2_000).default([]),
    lastCheckedAt: z.string().datetime().nullable().default(null),
    producerProcess: id,
    producerModel: id.nullable().default(null),
    verificationState: contextVerificationStateSchema.default("unverified"),
    sensitivity: contextSensitivitySchema.default("standard"),
  })
  .strict();

export const contextItemCreateSchema = z
  .object({
    id: id.optional(),
    label: z.string().trim().min(1).max(500),
    revision: contextRevisionInputSchema,
    approve: z.boolean().default(false),
    actor: actorSchema.default({}),
  })
  .strict();

export const contextProposalSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    revision: contextRevisionInputSchema,
    actor: actorSchema.default({}),
  })
  .strict();

export const contextApprovalSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    actor: actorSchema.default({}),
  })
  .strict();

export const contextLifecycleSchema = z
  .object({
    action: z.enum(["pin", "unpin", "lock", "unlock", "delete", "restore"]),
    expectedVersion: z.number().int().positive(),
    actor: actorSchema.default({}),
  })
  .strict();

export const contextPackEntrySchema = z
  .object({
    itemId: id,
    revisionId: id,
    representation: contextRepresentationSchema,
    selectionReason: z.string().trim().min(1).max(2_000),
    sensitivity: contextSensitivitySchema,
  })
  .strict();

export const contextPackInputSchema = z
  .object({
    id: id.optional(),
    name: z.string().trim().min(1).max(500),
    configurationId: id,
    roleId: id,
    expectedRevision: z.number().int().positive().optional(),
    entries: z.array(contextPackEntrySchema).max(2_000),
    actor: actorSchema.default({}),
  })
  .strict();

export const contextManifestRequestSchema = z
  .object({
    packId: id,
    configurationId: id,
    roleId: id,
    provider: id,
    model: id,
    purpose: z.string().trim().min(1).max(1_000).default("research-assistance"),
    collaborators: z.array(id).max(100).default([]),
    residency: id.nullable().default(null),
    license: id.nullable().default(null),
  })
  .strict();

export const contextPersistManifestSchema = contextManifestRequestSchema
  .extend({
    idempotencyKey: id,
    expectedSha256: z.string().regex(/^[a-f0-9]{64}$/),
    transmissionApprovalId: id.nullable().default(null),
  })
  .strict();

export const contextTransmissionApprovalSchema = z
  .object({
    manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
    provider: id,
    model: id,
    restrictedReferenceIds: z.array(id).min(1).max(2_000),
    actorId: id,
    rationale: z.string().trim().min(1).max(10_000),
    expiresAt: z.string().datetime().nullable().default(null),
  })
  .strict();

export const contextRevokeApprovalSchema = z
  .object({ actorId: id, rationale: z.string().trim().min(1).max(10_000) })
  .strict();

export const managedContextReferenceSchema = z
  .object({
    manifestId: id,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    configurationId: id,
    roleId: id,
  })
  .strict();
