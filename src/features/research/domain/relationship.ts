import { z } from "zod";

export const relationshipInputSchema = z.object({
  id: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  fromObjectId: z.string().trim().min(1),
  toObjectId: z.string().trim().min(1),
  type: z.enum([
    "supports",
    "contradicts",
    "generated-by",
    "uses",
    "tests",
    "implements",
  ]),
  origin: z.enum(["human", "imported", "inferred", "system"]).default("human"),
});

export type RelationshipInput = z.input<typeof relationshipInputSchema>;

export type Relationship = z.output<typeof relationshipInputSchema> & {
  reviewState: "unreviewed" | "approved" | "rejected";
  confidence: number | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

export function createRelationship(
  input: RelationshipInput,
  now = new Date(),
): Relationship {
  const parsed = relationshipInputSchema.parse(input);
  if (parsed.fromObjectId === parsed.toObjectId) {
    throw new Error("A research relationship cannot point to itself.");
  }
  return {
    ...parsed,
    reviewState: "unreviewed",
    confidence: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: now.toISOString(),
  };
}
