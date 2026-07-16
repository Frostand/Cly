import { createHash } from "node:crypto";
import { normalizeDurableOutboundContext } from "./outbound-context.js";

export { deriveTransferableContextSummary } from "./outbound-context.js";

const VERSION = 1;
const CAPABILITY_FIELDS = [
  "streaming",
  "reasoning",
  "toolCalls",
  "interceptBeforeEffect",
];

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

const normalizeOutboundContext = (outbound) => {
  const sourceEnvelope =
    outbound?.egress ?? outbound?.envelope ?? outbound?.preview;
  let normalized;
  try {
    normalized = normalizeDurableOutboundContext(sourceEnvelope);
  } catch (error) {
    throw new RuntimeError(
      "INVALID_OUTBOUND_CONTEXT",
      "Durable context cannot be normalized for provider egress.",
      false,
      error,
    );
  }
  return {
    preview: normalized.envelope,
    egress: normalized.envelope,
    previewBytes: normalized.bytes,
    egressBytes: normalized.bytes,
    previewSha256: normalized.sha256,
    egressSha256: normalized.sha256,
  };
};

const validateRequestVersion = (request) => {
  if (request.schemaVersion !== VERSION || request.payloadVersion !== VERSION) {
    return new RuntimeError(
      "UNSUPPORTED_REQUEST_VERSION",
      `Cly Dev requests require schemaVersion and payloadVersion ${VERSION}.`,
    );
  }
  if (typeof request.model !== "string" || !request.model.trim()) {
    return new RuntimeError(
      "UNSUPPORTED_PROVIDER_MODEL",
      "A provider model id is required.",
    );
  }
  return null;
};

const validateCapabilities = (capabilities) => {
  if (
    !capabilities ||
    typeof capabilities !== "object" ||
    CAPABILITY_FIELDS.some((field) => typeof capabilities[field] !== "boolean")
  ) {
    throw new RuntimeError(
      "INVALID_PROVIDER_CAPABILITIES",
      "Provider capability discovery returned an incomplete or unknown result.",
    );
  }
  if (!capabilities.streaming) {
    throw new RuntimeError(
      "UNSUPPORTED_PROVIDER_CAPABILITY",
      "The selected provider does not support streaming execution.",
    );
  }
  return capabilities;
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
const executionScopeKey = ({ projectId, sessionId, requestId }) =>
  JSON.stringify([projectId, sessionId, requestId]);
const providerExecutionId = (scope) =>
  `cly-dev-execution-${createHash("sha256")
    .update(executionScopeKey(scope))
    .digest("hex")}`;

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
  const durableToolEffects = options.durableToolEffects;
  const now = options.now ?? (() => new Date().toISOString());
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

  const append = (request, event, eventOptions) =>
    appendEvent(request.projectId, request.sessionId, event, eventOptions);
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

  const recordToolResult = async (request, resultKey, result, executed) => {
    await append(
      request,
      localEvent({
        key: `${resultKey}:result`,
        type: "message.recorded",
        payload: {
          role: "system",
          body: JSON.stringify({
            kind: "tool_result",
            key: resultKey,
            result,
            executed,
          }),
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
    const activeKey = executionScopeKey(request);
    const scopedProviderExecutionId = providerExecutionId(request);
    const activeExecutions = active.get(activeKey) ?? new Map();
    activeExecutions.set(controller, scopedProviderExecutionId);
    active.set(activeKey, activeExecutions);

    try {
      const requestVersionError = validateRequestVersion(request);
      if (requestVersionError) {
        return appendFailure(
          request,
          normalizedRuntimeError(provider, requestVersionError),
          "request:failure",
        );
      }
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
      let providerCapabilities;
      try {
        outbound = normalizeOutboundContext(
          await buildOutboundContext(request.projectId, request.sessionId),
        );
      } catch (error) {
        return appendFailure(
          request,
          normalizedRuntimeError(provider, error),
          "context:failure",
        );
      }

      await append(
        request,
        {
          schemaVersion: VERSION,
          payloadVersion: VERSION,
          idempotencyKey: key(request, "context"),
          type: "context.manifest.recorded",
          transferability: "transferable",
          occurredAt: now(),
          actor: actor("system", "cly-dev-runtime"),
          payload: { manifestId: outbound.egress.manifest.id },
        },
        { outboundContext: outbound.egress },
      );

      try {
        const authentication = await provider.getAuthentication();
        const authenticationError = authFailure(authentication);
        if (authenticationError) throw authenticationError;
        const models = await provider.listModels();
        if (
          !Array.isArray(models) ||
          !models.some((model) => model?.id === request.model)
        ) {
          throw new RuntimeError(
            "UNSUPPORTED_PROVIDER_MODEL",
            `Model ${request.model} is not available from provider ${provider.id}.`,
          );
        }
        providerCapabilities = validateCapabilities(
          await provider.getCapabilities(),
        );
        const declaredTools = request.tools ?? [];
        const classifications = declaredTools.map((tool) =>
          approvalGate.classify({ tool: tool.name ?? tool.tool }),
        );
        const declaresEffect = classifications.some(
          (classification) => classification?.sideEffecting,
        );
        if (declaredTools.length > 0 && !providerCapabilities.toolCalls) {
          throw new RuntimeError(
            "UNSUPPORTED_PROVIDER_CAPABILITY",
            "The selected provider does not support requested tool calls.",
          );
        }
        const explicitlyReadOnly = ["plan", "read_only", "read-only"].includes(
          request.mode,
        );
        if (
          providerCapabilities.interceptBeforeEffect === false &&
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
        clientRequestId: request.requestId,
        executionId: scopedProviderExecutionId,
        requestId: scopedProviderExecutionId,
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
              await provider.cancel(scopedProviderExecutionId);
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
            if (!providerCapabilities.toolCalls) {
              const unsupported = new RuntimeError(
                "UNSUPPORTED_PROVIDER_CAPABILITY",
                "The provider emitted a tool call without declaring tool-call support.",
              );
              await provider.cancel(scopedProviderExecutionId);
              controller.abort();
              return appendFailure(
                request,
                normalizedRuntimeError(provider, unsupported),
                `${resultKey}:unsupported`,
              );
            }
            const approval = await getApproval(
              request.approvals,
              event.toolCallId,
            );
            const gateDecision = await approvalGate.evaluate({
              projectId: request.projectId,
              sessionId: request.sessionId,
              toolCall: event,
              contextHash: outbound.egressSha256,
              approval,
            });
            const approvalRecord = gateDecision.approval;
            if (
              gateDecision.type === "pending" &&
              gateDecision.code === "APPROVAL_REQUIRED" &&
              approvalRecord
            ) {
              await append(
                request,
                localEvent({
                  key: `${resultKey}:approval:requested`,
                  type: "approval.requested",
                  payload: {
                    approvalId: approvalRecord.approvalId,
                    title: `Allow ${event.tool}`,
                    detail: JSON.stringify(approvalRecord),
                    requestedAction: approvalRecord.category,
                  },
                  actor: actor("agent", provider.id),
                  now,
                }),
              );
            }
            if (gateDecision.type === "pending") {
              await provider.cancel(scopedProviderExecutionId);
              controller.abort();
              return {
                status: "awaiting_approval",
                approval: gateDecision.approval,
              };
            }
            if (
              approvalRecord &&
              ["approved", "rejected", "canceled"].includes(
                approvalRecord.state,
              )
            ) {
              await append(
                request,
                localEvent({
                  key: `${resultKey}:approval:resolved`,
                  type: "approval.resolved",
                  payload: {
                    approvalId: approvalRecord.approvalId,
                    state:
                      gateDecision.type === "allow" ? "approved" : "rejected",
                    resolvedBy: approvalRecord.resolvedBy ?? "cly-dev-user",
                  },
                  actor: actor("user", "cly-dev-user"),
                  now,
                }),
              );
            }
            if (gateDecision.type !== "allow") {
              await provider.cancel(scopedProviderExecutionId);
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
              const classification = approvalGate.classify(event);
              if (
                classification?.sideEffecting &&
                typeof durableToolEffects?.executeOnce !== "function"
              ) {
                throw new RuntimeError(
                  "DURABLE_EFFECT_STORE_REQUIRED",
                  "Effectful tools require an atomic durable execute-once store.",
                );
              }
              const metadata = {
                idempotencyKey: resultKey,
                projectId: request.projectId,
                sessionId: request.sessionId,
                requestId: request.requestId,
                signal: controller.signal,
                category: gateDecision.category,
              };
              const execute = () => executeTool(event, metadata);
              const outcome = durableToolEffects?.executeOnce
                ? await durableToolEffects.executeOnce({
                    key: resultKey,
                    execute,
                    scope: {
                      projectId: request.projectId,
                      sessionId: request.sessionId,
                      requestId: request.requestId,
                      toolCallId: event.toolCallId,
                    },
                  })
                : { executed: true, result: await execute() };
              if (
                !outcome ||
                typeof outcome !== "object" ||
                !("result" in outcome) ||
                typeof outcome.executed !== "boolean"
              ) {
                throw new RuntimeError(
                  "INVALID_EFFECT_STORE_RESULT",
                  "The atomic effect store returned an invalid result.",
                );
              }
              const result = outcome.result;
              await recordToolResult(
                request,
                resultKey,
                result,
                outcome.executed,
              );
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
              await provider.cancel(scopedProviderExecutionId);
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
      const executions = active.get(activeKey);
      executions?.delete(controller);
      if (executions?.size === 0) active.delete(activeKey);
    }
  };

  return Object.freeze({
    execute,
    retry: execute,
    resume: execute,
    async cancel(scope) {
      if (
        !scope ||
        typeof scope !== "object" ||
        !scope.projectId ||
        !scope.sessionId ||
        !scope.requestId
      ) {
        throw new Error(
          "Cancellation requires projectId, sessionId, and requestId scope.",
        );
      }
      const executions = active.get(executionScopeKey(scope)) ?? new Map();
      for (const [controller, executionId] of executions) {
        controller.abort();
        await provider.cancel(executionId);
      }
    },
  });
}

export { RuntimeError as ClyDevRuntimeError, stableToolKey };
