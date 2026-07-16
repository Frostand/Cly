import { createHash } from "node:crypto";

const VERSION = 1;

class RuntimeError extends Error {
  constructor(code, message, retryable = false, cause) {
    super(message, { cause });
    this.name = "ClyDevRuntimeError";
    this.code = code;
    this.retryable = retryable;
  }
}

const localEvent = ({ key, type, payload, actor, now }) => ({
  schemaVersion: VERSION,
  payloadVersion: VERSION,
  idempotencyKey: key,
  type,
  transferability: "local-only",
  occurredAt: now(),
  actor,
  payload,
});

const bytesOf = (value) => {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return Buffer.from(String(value ?? ""));
};

const digest = (value) =>
  createHash("sha256").update(bytesOf(value)).digest("hex");

const normalizeOutbound = (outbound) => {
  const preview = outbound?.preview ?? outbound?.envelope;
  const egress = outbound?.egress ?? outbound?.envelope;
  const previewBytes =
    outbound?.previewBytes ?? outbound?.bytes ?? JSON.stringify(preview);
  const egressBytes =
    outbound?.egressBytes ?? outbound?.bytes ?? JSON.stringify(egress);
  const previewSha256 =
    outbound?.previewSha256 ?? outbound?.sha256 ?? digest(previewBytes);
  const egressSha256 =
    outbound?.egressSha256 ?? outbound?.sha256 ?? digest(egressBytes);
  return {
    preview,
    egress,
    previewBytes,
    egressBytes,
    previewSha256,
    egressSha256,
  };
};

const assertExactOutbound = (outbound) => {
  const normalized = normalizeOutbound(outbound);
  const equalBytes = bytesOf(normalized.previewBytes).equals(
    bytesOf(normalized.egressBytes),
  );
  const equalObjects =
    JSON.stringify(normalized.preview) === JSON.stringify(normalized.egress);
  const validHashes =
    normalized.previewSha256 === normalized.egressSha256 &&
    normalized.previewSha256 === digest(normalized.previewBytes) &&
    normalized.egressSha256 === digest(normalized.egressBytes);
  if (!equalBytes || !equalObjects || !validHashes) {
    throw new RuntimeError(
      "CONTEXT_EGRESS_MISMATCH",
      "The context preview is not byte-for-byte identical to provider egress.",
    );
  }
  if (!normalized.egress?.manifest?.id) {
    throw new RuntimeError(
      "INVALID_OUTBOUND_CONTEXT",
      "Outbound context must contain a durable manifest id.",
    );
  }
  return normalized;
};

const normalizedRuntimeError = (provider, error) => {
  if (error?.code && typeof error?.message === "string") {
    return {
      code: error.code,
      message: error.message,
      retryable: Boolean(error.retryable),
      ...(error.retryAfterMs === undefined
        ? {}
        : { retryAfterMs: error.retryAfterMs }),
    };
  }
  return provider.normalizeError(error);
};

const authFailure = (authentication) => {
  const status = authentication?.status;
  if (status === "authenticated") return null;
  if (status === "expired") {
    return new RuntimeError(
      "AUTHENTICATION_EXPIRED",
      "Provider authentication has expired.",
    );
  }
  if (status === "unavailable" || status === "absent") {
    return new RuntimeError(
      "PROVIDER_UNAVAILABLE",
      "The selected provider is unavailable.",
    );
  }
  return new RuntimeError(
    "AUTHENTICATION_REQUIRED",
    "The selected provider requires authentication.",
  );
};

const budgetFailure = (budget, usage) => {
  if (!budget) return null;
  const inputTokens = Number(usage.inputTokens ?? 0);
  const outputTokens = Number(usage.outputTokens ?? 0);
  const costMinor = Number(usage.costMinor ?? 0);
  const exhausted =
    (budget.maxInputTokens !== undefined &&
      inputTokens > budget.maxInputTokens) ||
    (budget.maxOutputTokens !== undefined &&
      outputTokens > budget.maxOutputTokens) ||
    (budget.maxTotalTokens !== undefined &&
      inputTokens + outputTokens > budget.maxTotalTokens) ||
    (budget.maxCostMinor !== undefined && costMinor > budget.maxCostMinor);
  return exhausted
    ? new RuntimeError(
        "BUDGET_EXHAUSTED",
        "Provider usage exceeded the request budget.",
      )
    : null;
};

const stableToolKey = ({ projectId, sessionId, requestId }, toolCallId) =>
  `cly-dev:${projectId}:${sessionId}:${requestId}:tool:${toolCallId}`;

const getApproval = (approvals, toolCallId) => {
  if (typeof approvals === "function") return approvals(toolCallId);
  if (Array.isArray(approvals)) {
    return approvals.find(
      (approval) =>
        approval.toolCallId === toolCallId ||
        approval.scope?.toolCallId === toolCallId,
    );
  }
  return approvals?.[toolCallId];
};

export function createClyDevExecutionRuntime(options = {}) {
  const repository = options.repository;
  const provider = options.provider;
  const appendEvent =
    options.appendEvent ?? repository?.appendEvent?.bind(repository);
  const buildOutboundContext =
    options.buildOutboundContext ??
    repository?.buildOutboundContext?.bind(repository) ??
    repository?.getOutboundContext?.bind(repository);
  const approvalGate = options.approvalGate;
  const executeTool = options.executeTool;
  const now = options.now ?? (() => new Date().toISOString());
  const getToolResult = options.getToolResult;
  const saveToolResult = options.saveToolResult;
  const inMemoryResults = new Map();
  const active = new Map();

  if (!provider) throw new Error("A Cly Dev provider adapter is required.");
  if (typeof appendEvent !== "function") {
    throw new Error("A durable Cly Dev event appender is required.");
  }
  if (typeof buildOutboundContext !== "function") {
    throw new Error("A Cly Dev outbound context builder is required.");
  }
  if (!approvalGate || typeof approvalGate.evaluate !== "function") {
    throw new Error("A Cly Dev approval gate is required.");
  }
  if (typeof executeTool !== "function") {
    throw new Error("An injected Cly Dev tool executor is required.");
  }

  const append = (request, event) =>
    appendEvent(request.projectId, request.sessionId, event);
  const key = (request, suffix) =>
    `cly-dev:${request.projectId}:${request.sessionId}:${request.requestId}:${suffix}`;
  const actor = (kind, id) => ({ kind, id });

  const appendFailure = async (request, error, suffix = "failure") => {
    await append(
      request,
      localEvent({
        key: key(request, suffix),
        type: "failure.recorded",
        payload: {
          code: error.code,
          message: error.message,
          retryable: Boolean(error.retryable),
        },
        actor: actor("system", "cly-dev-runtime"),
        now,
      }),
    );
    await append(
      request,
      localEvent({
        key: key(request, `${suffix}:state`),
        type: "session.state.changed",
        payload: { state: "failed" },
        actor: actor("system", "cly-dev-runtime"),
        now,
      }),
    );
    return { status: "failed", error };
  };

  const findPersistedToolResult = async (request, resultKey) => {
    if (getToolResult) {
      const result = await getToolResult(resultKey, request);
      if (result !== undefined) return result;
    }
    if (inMemoryResults.has(resultKey)) return inMemoryResults.get(resultKey);
    if (!repository?.listEvents) return undefined;
    let afterSequence = 0;
    for (;;) {
      const events = await repository.listEvents(
        request.projectId,
        request.sessionId,
        afterSequence,
        500,
      );
      for (const event of events) {
        if (event.type !== "message.recorded") continue;
        try {
          const body = JSON.parse(event.payload.body);
          if (body.kind === "tool_result" && body.key === resultKey) {
            return body.result;
          }
        } catch {
          // Non-runtime message bodies are intentionally ignored.
        }
      }
      if (events.length < 500) break;
      afterSequence = events.at(-1).sequence;
    }
    return undefined;
  };

  const persistToolResult = async (request, resultKey, result) => {
    await saveToolResult?.(resultKey, result, request);
    inMemoryResults.set(resultKey, result);
    await append(
      request,
      localEvent({
        key: `${resultKey}:result`,
        type: "message.recorded",
        payload: {
          role: "system",
          body: JSON.stringify({ kind: "tool_result", key: resultKey, result }),
        },
        actor: actor("tool", "cly-dev-tool-runtime"),
        now,
      }),
    );
  };

  const settleCanceled = async (request) => {
    await append(
      request,
      localEvent({
        key: key(request, "terminal:canceled"),
        type: "session.state.changed",
        payload: { state: "canceled" },
        actor: actor("system", "cly-dev-runtime"),
        now,
      }),
    );
    return { status: "canceled" };
  };

  const execute = async (request) => {
    if (!request?.projectId || !request?.sessionId || !request?.requestId) {
      throw new Error(
        "Execution requires projectId, sessionId, and requestId.",
      );
    }
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    request.signal?.addEventListener("abort", abortFromCaller, { once: true });
    if (request.signal?.aborted) controller.abort();
    active.set(request.requestId, controller);

    try {
      await append(
        request,
        localEvent({
          key: key(request, "request"),
          type: "message.recorded",
          payload: {
            role: "user",
            body: String(request.prompt ?? request.input ?? ""),
          },
          actor: actor("user", request.actorId ?? "cly-user"),
          now,
        }),
      );

      let outbound;
      try {
        outbound = assertExactOutbound(
          await buildOutboundContext(request.projectId, request.sessionId),
        );
      } catch (error) {
        return appendFailure(
          request,
          normalizedRuntimeError(provider, error),
          "context:failure",
        );
      }

      await append(request, {
        schemaVersion: VERSION,
        payloadVersion: VERSION,
        idempotencyKey: key(request, "context"),
        type: "context.manifest.recorded",
        transferability: "transferable",
        occurredAt: now(),
        actor: actor("system", "cly-dev-runtime"),
        payload: { manifestId: outbound.egress.manifest.id },
      });

      try {
        const authentication = await provider.getAuthentication();
        const authenticationError = authFailure(authentication);
        if (authenticationError) throw authenticationError;
        const capabilities = await provider.getCapabilities();
        const declaredTools = request.tools ?? [];
        const classifications = declaredTools.map((tool) =>
          approvalGate.classify({ tool: tool.name ?? tool.tool }),
        );
        const declaresEffect = classifications.some(
          (classification) => classification?.sideEffecting,
        );
        const explicitlyReadOnly = ["plan", "read_only", "read-only"].includes(
          request.mode,
        );
        if (
          capabilities.interceptBeforeEffect === false &&
          (declaresEffect || !explicitlyReadOnly)
        ) {
          throw new RuntimeError(
            "UNSAFE_PROVIDER_CAPABILITY",
            "This provider cannot intercept effectful tools before execution; only plan/read-only work is allowed.",
          );
        }
      } catch (error) {
        return appendFailure(
          request,
          normalizedRuntimeError(provider, error),
          "preflight:failure",
        );
      }

      const providerRequest = {
        ...request,
        signal: undefined,
        context: outbound.egress,
        contextBytes: outbound.egressBytes,
        contextHash: outbound.egressSha256,
      };

      try {
        let providerEventIndex = 0;
        for await (const event of provider.stream(providerRequest, {
          signal: controller.signal,
        })) {
          providerEventIndex += 1;
          const eventKey = key(
            request,
            `provider:${providerEventIndex}:${event.type}`,
          );
          if (event.type === "text") {
            await append(
              request,
              localEvent({
                key: eventKey,
                type: "message.recorded",
                payload: { role: "agent", body: event.text ?? "" },
                actor: actor("agent", provider.id),
                now,
              }),
            );
            continue;
          }
          if (event.type === "reasoning") {
            await append(
              request,
              localEvent({
                key: eventKey,
                type: "decision.recorded",
                payload: {
                  decisionId: event.decisionId ?? eventKey,
                  summary: event.summary ?? "Provider reasoning",
                  rationale: event.text ?? event.rationale ?? "",
                },
                actor: actor("agent", provider.id),
                now,
              }),
            );
            continue;
          }
          if (event.type === "usage") {
            await append(
              request,
              localEvent({
                key: eventKey,
                type: "cost.recorded",
                payload: {
                  amountMinor: Math.max(0, Number(event.costMinor ?? 0)),
                  currency: String(event.currency ?? "USD").toUpperCase(),
                  category: `provider_usage:${Number(event.inputTokens ?? 0)}:${Number(event.outputTokens ?? 0)}`,
                },
                actor: actor("system", provider.id),
                now,
              }),
            );
            const exhausted = budgetFailure(request.budget, event);
            if (exhausted) {
              await provider.cancel(request.requestId);
              controller.abort();
              return appendFailure(
                request,
                normalizedRuntimeError(provider, exhausted),
                "budget:failure",
              );
            }
            continue;
          }
          if (event.type === "tool_result") {
            await append(
              request,
              localEvent({
                key: eventKey,
                type: "message.recorded",
                payload: {
                  role: "system",
                  body: JSON.stringify({
                    kind: "provider_tool_result",
                    toolCallId: event.toolCallId,
                    result: event.result,
                  }),
                },
                actor: actor("tool", provider.id),
                now,
              }),
            );
            continue;
          }
          if (event.type === "tool_call") {
            await append(
              request,
              localEvent({
                key: `${eventKey}:call`,
                type: "message.recorded",
                payload: {
                  role: "agent",
                  body: JSON.stringify({
                    kind: "tool_call",
                    toolCallId: event.toolCallId,
                    tool: event.tool,
                    arguments: event.arguments,
                  }),
                },
                actor: actor("agent", provider.id),
                now,
              }),
            );

            const resultKey = stableToolKey(request, event.toolCallId);
            const existing = await findPersistedToolResult(request, resultKey);
            if (existing !== undefined) {
              await append(
                request,
                localEvent({
                  key: `${resultKey}:completed`,
                  type: "tool.recorded",
                  payload: {
                    toolCallId: event.toolCallId,
                    tool: event.tool,
                    status: "completed",
                  },
                  actor: actor("tool", "cly-dev-tool-runtime"),
                  now,
                }),
              );
              continue;
            }

            const approval = await getApproval(
              request.approvals,
              event.toolCallId,
            );
            const gateRequest = approvalGate.createRequest({
              projectId: request.projectId,
              sessionId: request.sessionId,
              toolCall: event,
              contextHash: outbound.egressSha256,
            });
            const gateDecision = approvalGate.evaluate({
              projectId: request.projectId,
              sessionId: request.sessionId,
              toolCall: event,
              contextHash: outbound.egressSha256,
              approval,
              projectPolicy: request.projectPolicy,
            });
            const approvalRelevant =
              gateDecision.type === "pending" ||
              gateDecision.approval ||
              gateDecision.code === "INVALID_APPROVAL" ||
              gateDecision.code?.startsWith("APPROVAL_");
            if (gateRequest && approvalRelevant) {
              await append(
                request,
                localEvent({
                  key: `${resultKey}:approval:requested`,
                  type: "approval.requested",
                  payload: {
                    approvalId: gateRequest.approvalId,
                    title: `Allow ${event.tool}`,
                    detail: JSON.stringify(gateRequest),
                    requestedAction: gateRequest.category,
                  },
                  actor: actor("agent", provider.id),
                  now,
                }),
              );
            }
            if (gateDecision.type === "pending") {
              await provider.cancel(request.requestId);
              controller.abort();
              return {
                status: "awaiting_approval",
                approval: gateDecision.approval,
              };
            }
            if (
              gateRequest &&
              approvalRelevant &&
              gateDecision.type !== "pending"
            ) {
              await append(
                request,
                localEvent({
                  key: `${resultKey}:approval:resolved`,
                  type: "approval.resolved",
                  payload: {
                    approvalId: gateRequest.approvalId,
                    state:
                      gateDecision.type === "allow" ? "approved" : "rejected",
                    resolvedBy: approval?.resolvedBy ?? "cly-dev-user",
                  },
                  actor: actor("user", "cly-dev-user"),
                  now,
                }),
              );
            }
            if (gateDecision.type !== "allow") {
              await provider.cancel(request.requestId);
              controller.abort();
              const denied = new RuntimeError(
                gateDecision.code ?? "TOOL_EFFECT_DENIED",
                gateDecision.reason ?? "The tool effect was denied.",
              );
              return appendFailure(
                request,
                normalizedRuntimeError(provider, denied),
                `${resultKey}:denied`,
              );
            }

            await append(
              request,
              localEvent({
                key: `${resultKey}:started`,
                type: "tool.recorded",
                payload: {
                  toolCallId: event.toolCallId,
                  tool: event.tool,
                  status: "started",
                },
                actor: actor("tool", "cly-dev-tool-runtime"),
                now,
              }),
            );
            try {
              const result = await executeTool(event, {
                idempotencyKey: resultKey,
                projectId: request.projectId,
                sessionId: request.sessionId,
                requestId: request.requestId,
                signal: controller.signal,
                category: gateDecision.category,
              });
              await persistToolResult(request, resultKey, result);
              await append(
                request,
                localEvent({
                  key: `${resultKey}:completed`,
                  type: "tool.recorded",
                  payload: {
                    toolCallId: event.toolCallId,
                    tool: event.tool,
                    status: "completed",
                    ...(Number.isInteger(result?.exitCode)
                      ? { exitCode: result.exitCode }
                      : {}),
                  },
                  actor: actor("tool", "cly-dev-tool-runtime"),
                  now,
                }),
              );
            } catch (error) {
              const normalized = normalizedRuntimeError(provider, error);
              await append(
                request,
                localEvent({
                  key: `${resultKey}:failed`,
                  type: "tool.recorded",
                  payload: {
                    toolCallId: event.toolCallId,
                    tool: event.tool,
                    status: "failed",
                    ...(Number.isInteger(error?.exitCode)
                      ? { exitCode: error.exitCode }
                      : {}),
                  },
                  actor: actor("tool", "cly-dev-tool-runtime"),
                  now,
                }),
              );
              await provider.cancel(request.requestId);
              controller.abort();
              return appendFailure(request, normalized, `${resultKey}:failure`);
            }
            continue;
          }
          if (event.type === "failed") {
            const normalized = normalizedRuntimeError(provider, event.error);
            return appendFailure(request, normalized, "provider:failure");
          }
          if (event.type === "canceled") return settleCanceled(request);
          if (event.type === "completed") {
            await append(
              request,
              localEvent({
                key: key(request, "terminal:completed"),
                type: "session.state.changed",
                payload: { state: "completed" },
                actor: actor("system", "cly-dev-runtime"),
                now,
              }),
            );
            return { status: "completed" };
          }
        }
        throw new RuntimeError(
          "INVALID_PROVIDER_STREAM",
          "Provider stream ended without a terminal event.",
        );
      } catch (error) {
        const normalized = normalizedRuntimeError(provider, error);
        if (normalized.code === "CANCELED") return settleCanceled(request);
        return appendFailure(request, normalized, "provider:failure");
      }
    } finally {
      request.signal?.removeEventListener("abort", abortFromCaller);
      active.delete(request.requestId);
    }
  };

  return Object.freeze({
    execute,
    retry: execute,
    resume: execute,
    async cancel(requestId) {
      active.get(requestId)?.abort();
      await provider.cancel(requestId);
    },
  });
}

export { RuntimeError as ClyDevRuntimeError, stableToolKey };
