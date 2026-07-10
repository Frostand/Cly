import { z } from "zod";

export const provenanceEventInputSchema = z.object({
  id: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  objectId: z.string().trim().min(1).optional(),
  action: z.string().trim().min(1).max(200),
  actorType: z.enum(["human", "agent", "system"]),
  actorId: z.string().trim().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type ProvenanceEventInput = z.input<typeof provenanceEventInputSchema>;

export interface ProvenanceEvent {
  id: string;
  projectId: string;
  objectId?: string;
  action: string;
  actorType: "human" | "agent" | "system";
  actorId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export function createProvenanceEvent(
  input: ProvenanceEventInput,
  now = new Date(),
): ProvenanceEvent {
  return {
    ...provenanceEventInputSchema.parse(input),
    createdAt: now.toISOString(),
  };
}
