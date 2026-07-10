import { z } from "zod";

import type { ResearchObjectPayload } from "./research-types";

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
    authors: z.array(z.string().trim().min(1)).optional(),
    citation: z.string().trim().min(1).optional(),
    doi: z.string().trim().min(1).optional(),
    url: z.url().optional(),
  }),
  z.object({
    kind: z.literal("claim"),
    status: z.enum(["draft", "supported", "contradicted", "needs-evidence"]),
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
]);

export const researchObjectInputSchema = z
  .object({
    id: z.string().trim().min(1),
    projectId: z.string().trim().min(1),
    title: z.string().trim().min(1).max(500),
    description: z.string().trim().max(10_000).default(""),
    payload: payloadSchema,
  })
  .superRefine((value, context) => {
    if (
      value.payload.kind === "source" &&
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

export interface ResearchObject {
  id: string;
  projectId: string;
  title: string;
  description: string;
  type: ResearchObjectPayload["kind"];
  payload: ResearchObjectPayload;
  createdAt: string;
  updatedAt: string;
}

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
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
