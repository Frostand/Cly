import { createHash, randomUUID } from "node:crypto";
import { hashToolArguments } from "./approval-gate.js";
import { normalizeDurableOutboundContext } from "./outbound-context.js";
import {
  hasCanonicalProviderCapabilities,
  isCanonicalProviderModelId,
} from "./provider-contract.js";

export { deriveTransferableContextSummary } from "./outbound-context.js";

const VERSION = 1;
const MAX_PROCESS_OUTPUT_CHARS = 500_000;
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
  if (!isCanonicalProviderModelId(request.model)) {
    return new RuntimeError(
      "UNSUPPORTED_PROVIDER_MODEL",
      "A valid provider model id is required.",
    );
  }
  return null;
};

const validateCapabilities = (capabilities) => {
  if (!hasCanonicalProviderCapabilities(capabilities)) {
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

const clipProcessOutput = (value) => {
  const text = typeof value === "string" ? value : "";
  return text.length > MAX_PROCESS_OUTPUT_CHARS
    ? { text: text.slice(0, MAX_PROCESS_OUTPUT_CHARS), truncated: true }
    : { text, truncated: false };
};

const parseTestCounts = (output) => {
  const passed =
    [...output.matchAll(/(\d+)\s+passed\b/gi)]
      .map((match) => Number(match[1]))
      .filter(Number.isFinite)
      .at(-1) ?? 0;
  const failed =
    [...output.matchAll(/(\d+)\s+failed\b/gi)]
      .map((match) => Number(match[1]))
      .filter(Number.isFinite)
      .at(-1) ?? 0;
  return { passed, failed };
};

const isTestCommand = (command) =>
  /\b(?:test|vitest|jest|playwright|pytest)\b/i.test(command);

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
  const requestApproval = options.requestApproval;
  const durableToolEffects = options.durableToolEffects;
  const listEvents =
    options.listEvents ?? repository?.listEvents?.bind(repository);
  const createAttemptId = options.createAttemptId ?? randomUUID;
  const now = options.now ?? (() => new Date().toISOString());
  const active = new Map();
  const inMemoryUsage = new Map();

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

  const requestEventPrefix = (request) =>
    `cly-dev:${request.projectId}:${request.sessionId}:${request.requestId}:`;
  const emptyUsage = () => ({ inputTokens: 0, outputTokens: 0, costMinor: 0 });
  const addUsage = (target, delta) => {
    target.inputTokens += Math.max(0, Number(delta.inputTokens ?? 0));
    target.outputTokens += Math.max(0, Number(delta.outputTokens ?? 0));
    target.costMinor += Math.max(0, Number(delta.costMinor ?? 0));
    return target;
  };
  const usageFromEvent = (event) => {
    if (event?.type !== "cost.recorded") return null;
    const match = /^provider_usage:([^:]+):([^:]+)$/.exec(
      String(event.payload?.category ?? ""),
    );
    if (!match) return null;
    const inputTokens = Number(match[1]);
    const outputTokens = Number(match[2]);
    const costMinor = Number(event.payload?.amountMinor ?? 0);
    if (
      !Number.isFinite(inputTokens) ||
      !Number.isFinite(outputTokens) ||
      !Number.isFinite(costMinor)
    ) {
      return null;
    }
    return { inputTokens, outputTokens, costMinor };
  };
  const loadRequestUsage = async (request) => {
    const scopeKey = executionScopeKey(request);
    if (typeof listEvents !== "function") {
      return { ...(inMemoryUsage.get(scopeKey) ?? emptyUsage()) };
    }
    const totals = emptyUsage();
    const prefix = requestEventPrefix(request);
    let afterSequence = 0;
    while (true) {
      const page = await listEvents(
        request.projectId,
        request.sessionId,
        afterSequence,
        500,
      );
      if (!Array.isArray(page) || page.length === 0) break;
      for (const event of page) {
        if (String(event.idempotencyKey ?? "").startsWith(prefix)) {
          const usage = usageFromEvent(event);
          if (usage) addUsage(totals, usage);
        }
      }
      const nextSequence = Number(page.at(-1)?.sequence ?? afterSequence);
      if (page.length < 500 || nextSequence <= afterSequence) break;
      afterSequence = nextSequence;
    }
    return totals;
  };
  const rememberUsage = (request, totals) => {
    if (typeof listEvents === "function") return;
    inMemoryUsage.set(executionScopeKey(request), { ...totals });
  };

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

  const recordToolResult = async (
    request,
    resultKey,
    toolCall,
    result,
    executed,
    startedAt,
  ) => {
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
    if (toolCall.tool !== "runCommand") return;

    const command = String(
      result?.command ?? toolCall.arguments?.command ?? "",
    ).trim();
    const cwd = typeof result?.cwd === "string" ? result.cwd.trim() : "";
    if (!command || !cwd) return;

    const stdout = clipProcessOutput(result?.stdout);
    const stderr = clipProcessOutput(result?.stderr);
    const exitCode = Number.isInteger(result?.exitCode)
      ? result.exitCode
      : null;
    const signal = typeof result?.signal === "string" ? result.signal : null;
    const status =
      signal && exitCode === null
        ? "canceled"
        : exitCode === 0
          ? "completed"
          : "failed";
    const finishedAt = now();
    await append(
      request,
      localEvent({
        key: `${resultKey}:process`,
        type: "process.recorded",
        payload: {
          requestId: toolCall.toolCallId,
          command,
          cwd,
          status,
          stdout: stdout.text,
          stderr: stderr.text,
          exitCode,
          signal,
          startedAt,
          finishedAt,
          truncated: stdout.truncated || stderr.truncated,
        },
        actor: actor("tool", "cly-dev-tool-runtime"),
        now,
      }),
    );
    if (!isTestCommand(command)) return;
    const counts = parseTestCounts(`${stdout.text}\n${stderr.text}`);
    await append(
      request,
      localEvent({
        key: `${resultKey}:test`,
        type: "test.recorded",
        payload: {
          commandId: toolCall.toolCallId,
          passed: counts.passed,
          failed: Math.max(counts.failed, status === "completed" ? 0 : 1),
          durationMs: Math.max(
            0,
            Date.parse(finishedAt) - Date.parse(startedAt),
          ),
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

  const execute = async (request, operation = "execute") => {
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
    let markRunningReady;
    let runningReadySettled = false;
    const runningReady = new Promise((resolve) => {
      markRunningReady = () => {
        if (runningReadySettled) return;
        runningReadySettled = true;
        resolve();
      };
    });
    const activeExecutions = active.get(activeKey) ?? new Map();
    activeExecutions.set(controller, {
      executionId: scopedProviderExecutionId,
      runningReady,
    });
    active.set(activeKey, activeExecutions);

    try {
      const requestVersionError = validateRequestVersion(request);
      if (requestVersionError) {
        markRunningReady();
        return appendFailure(
          request,
          normalizedRuntimeError(provider, requestVersionError),
          "request:failure",
        );
      }
      try {
        await append(
          request,
          localEvent({
            key: key(request, `${operation}:running`),
            type: "session.state.changed",
            payload: { state: "running" },
            actor: actor("system", "cly-dev-runtime"),
            now,
          }),
        );
      } finally {
        markRunningReady();
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
          models.some((model) => !isCanonicalProviderModelId(model?.id))
        ) {
          throw new RuntimeError(
            "INVALID_PROVIDER_MODELS",
            "Provider model discovery returned a malformed identifier.",
          );
        }
        if (!models.some((model) => model?.id === request.model)) {
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
      const declaredToolNames = new Set(
        (request.tools ?? []).map((tool) => tool.name ?? tool.tool),
      );

      let callbackTerminal = null;
      const handleToolCall = async (event, eventKey) => {
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
          throw new RuntimeError(
            "UNSUPPORTED_PROVIDER_CAPABILITY",
            "The provider emitted a tool call without declaring tool-call support.",
          );
        }
        if (!declaredToolNames.has(event.tool)) {
          throw new RuntimeError(
            "TOOL_NOT_DECLARED",
            `The provider attempted to invoke undeclared tool ${event.tool}.`,
          );
        }
        const evaluateGate = (approval) =>
          approvalGate.evaluate({
            projectId: request.projectId,
            sessionId: request.sessionId,
            toolCall: event,
            contextHash: outbound.egressSha256,
            approval,
          });
        const suppliedApproval = await getApproval(
          request.approvals,
          event.toolCallId,
        );
        let gateDecision = await evaluateGate(suppliedApproval);
        let approvalRecord = gateDecision.approval;
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
          if (typeof requestApproval === "function") {
            const response = await requestApproval({
              approval: approvalRecord,
              contextHash: outbound.egressSha256,
              request,
              signal: controller.signal,
              toolCall: event,
            });
            if (!response || response.id !== approvalRecord.approvalId) {
              throw new RuntimeError(
                "APPROVAL_BINDING_MISMATCH",
                "The approval broker response did not match the pending approval.",
              );
            }
            await append(
              request,
              localEvent({
                key: `${resultKey}:approval:resolved`,
                type: "approval.resolved",
                payload: {
                  approvalId: approvalRecord.approvalId,
                  state: response.approved ? "approved" : "rejected",
                  resolvedBy: response.resolvedBy ?? "cly-dev-user",
                },
                actor: actor("user", response.resolvedBy ?? "cly-dev-user"),
                now,
              }),
            );
            gateDecision = await evaluateGate({
              approvalId: approvalRecord.approvalId,
            });
            approvalRecord = gateDecision.approval;
          }
        }
        if (gateDecision.type === "pending") {
          return {
            status: "awaiting_approval",
            approval: gateDecision.approval,
          };
        }
        if (
          approvalRecord &&
          approvalRecord.resolutionRecorded !== true &&
          ["approved", "rejected", "canceled"].includes(approvalRecord.state)
        ) {
          await append(
            request,
            localEvent({
              key: `${resultKey}:approval:resolved`,
              type: "approval.resolved",
              payload: {
                approvalId: approvalRecord.approvalId,
                state: gateDecision.type === "allow" ? "approved" : "rejected",
                resolvedBy: approvalRecord.resolvedBy ?? "cly-dev-user",
              },
              actor: actor("user", "cly-dev-user"),
              now,
            }),
          );
        }
        if (gateDecision.type !== "allow") {
          throw new RuntimeError(
            gateDecision.code ?? "TOOL_EFFECT_DENIED",
            gateDecision.reason ?? "The tool effect was denied.",
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
        const startedAt = now();
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
                toolName: event.tool,
                argumentsSha256: hashToolArguments(event.arguments),
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
        await recordToolResult(
          request,
          resultKey,
          event,
          outcome.result,
          outcome.executed,
          startedAt,
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
              ...(Number.isInteger(outcome.result?.exitCode)
                ? { exitCode: outcome.result.exitCode }
                : {}),
            },
            actor: actor("tool", "cly-dev-tool-runtime"),
            now,
          }),
        );
        return { status: "completed", result: outcome.result };
      };

      const executeProviderToolCall = async (event) => {
        try {
          const result = await handleToolCall(
            event,
            key(request, `provider:mcp:${event.toolCallId}`),
          );
          if (result.status === "completed") return result.result;
          callbackTerminal = result;
          const error = new RuntimeError(
            "APPROVAL_REQUIRED",
            "The tool call is waiting for approval.",
          );
          error.callbackTerminal = true;
          throw error;
        } catch (error) {
          if (error?.callbackTerminal) throw error;
          const normalized = normalizedRuntimeError(provider, error);
          callbackTerminal = await appendFailure(
            request,
            normalized,
            `${stableToolKey(request, event.toolCallId)}:failure`,
          );
          throw error;
        }
      };

      try {
        const attemptId = createAttemptId();
        let providerEventIndex = 0;
        const observedUsage = await loadRequestUsage(request);
        const priorBudgetFailure = budgetFailure(request.budget, observedUsage);
        if (priorBudgetFailure) {
          return appendFailure(
            request,
            normalizedRuntimeError(provider, priorBudgetFailure),
            `budget:${attemptId}:failure`,
          );
        }
        for await (const event of provider.stream(providerRequest, {
          executeToolCall: executeProviderToolCall,
          signal: controller.signal,
        })) {
          if (callbackTerminal) return callbackTerminal;
          providerEventIndex += 1;
          const eventKey = key(
            request,
            `provider:${attemptId}:${providerEventIndex}:${event.type}`,
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
            const usageDelta = {
              inputTokens: Math.max(0, Number(event.inputTokens ?? 0)),
              outputTokens: Math.max(0, Number(event.outputTokens ?? 0)),
              costMinor: Math.max(0, Number(event.costMinor ?? 0)),
            };
            addUsage(observedUsage, usageDelta);
            await append(
              request,
              localEvent({
                key: eventKey,
                type: "cost.recorded",
                payload: {
                  amountMinor: usageDelta.costMinor,
                  currency: String(event.currency ?? "USD").toUpperCase(),
                  category: `provider_usage:${usageDelta.inputTokens}:${usageDelta.outputTokens}`,
                },
                actor: actor("system", provider.id),
                now,
              }),
            );
            rememberUsage(request, observedUsage);
            const exhausted = budgetFailure(request.budget, observedUsage);
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
            if (!declaredToolNames.has(event.tool)) {
              const undeclared = new RuntimeError(
                "TOOL_NOT_DECLARED",
                `The provider attempted to invoke undeclared tool ${event.tool}.`,
              );
              await provider.cancel(scopedProviderExecutionId);
              controller.abort();
              return appendFailure(
                request,
                normalizedRuntimeError(provider, undeclared),
                `${resultKey}:undeclared`,
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
              approvalRecord.resolutionRecorded !== true &&
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
              const startedAt = now();
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
                      toolName: event.tool,
                      argumentsSha256: hashToolArguments(event.arguments),
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
                event,
                result,
                outcome.executed,
                startedAt,
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
        if (callbackTerminal) return callbackTerminal;
        const normalized = normalizedRuntimeError(provider, error);
        if (normalized.code === "CANCELED") return settleCanceled(request);
        return appendFailure(request, normalized, "provider:failure");
      }
    } finally {
      markRunningReady();
      request.signal?.removeEventListener("abort", abortFromCaller);
      const executions = active.get(activeKey);
      executions?.delete(controller);
      if (executions?.size === 0) active.delete(activeKey);
    }
  };

  return Object.freeze({
    execute: (request) => execute(request, "execute"),
    retry: (request) => execute(request, "retry"),
    resume: (request) => execute(request, "resume"),
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
      for (const [controller, execution] of executions) {
        controller.abort();
        await execution.runningReady;
        await provider.cancel(execution.executionId);
      }
    },
  });
}

export { RuntimeError as ClyDevRuntimeError, stableToolKey };
