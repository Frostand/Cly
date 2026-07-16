// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createApprovalGate } from "./approval-gate.js";
import {
  createClyDevExecutionRuntime,
  deriveTransferableContextSummary,
} from "./execution-runtime.js";
import { createDeterministicMockProvider } from "./mock-provider.js";

const initialTime = "2026-07-16T12:00:00.000Z";
const laterTime = "2026-07-16T12:05:00.000Z";
const contextEnvelope = {
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

const outboundFor = (envelope = contextEnvelope) => {
  const bytes = JSON.stringify(envelope);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    preview: envelope,
    egress: envelope,
    previewBytes: bytes,
    egressBytes: bytes,
    previewSha256: sha256,
    egressSha256: sha256,
  };
};

const toolCall = {
  type: "tool_call",
  toolCallId: "call-1",
  tool: "writeFile",
  arguments: { path: "src/index.ts", content: "safe" },
};

const request = {
  schemaVersion: 1,
  payloadVersion: 1,
  projectId: "project-1",
  sessionId: "session-1",
  requestId: "request-1",
  prompt: "Implement it",
  model: "mock-model",
};

const createStrictAppender = () => {
  const events: Array<Record<string, unknown>> = [];
  const approvals = new Map<string, { state: string }>();
  const appendEvent = vi.fn(async (_projectId, _sessionId, event) => {
    const duplicate = events.find(
      (item) => item.idempotencyKey === event.idempotencyKey,
    );
    if (duplicate) return duplicate;
    if (event.type === "approval.requested") {
      if (approvals.has(event.payload.approvalId)) {
        throw new Error("duplicate approval request");
      }
      approvals.set(event.payload.approvalId, { state: "pending" });
    }
    if (event.type === "approval.resolved") {
      const stored = approvals.get(event.payload.approvalId);
      if (!stored || stored.state !== "pending") {
        throw new Error(
          "approval must be requested and pending before resolution",
        );
      }
      stored.state = event.payload.state;
    }
    const recorded = { ...event, sequence: events.length + 1 };
    events.push(recorded);
    return recorded;
  });
  return { appendEvent, approvals, events };
};

const createAtomicEffects = () => {
  const claims = new Map<
    string,
    Promise<{ executed: boolean; result: unknown }>
  >();
  return {
    executeOnce: vi.fn(async ({ key, execute }) => {
      const existing = claims.get(key);
      if (existing) {
        const outcome = await existing;
        return { ...outcome, executed: false };
      }
      const pending = Promise.resolve()
        .then(execute)
        .then((result) => ({ executed: true, result }));
      claims.set(key, pending);
      return pending;
    }),
  };
};

describe("reviewed Cly Dev security invariants", () => {
  it("derives provider context summaries only from fixed entry-kind counters", () => {
    const summary = deriveTransferableContextSummary([
      {
        kind: "repository_file",
        repositoryId: "private-repository-id",
        relativePath: "private/path.txt",
      },
      { kind: "research_object", researchObjectId: "private-research-id" },
      { kind: "commit", commitSha: "a".repeat(40) },
      { kind: "note", title: "private note title" },
      { kind: "note", title: "another private note title" },
    ]);
    expect(summary).toBe(
      "Cly Dev transferable context v1: entries=5; research_object=1; repository_file=1; commit=1; note=2.",
    );
    expect(summary).not.toContain("private");
    expect(summary).not.toContain("path.txt");
    expect(summary).not.toContain("aaaa");
  });

  it("loads approval state and immutable scope from an authoritative resolver", async () => {
    let now = initialTime;
    const stored = new Map<string, Record<string, unknown>>();
    const gate = createApprovalGate({
      now: () => now,
      projectPolicy: { categories: { file_write: "approval" } },
      loadApproval: async (approvalId) => stored.get(approvalId),
    });
    const pending = await gate.evaluate({
      projectId: request.projectId,
      sessionId: request.sessionId,
      toolCall,
      contextHash: "context-hash",
    });
    stored.set(pending.approval.approvalId, {
      ...pending.approval,
      state: "pending",
    });

    const forged = await gate.evaluate({
      projectId: request.projectId,
      sessionId: request.sessionId,
      toolCall,
      contextHash: "context-hash",
      approval: { ...pending.approval, state: "approved" },
    });
    expect(forged).toMatchObject({ type: "pending" });

    stored.set(pending.approval.approvalId, {
      ...pending.approval,
      state: "approved",
      resolvedBy: "user-1",
    });
    now = laterTime;
    const approved = await gate.evaluate({
      projectId: request.projectId,
      sessionId: request.sessionId,
      toolCall,
      contextHash: "context-hash",
      approval: { approvalId: pending.approval.approvalId, state: "rejected" },
    });
    expect(approved).toMatchObject({
      type: "allow",
      approval: { approvalId: pending.approval.approvalId },
    });
  });

  it("reuses the original pending approval id across time and appends only its resolution", async () => {
    let now = initialTime;
    const decisions = new Map<string, Record<string, unknown>>();
    const strict = createStrictAppender();
    const gate = createApprovalGate({
      now: () => now,
      projectPolicy: { categories: { file_write: "approval" } },
      loadApproval: async (approvalId) => decisions.get(approvalId),
      approvalTtlMs: 3_600_000,
    });
    const effects = createAtomicEffects();
    const executeTool = vi.fn(async () => ({ ok: true }));
    const runtime = createClyDevExecutionRuntime({
      provider: createDeterministicMockProvider([
        toolCall,
        { type: "completed" },
      ]),
      appendEvent: strict.appendEvent,
      buildOutboundContext: async () => outboundFor(),
      approvalGate: gate,
      executeTool,
      durableToolEffects: effects,
      now: () => now,
    });

    const first = await runtime.execute(request);
    expect(first).toMatchObject({ status: "awaiting_approval" });
    decisions.set(first.approval.approvalId, {
      ...first.approval,
      state: "approved",
      resolvedBy: "user-1",
    });
    now = laterTime;
    await expect(
      runtime.resume({
        ...request,
        approvals: { "call-1": { approvalId: first.approval.approvalId } },
      }),
    ).resolves.toMatchObject({ status: "completed" });
    expect(
      strict.events.filter((event) => event.type === "approval.requested"),
    ).toHaveLength(1);
    expect(
      strict.events.filter((event) => event.type === "approval.resolved"),
    ).toHaveLength(1);
    expect(
      strict.events.find((event) => event.type === "approval.resolved"),
    ).toMatchObject({
      payload: { approvalId: first.approval.approvalId, state: "approved" },
    });
  });

  it("fails closed without atomic durable effects and prevents concurrent duplicate execution", async () => {
    const makeRuntime = (durableToolEffects) => {
      const strict = createStrictAppender();
      const executeTool = vi.fn(async () => {
        await Promise.resolve();
        return { ok: true };
      });
      return {
        executeTool,
        runtime: createClyDevExecutionRuntime({
          provider: createDeterministicMockProvider([
            toolCall,
            { type: "completed" },
          ]),
          appendEvent: strict.appendEvent,
          buildOutboundContext: async () => outboundFor(),
          approvalGate: createApprovalGate({
            projectPolicy: { categories: { file_write: "allow" } },
          }),
          executeTool,
          durableToolEffects,
          now: () => initialTime,
        }),
      };
    };

    const missing = makeRuntime(undefined);
    await expect(missing.runtime.execute(request)).resolves.toMatchObject({
      status: "failed",
      error: { code: "DURABLE_EFFECT_STORE_REQUIRED" },
    });
    expect(missing.executeTool).not.toHaveBeenCalled();

    const atomic = makeRuntime(createAtomicEffects());
    await Promise.all([
      atomic.runtime.execute(request),
      atomic.runtime.execute(request),
    ]);
    expect(atomic.executeTool).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["secret field", { manifest: { secret: "sk-private" } }],
    ["absolute path", { manifest: { summary: "/Users/alice/private.txt" } }],
    [
      "embedded Unix absolute path",
      { manifest: { summary: "Failure at /Users/alice/private.txt" } },
    ],
    [
      "embedded Windows absolute path",
      {
        manifest: {
          summary: String.raw`Failure at C:\Users\alice\private.txt`,
        },
      },
    ],
    [
      "credential prose",
      { manifest: { summary: "credential is sk-private-value" } },
    ],
    [
      "authorization material",
      { manifest: { summary: "Authorization: Basic dXNlcjpwYXNz" } },
    ],
    [
      "known provider token",
      {
        manifest: { summary: "Observed token ghp_1234567890abcdefghijklmnop" },
      },
    ],
    [
      "private key material",
      { manifest: { summary: "-----BEGIN OPENSSH PRIVATE KEY-----" } },
    ],
    [
      "file URL in supplied summary",
      { manifest: { summary: "Failure at file:///Users/alice/private.txt" } },
    ],
    [
      "punctuation-adjacent path in supplied summary",
      { manifest: { summary: "Failure;/Users/alice/private.txt" } },
    ],
    [
      "GitLab token in supplied summary",
      { manifest: { summary: "Observed glpat-1234567890abcdef" } },
    ],
    [
      "Hugging Face token in supplied summary",
      { manifest: { summary: "Observed hf_1234567890abcdef" } },
    ],
    [
      "OAuth token in supplied summary",
      { manifest: { summary: "Observed ya29.a0AfH6SMBprivate" } },
    ],
    [
      "benign arbitrary supplied summary",
      { manifest: { summary: "A user-controlled sentence" } },
    ],
    ["environment value", { manifest: { environmentValue: "private" } }],
    ["process cache", { process: { cache: "private" } }],
    [
      "raw provider config",
      { provenance: { provider: { apiKey: "private" } } },
    ],
  ])("rejects transferable context containing %s", async (_label, additions) => {
    const envelope = structuredClone(contextEnvelope);
    if (additions.manifest)
      Object.assign(envelope.manifest, additions.manifest);
    if (additions.provenance) {
      Object.assign(
        envelope.provenance.provider,
        additions.provenance.provider,
      );
    }
    if (additions.process) Object.assign(envelope, additions);
    const strict = createStrictAppender();
    const runtime = createClyDevExecutionRuntime({
      provider: createDeterministicMockProvider([{ type: "completed" }]),
      appendEvent: strict.appendEvent,
      buildOutboundContext: async () => outboundFor(envelope),
      approvalGate: createApprovalGate({ projectPolicy: { default: "deny" } }),
      executeTool: vi.fn(),
      durableToolEffects: createAtomicEffects(),
      now: () => initialTime,
    });
    await expect(runtime.execute(request)).resolves.toMatchObject({
      status: "failed",
      error: { code: "INVALID_OUTBOUND_CONTEXT" },
    });
    expect(
      strict.events.some((event) => event.type === "context.manifest.recorded"),
    ).toBe(false);
  });

  it("fails closed on missing capabilities, unknown model, and unsupported versions", async () => {
    const run = async ({ provider, requestOverride = {} }) => {
      const strict = createStrictAppender();
      const runtime = createClyDevExecutionRuntime({
        provider,
        appendEvent: strict.appendEvent,
        buildOutboundContext: async () => outboundFor(),
        approvalGate: createApprovalGate({
          projectPolicy: { default: "deny" },
        }),
        executeTool: vi.fn(),
        durableToolEffects: createAtomicEffects(),
        now: () => initialTime,
      });
      return runtime.execute({ ...request, ...requestOverride });
    };
    const missingCapabilities = createDeterministicMockProvider(
      [{ type: "completed" }],
      { capabilities: null },
    );
    await expect(run({ provider: missingCapabilities })).resolves.toMatchObject(
      {
        status: "failed",
        error: { code: "INVALID_PROVIDER_CAPABILITIES" },
      },
    );
    await expect(
      run({
        provider: createDeterministicMockProvider([{ type: "completed" }]),
        requestOverride: { model: "unknown-model" },
      }),
    ).resolves.toMatchObject({
      status: "failed",
      error: { code: "UNSUPPORTED_PROVIDER_MODEL" },
    });
    await expect(
      run({
        provider: createDeterministicMockProvider([{ type: "completed" }]),
        requestOverride: { payloadVersion: 99 },
      }),
    ).resolves.toMatchObject({
      status: "failed",
      error: { code: "UNSUPPORTED_REQUEST_VERSION" },
    });
    await expect(
      run({
        provider: createDeterministicMockProvider([{ type: "completed" }], {
          capabilities: { toolCalls: false },
        }),
        requestOverride: { tools: [{ name: "readFile" }], mode: "read_only" },
      }),
    ).resolves.toMatchObject({
      status: "failed",
      error: { code: "UNSUPPORTED_PROVIDER_CAPABILITY" },
    });
  });

  it("denies missing policy and ignores request-supplied policy overrides", async () => {
    const missingPolicy = createApprovalGate();
    await expect(
      missingPolicy.evaluate({
        projectId: request.projectId,
        sessionId: request.sessionId,
        toolCall,
        contextHash: "context-hash",
      }),
    ).resolves.toMatchObject({ type: "deny", code: "POLICY_MISSING" });

    const strict = createStrictAppender();
    const executeTool = vi.fn();
    const runtime = createClyDevExecutionRuntime({
      provider: createDeterministicMockProvider([
        toolCall,
        { type: "completed" },
      ]),
      appendEvent: strict.appendEvent,
      buildOutboundContext: async () => outboundFor(),
      approvalGate: createApprovalGate({
        projectPolicy: { categories: { file_write: "deny" } },
      }),
      executeTool,
      durableToolEffects: createAtomicEffects(),
      now: () => initialTime,
    });
    await expect(
      runtime.execute({
        ...request,
        projectPolicy: { categories: { file_write: "allow" } },
      }),
    ).resolves.toMatchObject({
      status: "failed",
      error: { code: "POLICY_DENIED" },
    });
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("requires project/session/request scope for cancellation", async () => {
    const strict = createStrictAppender();
    const runtime = createClyDevExecutionRuntime({
      provider: createDeterministicMockProvider([
        { type: "wait_until_canceled" },
        { type: "completed" },
      ]),
      appendEvent: strict.appendEvent,
      buildOutboundContext: async () => outboundFor(),
      approvalGate: createApprovalGate({ projectPolicy: { default: "deny" } }),
      executeTool: vi.fn(),
      durableToolEffects: createAtomicEffects(),
      now: () => initialTime,
    });
    const running = runtime.execute(request);
    await vi.waitFor(() => expect(strict.events).toHaveLength(2));
    await expect(runtime.cancel("request-1")).rejects.toThrow(/scope/i);
    await runtime.cancel({
      projectId: request.projectId,
      sessionId: request.sessionId,
      requestId: request.requestId,
    });
    await expect(running).resolves.toMatchObject({ status: "canceled" });
  });

  it("isolates provider cancellation for identical request ids in different projects", async () => {
    const strict = createStrictAppender();
    const provider = createDeterministicMockProvider([
      { type: "wait_until_canceled" },
      { type: "completed" },
    ]);
    const runtime = createClyDevExecutionRuntime({
      provider,
      appendEvent: strict.appendEvent,
      buildOutboundContext: async () => outboundFor(),
      approvalGate: createApprovalGate({ projectPolicy: { default: "deny" } }),
      executeTool: vi.fn(),
      durableToolEffects: createAtomicEffects(),
      now: () => initialTime,
    });
    const firstRequest = { ...request, projectId: "project-1" };
    const secondRequest = { ...request, projectId: "project-2" };
    let secondSettled = false;
    const first = runtime.execute(firstRequest);
    const second = runtime.execute(secondRequest).then((result) => {
      secondSettled = true;
      return result;
    });
    await vi.waitFor(
      () =>
        expect(
          strict.events.filter(
            (event) => event.type === "context.manifest.recorded",
          ),
        ).toHaveLength(2),
      { timeout: 1_000 },
    );

    await runtime.cancel({
      projectId: firstRequest.projectId,
      sessionId: firstRequest.sessionId,
      requestId: firstRequest.requestId,
    });
    await expect(first).resolves.toMatchObject({ status: "canceled" });
    await new Promise((resolve) => setImmediate(resolve));
    expect(secondSettled).toBe(false);

    await runtime.cancel({
      projectId: secondRequest.projectId,
      sessionId: secondRequest.sessionId,
      requestId: secondRequest.requestId,
    });
    await expect(second).resolves.toMatchObject({ status: "canceled" });
  });

  it("removes mock-provider delay abort listeners after a settled wait", async () => {
    const controller = new AbortController();
    const add = vi.spyOn(AbortSignal.prototype, "addEventListener");
    const remove = vi.spyOn(AbortSignal.prototype, "removeEventListener");
    const provider = createDeterministicMockProvider([
      { type: "delay", ms: 0 },
      { type: "completed" },
    ]);
    for await (const _event of provider.stream(
      { requestId: "listener-cleanup" },
      { signal: controller.signal },
    )) {
      // Consume the deterministic stream.
    }
    expect(remove).toHaveBeenCalledTimes(add.mock.calls.length);
    add.mockRestore();
    remove.mockRestore();
  });
});
