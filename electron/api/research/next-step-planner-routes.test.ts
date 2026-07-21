// @vitest-environment node
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { registerNextStepPlannerRoutes } from "./next-step-planner-routes.js";

describe("next-step planner routes", () => {
  it("binds project and recommendation identity and rejects unreasoned deferrals", async () => {
    const generate = vi.fn(() => ({ recommendations: [] }));
    const decide = vi.fn(() => ({ execution: { created: false } }));
    const app = new Hono();
    registerNextStepPlannerRoutes(app, {
      getPlanner: () => ({ generate, list: () => [], decide }),
    });

    const generated = await app.request(
      "/api/projects/project-a/next-step-plans",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actor: "researcher-a" }),
      },
    );
    expect(generated.status).toBe(201);
    expect(generate).toHaveBeenCalledWith("project-a", "researcher-a");

    const invalid = await app.request(
      "/api/projects/project-a/next-step-plans/recommendations/rec-a/decisions",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "defer" }),
      },
    );
    expect(invalid.status).toBe(400);
    expect(decide).not.toHaveBeenCalled();

    const accepted = await app.request(
      "/api/projects/project-a/next-step-plans/recommendations/rec-a/decisions",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "accept", actor: "researcher-a" }),
      },
    );
    expect(accepted.status).toBe(200);
    expect(decide).toHaveBeenCalledWith({
      projectId: "project-a",
      recommendationId: "rec-a",
      action: "accept",
      actor: "researcher-a",
      reason: null,
      edit: null,
    });
  });

  it("limits edits to reviewable planner fields and never accepts execution input", async () => {
    const decide = vi.fn(() => ({ execution: { created: false } }));
    const app = new Hono();
    registerNextStepPlannerRoutes(app, {
      getPlanner: () => ({ generate: vi.fn(), list: () => [], decide }),
    });
    const response = await app.request(
      "/api/projects/project-a/next-step-plans/recommendations/rec-a/decisions",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "edit",
          edit: { title: "Revised title" },
          command: "rm -rf anything",
        }),
      },
    );
    expect(response.status).toBe(400);
    expect(decide).not.toHaveBeenCalled();
  });
});
