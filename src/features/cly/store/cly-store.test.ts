import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFixtureRepository } from "../fixtures/repository";
import { mockServices } from "../services/mock-services";
import { useClyStore } from "./cly-store";

describe("Cly UI store", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    useClyStore.setState({
      data: createFixtureRepository("active"),
      fixtureMode: "active",
      activeProjectId: "project-cly",
      activeScreen: "overview",
      selectedId: null,
      sidebarCollapsed: false,
      inspectorOpen: true,
      activityOpen: false,
      commandPaletteOpen: false,
    });
  });

  it("switches projects and navigation state", () => {
    useClyStore.getState().setActiveProject("project-cells");
    useClyStore.getState().setScreen("experiments");

    expect(useClyStore.getState().activeProjectId).toBe("project-cells");
    expect(useClyStore.getState().activeScreen).toBe("experiments");
  });

  it("clears project-scoped research data and hydrates the selected project", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "project-cells",
            name: "Cell morphology atlas",
            path: "~/Research/cell-atlas",
            metadata: {},
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            objects: [
              {
                id: "cells-source",
                projectId: "project-cells",
                type: "source",
                title: "Cell atlas source",
                description: "Project-specific evidence",
                payload: {
                  kind: "source",
                  citation: "Cell Atlas Consortium (2026)",
                },
                createdAt: "2026-07-12T00:00:00.000Z",
                updatedAt: "2026-07-12T00:00:00.000Z",
              },
            ],
            relationships: [],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    useClyStore.getState().setActiveProject("project-cells");

    expect(useClyStore.getState().activeProjectId).toBe("project-cells");
    expect(useClyStore.getState().data.sources).toEqual([]);
    expect(useClyStore.getState().data.claims).toEqual([]);
    expect(useClyStore.getState().data.experiments).toEqual([]);

    await vi.waitFor(() =>
      expect(useClyStore.getState().data.sources).toMatchObject([
        { id: "cells-source", title: "Cell atlas source" },
      ]),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/projects/project-cells/research",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/projects/project-cells/research",
      expect.any(Object),
    );
  });

  it("updates selection and inspector state", () => {
    useClyStore.setState({ inspectorOpen: false });
    useClyStore.getState().setSelected("claim-01");

    expect(useClyStore.getState().selectedId).toBe("claim-01");
    expect(useClyStore.getState().inspectorOpen).toBe(true);
  });

  it("toggles shell regions and fixture modes", () => {
    useClyStore.getState().toggleSidebar();
    useClyStore.getState().toggleActivity();
    useClyStore.getState().setFixtureMode("empty");

    expect(useClyStore.getState().sidebarCollapsed).toBe(true);
    expect(useClyStore.getState().activityOpen).toBe(true);
    expect(useClyStore.getState().data.claims).toHaveLength(0);
  });

  it("persists context and claim mutations across feature views", () => {
    useClyStore.getState().updateContextItem("ctx-03", { included: true });
    useClyStore.getState().updateClaim("claim-03", { status: "Strong" });

    expect(
      useClyStore
        .getState()
        .data.contextItems.find((item) => item.id === "ctx-03")?.included,
    ).toBe(true);
    expect(
      useClyStore.getState().data.claims.find((item) => item.id === "claim-03")
        ?.status,
    ).toBe("Strong");
  });

  it("creates graph relationships and supersedes decisions", () => {
    useClyStore.getState().addGraphEdge({
      id: "edge-test",
      source: "src-01",
      target: "claim-01",
      relation: "supports",
      confidence: 1,
      approved: true,
    });
    useClyStore.getState().updateDecision("decision-03", {
      status: "Superseded",
      supersededBy: "decision-04",
    });

    expect(useClyStore.getState().data.graphEdges.at(-1)?.id).toBe("edge-test");
    expect(
      useClyStore
        .getState()
        .data.decisions.find((item) => item.id === "decision-03")?.supersededBy,
    ).toBe("decision-04");
  });

  it("loads persisted research objects and relationships from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: "project-cly",
              name: "Neural surrogate reliability",
              path: "~/Research/surrogate-reliability",
              metadata: {},
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              objects: [
                {
                  id: "sqlite-source",
                  projectId: "project-cly",
                  type: "source",
                  title: "Persisted source",
                  description: "Stored in SQLite",
                  payload: {
                    kind: "source",
                    authors: [],
                    url: "https://example.test/persisted",
                    providerId: "paper-123",
                    provider: "semantic-scholar",
                    query: "robust calibration",
                    rankingScore: 0.91,
                    rankingExplanation: "Matched title and abstract signals.",
                    retrievedAt: "2026-07-11T00:00:00.000Z",
                  },
                  createdAt: "2026-07-11T00:00:00.000Z",
                  updatedAt: "2026-07-11T00:00:00.000Z",
                },
                {
                  id: "sqlite-claim",
                  projectId: "project-cly",
                  type: "claim",
                  title: "Persisted claim",
                  description: "",
                  payload: { kind: "claim", status: "supported" },
                  createdAt: "2026-07-11T00:00:00.000Z",
                  updatedAt: "2026-07-11T00:00:00.000Z",
                },
                {
                  id: "sqlite-experiment",
                  projectId: "project-cly",
                  type: "experiment",
                  title: "Persisted experiment",
                  description: "Check the persisted mapping.",
                  payload: {
                    kind: "experiment",
                    hypothesis: "Persistence survives reloads.",
                  },
                  createdAt: "2026-07-11T00:00:00.000Z",
                  updatedAt: "2026-07-11T00:00:00.000Z",
                },
              ],
              relationships: [
                {
                  id: "sqlite-relationship",
                  projectId: "project-cly",
                  fromObjectId: "sqlite-source",
                  toObjectId: "sqlite-claim",
                  type: "supports",
                  createdAt: "2026-07-11T00:00:00.000Z",
                },
              ],
            }),
            { status: 200 },
          ),
        ),
    );

    await expect(useClyStore.getState().loadFromApi()).resolves.toBe(true);

    const data = useClyStore.getState().data;
    expect(data.sources).toMatchObject([
      {
        id: "sqlite-source",
        authors: "Unknown authors",
        providerId: "paper-123",
        url: "https://example.test/persisted",
        provenance: {
          provider: "semantic-scholar",
          query: "robust calibration",
          score: 0.91,
        },
      },
    ]);
    expect(data.claims).toMatchObject([
      {
        id: "sqlite-claim",
        status: "Strong",
        supportingSourceIds: ["sqlite-source"],
      },
    ]);
    expect(data.experiments).toMatchObject([
      {
        id: "sqlite-experiment",
        hypothesis: "Persistence survives reloads.",
      },
    ]);
    expect(data.graphEdges).toMatchObject([
      {
        id: "sqlite-relationship",
        source: "sqlite-source",
        target: "sqlite-claim",
        relation: "supports",
      },
    ]);
  });

  it("persists a source before updating local state and leaves state unchanged on failure", async () => {
    const source = createFixtureRepository("active").sources.at(0);
    if (!source)
      throw new Error("Expected the active fixture to include a source.");
    const sourceCount = useClyStore.getState().data.sources.length;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "project-cly",
            name: "Neural surrogate reliability",
            path: "~/Research/surrogate-reliability",
            metadata: {},
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "sqlite-created-source",
            projectId: "project-cly",
            type: "source",
            title: source.title,
            description: source.summary,
            payload: { kind: "source", authors: ["K. Raman"] },
            createdAt: "2026-07-11T00:00:00.000Z",
            updatedAt: "2026-07-11T00:00:00.000Z",
          }),
          { status: 201 },
        ),
      )
      .mockRejectedValueOnce(new Error("API unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      useClyStore.getState().addSource(source),
    ).resolves.toMatchObject({ id: "sqlite-created-source" });
    expect(useClyStore.getState().data.sources).toHaveLength(sourceCount + 1);
    expect(useClyStore.getState().data.graphNodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "sqlite-created-source",
          type: "source",
        }),
      ]),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/project-cly/research/objects",
      expect.objectContaining({ method: "POST" }),
    );
    const persistedBody = JSON.parse(
      (fetchMock.mock.calls[1]?.[1] as RequestInit).body as string,
    );
    expect(persistedBody.payload).toMatchObject({
      abstract: source.summary,
      year: source.year,
    });

    await expect(useClyStore.getState().addSource(source)).resolves.toBeNull();

    expect(useClyStore.getState().data.sources).toHaveLength(sourceCount + 1);
    expect(useClyStore.getState().toasts.at(-1)).toMatchObject({
      title: "Source was not saved",
      detail: "API unavailable",
    });
  });

  it("rejects source creation when persistence is unavailable", async () => {
    const sourceCount = useClyStore.getState().data.sources.length;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("API unavailable")),
    );

    await expect(
      mockServices.sources.create({ title: "Offline source", type: "Paper" }),
    ).rejects.toThrow("Source was not saved");

    expect(useClyStore.getState().data.sources).toHaveLength(sourceCount);
    expect(useClyStore.getState().toasts.at(-1)).toMatchObject({
      title: "Source was not saved",
      detail: "API unavailable",
    });
  });

  it("persists claims and experiments before adding them to local state", async () => {
    const claimCount = useClyStore.getState().data.claims.length;
    const experimentCount = useClyStore.getState().data.experiments.length;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "project-cly",
            name: "Neural surrogate reliability",
            path: "~/Research/surrogate-reliability",
            metadata: {},
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "persisted-claim",
            projectId: "project-cly",
            type: "claim",
            title: "Persisted claim",
            description: "",
            payload: {
              kind: "claim",
              status: "draft",
              reviewStatus: "Unsupported",
            },
            createdAt: "2026-07-12T00:00:00.000Z",
            updatedAt: "2026-07-12T00:00:00.000Z",
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "project-cly",
            name: "Neural surrogate reliability",
            path: "~/Research/surrogate-reliability",
            metadata: {},
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "persisted-experiment",
            projectId: "project-cly",
            type: "experiment",
            title: "Persisted experiment",
            description: "Test persistence",
            payload: { kind: "experiment", hypothesis: "To be specified" },
            createdAt: "2026-07-12T00:00:00.000Z",
            updatedAt: "2026-07-12T00:00:00.000Z",
          }),
          { status: 201 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      mockServices.claims.create("Persisted claim"),
    ).resolves.toMatchObject({
      id: "persisted-claim",
    });
    await expect(
      mockServices.experiments.create({
        name: "Persisted experiment",
        goal: "Test persistence",
        type: "Custom",
      }),
    ).resolves.toMatchObject({ id: "persisted-experiment" });

    expect(useClyStore.getState().data.claims).toHaveLength(claimCount + 1);
    expect(useClyStore.getState().data.experiments).toHaveLength(
      experimentCount + 1,
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "/api/projects/project-cly/research/objects",
    );
    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      "/api/projects/project-cly/research/objects",
    );
  });

  it("persists claim status changes and claim-experiment relationships", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "claim-01",
            projectId: "project-cly",
            type: "claim",
            title: "Claim",
            description: "",
            payload: {
              kind: "claim",
              status: "supported",
              reviewStatus: "Strong",
            },
            createdAt: "2026-07-12T00:00:00.000Z",
            updatedAt: "2026-07-12T00:00:00.000Z",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "claim-experiment-link",
            projectId: "project-cly",
            fromObjectId: "exp-01",
            toObjectId: "claim-01",
            type: "tests",
            createdAt: "2026-07-12T00:00:00.000Z",
          }),
          { status: 201 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await mockServices.claims.setStatus("claim-01", "Strong");
    await mockServices.claims.linkExperiment("claim-01", "exp-01");

    expect(
      useClyStore
        .getState()
        .data.claims.find((claim) => claim.id === "claim-01"),
    ).toMatchObject({
      status: "Strong",
      experimentIds: expect.arrayContaining(["exp-01"]),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/projects/project-cly/research/claims/claim-01",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/projects/project-cly/research/relationships",
      expect.objectContaining({ method: "POST" }),
    );
    expect(
      JSON.parse((fetchMock.mock.calls[1]?.[1] as RequestInit).body as string),
    ).toMatchObject({
      fromObjectId: "exp-01",
      toObjectId: "claim-01",
      type: "tests",
    });
  });

  it("marks quick-created sources as placeholders before persistence", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "project-cly",
            name: "Neural surrogate reliability",
            path: "~/Research/surrogate-reliability",
            metadata: {},
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "sqlite-placeholder-source",
            projectId: "project-cly",
            type: "source",
            title: "Untitled source",
            description: "Imported source awaiting extraction.",
            payload: { kind: "source", status: "placeholder" },
            createdAt: "2026-07-12T00:00:00.000Z",
            updatedAt: "2026-07-12T00:00:00.000Z",
          }),
          { status: 201 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      mockServices.sources.create({
        title: "Untitled source",
        type: "Paper",
      }),
    ).resolves.toMatchObject({ id: "sqlite-placeholder-source" });

    const body = JSON.parse(
      (fetchMock.mock.calls[1]?.[1] as RequestInit).body as string,
    );
    expect(body.payload).toMatchObject({
      kind: "source",
      status: "placeholder",
    });
  });

  it("persists the complete literature result and ranking provenance in one write", async () => {
    const candidate = createFixtureRepository("active").sources[0];
    const result = {
      source: {
        ...candidate,
        id: "semantic-scholar:paper-new",
        title: "A newly discovered calibration paper",
        provider: "semantic-scholar",
        providerId: "paper-new",
      },
      query: "robust calibration",
      score: 0.92,
      method: "rrf:cross_encoder_tei:BAAI/bge-reranker-base",
      model: "BAAI/bge-reranker-base",
      components: { keywordRank: 1, semanticRank: 1 },
      explanation: "Combined keyword and semantic ranks.",
      retrievedAt: "2026-07-12T20:00:00.000Z",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "project-cly",
            name: "Neural surrogate reliability",
            path: "~/Research/surrogate-reliability",
            metadata: {},
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "persisted-literature-source",
            projectId: "project-cly",
            type: "source",
            title: result.source.title,
            description: result.source.summary,
            payload: {
              kind: "source",
              provider: "semantic-scholar",
              query: result.query,
              rankingMethod: result.method,
              rankingModel: result.model,
              rankingScore: result.score,
              rankingExplanation: result.explanation,
              retrievedAt: result.retrievedAt,
            },
            createdAt: result.retrievedAt,
            updatedAt: result.retrievedAt,
          }),
          { status: 201 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      mockServices.sources.createFromSearch(result),
    ).resolves.toMatchObject({
      id: "persisted-literature-source",
      provenance: {
        method: result.method,
        model: result.model,
        provider: "semantic-scholar",
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = JSON.parse(
      (fetchMock.mock.calls[1]?.[1] as RequestInit).body as string,
    );
    expect(body.payload).toMatchObject({
      provider: "semantic-scholar",
      providerId: "paper-new",
      query: result.query,
      rankingMethod: result.method,
      rankingModel: result.model,
      rankingScore: result.score,
      rankingExplanation: result.explanation,
      retrievedAt: result.retrievedAt,
    });
  });

  it("persists and reflects a source-to-claim evidence relationship", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "relationship-literature",
            projectId: "project-cly",
            fromObjectId: "src-01",
            toObjectId: "claim-01",
            type: "supports",
            createdAt: "2026-07-12T00:00:00.000Z",
          }),
          { status: 201 },
        ),
      ),
    );

    await mockServices.sources.linkClaim("src-01", "claim-01");

    expect(
      useClyStore.getState().data.sources.find((item) => item.id === "src-01")
        ?.linkedClaimIds,
    ).toContain("claim-01");
    expect(
      useClyStore.getState().data.claims.find((item) => item.id === "claim-01")
        ?.supportingSourceIds,
    ).toContain("src-01");
    expect(useClyStore.getState().data.graphEdges.at(-1)).toMatchObject({
      source: "src-01",
      target: "claim-01",
      relation: "supports",
    });
  });

  it("persists explicit structured-note enrichment", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ id: "src-01" }), { status: 200 }),
        ),
    );

    await expect(mockServices.sources.enrich("src-01")).resolves.toMatchObject({
      methods: expect.arrayContaining(["Deep ensembles"]),
      limitations: expect.arrayContaining(["Only low-dimensional PDE systems"]),
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/projects/project-cly/research/objects/src-01",
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});
