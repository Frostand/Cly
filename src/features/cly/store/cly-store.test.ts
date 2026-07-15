import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCostLedgerFixture } from "../fixtures/cost-ledger";
import { createFixtureRepository } from "../fixtures/repository";
import { mockServices } from "../services/mock-services";
import { resolveInitialFixtureMode, useClyStore } from "./cly-store";

describe("Cly UI store", () => {
  it("always starts packaged production with an empty research repository", () => {
    expect(
      resolveInitialFixtureMode({ demoFlag: "1", development: false }),
    ).toBe("empty");
    expect(
      resolveInitialFixtureMode({ demoFlag: "1", development: true }),
    ).toBe("active");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    const data = createFixtureRepository("active");
    const costs = createCostLedgerFixture("active", data);
    useClyStore.setState({
      data,
      costLedger: costs.ledger,
      claimCosts: costs.claimCosts,
      costsLoading: false,
      costsError: null,
      selectedCostEntryId: costs.ledger.entries[0]?.id ?? null,
      fixtureMode: "active",
      activeProjectId: "project-cly",
      activeScreen: "overview",
      selectedId: null,
      sidebarCollapsed: false,
      inspectorOpen: true,
      activityOpen: false,
      commandPaletteOpen: false,
      preregistrations: [],
      preregistrationsLoading: false,
      preregistrationsError: null,
    });
  });

  it("switches projects and navigation state", () => {
    useClyStore.getState().setActiveProject("project-cells");
    useClyStore.getState().setScreen("experiments");

    expect(useClyStore.getState().activeProjectId).toBe("project-cells");
    expect(useClyStore.getState().activeScreen).toBe("experiments");
    expect(useClyStore.getState().costLedger.entries).toEqual([]);
    expect(useClyStore.getState().claimCosts).toEqual({});
  });

  it("hydrates persisted runs, the cost ledger, and claim totals together", async () => {
    const ledger = {
      categorizedTotals: [
        { category: "gpu", totals: [{ amountMinor: 1250, currency: "USD" }] },
      ],
      conversionState: "single-currency",
      entries: [
        {
          id: "cost-1",
          projectId: "project-cly",
          runId: "run-costed",
          runTitle: "Costed run",
          source: "manual",
          providerEntryId: null,
          amountMinor: 1250,
          currency: "USD",
          category: "gpu",
          startedAt: "2026-07-01T00:00:00.000Z",
          endedAt: "2026-07-01T01:00:00.000Z",
          confidenceBps: 9000,
          description: "GPU runtime",
          raw: { schema: "cly.manual-cost.v1" },
          createdAt: "2026-07-01T01:00:00.000Z",
          waste: [],
        },
      ],
      totals: [{ amountMinor: 1250, currency: "USD" }],
      waste: {
        categorizedTotals: [],
        conversionState: "empty",
        entries: [],
        entryCount: 0,
        totals: [],
      },
    };
    const claimCosts = [
      {
        claimId: "claim-costed",
        entries: ledger.entries,
        runIds: ["run-costed"],
        totals: ledger.totals,
        categorizedTotals: ledger.categorizedTotals,
        conversionState: "single-currency",
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (url.endsWith("/research") && init?.method === "PUT") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: "project-cly",
                name: "Project",
                path: "/project",
                metadata: {},
              }),
              { status: 200 },
            ),
          );
        }
        if (url.endsWith("/research")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                objects: [
                  {
                    id: "experiment-costed",
                    projectId: "project-cly",
                    type: "experiment",
                    title: "Cost experiment",
                    description: "",
                    payload: { kind: "experiment" },
                    createdAt: "2026-07-01T00:00:00.000Z",
                    updatedAt: "2026-07-01T00:00:00.000Z",
                  },
                  {
                    id: "run-costed",
                    projectId: "project-cly",
                    type: "run",
                    title: "Costed run",
                    description: "",
                    payload: {
                      kind: "run",
                      status: "completed",
                      commitSha: "abc1234",
                    },
                    createdAt: "2026-07-01T00:00:00.000Z",
                    updatedAt: "2026-07-01T01:00:00.000Z",
                  },
                  {
                    id: "claim-costed",
                    projectId: "project-cly",
                    type: "claim",
                    title: "Costed claim",
                    description: "",
                    payload: { kind: "claim", status: "supported" },
                    createdAt: "2026-07-01T00:00:00.000Z",
                    updatedAt: "2026-07-01T01:00:00.000Z",
                  },
                ],
                relationships: [
                  {
                    id: "generated-costed",
                    projectId: "project-cly",
                    fromObjectId: "run-costed",
                    toObjectId: "experiment-costed",
                    type: "generated-by",
                    reviewState: "approved",
                    confidence: 1,
                    createdAt: "2026-07-01T00:00:00.000Z",
                  },
                ],
              }),
              { status: 200 },
            ),
          );
        }
        if (url.endsWith("/costs/claims")) {
          return Promise.resolve(new Response(JSON.stringify(claimCosts)));
        }
        if (url.endsWith("/costs")) {
          return Promise.resolve(new Response(JSON.stringify(ledger)));
        }
        return Promise.resolve(new Response("Unavailable", { status: 503 }));
      }),
    );

    await expect(useClyStore.getState().loadFromApi()).resolves.toBe(true);

    expect(useClyStore.getState().data.runs).toMatchObject([
      {
        id: "run-costed",
        experimentId: "experiment-costed",
        status: "Complete",
        codeVersion: "abc1234",
      },
    ]);
    expect(useClyStore.getState().costLedger).toMatchObject(ledger);
    expect(useClyStore.getState().claimCosts["claim-costed"]).toMatchObject({
      totals: [{ amountMinor: 1250, currency: "USD" }],
      runIds: ["run-costed"],
    });
  });

  it("persists integer manual costs before refreshing project-scoped totals", async () => {
    const current = useClyStore.getState().costLedger.entries[0];
    const created = {
      ...current,
      id: "cost-created",
      amountMinor: 4321,
      runId: "run-02",
    };
    const ledger = {
      ...useClyStore.getState().costLedger,
      entries: [created],
      totals: [{ amountMinor: 4321, currency: "USD" }],
    };
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith("/costs/claims")) {
        return Promise.resolve(new Response(JSON.stringify([])));
      }
      if (url.endsWith("/costs") && init?.method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify(created), { status: 201 }),
        );
      }
      if (url.endsWith("/costs")) {
        return Promise.resolve(new Response(JSON.stringify(ledger)));
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      useClyStore.getState().createCostEntry({
        amountMinor: 4321,
        category: "gpu",
        confidenceBps: 8750,
        currency: "USD",
        description: "Manual GPU rate",
        endedAt: "2026-07-01T01:00:00.000Z",
        runId: "run-02",
        startedAt: "2026-07-01T00:00:00.000Z",
      }),
    ).resolves.toMatchObject({ id: "cost-created" });

    const post = fetchMock.mock.calls.find(
      ([url, init]) => url.endsWith("/costs") && init?.method === "POST",
    );
    expect(JSON.parse(post?.[1]?.body as string)).toMatchObject({
      amountMinor: 4321,
      confidenceBps: 8750,
    });
    expect(useClyStore.getState().costLedger.entries[0].id).toBe(
      "cost-created",
    );
    expect(useClyStore.getState().selectedCostEntryId).toBe("cost-created");
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
                  origin: "imported",
                  reviewState: "unreviewed",
                  confidence: null,
                  reviewedBy: null,
                  reviewedAt: null,
                  createdAt: "2026-07-11T00:00:00.000Z",
                },
                {
                  id: "sqlite-tests-relationship",
                  projectId: "project-cly",
                  fromObjectId: "sqlite-experiment",
                  toObjectId: "sqlite-claim",
                  type: "tests",
                  origin: "human",
                  reviewState: "unreviewed",
                  confidence: null,
                  reviewedBy: null,
                  reviewedAt: null,
                  createdAt: "2026-07-11T00:00:01.000Z",
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
    expect(data.graphNodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "sqlite-claim", status: "Suggested" }),
      ]),
    );
    expect(data.graphEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "sqlite-relationship",
          source: "sqlite-source",
          target: "sqlite-claim",
          relation: "supports",
          approved: false,
          confidence: null,
        }),
        expect.objectContaining({
          id: "sqlite-tests-relationship",
          relation: "tests",
          approved: false,
          confidence: null,
        }),
      ]),
    );
    expect(data.notebooks).toEqual([]);
    expect(data.artifacts).toEqual([]);
    expect(data.audits).toEqual([]);
    expect(data.decisions).toEqual([]);
    expect(data.reports).toEqual([]);
    expect(data.agentSessions).toEqual([]);
    expect(data.activity).toEqual([]);
  });

  it("hydrates canonical research when the optional lineage endpoint is unavailable", async () => {
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
            objects: [
              {
                id: "canonical-source",
                projectId: "project-cly",
                type: "source",
                title: "Canonical persisted source",
                description: "Research data remains available.",
                payload: { kind: "source" },
                createdAt: "2026-07-13T00:00:00.000Z",
                updatedAt: "2026-07-13T00:00:00.000Z",
              },
            ],
            relationships: [],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(
        new Response("Lineage service unavailable", { status: 503 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(useClyStore.getState().loadFromApi()).resolves.toBe(true);

    expect(useClyStore.getState().data.sources).toMatchObject([
      { id: "canonical-source", title: "Canonical persisted source" },
    ]);
    expect(useClyStore.getState().lineageSuggestions).toEqual([]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/projects/project-cly/lineage-suggestions",
      expect.any(Object),
    );
  });

  it("does not apply a completed project A mutation after switching to project B", async () => {
    let resolveCreate: ((response: Response) => void) | undefined;
    const createResponse = new Promise<Response>((resolve) => {
      resolveCreate = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "project-cly",
            name: "A",
            path: "/a",
            metadata: {},
          }),
          { status: 200 },
        ),
      )
      .mockReturnValueOnce(createResponse)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "project-cells",
            name: "B",
            path: "/b",
            metadata: {},
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ objects: [], relationships: [] }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const pending = mockServices.claims.create("Project A claim");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    useClyStore.getState().setActiveProject("project-cells");
    resolveCreate?.(
      new Response(
        JSON.stringify({
          id: "claim-project-a",
          projectId: "project-cly",
          type: "claim",
          title: "Project A claim",
          description: "",
          payload: {
            kind: "claim",
            status: "draft",
            reviewStatus: "Unsupported",
          },
          origin: "human",
          reviewState: "unreviewed",
          reviewedBy: null,
          reviewedAt: null,
          createdAt: "2026-07-13T00:00:00.000Z",
          updatedAt: "2026-07-13T00:00:00.000Z",
        }),
        { status: 201 },
      ),
    );
    await pending;
    await vi.waitFor(() =>
      expect(useClyStore.getState().activeProjectId).toBe("project-cells"),
    );

    expect(
      useClyStore
        .getState()
        .data.claims.find((claim) => claim.id === "claim-project-a"),
    ).toBeUndefined();
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
            title: "Persisted experiment",
            description: "Test persistence",
            definition: {
              id: "definition-1",
              projectId: "project-cly",
              experimentId: "persisted-experiment",
              version: 1,
              hypothesis: "To be specified",
              objective: "Test persistence",
              configuration: { experimentType: "Custom" },
              datasets: [],
              declaredMetrics: [],
              definitionHash: "a".repeat(64),
              provenanceEventId: "event-1",
              createdAt: "2026-07-12T00:00:00.000Z",
            },
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
      "/api/projects/project-cly/experiments",
    );
  });

  it("keeps preregistration versions and append-only deviation state hydrated", async () => {
    const experiment = useClyStore.getState().data.experiments[0];
    const content = {
      hypothesis: "Calibration reduces worst-group error.",
      primaryMetrics: ["Worst-group error"],
      exclusionRules: "Exclude corrupt records only.",
      analysisPlan: "Use paired estimates with uncertainty intervals.",
      successCriteria: "Worst-group error improves by two points.",
      dataset: "Shift benchmark v2",
      intendedDesign: "Paired ablation",
    };
    const snapshot = {
      id: "snapshot-store",
      projectId: "project-cly",
      experimentId: experiment.id,
      version: 1,
      amendsSnapshotId: null,
      content,
      contentHash: "a".repeat(64),
      actorType: "human",
      actorId: "local-user",
      origin: "human",
      provenanceEventId: "event-snapshot",
      createdAt: "2026-07-13T12:00:00.000Z",
      finalEvaluation: null,
      deviations: [],
    } as const;
    const evaluated = {
      ...snapshot,
      finalEvaluation: {
        id: "evaluation-store",
        actorId: "local-user",
        provenanceEventId: "event-evaluation",
        evaluatedAt: "2026-07-13T13:00:00.000Z",
      },
    };
    const deviation = {
      id: "deviation-store",
      projectId: "project-cly",
      snapshotId: snapshot.id,
      fieldPath: "/analysisPlan",
      beforeValue: content.analysisPlan,
      afterValue: "Use a stratified paired analysis.",
      rationale: "The planned strata were omitted.",
      declarationTiming: "retrospective",
      actorId: "local-user",
      provenanceEventId: "event-deviation",
      declaredAt: "2026-07-13T14:00:00.000Z",
      acknowledgement: null,
    } as const;
    const acknowledged = {
      ...deviation,
      acknowledgement: {
        id: "ack-store",
        state: "acknowledged",
        actorId: "local-user",
        provenanceEventId: "event-ack",
        acknowledgedAt: "2026-07-13T14:01:00.000Z",
      },
    } as const;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(snapshot), { status: 201 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(evaluated), { status: 201 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(deviation), { status: 201 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(acknowledged), { status: 201 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      useClyStore.getState().createPreregistration(experiment.id, content),
    ).resolves.toMatchObject({ id: snapshot.id });
    await expect(
      useClyStore.getState().markPreregistrationEvaluated(snapshot.id),
    ).resolves.toMatchObject({ finalEvaluation: evaluated.finalEvaluation });
    await expect(
      useClyStore.getState().declareAnalysisDeviation(snapshot.id, {
        fieldPath: "/analysisPlan",
        afterValue: deviation.afterValue,
        rationale: deviation.rationale,
      }),
    ).resolves.toMatchObject({ declarationTiming: "retrospective" });
    await expect(
      useClyStore.getState().acknowledgeAnalysisDeviation(deviation.id),
    ).resolves.toMatchObject({ acknowledgement: acknowledged.acknowledgement });

    expect(useClyStore.getState().preregistrations).toEqual([
      {
        ...evaluated,
        deviations: [acknowledged],
      },
    ]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `/api/projects/project-cly/experiments/${experiment.id}/preregistrations`,
      "/api/projects/project-cly/preregistrations/snapshot-store/final-evaluation",
      "/api/projects/project-cly/preregistrations/snapshot-store/deviations",
      "/api/projects/project-cly/deviations/deviation-store/acknowledgements",
    ]);
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
