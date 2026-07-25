// @vitest-environment node
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { registerResearchRoutes } from "./routes.js";

const researchRepository = {
  listProject: () => ({ objects: [], relationships: [] }),
};

describe("research workflow routes", () => {
  it("validates project-scoped source archive transitions", async () => {
    const setSourceArchived = vi.fn(() => ({ id: "source-a" }));
    const app = new Hono();
    registerResearchRoutes(app, {
      getRepository: () => ({ ...researchRepository, setSourceArchived }),
    });

    const invalid = await app.request(
      "/api/projects/project-a/research/sources/source-a/archive",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ archived: "yes" }),
      },
    );
    expect(invalid.status).toBe(400);
    expect(setSourceArchived).not.toHaveBeenCalled();

    const archived = await app.request(
      "/api/projects/project-a/research/sources/source-a/archive",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ archived: true }),
      },
    );
    expect(archived.status).toBe(200);
    expect(setSourceArchived).toHaveBeenCalledWith(
      "project-a",
      "source-a",
      true,
    );
  });

  it("validates durable finding dispositions before repository mutation", async () => {
    const transitionFinding = vi.fn();
    const app = new Hono();
    registerResearchRoutes(app, {
      getRepository: () => researchRepository,
      getWorkflowRepository: () => ({ transitionFinding }),
    });

    const invalid = await app.request(
      "/api/projects/project-a/reproducibility/findings/finding-a",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "Deferred" }),
      },
    );
    expect(invalid.status).toBe(400);
    expect(transitionFinding).not.toHaveBeenCalled();

    const assigned = await app.request(
      "/api/projects/project-a/reproducibility/findings/finding-a",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "Assigned",
          assignee: "researcher-a",
        }),
      },
    );
    expect(assigned.status).toBe(200);
    expect(transitionFinding).toHaveBeenCalledWith(
      "project-a",
      "finding-a",
      expect.objectContaining({
        status: "Assigned",
        assignee: "researcher-a",
      }),
    );
  });

  it("keeps decision supersession and planner mutation project-scoped", async () => {
    const supersedeDecision = vi.fn(() => ({
      decision: { id: "decision-a", status: "Superseded" },
      replacement: { id: "decision-b", status: "Active" },
    }));
    const transitionPlannerStep = vi.fn(() => ({
      id: "step-a",
      status: "In progress",
    }));
    const app = new Hono();
    registerResearchRoutes(app, {
      getRepository: () => researchRepository,
      getWorkflowRepository: () => ({
        supersedeDecision,
        transitionPlannerStep,
      }),
    });

    const superseded = await app.request(
      "/api/projects/project-a/decisions/decision-a/supersede",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Replacement",
          decision: "Use the replacement.",
          reason: "New evidence.",
        }),
      },
    );
    expect(superseded.status).toBe(201);
    expect(supersedeDecision).toHaveBeenCalledWith(
      "project-a",
      "decision-a",
      expect.objectContaining({ title: "Replacement" }),
    );

    const started = await app.request(
      "/api/projects/project-b/planner/step-a",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "In progress" }),
      },
    );
    expect(started.status).toBe(200);
    expect(transitionPlannerStep).toHaveBeenCalledWith(
      "project-b",
      "step-a",
      "In progress",
      "local-user",
    );
  });
});
