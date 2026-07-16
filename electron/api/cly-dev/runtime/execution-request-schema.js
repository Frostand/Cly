import { z } from "zod";

const version = z.literal(1);
const id = z.string().trim().min(1).max(500);

const toolDeclarationSchema = z.object({ name: id }).strict();
const approvalReferenceSchema = z.object({ approvalId: id }).strict();
const budgetSchema = z
  .object({
    maxInputTokens: z.number().int().min(0).optional(),
    maxOutputTokens: z.number().int().min(0).optional(),
    maxTotalTokens: z.number().int().min(0).optional(),
    maxCostMinor: z.number().int().min(0).optional(),
  })
  .strict();

export const clyDevExecutionRequestSchema = z
  .object({
    schemaVersion: version,
    payloadVersion: version,
    requestId: id,
    prompt: z.string().min(1).max(100_000),
    mode: z.enum(["execute", "plan", "read_only", "read-only"]),
    tools: z.array(toolDeclarationSchema).max(100).default([]),
    approvals: z.record(id, approvalReferenceSchema).optional(),
    budget: budgetSchema.optional(),
    actorId: id.optional(),
  })
  .strict();

export const clyDevCancellationRequestSchema = z
  .object({
    schemaVersion: version,
    payloadVersion: version,
    requestId: id,
  })
  .strict();
