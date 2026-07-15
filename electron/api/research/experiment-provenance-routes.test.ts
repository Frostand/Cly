// @vitest-environment node
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { registerResearchRoutes } from "./routes.js";

describe("experiment provenance routes", () => {
  it("binds project and experiment identity at the route boundary", async () => {
    const createExperimentRun = vi.fn(() => ({ id: "run-1" }));
    const listExperimentLineage = vi.fn(() => ({ runs: [] }));
    const listExperimentLineages = vi.fn(() => [{ runs: [] }]);
    const app = new Hono();
    registerResearchRoutes(app, {
      getRepository: () => ({
        createExperimentRun,
        listExperimentLineage,
        listExperimentLineages,
      }),
    });

    const response = await app.request(
      "/api/projects/project-a/experiments/experiment-a/runs",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Seed 42",
          commitSha: "abcdef1",
          status: "running",
          projectId: "project-b",
          experimentId: "experiment-b",
        }),
      },
    );
    expect(response.status).toBe(201);
    expect(createExperimentRun).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-a",
        experimentId: "experiment-a",
        title: "Seed 42",
      }),
    );

    const lineageResponse = await app.request(
      "/api/projects/project-a/experiments/experiment-a/lineage",
    );
    expect(lineageResponse.status).toBe(200);
    expect(listExperimentLineage).toHaveBeenCalledWith(
      "project-a",
      "experiment-a",
    );

    const allLineagesResponse = await app.request(
      "/api/projects/project-a/experiments/lineage",
    );
    expect(allLineagesResponse.status).toBe(200);
    expect(listExperimentLineages).toHaveBeenCalledWith("project-a");
  });

  it("rejects terminal runs without a finish time", async () => {
    const createExperimentRun = vi.fn();
    const app = new Hono();
    registerResearchRoutes(app, {
      getRepository: () => ({ createExperimentRun }),
    });
    const response = await app.request(
      "/api/projects/project-a/experiments/experiment-a/runs",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Completed run",
          commitSha: "abcdef1",
          status: "completed",
        }),
      },
    );
    expect(response.status).toBe(400);
    expect(createExperimentRun).not.toHaveBeenCalled();
  });
});
