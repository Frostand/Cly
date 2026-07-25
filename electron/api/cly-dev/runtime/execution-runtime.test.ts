// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { clyDevInternalEventInputSchema } from "../session-schema.js";
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

const withTools = (request, ...names: string[]) => ({
  ...request,
  tools: names.map((name) => ({ name })),
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
  requestApproval,
  beforeAppend,
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
    await beforeAppend?.(event);
    clyDevInternalEventInputSchema.parse(event);
    const duplicate = events.find(
      (item) => item.idempotencyKey === event.idempotencyKey,
    );
    if (duplicate) return duplicate;
    if (event.type === "approval.requested") {
      if (durableApprovals.has(event.payload.approvalId)) {
        throw new Error("approval request already exists");
      }
      durableApprovals.set(event.payload.approvalId, "pending");
      approvals.set(event.payload.approvalId, {
        ...JSON.parse(event.payload.detail),
        approvalId: event.payload.approvalId,
        state: "pending",
      });
    }
    if (event.type === "approval.resolved") {
      if (durableApprovals.get(event.payload.approvalId) !== "pending") {
        throw new Error("approval must be pending before resolution");
      }
      durableApprovals.set(event.payload.approvalId, event.payload.state);
      approvals.set(event.payload.approvalId, {
        ...approvals.get(event.payload.approvalId),
        state: event.payload.state,
        resolvedBy: event.payload.resolvedBy,
      });
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
    requestApproval,
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
    expect(eventsAtProviderStart).toBe(3);
    expect(harness.events.map((event) => event.type)).toEqual([
      "session.state.changed",
      "message.recorded",
      "context.manifest.recorded",
      "message.recorded",
      "decision.recorded",
      "cost.recorded",
      "session.state.changed",
    ]);
    expect(harness.events[0]).toMatchObject({
      payload: { state: "running" },
    });
    expect(harness.events[2].payload.manifestId).toBe("manifest-1");
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
    const declaredRequest = withTools(pending.request, "writeFile");
    const first = await pending.runtime.execute(declaredRequest);
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
      ...declaredRequest,
      approvals: {
        [toolCall.toolCallId]: {
          approvalId: first.approval.approvalId,
          state: "rejected",
        },
      },
    });
    expect(resumed).toMatchObject({ status: "completed" });
    expect(
      pending.events.filter(
        (event) =>
          event.type === "session.state.changed" &&
          event.payload.state === "running",
      ),
    ).toHaveLength(2);
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
    const declaredRequest = withTools(harness.request, "runCommand");
    await harness.runtime.execute(declaredRequest);
    await harness.runtime.retry(declaredRequest);
    await harness.runtime.resume(declaredRequest);
    expect(harness.executeTool).toHaveBeenCalledTimes(1);
    expect(
      harness.events.filter((event) => event.type === "tool.recorded"),
    ).toHaveLength(2);
  });

  it("executes MCP callbacks inside the runtime boundary and audits provider results without replay", async () => {
    let runtimeResult: unknown;
    const harness = createHarness({
      script: async (_request, { executeToolCall }) => {
        runtimeResult = await executeToolCall(
          call("writeFile", { filePath: "result.txt", content: "done" }),
        );
        return [
          {
            type: "tool_result",
            toolCallId: "provider-json-rpc-audit",
            result: runtimeResult,
          },
          { type: "completed" },
        ];
      },
    });

    await expect(
      harness.runtime.execute(withTools(harness.request, "writeFile")),
    ).resolves.toEqual({
      status: "completed",
    });
    expect(runtimeResult).toMatchObject({ ok: true, tool: "writeFile" });
    expect(harness.executeTool).toHaveBeenCalledOnce();
    expect(harness.durableToolEffects.executeOnce).toHaveBeenCalledOnce();
    expect(
      harness.events.filter(
        (event) =>
          event.type === "tool.recorded" &&
          event.payload.status === "completed",
      ),
    ).toHaveLength(1);
  });

  it("records actual provider command output as durable process and test events", async () => {
    const harness = createHarness({
      script: async (_request, { executeToolCall }) => {
        await executeToolCall(
          call("runCommand", { command: "pnpm test:unit" }),
        );
        return [{ type: "completed" }];
      },
    });
    harness.executeTool.mockResolvedValueOnce({
      command: "pnpm test:unit",
      cwd: "/tmp/cly-project",
      exitCode: 0,
      signal: null,
      stdout: "Tests 2 passed",
      stderr: "",
    });

    await expect(
      harness.runtime.execute(withTools(harness.request, "runCommand")),
    ).resolves.toEqual({ status: "completed" });

    expect(
      harness.events.find((event) => event.type === "process.recorded"),
    ).toMatchObject({
      payload: {
        requestId: "call-runCommand",
        command: "pnpm test:unit",
        cwd: "/tmp/cly-project",
        status: "completed",
        stdout: "Tests 2 passed",
        stderr: "",
        exitCode: 0,
      },
    });
    expect(
      harness.events.find((event) => event.type === "test.recorded"),
    ).toMatchObject({
      payload: { commandId: "call-runCommand", passed: 2, failed: 0 },
    });
  });

  it("suspends an MCP effect on the approval broker and revalidates before execution", async () => {
    const requestApproval = vi.fn(({ approval }) => ({
      approved: true,
      id: approval.approvalId,
      resolvedBy: "user-1",
      scope: "once",
    }));
    const harness = createHarness({
      policy: { categories: { file_write: "approval" } },
      requestApproval,
      script: async (_request, { executeToolCall }) => {
        await executeToolCall(
          call("writeFile", { filePath: "approved.txt", content: "yes" }),
        );
        return [{ type: "completed" }];
      },
    });

    await expect(
      harness.runtime.execute(withTools(harness.request, "writeFile")),
    ).resolves.toEqual({
      status: "completed",
    });
    expect(requestApproval).toHaveBeenCalledOnce();
    expect(harness.executeTool).toHaveBeenCalledOnce();
    expect(harness.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["approval.requested", "approval.resolved"]),
    );
  });

  it.each([
    ["rejection", "User rejected the effect"],
    ["timeout", "Permission request expired"],
    ["cancellation", "Permission request was cancelled"],
  ])("fails closed on MCP approval %s", async (_label, reason) => {
    const harness = createHarness({
      policy: { categories: { command: "approval" } },
      requestApproval: ({ approval }) => ({
        approved: false,
        id: approval.approvalId,
        reason,
        scope: "once",
      }),
      script: async (_request, { executeToolCall }) => {
        await executeToolCall(call("runCommand", { command: "touch bypass" }));
        return [{ type: "completed" }];
      },
    });

    await expect(
      harness.runtime.execute(withTools(harness.request, "runCommand")),
    ).resolves.toMatchObject({ status: "failed" });
    expect(harness.executeTool).not.toHaveBeenCalled();
    expect(
      harness.events.filter((event) => event.type === "failure.recorded"),
    ).toHaveLength(1);
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
      harness.runtime.execute(withTools(harness.request, "runCommand")),
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

  it("fails closed when a provider invokes a tool outside the request declaration", async () => {
    const harness = createHarness({
      script: async (_request, { executeToolCall }) => {
        await executeToolCall(
          call("writeFile", { filePath: "undeclared.txt", content: "no" }),
        );
        return [{ type: "completed" }];
      },
    });

    await expect(
      harness.runtime.execute(withTools(harness.request, "readFile")),
    ).resolves.toMatchObject({
      status: "failed",
      error: { code: "TOOL_NOT_DECLARED" },
    });
    expect(harness.executeTool).not.toHaveBeenCalled();
    expect(harness.durableToolEffects.executeOnce).not.toHaveBeenCalled();
  });

  it("fails closed when a streamed tool call is outside the request declaration", async () => {
    const providerCancel = vi.fn();
    const harness = createHarness({
      providerOptions: { onCancel: providerCancel },
      script: [
        {
          type: "tool_call",
          ...call("writeFile", {
            filePath: "stream-undeclared.txt",
            content: "no",
          }),
        },
        { type: "completed" },
      ],
    });

    await expect(
      harness.runtime.execute(withTools(harness.request, "readFile")),
    ).resolves.toMatchObject({
      status: "failed",
      error: { code: "TOOL_NOT_DECLARED" },
    });
    expect(providerCancel).toHaveBeenCalledOnce();
    expect(harness.executeTool).not.toHaveBeenCalled();
    expect(harness.durableToolEffects.executeOnce).not.toHaveBeenCalled();
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
    "mock model",
    "mock\0model",
    "mock@model",
  ])("rejects malformed requested provider model identifier %j before discovery", async (model) => {
    const harness = createHarness();

    await expect(
      harness.runtime.execute({
        ...harness.request,
        model,
      }),
    ).resolves.toMatchObject({
      status: "failed",
      error: { code: "UNSUPPORTED_PROVIDER_MODEL" },
    });
    expect(harness.events.map((event) => event.type)).toEqual([
      "failure.recorded",
      "session.state.changed",
    ]);
  });

  it("rejects a discovered model catalog containing a malformed identifier", async () => {
    const harness = createHarness({
      providerOptions: {
        models: [{ id: "mock-model" }, { id: "malformed model" }],
      },
    });

    await expect(
      harness.runtime.execute(harness.request),
    ).resolves.toMatchObject({
      status: "failed",
      error: { code: "INVALID_PROVIDER_MODELS" },
    });
  });

  it("passes a dynamically advertised reasoning effort to the provider", async () => {
    let providerRequest: Record<string, unknown> | undefined;
    const harness = createHarness({
      providerOptions: {
        models: [{ id: "mock-model", reasoningEfforts: ["ultra"] }],
      },
      script: (request) => {
        providerRequest = request;
        return [{ type: "completed" }];
      },
    });

    await expect(
      harness.runtime.execute({
        ...harness.request,
        reasoningEffort: "ultra",
      }),
    ).resolves.toMatchObject({ status: "completed" });
    expect(providerRequest).toMatchObject({ reasoningEffort: "ultra" });
  });

  it("rejects a reasoning effort the live model did not advertise", async () => {
    const harness = createHarness({
      providerOptions: {
        models: [{ id: "mock-model", reasoningEfforts: ["medium", "high"] }],
      },
    });

    await expect(
      harness.runtime.execute({
        ...harness.request,
        reasoningEffort: "ultra",
      }),
    ).resolves.toMatchObject({
      status: "failed",
      error: { code: "UNSUPPORTED_REASONING_EFFORT" },
    });
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
    await vi.waitFor(() =>
      expect(harness.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "session.state.changed",
            payload: { state: "running" },
          }),
        ]),
      ),
    );
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

  it("records running for a handoff-style resume before provider egress", async () => {
    let eventsAtProviderStart = [];
    const harness = createHarness({
      script: () => {
        eventsAtProviderStart = harness.events.map((event) => event.type);
        return [{ type: "completed" }];
      },
    });

    await expect(
      harness.runtime.resume({
        ...harness.request,
        requestId: "handoff-resume-1",
        handoffId: "handoff-1",
      }),
    ).resolves.toMatchObject({ status: "completed" });
    expect(eventsAtProviderStart[0]).toBe("session.state.changed");
    expect(harness.events[0]).toMatchObject({
      idempotencyKey:
        "cly-dev:project-1:session-1:handoff-resume-1:resume:running",
      payload: { state: "running" },
    });
  });

  it("accumulates provider usage deltas before enforcing token budgets", async () => {
    const cancel = vi.fn();
    const harness = createHarness({
      providerOptions: { onCancel: cancel },
      script: [
        { type: "usage", inputTokens: 6, outputTokens: 1 },
        { type: "usage", inputTokens: 6, outputTokens: 1 },
        { type: "completed" },
      ],
    });
    await expect(
      harness.runtime.execute({
        ...harness.request,
        budget: { maxInputTokens: 10 },
      }),
    ).resolves.toMatchObject({
      status: "failed",
      error: { code: "BUDGET_EXHAUSTED" },
    });
    expect(
      harness.events.filter((event) => event.type === "cost.recorded"),
    ).toHaveLength(2);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("keeps usage and durable provider events collision-free across approval resume", async () => {
    const toolCall = call("writeFile", {
      filePath: "resume.txt",
      content: "approved",
    });
    let attempt = 0;
    const harness = createHarness({
      policy: { categories: { file_write: "approval" } },
      script: () => {
        attempt += 1;
        return attempt === 1
          ? [
              { type: "usage", inputTokens: 6, outputTokens: 1 },
              { type: "tool_call", ...toolCall },
            ]
          : [
              { type: "usage", inputTokens: 6, outputTokens: 1 },
              { type: "completed" },
            ];
      },
    });

    const first = await harness.runtime.execute({
      ...withTools(harness.request, "writeFile"),
      budget: { maxInputTokens: 10 },
    });
    expect(first).toMatchObject({ status: "awaiting_approval" });
    harness.approvals.set(first.approval.approvalId, {
      ...first.approval,
      state: "approved",
      resolvedBy: "user-1",
    });

    await expect(
      harness.runtime.resume({
        ...withTools(harness.request, "writeFile"),
        budget: { maxInputTokens: 10 },
        approvals: {
          [toolCall.toolCallId]: {
            approvalId: first.approval.approvalId,
          },
        },
      }),
    ).resolves.toMatchObject({
      status: "failed",
      error: { code: "BUDGET_EXHAUSTED" },
    });
    const usageEvents = harness.events.filter(
      (event) => event.type === "cost.recorded",
    );
    expect(usageEvents).toHaveLength(2);
    expect(new Set(usageEvents.map((event) => event.idempotencyKey)).size).toBe(
      2,
    );
  });

  it("waits for the durable running transition before provider cancellation", async () => {
    let releaseRunning: (() => void) | undefined;
    const runningBarrier = new Promise<void>((resolve) => {
      releaseRunning = resolve;
    });
    const providerCancel = vi.fn();
    const harness = createHarness({
      beforeAppend: (event) =>
        event.type === "session.state.changed" &&
        event.payload.state === "running"
          ? runningBarrier
          : undefined,
      providerOptions: { onCancel: providerCancel },
      script: [{ type: "wait_until_canceled" }, { type: "completed" }],
    });

    const execution = harness.runtime.execute(harness.request);
    await vi.waitFor(() => expect(harness.appendEvent).toHaveBeenCalledOnce());
    const cancellation = harness.runtime.cancel({
      projectId: harness.request.projectId,
      sessionId: harness.request.sessionId,
      requestId: harness.request.requestId,
    });
    await Promise.resolve();
    expect(providerCancel).not.toHaveBeenCalled();

    releaseRunning?.();
    await cancellation;
    await expect(execution).resolves.toMatchObject({ status: "canceled" });
    expect(providerCancel).toHaveBeenCalledOnce();
    const runningIndex = harness.events.findIndex(
      (event) =>
        event.type === "session.state.changed" &&
        event.payload.state === "running",
    );
    const canceledIndex = harness.events.findIndex(
      (event) =>
        event.type === "session.state.changed" &&
        event.payload.state === "canceled",
    );
    expect(runningIndex).toBeGreaterThanOrEqual(0);
    expect(canceledIndex).toBeGreaterThan(runningIndex);
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
