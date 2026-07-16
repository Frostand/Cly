// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createMockAgentProvider } from "./mock-provider.js";
import { createAgentScheduler } from "./scheduler.js";

const budget = {
  maxInputTokens: 1_000,
  maxOutputTokens: 1_000,
  maxCostMinorUnits: 1_000,
  maxRuntimeMs: 10_000,
};

const permissions = {
  canReadFiles: true,
  canWriteFiles: true,
  canRunCommands: true,
  canAccessNetwork: true,
  requiresApprovalForWrite: true,
  requiresApprovalForNetwork: true,
};

const role = (id: string, instanceCount: number, maxParallel: number) => ({
  id,
  role: id === "review" ? ("review" as const) : ("implementation" as const),
  instanceCount,
  maxParallel,
  provider: "openai",
  model: "gpt-5",
  reasoningLevel: "medium" as const,
  budget,
  allowedTools: ["readFile", "writeFile"],
  allowedContextSources: ["project"],
  allowedFileGlobs: ["**/*"],
  permissions,
  approvalCheckpoints: ["write"],
});

const configuration = (overrides: Record<string, unknown> = {}) => ({
  id: "configuration-1",
  projectId: "project-1",
  name: "Delivery team",
  maxParallel: 2,
  maxTotalBudget: { ...budget, maxRuntimeMs: 100_000 },
  partialFailurePolicy: "continue" as const,
  roles: [role("implementation", 3, 1), role("review", 2, 1)],
  revision: 1,
  createdAt: "2026-07-15T12:00:00.000Z",
  updatedAt: "2026-07-15T12:00:00.000Z",
  ...overrides,
});

const usage = (inputTokens = 20, outputTokens = 10, costMinorUnits = 3) => ({
  type: "usage" as const,
  inputTokens,
  outputTokens,
  costMinorUnits,
  runtimeMs: 5,
});

describe("agent scheduler", () => {
  it("enforces global and per-role concurrency caps", async () => {
    const scripts = Object.fromEntries(
      [
        "implementation-1",
        "implementation-2",
        "implementation-3",
        "review-1",
        "review-2",
      ].map((id) => [id, [{ type: "delay", ms: 5 }, usage()]]),
    );
    const provider = createMockAgentProvider({ scripts });
    const result = await createAgentScheduler({}).run(
      configuration(),
      provider,
    );

    expect(provider.maximumActive).toBe(2);
    expect(provider.maximumActiveByRole.implementation).toBe(1);
    expect(provider.maximumActiveByRole.review).toBe(1);
    expect(result.results.map((worker) => worker.status)).toEqual([
      "completed",
      "completed",
      "completed",
      "completed",
      "completed",
    ]);
  });

  it("cancels active and queued workers when the run signal aborts", async () => {
    const controller = new AbortController();
    const provider = createMockAgentProvider({
      scripts: {
        "implementation-1": [{ type: "wait_until_aborted" }],
        "implementation-2": [usage()],
      },
      onWorkerStart: () => queueMicrotask(() => controller.abort()),
    });
    const result = await createAgentScheduler({}).run(
      configuration({
        maxParallel: 1,
        roles: [role("implementation", 2, 1)],
      }),
      provider,
      controller.signal,
    );

    expect(result.results.map(({ status }) => status)).toEqual([
      "canceled",
      "canceled",
    ]);
    expect(result.events.filter(({ type }) => type === "started")).toHaveLength(
      1,
    );
    expect(
      result.events.filter(({ type }) => type === "canceled"),
    ).toHaveLength(2);
  });

  it.each([
    ["continue", ["failed", "completed"]],
    ["cancel_remaining", ["failed", "canceled"]],
  ] as const)("preserves partial results under the %s policy", async (partialFailurePolicy, statuses) => {
    const provider = createMockAgentProvider({
      scripts: {
        "implementation-1": [{ type: "error", code: "PARTIAL_FAILURE" }],
        "implementation-2": [usage()],
      },
    });
    const result = await createAgentScheduler({}).run(
      configuration({
        maxParallel: 1,
        partialFailurePolicy,
        roles: [role("implementation", 2, 1)],
      }),
      provider,
    );

    expect(result.results.map(({ status }) => status)).toEqual(statuses);
    expect(result.results[0]).toMatchObject({
      error: { code: "PARTIAL_FAILURE" },
    });
  });

  it.each([
    ["maxInputTokens", usage(21, 0, 0)],
    ["maxOutputTokens", usage(0, 21, 0)],
    ["maxCostMinorUnits", usage(0, 0, 21)],
    ["maxRuntimeMs", { ...usage(0, 0, 0), runtimeMs: 21 }],
  ] as const)("exhausts aggregate %s after accounting usage and cancels queued work", async (budgetKey, usageEvent) => {
    const maxTotalBudget = { ...budget, [budgetKey]: 20 };
    const provider = createMockAgentProvider({
      scripts: {
        "implementation-1": [usageEvent],
        "implementation-2": [usage()],
      },
    });
    const result = await createAgentScheduler({}).run(
      configuration({
        maxParallel: 1,
        maxTotalBudget,
        roles: [role("implementation", 2, 1)],
      }),
      provider,
    );

    expect(result.results.map(({ status }) => status)).toEqual([
      "budget_exhausted",
      "canceled",
    ]);
    expect(
      result.usage[
        budgetKey.replace(/^max/, "").replace(/^./, (c) => c.toLowerCase())
      ],
    ).toBe(21);
    expect(
      result.events.some(
        (event) =>
          event.type === "budget_exhausted" && event.budget === budgetKey,
      ),
    ).toBe(true);
  });

  it("blocks an approval-gated action until an approved bound result arrives", async () => {
    let resolveApproval!: (value: Record<string, unknown>) => void;
    const approval = new Promise<Record<string, unknown>>((resolve) => {
      resolveApproval = resolve;
    });
    const requestApproval = vi.fn(() => approval);
    const provider = createMockAgentProvider({
      scripts: {
        "implementation-1": [
          {
            type: "action",
            id: "approval-1",
            checkpoint: "write",
            tool: "writeFile",
            input: { path: "src/app.ts" },
          },
          usage(),
        ],
      },
    });
    let settled = false;
    const run = createAgentScheduler({ requestApproval })
      .run(
        configuration({
          maxParallel: 1,
          roles: [role("implementation", 1, 1)],
        }),
        provider,
      )
      .finally(() => {
        settled = true;
      });

    await vi.waitFor(() => expect(requestApproval).toHaveBeenCalledOnce());
    expect(provider.executedActions).toEqual([]);
    expect(settled).toBe(false);
    const request = requestApproval.mock.calls[0][0];
    expect(request).toMatchObject({
      id: "approval-1",
      projectId: "project-1",
      runId: "implementation-1",
      checkpoint: "write",
    });
    resolveApproval({
      approved: true,
      id: request.id,
      projectId: request.projectId,
      runId: request.runId,
    });
    const result = await run;

    expect(provider.executedActions).toHaveLength(1);
    expect(result.results[0].status).toBe("completed");
    expect(result.events.map(({ type }) => type)).toEqual([
      "queued",
      "started",
      "awaiting_approval",
      "usage",
      "completed",
    ]);
  });

  it("cancels a worker that is waiting for approval when the run aborts", async () => {
    const controller = new AbortController();
    const requestApproval = vi.fn(
      () => new Promise<Record<string, unknown>>(() => undefined),
    );
    const provider = createMockAgentProvider({
      scripts: {
        "implementation-1": [
          {
            type: "action",
            id: "approval-1",
            checkpoint: "write",
            tool: "writeFile",
          },
        ],
      },
    });
    const run = createAgentScheduler({ requestApproval }).run(
      configuration({
        maxParallel: 1,
        roles: [role("implementation", 1, 1)],
      }),
      provider,
      controller.signal,
    );

    await vi.waitFor(() => expect(requestApproval).toHaveBeenCalledOnce());
    controller.abort();

    await expect(run).resolves.toMatchObject({
      results: [{ status: "canceled" }],
    });
    expect(provider.executedActions).toEqual([]);
  });
});
