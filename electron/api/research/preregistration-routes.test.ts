// @vitest-environment node
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { registerPreregistrationRoutes } from "./preregistration-routes.js";

const content = {
  hypothesis: "Calibration reduces worst-group error.",
  primaryMetrics: ["Worst-group error"],
  exclusionRules: "Exclude corrupt records only.",
  analysisPlan: "Use paired estimates with uncertainty intervals.",
  successCriteria: "Worst-group error improves by two points.",
  dataset: "Shift benchmark v2",
  intendedDesign: "Paired ablation",
};

describe("preregistration routes", () => {
  it("validates a complete snapshot and takes project and experiment scope from the URL", async () => {
    const createPreregistration = vi.fn((input) => ({
      id: "snapshot-1",
      ...input,
    }));
    const app = new Hono();
    registerPreregistrationRoutes(app, {
      getRepository: () => ({ createPreregistration }),
    });

    const response = await app.request(
      "/api/projects/project-1/experiments/experiment-1/preregistrations",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: "project-2",
          experimentId: "experiment-2",
          content,
        }),
      },
    );
    expect(response.status).toBe(400);
    expect(createPreregistration).not.toHaveBeenCalled();

    const created = await app.request(
      "/api/projects/project-1/experiments/experiment-1/preregistrations",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content, actorId: "researcher-1" }),
      },
    );
    expect(created.status).toBe(201);
    expect(createPreregistration).toHaveBeenCalledWith({
      content,
      actorId: "researcher-1",
      actorType: "human",
      origin: "human",
      projectId: "project-1",
      experimentId: "experiment-1",
    });
  });

  it("routes comparison, final evaluation, deviation, and acknowledgement writes", async () => {
    const repository = {
      comparePreregistration: vi.fn(() => []),
      markPreregistrationEvaluated: vi.fn(() => ({ id: "snapshot-1" })),
      declareAnalysisDeviation: vi.fn(() => ({ id: "deviation-1" })),
      acknowledgeAnalysisDeviation: vi.fn(() => ({ id: "deviation-1" })),
    };
    const app = new Hono();
    registerPreregistrationRoutes(app, { getRepository: () => repository });

    const compare = await app.request(
      "/api/projects/project-1/preregistrations/snapshot-1/compare",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      },
    );
    expect(compare.status).toBe(200);
    expect(repository.comparePreregistration).toHaveBeenCalledWith(
      "project-1",
      "snapshot-1",
      content,
    );

    const evaluated = await app.request(
      "/api/projects/project-1/preregistrations/snapshot-1/final-evaluation",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actorId: "reviewer-1" }),
      },
    );
    expect(evaluated.status).toBe(201);
    expect(repository.markPreregistrationEvaluated).toHaveBeenCalledWith({
      projectId: "project-1",
      snapshotId: "snapshot-1",
      actorId: "reviewer-1",
    });

    const invalidDeviation = await app.request(
      "/api/projects/project-1/preregistrations/snapshot-1/deviations",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fieldPath: "/unknown",
          afterValue: "Changed",
          rationale: "Needed",
        }),
      },
    );
    expect(invalidDeviation.status).toBe(400);
    expect(repository.declareAnalysisDeviation).not.toHaveBeenCalled();

    const deviation = await app.request(
      "/api/projects/project-1/preregistrations/snapshot-1/deviations",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fieldPath: "/analysisPlan",
          afterValue: "Use a stratified paired analysis.",
          rationale: "The planned strata were omitted.",
        }),
      },
    );
    expect(deviation.status).toBe(201);
    expect(repository.declareAnalysisDeviation).toHaveBeenCalledWith({
      projectId: "project-1",
      snapshotId: "snapshot-1",
      fieldPath: "/analysisPlan",
      afterValue: "Use a stratified paired analysis.",
      rationale: "The planned strata were omitted.",
      actorId: "local-user",
    });

    const acknowledgement = await app.request(
      "/api/projects/project-1/deviations/deviation-1/acknowledgements",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    expect(acknowledgement.status).toBe(201);
    expect(repository.acknowledgeAnalysisDeviation).toHaveBeenCalledWith({
      projectId: "project-1",
      deviationId: "deviation-1",
      actorId: "local-user",
    });
  });
});
