import {
  createToolApprovalBinding,
  waitForToolApproval,
} from "../tool-approvals.js";
import { evaluateAgentAction } from "./action-policy.js";
import { parseAgentConfigurationInput } from "./configuration-schema.js";

const budgetFields = [
  ["maxInputTokens", "inputTokens"],
  ["maxOutputTokens", "outputTokens"],
  ["maxCostMinorUnits", "costMinorUnits"],
  ["maxRuntimeMs", "runtimeMs"],
];

const emptyUsage = () => ({
  inputTokens: 0,
  outputTokens: 0,
  costMinorUnits: 0,
  runtimeMs: 0,
});

const abortError = () => {
  const error = new Error("Worker canceled.");
  error.name = "AbortError";
  return error;
};

const isAbortError = (error) => error?.name === "AbortError";

const awaitWithAbort = (value, signal) => {
  if (!signal) return Promise.resolve(value);
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const handleAbort = () => {
      signal.removeEventListener("abort", handleAbort);
      reject(abortError());
    };
    signal.addEventListener("abort", handleAbort, { once: true });
    Promise.resolve(value).then(
      (result) => {
        signal.removeEventListener("abort", handleAbort);
        resolve(result);
      },
      (error) => {
        signal.removeEventListener("abort", handleAbort);
        reject(error);
      },
    );
  });
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const fallbackCodes = new Set([
  "MODEL_UNAVAILABLE",
  "PROVIDER_UNAVAILABLE",
  "RATE_LIMITED",
]);

const fallbackEligible = (error) => fallbackCodes.has(error?.code);

const providerFailure = (error) => ({
  code: error?.code ?? "PROVIDER_ERROR",
  message: error instanceof Error ? error.message : error?.message,
});

export function createAgentScheduler({
  now = Date.now,
  requestApproval = waitForToolApproval,
} = {}) {
  return {
    async run(configuration, provider, signal) {
      parseAgentConfigurationInput({
        name: configuration.name,
        maxParallel: configuration.maxParallel,
        maxTotalBudget: configuration.maxTotalBudget,
        partialFailurePolicy: configuration.partialFailurePolicy,
        roles: configuration.roles,
      });

      const events = [];
      let eventSequence = 0;
      const emit = (event) => {
        events.push({ sequence: ++eventSequence, ...event });
      };
      const results = configuration.roles.flatMap((role) =>
        Array.from({ length: role.instanceCount }, (_, index) => ({
          id: `${role.id}-${index + 1}`,
          roleId: role.id,
          role: role.role,
          index: index + 1,
          status: "queued",
          usage: emptyUsage(),
        })),
      );
      const roleById = new Map(
        configuration.roles.map((role) => [role.id, role]),
      );
      const aggregateUsage = emptyUsage();
      const aggregateProviderReportedUsage = emptyUsage();
      const reservedUsage = emptyUsage();
      const peakReservedUsage = emptyUsage();
      const pending = [...results];
      const active = new Map();
      const activeByRole = new Map();
      let stopReason = signal?.aborted ? "signal" : null;

      for (const worker of results) {
        emit({ type: "queued", workerId: worker.id, roleId: worker.roleId });
      }

      const cancelQueued = (reason) => {
        for (const worker of pending.splice(0)) {
          if (worker.status !== "queued") continue;
          worker.status = "canceled";
          worker.error = { code: "CANCELED", reason };
          emit({
            type: "canceled",
            workerId: worker.id,
            roleId: worker.roleId,
            reason,
          });
        }
      };

      const stop = (reason, exceptWorkerId) => {
        if (!stopReason) stopReason = reason;
        cancelQueued(reason);
        for (const [workerId, entry] of active) {
          if (workerId !== exceptWorkerId) entry.controller.abort();
        }
      };

      const handleExternalAbort = () => stop("signal");
      signal?.addEventListener("abort", handleExternalAbort, { once: true });

      const createReservation = (role, slots) => {
        const reservation = { scopes: {} };
        for (const [budgetKey, usageKey] of budgetFields) {
          const available = Math.max(
            0,
            configuration.maxTotalBudget[budgetKey] -
              aggregateUsage[usageKey] -
              reservedUsage[usageKey],
          );
          const fairShare =
            slots > 1 ? Math.floor(available / slots) : available;
          const amount = Math.min(role.budget[budgetKey], fairShare);
          reservation[usageKey] = amount;
          reservation.scopes[usageKey] =
            amount < role.budget[budgetKey] ? "aggregate" : "role";
        }
        if (reservation.runtimeMs <= 0) return null;
        for (const [, usageKey] of budgetFields) {
          reservedUsage[usageKey] += reservation[usageKey];
          peakReservedUsage[usageKey] = Math.max(
            peakReservedUsage[usageKey],
            reservedUsage[usageKey],
          );
        }
        return reservation;
      };

      const releaseReservation = (reservation) => {
        for (const [, usageKey] of budgetFields) {
          reservedUsage[usageKey] = Math.max(
            0,
            reservedUsage[usageKey] - reservation[usageKey],
          );
          reservation[usageKey] = 0;
        }
      };

      const commitUsage = (
        worker,
        reservation,
        usageEvent,
        emitEvent = true,
        recordProviderReported = emitEvent,
      ) => {
        const acceptedUsage = emptyUsage();
        const attemptedUsage = emptyUsage();
        let exhausted = null;
        for (const [budgetKey, usageKey] of budgetFields) {
          const attempted = Number(usageEvent[usageKey] ?? 0);
          if (!Number.isFinite(attempted) || attempted < 0) {
            const error = new TypeError(
              `Invalid provider usage for ${usageKey}.`,
            );
            error.code = "INVALID_USAGE";
            throw error;
          }
          attemptedUsage[usageKey] = attempted;
          if (recordProviderReported) {
            aggregateProviderReportedUsage[usageKey] += attempted;
          }
          const accepted = Math.min(attempted, reservation[usageKey]);
          acceptedUsage[usageKey] = accepted;
          reservation[usageKey] -= accepted;
          reservedUsage[usageKey] = Math.max(
            0,
            reservedUsage[usageKey] - accepted,
          );
          worker.usage[usageKey] += accepted;
          aggregateUsage[usageKey] += accepted;
          if (!exhausted && attempted > accepted) {
            exhausted = {
              budget: budgetKey,
              scope: reservation.scopes[usageKey],
            };
          }
        }
        if (emitEvent) {
          emit({
            type: "usage",
            workerId: worker.id,
            roleId: worker.roleId,
            acceptedUsage,
            attemptedUsage,
            usage: { ...worker.usage },
            aggregateUsage: { ...aggregateUsage },
            aggregateProviderReportedUsage: {
              ...aggregateProviderReportedUsage,
            },
            aggregateReservedUsage: { ...reservedUsage },
          });
        }
        return exhausted;
      };

      const markBudgetExhausted = (worker, exhausted) => {
        worker.status = "budget_exhausted";
        worker.error = {
          code: "BUDGET_EXHAUSTED",
          budget: exhausted.budget,
          scope: exhausted.scope,
        };
        emit({
          type: "budget_exhausted",
          workerId: worker.id,
          roleId: worker.roleId,
          budget: exhausted.budget,
          scope: exhausted.scope,
        });
        if (
          exhausted.scope === "aggregate" ||
          configuration.partialFailurePolicy === "cancel_remaining"
        ) {
          stop("budget_exhausted", worker.id);
        }
      };

      const failWorker = (worker, error) => {
        worker.status = "failed";
        worker.error = error;
        emit({
          type: "failed",
          workerId: worker.id,
          roleId: worker.roleId,
          error,
        });
        if (configuration.partialFailurePolicy === "cancel_remaining") {
          stop("partial_failure", worker.id);
        }
      };

      const runWorker = async (worker, role, controller, reservation) => {
        worker.status = "started";
        const startedAt = now();
        let runtimeReported = false;
        let deadlineTriggered = false;
        const deadlineScope = reservation.scopes.runtimeMs;
        let fallbackState = null;
        const deadlineTimer = setTimeout(() => {
          deadlineTriggered = true;
          controller.abort();
        }, reservation.runtimeMs);
        emit({ type: "started", workerId: worker.id, roleId: worker.roleId });

        const finishFallback = (terminalReason, details = {}) => {
          if (!fallbackState || fallbackState.finished) return;
          fallbackState.finished = true;
          emit({
            type:
              terminalReason === "completed"
                ? "fallback_completed"
                : "fallback_failed",
            workerId: worker.id,
            roleId: worker.roleId,
            model: fallbackState.model,
            terminalReason,
            ...details,
          });
        };

        const accountWallRuntime = () => {
          if (runtimeReported) return null;
          runtimeReported = true;
          return commitUsage(
            worker,
            reservation,
            { runtimeMs: Math.max(0, now() - startedAt) },
            false,
          );
        };

        const runAttempt = async (attemptRole, attemptState) => {
          const iterator = provider
            .run(worker, {
              configuration,
              role: attemptRole,
              remainingBudget: {
                inputTokens: reservation.inputTokens,
                outputTokens: reservation.outputTokens,
                costMinorUnits: reservation.costMinorUnits,
                runtimeMs: reservation.runtimeMs,
              },
              signal: controller.signal,
            })
            [Symbol.asyncIterator]();
          let completed = false;
          try {
            while (true) {
              const next = await awaitWithAbort(
                iterator.next(),
                controller.signal,
              );
              if (next.done) {
                completed = true;
                return { kind: "completed" };
              }
              const providerEvent = next.value;
              if (providerEvent.type === "usage") {
                runtimeReported ||= providerEvent.runtimeMs !== undefined;
                const exhausted = commitUsage(
                  worker,
                  reservation,
                  providerEvent,
                );
                if (exhausted) return { kind: "budget_exhausted", exhausted };
                continue;
              }
              if (providerEvent.type === "action") {
                const action = clone(providerEvent);
                const policy = evaluateAgentAction(attemptRole, action);
                if (!policy.allowed) {
                  return { kind: "failed", error: policy.error };
                }
                let approval;
                if (policy.requiresApproval) {
                  if (typeof action.id !== "string" || !action.id) {
                    return {
                      kind: "failed",
                      error: {
                        code: "POLICY_VIOLATION",
                        message: "Approval-gated actions require an id.",
                      },
                    };
                  }
                  const approvalRequest = {
                    id: action.id,
                    projectId: configuration.projectId,
                    provider: attemptRole.provider,
                    request: {
                      input: clone(action.input ?? {}),
                      toolName: action.tool,
                    },
                    runId: worker.id,
                    signal: controller.signal,
                  };
                  const expectedBinding =
                    createToolApprovalBinding(approvalRequest);
                  emit({
                    type: "awaiting_approval",
                    workerId: worker.id,
                    roleId: worker.roleId,
                    approvalId: action.id,
                    checkpoint: policy.checkpoint,
                    actionHash: expectedBinding.actionHash,
                  });
                  approval = await awaitWithAbort(
                    requestApproval(approvalRequest),
                    controller.signal,
                  );
                  const bound =
                    approval?.id === action.id &&
                    approval?.projectId === expectedBinding.projectId &&
                    approval?.runId === expectedBinding.runId &&
                    approval?.actionHash === expectedBinding.actionHash &&
                    Number.isFinite(approval?.expiresAt) &&
                    approval.expiresAt > now();
                  if (!approval?.approved || !bound) {
                    return {
                      kind: "failed",
                      error: {
                        code: "APPROVAL_DENIED",
                        reason: bound
                          ? (approval?.reason ?? "Approval was denied.")
                          : "Approval result did not match the exact active binding.",
                      },
                    };
                  }
                }
                if (policy.sideEffecting) {
                  // Once a side effect is dispatched, an automatic fallback could
                  // replay it even when the provider reports a retryable failure.
                  attemptState.sideEffectsExecuted = true;
                }
                await awaitWithAbort(
                  provider.executeAction?.(worker, action, {
                    approval,
                    role: attemptRole,
                    signal: controller.signal,
                  }),
                  controller.signal,
                );
                continue;
              }
              if (providerEvent.type === "error") {
                return {
                  kind: "failed",
                  error: {
                    code: providerEvent.code ?? "PROVIDER_ERROR",
                    message: providerEvent.message,
                  },
                };
              }
            }
          } finally {
            if (!completed) {
              const closing = iterator.return?.();
              if (closing && !controller.signal.aborted) {
                await closing;
              } else {
                Promise.resolve(closing).catch(() => undefined);
              }
            }
          }
        };

        try {
          const attempts = [role];
          if (role.fallbackModel && role.fallbackModel !== role.model) {
            attempts.push({ ...role, model: role.fallbackModel });
          }
          let outcome;
          for (const [attemptIndex, attemptRole] of attempts.entries()) {
            const attemptState = { sideEffectsExecuted: false };
            if (attemptIndex === 1) {
              fallbackState = {
                finished: false,
                model: attemptRole.model,
              };
              emit({
                type: "fallback_started",
                workerId: worker.id,
                roleId: worker.roleId,
                fromModel: role.model,
                toModel: attemptRole.model,
                reason: outcome?.error?.code,
              });
            }
            try {
              outcome = await runAttempt(attemptRole, attemptState);
            } catch (error) {
              if (isAbortError(error) || controller.signal.aborted) throw error;
              outcome = { kind: "failed", error: providerFailure(error) };
            }
            if (outcome.kind === "completed") {
              break;
            }
            if (outcome.kind === "budget_exhausted") {
              accountWallRuntime();
              finishFallback("budget_exhausted", outcome.exhausted);
              markBudgetExhausted(worker, outcome.exhausted);
              return;
            }
            if (
              attemptIndex === 0 &&
              attempts.length > 1 &&
              fallbackEligible(outcome.error)
            ) {
              if (attemptState.sideEffectsExecuted) {
                emit({
                  type: "fallback_skipped",
                  workerId: worker.id,
                  roleId: worker.roleId,
                  fromModel: role.model,
                  toModel: attempts[1].model,
                  reason: "side_effects_executed",
                  error: outcome.error,
                });
              } else {
                continue;
              }
            }
            if (attemptIndex === 1) {
              const terminalReason =
                outcome.error?.code === "POLICY_VIOLATION"
                  ? "policy_violation"
                  : outcome.error?.code === "APPROVAL_DENIED"
                    ? "approval_denied"
                    : "provider_failure";
              finishFallback(terminalReason, { error: outcome.error });
            }
            const runtimeExhausted = accountWallRuntime();
            if (runtimeExhausted) {
              finishFallback("budget_exhausted", runtimeExhausted);
              markBudgetExhausted(worker, runtimeExhausted);
              return;
            }
            failWorker(worker, outcome.error);
            return;
          }

          const runtimeExhausted = accountWallRuntime();
          if (runtimeExhausted) {
            finishFallback("budget_exhausted", runtimeExhausted);
            markBudgetExhausted(worker, runtimeExhausted);
            return;
          }
          finishFallback("completed");
          worker.status = "completed";
          emit({
            type: "completed",
            workerId: worker.id,
            roleId: worker.roleId,
          });
        } catch (error) {
          if (deadlineTriggered) {
            commitUsage(
              worker,
              reservation,
              { runtimeMs: reservation.runtimeMs },
              false,
            );
            finishFallback("deadline", {
              budget: "maxRuntimeMs",
              scope: deadlineScope,
            });
            markBudgetExhausted(worker, {
              budget: "maxRuntimeMs",
              scope: deadlineScope,
            });
            return;
          }
          if (isAbortError(error) || controller.signal.aborted) {
            accountWallRuntime();
            finishFallback("canceled", {
              reason: stopReason ?? "signal",
            });
            worker.status = "canceled";
            worker.error = { code: "CANCELED", reason: stopReason ?? "signal" };
            emit({
              type: "canceled",
              workerId: worker.id,
              roleId: worker.roleId,
              reason: stopReason ?? "signal",
            });
            return;
          }
          const failure = providerFailure(error);
          finishFallback("provider_failure", { error: failure });
          failWorker(worker, failure);
        } finally {
          clearTimeout(deadlineTimer);
          releaseReservation(reservation);
        }
      };

      const launchableSlotCount = (firstWorker) => {
        const capacity = configuration.maxParallel - active.size;
        const projectedByRole = new Map(activeByRole);
        let slots = 0;
        for (const candidate of [firstWorker, ...pending]) {
          if (slots >= capacity) break;
          const candidateRole = roleById.get(candidate.roleId);
          const projected = projectedByRole.get(candidate.roleId) ?? 0;
          if (projected >= candidateRole.maxParallel) continue;
          projectedByRole.set(candidate.roleId, projected + 1);
          slots += 1;
        }
        return Math.max(1, slots);
      };

      while (pending.length || active.size) {
        if (stopReason) cancelQueued(stopReason);
        let launched = false;
        while (!stopReason && active.size < configuration.maxParallel) {
          const pendingIndex = pending.findIndex((worker) => {
            const role = roleById.get(worker.roleId);
            return (activeByRole.get(worker.roleId) ?? 0) < role.maxParallel;
          });
          if (pendingIndex < 0) break;
          const [worker] = pending.splice(pendingIndex, 1);
          const role = roleById.get(worker.roleId);
          const slots = launchableSlotCount(worker);
          const reservation = createReservation(role, slots);
          if (!reservation) {
            pending.unshift(worker);
            emit({
              type: "budget_exhausted",
              budget: "maxRuntimeMs",
              scope: "aggregate",
            });
            stop("budget_exhausted");
            break;
          }
          const controller = new AbortController();
          if (signal?.aborted) controller.abort();
          activeByRole.set(
            worker.roleId,
            (activeByRole.get(worker.roleId) ?? 0) + 1,
          );
          const promise = runWorker(
            worker,
            role,
            controller,
            reservation,
          ).finally(() => {
            active.delete(worker.id);
            activeByRole.set(
              worker.roleId,
              activeByRole.get(worker.roleId) - 1,
            );
          });
          active.set(worker.id, { controller, promise });
          launched = true;
        }
        if (active.size) {
          await Promise.race(
            [...active.values()].map(({ promise }) => promise),
          );
        } else if (!launched && pending.length) {
          cancelQueued(stopReason ?? "not_schedulable");
        }
      }

      signal?.removeEventListener("abort", handleExternalAbort);
      return {
        results,
        workers: results,
        usage: aggregateUsage,
        usageTotals: {
          accepted: { ...aggregateUsage },
          providerReported: { ...aggregateProviderReportedUsage },
          reserved: { ...peakReservedUsage },
        },
        events,
      };
    },
  };
}
