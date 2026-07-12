import { describe, expect, it } from "vitest";

import { createProvenanceEvent } from "./provenance-event";
import { createRelationship } from "./relationship";
import { createResearchObject } from "./research-object";

const now = new Date("2026-07-10T12:00:00.000Z");

describe("research domain", () => {
  it("creates a typed source with stable timestamps", () => {
    const source = createResearchObject(
      {
        id: "source-1",
        projectId: "project-1",
        title: "A useful paper",
        payload: { kind: "source", url: "https://example.com/paper" },
      },
      now,
    );

    expect(source.type).toBe("source");
    expect(source.createdAt).toBe(now.toISOString());
    expect(source.updatedAt).toBe(now.toISOString());
  });

  it("requires evidence coordinates for sources", () => {
    expect(() =>
      createResearchObject({
        id: "source-1",
        projectId: "project-1",
        title: "Untraceable source",
        payload: { kind: "source" },
      }),
    ).toThrow("A source requires a URL or citation");
  });

  it("preserves validated literature ranking provenance", () => {
    const source = createResearchObject(
      {
        id: "source-ranked",
        projectId: "project-1",
        title: "Ranked paper",
        payload: {
          kind: "source",
          url: "https://example.com/ranked",
          provider: "semantic-scholar",
          providerId: "paper-123",
          query: "robust calibration",
          rankingScore: 0.91,
          rankingMethod: "keyword_overlap_v1",
          rankingModel: "BAAI/bge-reranker-base",
          rankingExplanation: "Matched title and abstract signals.",
          retrievedAt: "2026-07-12T12:00:00.000Z",
        },
      },
      now,
    );

    expect(source.payload).toMatchObject({
      providerId: "paper-123",
      rankingScore: 0.91,
      rankingMethod: "keyword_overlap_v1",
      rankingModel: "BAAI/bge-reranker-base",
      query: "robust calibration",
    });
  });

  it("keeps evidence relationships directed", () => {
    const relationship = createRelationship(
      {
        id: "relationship-1",
        projectId: "project-1",
        fromObjectId: "source-1",
        toObjectId: "claim-1",
        type: "supports",
      },
      now,
    );
    expect(relationship.fromObjectId).toBe("source-1");
    expect(relationship.toObjectId).toBe("claim-1");
  });

  it("records attributable provenance", () => {
    const event = createProvenanceEvent(
      {
        id: "event-1",
        projectId: "project-1",
        objectId: "claim-1",
        action: "claim.created",
        actorType: "human",
        actorId: "local-user",
      },
      now,
    );
    expect(event.createdAt).toBe(now.toISOString());
    expect(event.metadata).toEqual({});
  });
});
