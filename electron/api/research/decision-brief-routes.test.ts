// @vitest-environment node
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import { registerResearchRoutes } from "./routes.js";

describe("decision brief routes", () => {
  it("keeps generation and finding transitions project-scoped at the route boundary", async () => {
    const generateDecisionBrief = vi.fn(() => ({
      brief: null,
      created: false,
      noChanges: true,
    }));
    const transitionDecisionBriefFinding = vi.fn(() => ({ id: "finding-1" }));
    const app = new Hono();
    registerResearchRoutes(app, {
      getRepository: () => ({
        generateDecisionBrief,
        listDecisionBriefs: () => [],
        transitionDecisionBriefFinding,
      }),
    });

    const generated = await app.request(
      "/api/projects/project-a/decision-briefs",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actor: "facilitator-a" }),
      },
    );
    expect(generated.status).toBe(201);
    expect(generateDecisionBrief).toHaveBeenCalledWith(
      "project-a",
      "facilitator-a",
    );

    const invalidDeferral = await app.request(
      "/api/projects/project-a/decision-briefs/brief-a/findings/finding-a",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "deferred" }),
      },
    );
    expect(invalidDeferral.status).toBe(400);
    expect(transitionDecisionBriefFinding).not.toHaveBeenCalled();

    const assigned = await app.request(
      "/api/projects/project-a/decision-briefs/brief-a/findings/finding-a",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "assigned",
          owner: "owner-a",
          actor: "facilitator-a",
        }),
      },
    );
    expect(assigned.status).toBe(200);
    expect(transitionDecisionBriefFinding).toHaveBeenCalledWith({
      projectId: "project-a",
      briefId: "brief-a",
      findingId: "finding-a",
      status: "assigned",
      owner: "owner-a",
      actor: "facilitator-a",
    });
  });
});
