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
  registerLiteratureRoutes(app, {
    search,
    rerank,
    getRepository: () => ({ listProject }),
  });
  return { app, listProject, rerank, search };
};

describe("literature routes", () => {
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
      provider: "both",
    });
    expect(rerank).toHaveBeenCalledWith("robust calibration", [
      { id: "semantic-scholar:paper-1" },
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
  });
});
