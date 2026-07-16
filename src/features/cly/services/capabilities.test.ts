import { describe, expect, it } from "vitest";
import { getCapability } from "./capabilities";

describe("Cly Dev capability truthfulness", () => {
  it("separates durable session persistence from deferred process execution", () => {
    expect(getCapability("agents.sessions-durable")).toMatchObject({
      state: "production",
      action: "Persist and inspect durable agent session state",
      service: "productionAgentSessionServices",
      api: "GET /api/projects/:projectId/cly-dev/sessions; POST /api/projects/:projectId/cly-dev/session-aggregates",
    });
    expect(getCapability("agents.execute")).toMatchObject({
      state: "unavailable",
      service: null,
      api: null,
      reason: expect.stringContaining("CLY-76"),
    });
  });
});
