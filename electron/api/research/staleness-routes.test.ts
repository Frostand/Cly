// @vitest-environment node
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { registerResearchRoutes } from "./routes.js";

describe("staleness routes", () => {
  it("binds project identity and exposes persisted transition history", async () => {
    const assessProjectStaleness = vi.fn(() => ({ impacted: [] }));
    const listStalenessTransitions = vi.fn(() => [
      { fromState: "current", toState: "stale" },
    ]);
    const app = new Hono();
    registerResearchRoutes(app, {
      getRepository: () => ({
        assessProjectStaleness,
        listStalenessTransitions,
      }),
    });

    const response = await app.request(
      "/api/projects/project-a/staleness/assessments",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: "project-b", code: [] }),
      },
    );
    expect(response.status).toBe(200);
    expect(assessProjectStaleness).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project-a" }),
    );

    const history = await app.request(
      "/api/projects/project-a/staleness/claim-1/transitions",
    );
    expect(history.status).toBe(200);
    expect(listStalenessTransitions).toHaveBeenCalledWith(
      "project-a",
      "claim-1",
    );
  });
});
