// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { clyDevEventInputSchema } from "../session-schema.js";
import { createApprovalGate } from "./approval-gate.js";
import {
  createClyDevExecutionRuntime,
  deriveTransferableContextSummary,
} from "./execution-runtime.js";
import { createDeterministicMockProvider } from "./mock-provider.js";

const NOW = "2026-07-16T12:00:00.000Z";
const context = {
  schemaVersion: 1,
  kind: "cly.context_manifest",
  manifest: {
    id: "manifest-1",
    schemaVersion: 1,
    summary: deriveTransferableContextSummary([]),
    entries: [],
  },
  provenance: {
    repository: { id: "repo-1" },
    worktree: { id: "worktree-1", branch: "main" },
    commit: { sha: "a".repeat(40) },
    machine: { id: "machine-1", platform: "darwin" },
    provider: { id: "deterministic-mock", model: "mock-model" },
    research: { objectIds: [] },
  },
};
const contextBytes = JSON.stringify(context);
const contextHash = createHash("sha256").update(contextBytes).digest("hex");
const outbound = {
  preview: context,
  egress: context,
  previewBytes: contextBytes,
  egressBytes: contextBytes,
  previewSha256: contextHash,
  egressSha256: contextHash,
};

const call = (tool: string, argumentsValue: Record<string, unknown> = {}) => ({
  toolCallId: `call-${tool}`,
  tool,
  arguments: argumentsValue,
});

const createGateHarness = (projectPolicy) => {
  const approvals = new Map<string, Record<string, unknown>>();
  const gate = createApprovalGate({
    now: () => NOW,
    projectPolicy,
    approvalTtlMs: 3_600_000,
    loadApproval: async (approvalId) => approvals.get(approvalId),
  });
  return { approvals, gate };
};

describe("Cly Dev approval gate", () => {
  const categories = {
    file_write: ["writeFile", { path: "src/index.ts", content: "next" }],
    command: ["runCommand", { command: "pnpm test" }],
    network: ["network", { url: "https://example.com" }],
    secret: ["readSecret", { name: "OPENAI_API_KEY" }],
    git: ["gitCommit", { message: "test" }],
    experiment: ["runExperiment", { id: "experiment-1" }],
    research_record: ["updateResearchRecord", { id: "record-1" }],
  } as const;

  it.each(
    Object.entries(categories),
  )("classifies %s effects and requires exact approval scope", async (category, [
    tool,
    args,
  ]) => {
    const { approvals, gate } = createGateHarness({
      categories: { [category]: "approval" },
    });
    const toolCall = call(tool, args);

    expect(gate.classify(toolCall)).toMatchObject({
      category,
      sideEffecting: true,
    });
    const pending = await gate.evaluate({
      projectId: "project-1",
      sessionId: "session-1",
      toolCall,
      contextHash,
    });
    expect(pending).toMatchObject({ type: "pending", category });
    approvals.set(pending.approval.approvalId, {
      ...pending.approval,
      state: "approved",
      resolvedBy: "user-1",
    });
    await expect(
      gate.evaluate({
        projectId: "project-1",
        sessionId: "session-1",
        toolCall,
        contextHash,
        approval: {
          approvalId: pending.approval.approvalId,
          state: "rejected",
        },
      }),
    ).resolves.toMatchObject({ type: "allow", category });
  });

  it("denies unknown tools/categories and policy-denied effects", async () => {
    const gate = createApprovalGate({
      now: () => NOW,
      projectPolicy: { default: "deny" },
    });
    await expect(
      gate.evaluate({
        projectId: "project-1",
        sessionId: "session-1",
        toolCall: call("mysteryTool"),
        contextHash,
      }),
    ).resolves.toMatchObject({ type: "deny", code: "UNKNOWN_TOOL" });

    const denied = createApprovalGate({
      now: () => NOW,
      projectPolicy: { categories: { command: "deny" } },
    });
    await expect(
      denied.evaluate({
        projectId: "project-1",
        sessionId: "session-1",
        toolCall: call("runCommand", { command: "rm -rf output" }),
        contextHash,
      }),
    ).resolves.toMatchObject({ type: "deny", code: "POLICY_DENIED" });
  });

  it.each([
    ["pending", {}, "pending"],
    ["rejected", {}, "deny"],
    ["approved", { expiresAt: "2026-07-16T11:59:59.000Z" }, "deny"],
    ["approved", { projectId: "other-project" }, "deny"],
    ["approved", { sessionId: "other-session" }, "deny"],
    ["approved", { tool: "writeFile" }, "deny"],
    ["approved", { argumentsHash: "wrong" }, "deny"],
    ["approved", { contextHash: "wrong" }, "deny"],
  ])("handles %s and mismatched approval scope", async (state, overrides, type) => {
    const { approvals, gate } = createGateHarness({
      categories: { command: "approval" },
    });
    const toolCall = call("runCommand", { command: "pnpm test" });
    const approval = {
      ...gate.createRequest({
        projectId: "project-1",
        sessionId: "session-1",
        toolCall,
        contextHash,
      }),
      state,
      resolvedBy: "user-1",
      ...overrides,
    };
    approvals.set(approval.approvalId, approval);
    await expect(
      gate.evaluate({
        projectId: "project-1",
        sessionId: "session-1",
        toolCall,
        contextHash,
        approval: { approvalId: approval.approvalId },
      }),
    ).resolves.toMatchObject({ type });
  });
});

const createHarness = ({
  script = [{ type: "text", text: "done" }, { type: "completed" }],
  policy = { default: "allow" },
  providerOptions = {},
  customOutbound = outbound,
} = {}) => {
  const events: Array<{
    idempotencyKey: string;
    payload: Record<string, unknown>;
    sequence: number;
    type: string;
  }> = [];
  const durableApprovals = new Map<string, string>();
  const approvals = new Map<string, Record<string, unknown>>();
  const results = new Map<
    string,
    Promise<{ executed: boolean; result: unknown }>
  >();
  const appendEvent = vi.fn(async (_projectId, _sessionId, event) => {
    clyDevEventInputSchema.parse(event);
    const duplicate = events.find(
      (item) => item.idempotencyKey === event.idempotencyKey,
    );
    if (duplicate) return duplicate;
    if (event.type === "approval.requested") {
      if (durableApprovals.has(event.payload.approvalId)) {
        throw new Error("approval request already exists");
      }
      durableApprovals.set(event.payload.approvalId, "pending");
    }
    if (event.type === "approval.resolved") {
      if (durableApprovals.get(event.payload.approvalId) !== "pending") {
        throw new Error("approval must be pending before resolution");
      }
      durableApprovals.set(event.payload.approvalId, event.payload.state);
    }
    const recorded = { ...event, sequence: events.length + 1 };
    events.push(recorded);
    return recorded;
  });
  const executeTool = vi.fn(async (toolCall, metadata) => ({
    tool: toolCall.tool,
    key: metadata.idempotencyKey,
    ok: true,
  }));
  const provider = createDeterministicMockProvider(script, providerOptions);
  const gate = createApprovalGate({
    now: () => NOW,
    projectPolicy: policy,
    approvalTtlMs: 3_600_000,
    loadApproval: async (approvalId) => approvals.get(approvalId),
  });
  const durableToolEffects = {
    executeOnce: vi.fn(async ({ key, execute }) => {
      const existing = results.get(key);
      if (existing) {
        const outcome = await existing;
        return { ...outcome, executed: false };
      }
      const pending = Promise.resolve()
        .then(execute)
        .then((result) => ({ executed: true, result }));
      results.set(key, pending);
      return pending;
    }),
  };
  const runtime = createClyDevExecutionRuntime({
    provider,
    appendEvent,
    buildOutboundContext: async () => customOutbound,
    approvalGate: gate,
    executeTool,
    durableToolEffects,
    now: () => NOW,
  });
  const request = {
    schemaVersion: 1,
    payloadVersion: 1,
    projectId: "project-1",
    sessionId: "session-1",
    requestId: "request-1",
    prompt: "Implement it",
    model: "mock-model",
  };
  return {
    appendEvent,
    approvals,
    events,
    executeTool,
    gate,
    provider,
    request,
    results,
    runtime,
    durableToolEffects,
  };
};

describe("Cly Dev durable execution runtime", () => {
  it("records request and byte-identical context before provider egress, then every stream event in order", async () => {
    let eventsAtProviderStart = 0;
    const harness = createHarness({
      script: () => {
        eventsAtProviderStart = harness.events.length;
        return [
          { type: "text", text: "answer" },
          { type: "reasoning", text: "because" },
          {
            type: "usage",
            inputTokens: 4,
            outputTokens: 2,
            costMinor: 3,
            currency: "USD",
          },
          { type: "completed" },
        ];
      },
    });

    await expect(
      harness.runtime.execute(harness.request),
    ).resolves.toMatchObject({ status: "completed" });
    expect(eventsAtProviderStart).toBe(2);
    expect(harness.events.map((event) => event.type)).toEqual([
      "message.recorded",
      "context.manifest.recorded",
      "message.recorded",
      "decision.recorded",
      "cost.recorded",
      "session.state.changed",
    ]);
    expect(harness.events[1].payload.manifestId).toBe("manifest-1");
  });

  it("rebuilds canonical context instead of trusting source bytes or digests", async () => {
    let providerRequest: Record<string, unknown> | undefined;
    const harness = createHarness({
      script: (received) => {
        providerRequest = received;
        return [{ type: "completed" }];
      },
      customOutbound: {
        ...outbound,
        previewBytes: "tampered-preview",
        egressBytes: "tampered-egress",
        previewSha256: "0".repeat(64),
        egressSha256: "f".repeat(64),
      },
    });
    await expect(
      harness.runtime.execute(harness.request),
    ).resolves.toMatchObject({ status: "completed" });
    expect(providerRequest).toMatchObject({
      context: context,
      contextBytes,
      contextHash,
    });
  });

  it("requests approval, executes only after exact approval, and saves a stable result", async () => {
    const toolCall = call("writeFile", {
      path: "src/index.ts",
      content: "next",
    });
    const script = [{ type: "tool_call", ...toolCall }, { type: "completed" }];
    const pending = createHarness({
      script,
      policy: { categories: { file_write: "approval" } },
    });
    const first = await pending.runtime.execute(pending.request);
    expect(first).toMatchObject({ status: "awaiting_approval" });
    expect(pending.executeTool).not.toHaveBeenCalled();
    expect(
      pending.events.some((event) => event.type === "approval.requested"),
    ).toBe(true);

    pending.approvals.set(first.approval.approvalId, {
      ...first.approval,
      state: "approved",
      resolvedBy: "user-1",
    });
    const resumed = await pending.runtime.resume({
      ...pending.request,
      approvals: {
        [toolCall.toolCallId]: {
          approvalId: first.approval.approvalId,
          state: "rejected",
        },
      },
    });
    expect(resumed).toMatchObject({ status: "completed" });
    expect(pending.executeTool).toHaveBeenCalledTimes(1);
    expect([...pending.results.keys()]).toEqual([
      "cly-dev:project-1:session-1:request-1:tool:call-writeFile",
    ]);
  });

  it("does not duplicate an already completed tool effect during retry/resume", async () => {
    const toolCall = {
      type: "tool_call",
      ...call("runCommand", { command: "pnpm test" }),
    };
    const harness = createHarness({
      script: [toolCall, { type: "completed" }],
    });
    await harness.runtime.execute(harness.request);
    await harness.runtime.retry(harness.request);
    await harness.runtime.resume(harness.request);
    expect(harness.executeTool).toHaveBeenCalledTimes(1);
    expect(
      harness.events.filter((event) => event.type === "tool.recorded"),
    ).toHaveLength(2);
  });

  it("records partial tool failure and stops the provider run", async () => {
    const harness = createHarness({
      script: [
        { type: "tool_call", ...call("runCommand", { command: "false" }) },
        { type: "completed" },
      ],
    });
    harness.executeTool.mockRejectedValueOnce(new Error("command failed"));
    await expect(
      harness.runtime.execute(harness.request),
    ).resolves.toMatchObject({ status: "failed" });
    expect(harness.events.map((event) => event.type)).toContain(
      "failure.recorded",
    );
    expect(
      harness.events.find(
        (event) =>
          event.type === "tool.recorded" && event.payload.status === "failed",
      ),
    ).toBeTruthy();
  });

  it.each([
    [{ authentication: { status: "unavailable" } }, "PROVIDER_UNAVAILABLE"],
    [{ authentication: { status: "expired" } }, "AUTHENTICATION_EXPIRED"],
  ])("records provider authentication preflight failures", async (providerOptions, code) => {
    const harness = createHarness({ providerOptions });
    await expect(
      harness.runtime.execute(harness.request),
    ).resolves.toMatchObject({
      status: "failed",
      error: { code },
    });
    expect(
      harness.events.some((event) => event.type === "failure.recorded"),
    ).toBe(true);
  });

  it.each([
    [Object.assign(new Error("rate limit"), { status: 429 }), "RATE_LIMITED"],
    [
      Object.assign(new Error("budget exhausted"), {
        code: "BUDGET_EXHAUSTED",
      }),
      "BUDGET_EXHAUSTED",
    ],
  ])("durably normalizes provider errors", async (error, code) => {
    const harness = createHarness({
      script: async () => {
        throw error;
      },
    });
    await expect(
      harness.runtime.execute(harness.request),
    ).resolves.toMatchObject({
      status: "failed",
      error: { code },
    });
  });

  it("cancels a live run durably", async () => {
    const harness = createHarness({
      script: [{ type: "wait_until_canceled" }, { type: "completed" }],
    });
    const running = harness.runtime.execute(harness.request);
    await vi.waitFor(() => expect(harness.events).toHaveLength(2));
    await harness.runtime.cancel({
      projectId: harness.request.projectId,
      sessionId: harness.request.sessionId,
      requestId: harness.request.requestId,
    });
    await expect(running).resolves.toMatchObject({ status: "canceled" });
    expect(harness.events.at(-1)).toMatchObject({
      type: "session.state.changed",
      payload: { state: "canceled" },
    });
  });

  it("rejects declared effectful tools before starting a provider that cannot intercept effects", async () => {
    let started = false;
    const harness = createHarness({
      providerOptions: { capabilities: { interceptBeforeEffect: false } },
      script: () => {
        started = true;
        return [{ type: "completed" }];
      },
    });
    await expect(
      harness.runtime.execute({
        ...harness.request,
        tools: [{ name: "writeFile" }],
      }),
    ).resolves.toMatchObject({
      status: "failed",
      error: { code: "UNSAFE_PROVIDER_CAPABILITY" },
    });
    expect(started).toBe(false);
  });
});
