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
});

export type RelationshipInput = z.infer<typeof relationshipInputSchema>;

export interface Relationship extends RelationshipInput {
  createdAt: string;
}

export function createRelationship(
  input: RelationshipInput,
  now = new Date(),
): Relationship {
  const parsed = relationshipInputSchema.parse(input);
  if (parsed.fromObjectId === parsed.toObjectId) {
    throw new Error("A research relationship cannot point to itself.");
  }
  return { ...parsed, createdAt: now.toISOString() };
}
