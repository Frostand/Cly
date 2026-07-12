import { describe, expect, it } from "vitest";

import { createProvenanceEvent } from "./provenance-event";
import { createRelationship } from "./relationship";
import type { Claim, Experiment, Run, Source } from "./research-object";
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

  it("allows explicitly marked source placeholders", () => {
    expect(
      createResearchObject({
        id: "source-placeholder",
        projectId: "project-1",
        title: "Untitled source",
        payload: { kind: "source", status: "placeholder" },
      }),
    ).toMatchObject({
      type: "source",
      payload: { kind: "source", status: "placeholder" },
    });
  });

  it("exposes correlated source, claim, experiment, and run primitives", () => {
    const objects = [
      createResearchObject({
        id: "source-1",
        projectId: "project-1",
        title: "Paper",
        payload: { kind: "source", citation: "Example et al. (2026)" },
      }),
      createResearchObject({
        id: "claim-1",
        projectId: "project-1",
        title: "Claim",
        payload: { kind: "claim", status: "draft" },
      }),
      createResearchObject({
        id: "experiment-1",
        projectId: "project-1",
        title: "Experiment",
        payload: { kind: "experiment", hypothesis: "Recall improves." },
      }),
      createResearchObject({
        id: "run-1",
        projectId: "project-1",
        title: "Run",
        payload: { kind: "run", status: "planned" },
      }),
    ];

    const source = objects.find(
      (object): object is Source => object.type === "source",
    );
    const claim = objects.find(
      (object): object is Claim => object.type === "claim",
    );
    const experiment = objects.find(
      (object): object is Experiment => object.type === "experiment",
    );
    const run = objects.find((object): object is Run => object.type === "run");

    expect(source?.payload.kind).toBe("source");
    expect(claim?.payload.status).toBe("draft");
    expect(experiment?.payload.hypothesis).toBe("Recall improves.");
    expect(run?.payload.status).toBe("planned");
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
