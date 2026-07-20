// @vitest-environment node
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import { registerResearchRoutes } from "./routes.js";

describe("code research linker routes", () => {
  it("binds project identity at the route boundary and preserves proposal evidence", async () => {
    const createLink = vi.fn((input) => input);
    const app = new Hono();
    registerResearchRoutes(app, {
      getCodeLinker: () => ({ createLink }),
    });

    const response = await app.request(
      "/api/projects/project-a/code-context/links",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: "project-b",
          codeEntityId: "entity-1",
          targetKind: "claim",
          targetId: "claim-1",
          linkRole: "supports",
          source: "agent-proposed",
          origin: "agent:reviewer",
          confidence: 0.72,
          evidence: [
            {
              type: "source-location",
              locator: "analysis.py:10",
              description: "The function computes the reported quantity.",
            },
          ],
        }),
      },
    );

    expect(response.status).toBe(201);
    expect(createLink).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-a",
        source: "agent-proposed",
        confidence: 0.72,
        evidence: [expect.objectContaining({ locator: "analysis.py:10" })],
      }),
    );
  });

  it("exposes an exact file or symbol context and rejects scan bodies", async () => {
    const getContext = vi.fn(() => ({ entity: { id: "entity-1" }, links: [] }));
    const listEntities = vi.fn(() => [{ id: "entity-1" }]);
    const scan = vi.fn();
    const app = new Hono();
    registerResearchRoutes(app, {
      getCodeLinker: () => ({ getContext, listEntities, scan }),
    });

    const context = await app.request(
      "/api/projects/project-a/code-context?path=analysis.py&symbol=fit",
    );
    expect(context.status).toBe(200);
    expect(getContext).toHaveBeenCalledWith("project-a", {
      path: "analysis.py",
      symbol: "fit",
    });

    const entities = await app.request(
      "/api/projects/project-a/code-context/entities?kind=symbol",
    );
    expect(entities.status).toBe(200);
    expect(listEntities).toHaveBeenCalledWith("project-a", { kind: "symbol" });

    const rejectedScan = await app.request(
      "/api/projects/project-a/code-context/scan",
      { method: "POST", headers: { "content-length": "2" }, body: "{}" },
    );
    expect(rejectedScan.status).toBe(400);
    expect(scan).not.toHaveBeenCalled();
  });
});
