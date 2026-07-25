// @vitest-environment node
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { registerLiteratureRoutes } from "./routes.js";
import { LiteratureSearchError } from "./semantic-scholar.js";

const createApp = (
  search = vi.fn().mockResolvedValue([]),
  rerank = vi.fn().mockResolvedValue({
    method: null,
    signals: [],
    status: "not_configured",
  }),
) => {
  const app = new Hono();
  const listProject = vi
    .fn()
    .mockReturnValue({ objects: [], relationships: [] });
  const getProject = vi.fn().mockReturnValue({
    id: "project-1",
    metadata: { localOnly: false },
    name: "Project 1",
    path: "/tmp/project-1",
  });
  registerLiteratureRoutes(app, {
    search,
    rerank,
    getRepository: () => ({ getProject, listProject }),
  });
  return { app, listProject, rerank, search };
};

describe("literature routes", () => {
  it("blocks external searches for local-only projects without destination approval", async () => {
    const search = vi.fn();
    const app = new Hono();
    registerLiteratureRoutes(app, {
      search,
      rerank: vi.fn(),
      getRepository: () => ({
        getProject: () => ({
          id: "project-1",
          metadata: { localOnly: true },
          name: "Private project",
          path: "/tmp/private",
        }),
        listProject: () => ({ objects: [], relationships: [] }),
      }),
    });

    const response = await app.request(
      "/api/projects/project-1/literature/search",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "unpublished target" }),
      },
    );

    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toContain("external transmission");
    expect(search).not.toHaveBeenCalled();
  });
  it("scopes searches to an existing project", async () => {
    const { app, listProject, rerank, search } = createApp(
      vi.fn().mockResolvedValue([{ id: "semantic-scholar:paper-1" }]),
    );
    const response = await app.request(
      "/api/projects/project-1/literature/search",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "robust calibration", limit: 10 }),
      },
    );
    expect(response.status).toBe(200);
    expect(listProject).toHaveBeenCalledWith("project-1");
    expect(search).toHaveBeenCalledWith("robust calibration", {
      limit: 10,
      provider: "all",
    });
    expect(rerank).toHaveBeenCalledWith("robust calibration", [
      expect.objectContaining({
        id: "semantic-scholar:paper-1",
        fullTextStatus: "not_available",
        extraction: expect.objectContaining({ hasFullText: false }),
      }),
    ]);
  });

  it("maps provider rate limits to HTTP 429", async () => {
    const { app } = createApp(
      vi
        .fn()
        .mockRejectedValue(
          new LiteratureSearchError("Provider rate limited.", "rate_limited"),
        ),
    );
    const response = await app.request(
      "/api/projects/project-1/literature/search",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "topic" }),
      },
    );
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      kind: "rate_limited",
      retryable: true,
      action: expect.stringContaining("retry"),
    });
  });

  it("parses BibTeX imports and returns duplicate accounting", async () => {
    const importRecords = vi.fn().mockReturnValue({
      duplicateCount: 0,
      importedCount: 1,
      results: [{ duplicate: false, source: { id: "source-1" } }],
    });
    const app = new Hono();
    registerLiteratureRoutes(app, {
      getLiteratureRepository: () => ({ importRecords }),
      getRepository: () => ({
        getProject: vi.fn(),
        listProject: vi.fn(),
      }),
    });

    const response = await app.request(
      "/api/projects/project-1/literature/imports",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          format: "bibtex",
          content: "@article{paper, title={Grounded synthesis}, year={2026}}",
          readingListIds: ["list-1"],
        }),
      },
    );

    expect(response.status).toBe(201);
    expect(importRecords).toHaveBeenCalledWith(
      "project-1",
      [expect.objectContaining({ title: "Grounded synthesis", year: 2026 })],
      { importMethod: "bibtex", readingListIds: ["list-1"] },
    );
    await expect(response.json()).resolves.toMatchObject({ importedCount: 1 });
  });

  it("creates and lists project-scoped reading lists", async () => {
    const createReadingList = vi.fn().mockReturnValue({
      created: true,
      readingList: { id: "list-1", name: "Core methods" },
    });
    const listReadingLists = vi
      .fn()
      .mockReturnValue([{ id: "list-1", name: "Core methods" }]);
    const app = new Hono();
    registerLiteratureRoutes(app, {
      getLiteratureRepository: () => ({
        createReadingList,
        listReadingLists,
      }),
      getRepository: () => ({
        getProject: vi.fn(),
        listProject: vi.fn(),
      }),
    });

    const created = await app.request(
      "/api/projects/project-1/literature/reading-lists",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Core methods" }),
      },
    );
    const listed = await app.request(
      "/api/projects/project-1/literature/reading-lists",
    );

    expect(created.status).toBe(201);
    expect(listed.status).toBe(200);
    expect(createReadingList).toHaveBeenCalledWith("project-1", {
      name: "Core methods",
      description: "",
    });
    expect(listReadingLists).toHaveBeenCalledWith("project-1");
  });
});
