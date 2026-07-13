import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFixtureRepository } from "../fixtures/repository";
import { useClyStore } from "./cly-store";

const summary = {
  obligations: [
    {
      id: "obligation-a",
      projectId: "project-cly",
      datasetObjectId: "src-03",
      datasetTitle: "Cylinder-flow reference trajectories v2",
      consentProtocolScope: "Approved benchmark research",
      approvedPurposes: ["peer-review"],
      permittedCollaborators: [],
      externalProcessing: "review",
      permittedProviders: ["openai"],
      residency: ["US"],
      retentionExpiresAt: null,
      deletionDueAt: null,
      license: "CC-BY-4.0",
      owner: "Dataset steward",
      reviewDate: null,
      provenanceSource: "Dataset license",
      notes: "",
      revision: 1,
      createdBy: "local-user",
      updatedBy: "local-user",
      createdAt: "2026-07-13T12:00:00.000Z",
      updatedAt: "2026-07-13T12:00:00.000Z",
    },
  ],
  alerts: [],
  inheritedRestrictions: {
    "claim-01": [
      {
        obligationId: "obligation-a",
        datasetObjectId: "src-03",
        datasetTitle: "Cylinder-flow reference trajectories v2",
        consentProtocolScope: "Approved benchmark research",
        approvedPurposes: ["peer-review"],
        externalProcessing: "review",
        residency: ["US"],
        retentionExpiresAt: null,
        deletionDueAt: null,
        license: "CC-BY-4.0",
        owner: "Dataset steward",
        reviewDate: null,
      },
    ],
  },
};

describe("obligations store", () => {
  beforeEach(() => {
    useClyStore.setState({
      activeProjectId: "project-cly",
      data: createFixtureRepository("active"),
      datasetObligations: [],
      obligationAlerts: [],
      inheritedRestrictions: {},
      obligationsLoading: false,
      obligationsError: null,
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("hydrates project-scoped obligations and inherited restrictions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("/api/projects/project-cly/obligations");
        return new Response(JSON.stringify(summary));
      }),
    );

    await expect(useClyStore.getState().loadObligations()).resolves.toBe(true);
    expect(useClyStore.getState()).toMatchObject({
      datasetObligations: [
        expect.objectContaining({ id: "obligation-a", revision: 1 }),
      ],
      inheritedRestrictions: {
        "claim-01": [expect.objectContaining({ obligationId: "obligation-a" })],
      },
      obligationsLoading: false,
    });
  });

  it("saves through the dataset-scoped route and refreshes propagation", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PUT") {
          expect(String(input)).toContain("/datasets/src-03/obligation");
          return new Response(JSON.stringify(summary.obligations[0]));
        }
        return new Response(JSON.stringify(summary));
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const saved = await useClyStore.getState().saveDatasetObligation("src-03", {
      consentProtocolScope: "Approved benchmark research",
      approvedPurposes: ["peer-review"],
      permittedCollaborators: [],
      externalProcessing: "review",
      permittedProviders: ["openai"],
      residency: ["US"],
      retentionExpiresAt: null,
      deletionDueAt: null,
      license: "CC-BY-4.0",
      owner: "Dataset steward",
      reviewDate: null,
      provenanceSource: "Dataset license",
      notes: "",
      actorId: "local-user",
    });

    expect(saved).toMatchObject({ id: "obligation-a" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      useClyStore.getState().inheritedRestrictions["claim-01"],
    ).toHaveLength(1);
  });
});
