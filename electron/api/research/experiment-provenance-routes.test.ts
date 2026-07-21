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

describe("reproducibility audit routes", () => {
  it("binds project, audit, and finding identity at the route boundary", async () => {
    const run = vi.fn(() => ({ audit: { id: "audit-1" }, findings: [] }));
    const latest = vi.fn(() => ({ audit: { id: "audit-1" }, findings: [] }));
    const resolve = vi.fn(() => ({ id: "finding-1", status: "Resolved" }));
    const app = new Hono();
    registerResearchRoutes(app, {
      getReproducibilityAuditService: () => ({ run, latest, resolve }),
    });

    const created = await app.request(
      "/api/projects/project-a/reproducibility-audits",
      { method: "POST" },
    );
    expect(created.status).toBe(201);
    expect(run).toHaveBeenCalledWith("project-a");

    const fetched = await app.request(
      "/api/projects/project-a/reproducibility-audits/latest",
    );
    expect(fetched.status).toBe(200);
    expect(latest).toHaveBeenCalledWith("project-a");

    const resolved = await app.request(
      "/api/projects/project-a/reproducibility-audits/audit-1/findings/finding-1",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actorId: "reviewer-1", projectId: "project-b" }),
      },
    );
    expect(resolved.status).toBe(400);
    expect(resolve).not.toHaveBeenCalled();

    const validResolution = await app.request(
      "/api/projects/project-a/reproducibility-audits/audit-1/findings/finding-1",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actorId: "reviewer-1" }),
      },
    );
    expect(validResolution.status).toBe(200);
    expect(resolve).toHaveBeenCalledWith(
      "project-a",
      "audit-1",
      "finding-1",
      "reviewer-1",
    );
  });

  it("rejects an audit request body", async () => {
    const run = vi.fn();
    const app = new Hono();
    registerResearchRoutes(app, {
      getReproducibilityAuditService: () => ({ run }),
    });

    const response = await app.request(
      "/api/projects/project-a/reproducibility-audits",
      {
        method: "POST",
        headers: { "content-length": "2", "content-type": "application/json" },
        body: "{}",
      },
    );
    expect(response.status).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });
});
