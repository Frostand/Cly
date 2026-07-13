// @vitest-environment node

import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { registerPrImpactReviewRoutes } from "./routes.js";

describe("pull request impact review routes", () => {
  it("validates a project-scoped local review request", async () => {
    const analyze = vi.fn(async () => ({
      projectId: "project-alpha",
      reviewId: "review-1",
    }));
    const app = new Hono();
    registerPrImpactReviewRoutes(app, {
      getService: () => ({ analyze, recordHumanReview: vi.fn() }),
    });

    const response = await app.request(
      "/api/projects/project-alpha/pr-impact-review",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: { kind: "local", scope: "working-tree" },
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      projectId: "project-alpha",
      reviewId: "review-1",
    });
    expect(analyze).toHaveBeenCalledWith("project-alpha", {
      kind: "local",
      scope: "working-tree",
    });
  });

  it("requires explicit local refs for a pull request without fetching externally", async () => {
    const app = new Hono();
    registerPrImpactReviewRoutes(app, {
      getService: () => ({ analyze: vi.fn(), recordHumanReview: vi.fn() }),
    });

    const response = await app.request(
      "/api/projects/project-alpha/pr-impact-review",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: { kind: "pull-request", number: 60 } }),
      },
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("baseRef");
  });

  it("records an attributable human decision without verifying inferred links", async () => {
    const recordHumanReview = vi.fn(() => ({ id: "provenance-1" }));
    const app = new Hono();
    registerPrImpactReviewRoutes(app, {
      getService: () => ({ analyze: vi.fn(), recordHumanReview }),
    });

    const response = await app.request(
      "/api/projects/project-alpha/pr-impact-review/approvals",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reviewId: "a".repeat(64),
          actorId: "local-reviewer",
          decision: "approved",
          confirmedLinkIds: ["evidence-1"],
          note: "Reviewed methodology and leakage implications.",
        }),
      },
    );

    expect(response.status).toBe(201);
    expect(recordHumanReview).toHaveBeenCalledWith("project-alpha", {
      reviewId: "a".repeat(64),
      actorId: "local-reviewer",
      decision: "approved",
      confirmedLinkIds: ["evidence-1"],
      note: "Reviewed methodology and leakage implications.",
    });
  });
});
