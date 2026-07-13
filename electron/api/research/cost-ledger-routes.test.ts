// @vitest-environment node
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import { registerCostLedgerRoutes } from "./cost-ledger-routes.js";

function createApp(repository: Record<string, ReturnType<typeof vi.fn>>) {
  const app = new Hono();
  registerCostLedgerRoutes(app, { getRepository: () => repository });
  return app;
}

describe("cost ledger routes", () => {
  it("validates and scopes manual cost entries from the route project", async () => {
    const createManualEntry = vi.fn((input) => ({ id: "cost-1", ...input }));
    const app = createApp({ createManualEntry });
    const response = await app.request("/api/projects/project-1/costs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        amountMinor: 1200,
        category: "gpu",
        confidenceBps: 9000,
        currency: "USD",
        description: "GPU runtime",
        endedAt: "2026-07-01T01:00:00.000Z",
        runId: "run-1",
        startedAt: "2026-07-01T00:00:00.000Z",
      }),
    });

    expect(response.status).toBe(201);
    expect(createManualEntry).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project-1", amountMinor: 1200 }),
    );

    const invalid = await app.request("/api/projects/project-1/costs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        amountMinor: 12.5,
        category: "gpu",
        confidenceBps: 9000,
        currency: "USD",
        endedAt: "2026-07-01T01:00:00.000Z",
        runId: "run-1",
        startedAt: "2026-07-01T00:00:00.000Z",
      }),
    });
    expect(invalid.status).toBe(400);
    expect(createManualEntry).toHaveBeenCalledTimes(1);
  });

  it("exposes ledger, AWS import, and claim aggregation contracts", async () => {
    const repository = {
      getClaimCosts: vi.fn(() => ({ claimId: "claim-1", totals: [] })),
      importAwsCur: vi.fn(() => ({ importedCount: 1, duplicateCount: 0 })),
      listClaimCosts: vi.fn(() => [{ claimId: "claim-1", totals: [] }]),
      listLedger: vi.fn(() => ({ entries: [], totals: [] })),
    };
    const app = createApp(repository);

    expect((await app.request("/api/projects/project-1/costs")).status).toBe(
      200,
    );
    expect(
      (await app.request("/api/projects/project-1/costs/claims")).status,
    ).toBe(200);
    expect(
      (await app.request("/api/projects/project-1/costs/claims/claim-1"))
        .status,
    ).toBe(200);
    const imported = await app.request(
      "/api/projects/project-1/costs/imports/aws-cur",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileName: "cur.csv", csv: "header\nrow" }),
      },
    );
    expect(imported.status).toBe(201);
    expect(repository.importAwsCur).toHaveBeenCalledWith({
      csv: "header\nrow",
      fileName: "cur.csv",
      projectId: "project-1",
    });
  });

  it("does not hide repository isolation errors", async () => {
    const app = createApp({
      listLedger: vi.fn(() => {
        throw new Error("Research project does not exist.");
      }),
    });
    const response = await app.request("/api/projects/missing/costs");
    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Research project does not exist.");
  });
});
