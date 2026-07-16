// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createToolApprovalBinding } from "../tool-approvals.js";
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

const boundApproval = (request: Record<string, unknown>) => ({
  approved: true,
  expiresAt: Date.now() + 5_000,
  id: request.id,
  ...createToolApprovalBinding(request),
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
    ["continue", ["budget_exhausted", "completed"]],
    ["cancel_remaining", ["budget_exhausted", "canceled"]],
  ] as const)("applies the %s policy to queued work after role-budget exhaustion", async (partialFailurePolicy, statuses) => {
    const constrainedRole = {
      ...role("implementation", 2, 1),
      budget: { ...budget, maxInputTokens: 10 },
    };
    const provider = createMockAgentProvider({
      scripts: {
        "implementation-1": [usage(11, 0, 0)],
        "implementation-2": [usage(1, 0, 0)],
      },
    });
    const result = await createAgentScheduler({}).run(
      configuration({
        maxParallel: 1,
        maxTotalBudget: { ...budget, maxInputTokens: 100 },
        partialFailurePolicy,
        roles: [constrainedRole],
      }),
      provider,
    );

    expect(result.results.map(({ status }) => status)).toEqual(statuses);
    expect(provider.startedWorkers).toEqual(
      partialFailurePolicy === "continue"
        ? ["implementation-1", "implementation-2"]
        : ["implementation-1"],
    );
  });

  it.each([
    ["continue", ["budget_exhausted", "completed"]],
    ["cancel_remaining", ["budget_exhausted", "canceled"]],
  ] as const)("applies the %s policy to active work after role-budget exhaustion", async (partialFailurePolicy, statuses) => {
    const constrainedRole = {
      ...role("implementation", 2, 2),
      budget: { ...budget, maxInputTokens: 10 },
    };
    const provider = createMockAgentProvider({
      scripts: {
        "implementation-1": [{ type: "delay", ms: 5 }, usage(11, 0, 0)],
        "implementation-2":
          partialFailurePolicy === "continue"
            ? [{ type: "delay", ms: 10 }, usage(1, 0, 0)]
            : [{ type: "wait_until_aborted" }],
      },
    });
    const result = await createAgentScheduler({}).run(
      configuration({
        maxParallel: 2,
        maxTotalBudget: { ...budget, maxInputTokens: 100 },
        partialFailurePolicy,
        roles: [constrainedRole],
      }),
      provider,
    );

    expect(provider.maximumActive).toBe(2);
    expect(result.results.map(({ status }) => status)).toEqual(statuses);
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
    ).toBe(20);
    expect(
      result.events.some(
        (event) =>
          event.type === "budget_exhausted" && event.budget === budgetKey,
      ),
    ).toBe(true);
    const usageKey = budgetKey
      .replace(/^max/, "")
      .replace(/^./, (character) => character.toLowerCase());
    expect(result.usageTotals).toMatchObject({
      accepted: { [usageKey]: 20 },
      providerReported: { [usageKey]: 21 },
      reserved: { [usageKey]: 20 },
    });
  });

  it("atomically reserves concurrent worker budgets without oversubscription", async () => {
    const constrainedRole = {
      ...role("implementation", 2, 2),
      budget: { ...budget, maxInputTokens: 15 },
    };
    const provider = createMockAgentProvider({
      scripts: {
        "implementation-1": [{ type: "delay", ms: 5 }, usage(15, 0, 0)],
        "implementation-2": [{ type: "delay", ms: 5 }, usage(15, 0, 0)],
      },
    });
    const result = await createAgentScheduler({}).run(
      configuration({
        maxParallel: 2,
        maxTotalBudget: { ...budget, maxInputTokens: 20 },
        roles: [constrainedRole],
      }),
      provider,
    );

    expect(provider.maximumActive).toBe(2);
    expect(result.usage.inputTokens).toBeLessThanOrEqual(20);
    expect(
      result.results.map(({ usage: workerUsage }) => workerUsage.inputTokens),
    ).toEqual([10, 0]);
    expect(result.results.map(({ status }) => status)).toEqual([
      "budget_exhausted",
      "canceled",
    ]);
  });

  it("aborts a provider that exceeds a runtime deadline without usage events", async () => {
    const provider = createMockAgentProvider({
      scripts: {
        "implementation-1": [{ type: "delay", ms: 40 }],
      },
    });
    const result = await createAgentScheduler({}).run(
      configuration({
        maxParallel: 1,
        maxTotalBudget: { ...budget, maxRuntimeMs: 10 },
        roles: [
          {
            ...role("implementation", 1, 1),
            budget: { ...budget, maxRuntimeMs: 10 },
          },
        ],
      }),
      provider,
    );

    expect(result.results[0].status).toBe("budget_exhausted");
    expect(result.results[0].usage.runtimeMs).toBeLessThanOrEqual(10);
    expect(result.usage.runtimeMs).toBeLessThanOrEqual(10);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        budget: "maxRuntimeMs",
        scope: "role",
        type: "budget_exhausted",
      }),
    );
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
      request: {
        input: { path: "src/app.ts" },
        toolName: "writeFile",
      },
      runId: "implementation-1",
    });
    resolveApproval(boundApproval(request));
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
            input: { path: "src/app.ts" },
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

  it("rejects disallowed tools, permissions, file paths, and checkpoints before approval", async () => {
    const cases = [
      {
        action: {
          type: "action",
          id: "unlisted",
          checkpoint: "write",
          tool: "writeFile",
          input: { path: "src/app.ts" },
        },
        configuredRole: {
          ...role("implementation", 1, 1),
          allowedTools: ["readFile"],
        },
      },
      {
        action: {
          type: "action",
          id: "forbidden-write",
          checkpoint: "write",
          tool: "writeFile",
          input: { path: "src/app.ts" },
        },
        configuredRole: {
          ...role("implementation", 1, 1),
          permissions: { ...permissions, canWriteFiles: false },
        },
      },
      {
        action: {
          type: "action",
          id: "outside-glob",
          checkpoint: "write",
          tool: "writeFile",
          input: { path: "secrets.txt" },
        },
        configuredRole: {
          ...role("implementation", 1, 1),
          allowedFileGlobs: ["src/**"],
        },
      },
      {
        action: {
          type: "action",
          id: "wrong-checkpoint",
          checkpoint: "network",
          tool: "writeFile",
          input: { path: "src/app.ts" },
        },
        configuredRole: role("implementation", 1, 1),
      },
      {
        action: {
          type: "action",
          id: "forbidden-command",
          checkpoint: "command",
          tool: "runCommand",
          input: { command: "pnpm test" },
        },
        configuredRole: {
          ...role("implementation", 1, 1),
          allowedTools: ["runCommand"],
          permissions: { ...permissions, canRunCommands: false },
        },
      },
      {
        action: {
          type: "action",
          id: "forbidden-network",
          checkpoint: "network",
          tool: "network",
          input: { url: "https://example.test" },
        },
        configuredRole: {
          ...role("implementation", 1, 1),
          allowedTools: ["network"],
          permissions: { ...permissions, canAccessNetwork: false },
        },
      },
    ];

    for (const testCase of cases) {
      const requestApproval = vi.fn(boundApproval);
      const provider = createMockAgentProvider({
        scripts: { "implementation-1": [testCase.action] },
      });
      const result = await createAgentScheduler({ requestApproval }).run(
        configuration({
          maxParallel: 1,
          roles: [testCase.configuredRole],
        }),
        provider,
      );

      expect(result.results[0]).toMatchObject({
        error: { code: "POLICY_VIOLATION" },
        status: "failed",
      });
      expect(requestApproval).not.toHaveBeenCalled();
      expect(provider.executedActions).toEqual([]);
    }
  });

  it.each([
    ["altered", { actionHash: "altered" }],
    ["expired", { expiresAt: 0 }],
  ])("rejects an %s approval binding", async (_name, override) => {
    const requestApproval = vi.fn((request) => ({
      ...boundApproval(request),
      ...override,
    }));
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
        ],
      },
    });
    const result = await createAgentScheduler({ requestApproval }).run(
      configuration({
        maxParallel: 1,
        roles: [role("implementation", 1, 1)],
      }),
      provider,
    );

    expect(result.results[0]).toMatchObject({
      error: { code: "APPROVAL_DENIED" },
      status: "failed",
    });
    expect(provider.executedActions).toEqual([]);
  });

  it("executes an authorized ungated action without requesting approval", async () => {
    const requestApproval = vi.fn(boundApproval);
    const provider = createMockAgentProvider({
      scripts: {
        "implementation-1": [
          {
            type: "action",
            id: "write-ungated",
            checkpoint: "write",
            tool: "writeFile",
            input: { path: "src/app.ts" },
          },
        ],
      },
    });
    const configuredRole = {
      ...role("implementation", 1, 1),
      allowedTools: ["writeFile"],
      approvalCheckpoints: [],
      permissions: {
        ...permissions,
        requiresApprovalForNetwork: false,
        requiresApprovalForWrite: false,
      },
    };
    const result = await createAgentScheduler({ requestApproval }).run(
      configuration({ maxParallel: 1, roles: [configuredRole] }),
      provider,
    );

    expect(result.results[0].status).toBe("completed");
    expect(requestApproval).not.toHaveBeenCalled();
    expect(provider.executedActions).toHaveLength(1);
  });

  it("requires approval when the configured checkpoint gates an action", async () => {
    const requestApproval = vi.fn(boundApproval);
    const provider = createMockAgentProvider({
      scripts: {
        "implementation-1": [
          {
            type: "action",
            id: "command-gated",
            checkpoint: "command",
            tool: "runCommand",
            input: { command: "pnpm test" },
          },
        ],
      },
    });
    const configuredRole = {
      ...role("implementation", 1, 1),
      allowedTools: ["runCommand"],
      approvalCheckpoints: ["command"],
      permissions: {
        ...permissions,
        requiresApprovalForNetwork: false,
        requiresApprovalForWrite: false,
      },
    };
    const result = await createAgentScheduler({ requestApproval }).run(
      configuration({ maxParallel: 1, roles: [configuredRole] }),
      provider,
    );

    expect(result.results[0].status).toBe("completed");
    expect(requestApproval).toHaveBeenCalledOnce();
    expect(provider.executedActions).toHaveLength(1);
  });

  it("falls back for a qualifying model failure while preserving usage", async () => {
    const provider = createMockAgentProvider({
      scripts: {
        "implementation-1@gpt-5": [
          usage(5, 2, 1),
          { type: "error", code: "MODEL_UNAVAILABLE" },
        ],
        "implementation-1@gpt-5-mini": [usage(4, 2, 1)],
      },
    });
    const result = await createAgentScheduler({}).run(
      configuration({
        maxParallel: 1,
        roles: [
          {
            ...role("implementation", 1, 1),
            fallbackModel: "gpt-5-mini",
          },
        ],
      }),
      provider,
    );

    expect(result.results[0]).toMatchObject({
      status: "completed",
      usage: { inputTokens: 9, outputTokens: 4, costMinorUnits: 2 },
    });
    expect(result.events.map(({ type }) => type)).toEqual(
      expect.arrayContaining(["fallback_started", "fallback_completed"]),
    );
    expect(result.events).toContainEqual(
      expect.objectContaining({
        terminalReason: "completed",
        type: "fallback_completed",
      }),
    );
  });

  it("fails audibly when the fallback attempt also fails", async () => {
    const provider = createMockAgentProvider({
      scripts: {
        "implementation-1@gpt-5": [
          { type: "error", code: "PROVIDER_UNAVAILABLE" },
        ],
        "implementation-1@gpt-5-mini": [
          { type: "error", code: "MODEL_UNAVAILABLE" },
        ],
      },
    });
    const result = await createAgentScheduler({}).run(
      configuration({
        maxParallel: 1,
        roles: [
          {
            ...role("implementation", 1, 1),
            fallbackModel: "gpt-5-mini",
          },
        ],
      }),
      provider,
    );

    expect(result.results[0]).toMatchObject({
      error: { code: "MODEL_UNAVAILABLE" },
      status: "failed",
    });
    expect(result.events.map(({ type }) => type)).toEqual(
      expect.arrayContaining(["fallback_started", "fallback_failed", "failed"]),
    );
    expect(result.events).toContainEqual(
      expect.objectContaining({
        terminalReason: "provider_failure",
        type: "fallback_failed",
      }),
    );
  });

  it("does not start fallback after a side-effecting primary action", async () => {
    const provider = createMockAgentProvider({
      scripts: {
        "implementation-1@gpt-5": [
          {
            type: "action",
            id: "write-before-failure",
            checkpoint: "write",
            tool: "writeFile",
            input: { path: "src/app.ts" },
          },
          { type: "error", code: "MODEL_UNAVAILABLE" },
        ],
        "implementation-1@gpt-5-mini": [usage(1, 0, 0)],
      },
    });
    const configuredRole = {
      ...role("implementation", 1, 1),
      fallbackModel: "gpt-5-mini",
      approvalCheckpoints: [],
      permissions: {
        ...permissions,
        requiresApprovalForWrite: false,
      },
    };
    const result = await createAgentScheduler({}).run(
      configuration({ maxParallel: 1, roles: [configuredRole] }),
      provider,
    );

    expect(result.results[0]).toMatchObject({
      error: { code: "MODEL_UNAVAILABLE" },
      status: "failed",
    });
    expect(provider.executedActions).toHaveLength(1);
    expect(provider.startedWorkers).toEqual(["implementation-1"]);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        reason: "side_effects_executed",
        type: "fallback_skipped",
      }),
    );
    expect(result.events.some(({ type }) => type === "fallback_started")).toBe(
      false,
    );
  });

  it("terminates a started fallback with a budget audit event", async () => {
    const provider = createMockAgentProvider({
      scripts: {
        "implementation-1@gpt-5": [
          { type: "error", code: "MODEL_UNAVAILABLE" },
        ],
        "implementation-1@gpt-5-mini": [usage(11, 0, 0)],
      },
    });
    const result = await createAgentScheduler({}).run(
      configuration({
        maxParallel: 1,
        roles: [
          {
            ...role("implementation", 1, 1),
            budget: { ...budget, maxInputTokens: 10 },
            fallbackModel: "gpt-5-mini",
          },
        ],
      }),
      provider,
    );

    expect(result.results[0].status).toBe("budget_exhausted");
    expect(result.events).toContainEqual(
      expect.objectContaining({
        terminalReason: "budget_exhausted",
        type: "fallback_failed",
      }),
    );
  });

  it("terminates a started fallback with a deadline audit event", async () => {
    const provider = createMockAgentProvider({
      scripts: {
        "implementation-1@gpt-5": [
          { type: "error", code: "MODEL_UNAVAILABLE" },
        ],
        "implementation-1@gpt-5-mini": [{ type: "delay", ms: 40 }],
      },
    });
    const result = await createAgentScheduler({}).run(
      configuration({
        maxParallel: 1,
        maxTotalBudget: { ...budget, maxRuntimeMs: 10 },
        roles: [
          {
            ...role("implementation", 1, 1),
            budget: { ...budget, maxRuntimeMs: 10 },
            fallbackModel: "gpt-5-mini",
          },
        ],
      }),
      provider,
    );

    expect(result.results[0].status).toBe("budget_exhausted");
    expect(result.events).toContainEqual(
      expect.objectContaining({
        terminalReason: "deadline",
        type: "fallback_failed",
      }),
    );
  });

  it("terminates a started fallback with a cancellation audit event", async () => {
    const controller = new AbortController();
    const provider = createMockAgentProvider({
      scripts: {
        "implementation-1@gpt-5": [
          { type: "error", code: "MODEL_UNAVAILABLE" },
        ],
        "implementation-1@gpt-5-mini": [{ type: "wait_until_aborted" }],
      },
      onWorkerStart: () => {
        if (provider.startedWorkers.length === 2) {
          queueMicrotask(() => controller.abort());
        }
      },
    });
    const result = await createAgentScheduler({}).run(
      configuration({
        maxParallel: 1,
        roles: [
          {
            ...role("implementation", 1, 1),
            fallbackModel: "gpt-5-mini",
          },
        ],
      }),
      provider,
      controller.signal,
    );

    expect(result.results[0].status).toBe("canceled");
    expect(result.events).toContainEqual(
      expect.objectContaining({
        terminalReason: "canceled",
        type: "fallback_failed",
      }),
    );
  });

  it("terminates a started fallback with a policy audit event", async () => {
    const provider = createMockAgentProvider({
      scripts: {
        "implementation-1@gpt-5": [
          { type: "error", code: "MODEL_UNAVAILABLE" },
        ],
        "implementation-1@gpt-5-mini": [
          {
            type: "action",
            id: "forbidden-fallback-action",
            checkpoint: "network",
            tool: "network",
            input: { url: "https://example.test" },
          },
        ],
      },
    });
    const result = await createAgentScheduler({}).run(
      configuration({
        maxParallel: 1,
        roles: [
          {
            ...role("implementation", 1, 1),
            fallbackModel: "gpt-5-mini",
          },
        ],
      }),
      provider,
    );

    expect(result.results[0]).toMatchObject({
      error: { code: "POLICY_VIOLATION" },
      status: "failed",
    });
    expect(result.events).toContainEqual(
      expect.objectContaining({
        terminalReason: "policy_violation",
        type: "fallback_failed",
      }),
    );
  });
});
