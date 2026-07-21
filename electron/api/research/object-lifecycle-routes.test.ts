// @vitest-environment node
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { registerResearchRoutes } from "./routes.js";

describe("project lifecycle object routes", () => {
  it("binds project and object identity and forwards optimistic versions", async () => {
    const updateObject = vi.fn((input) => ({ ...input, version: 4 }));
    const app = new Hono();
    registerResearchRoutes(app, {
      getRepository: () => ({ updateObject }),
    });

    const response = await app.request(
      "/api/projects/project-a/research/objects/objective-1",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: "project-b",
          id: "other-object",
          expectedVersion: 3,
          payload: { status: "completed" },
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(updateObject).toHaveBeenCalledWith({
      projectId: "project-a",
      id: "objective-1",
      expectedVersion: 3,
      payload: { status: "completed" },
    });
  });

  it("returns a conflict response for stale lifecycle edits", async () => {
    const app = new Hono();
    registerResearchRoutes(app, {
      getRepository: () => ({
        updateObject: vi.fn(() => {
          throw new Error(
            "Research object version conflict: expected 1, current 2.",
          );
        }),
      }),
    });

    const response = await app.request(
      "/api/projects/project-a/research/objects/objective-1",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: 1,
          title: "Stale edit",
        }),
      },
    );

    expect(response.status).toBe(409);
    await expect(response.text()).resolves.toContain("version conflict");
  });

  it("preserves source enrichment updates without an optimistic version", async () => {
    const updateSource = vi.fn((input) => ({ ...input, version: 2 }));
    const app = new Hono();
    registerResearchRoutes(app, {
      getRepository: () => ({ updateSource }),
    });

    const response = await app.request(
      "/api/projects/project-a/research/objects/source-1",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          description: "Enriched abstract",
          payload: { findings: ["Result"] },
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(updateSource).toHaveBeenCalledWith({
      id: "source-1",
      projectId: "project-a",
      description: "Enriched abstract",
      payload: { findings: ["Result"] },
    });
  });
});
