import { parseAgentConfigurationInput } from "./configuration-schema.js";

const emptyUsage = () => ({
  inputTokens: 0,
  outputTokens: 0,
  costMinorUnits: 0,
  runtimeMs: 0,
});

const budgetFields = [
  ["maxInputTokens", "inputTokens"],
  ["maxOutputTokens", "outputTokens"],
  ["maxCostMinorUnits", "costMinorUnits"],
  ["maxRuntimeMs", "runtimeMs"],
];

const exhaustedBudget = (usage, budget) =>
  budgetFields.find(
    ([budgetKey, usageKey]) => usage[usageKey] >= budget[budgetKey],
  );

const hasRemainingBudget = (usage, budget) =>
  budgetFields.every(
    ([budgetKey, usageKey]) => usage[usageKey] < budget[budgetKey],
  );

const addUsage = (target, event) => {
  for (const [, usageKey] of budgetFields) {
    target[usageKey] += Number(event[usageKey] ?? 0);
  }
};

const isAbortError = (error) => error?.name === "AbortError";

const abortError = () => {
  const error = new Error("Worker canceled.");
  error.name = "AbortError";
  return error;
};

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

export function createAgentScheduler({
  now = Date.now,
  requestApproval = async () => ({ approved: false }),
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

      const runWorker = async (worker, controller) => {
        const role = roleById.get(worker.roleId);
        worker.status = "started";
        const startedAt = now();
        let accountedRuntime = false;
        emit({ type: "started", workerId: worker.id, roleId: worker.roleId });
        try {
          for await (const providerEvent of provider.run(worker, {
            configuration,
            role,
            signal: controller.signal,
          })) {
            if (controller.signal.aborted) {
              const error = new Error("Worker canceled.");
              error.name = "AbortError";
              throw error;
            }
            if (providerEvent.type === "usage") {
              accountedRuntime ||= providerEvent.runtimeMs !== undefined;
              addUsage(worker.usage, providerEvent);
              addUsage(aggregateUsage, providerEvent);
              emit({
                type: "usage",
                workerId: worker.id,
                roleId: worker.roleId,
                usage: { ...worker.usage },
                aggregateUsage: { ...aggregateUsage },
              });
              const roleExhausted = exhaustedBudget(worker.usage, role.budget);
              const aggregateExhausted = exhaustedBudget(
                aggregateUsage,
                configuration.maxTotalBudget,
              );
              const exhausted = aggregateExhausted ?? roleExhausted;
              if (exhausted) {
                worker.status = "budget_exhausted";
                worker.error = {
                  code: "BUDGET_EXHAUSTED",
                  budget: exhausted[0],
                  scope: aggregateExhausted ? "aggregate" : "role",
                };
                emit({
                  type: "budget_exhausted",
                  workerId: worker.id,
                  roleId: worker.roleId,
                  budget: exhausted[0],
                  scope: aggregateExhausted ? "aggregate" : "role",
                });
                stop("budget_exhausted", worker.id);
                return;
              }
              continue;
            }
            if (providerEvent.type === "action") {
              const approvalRequest = {
                ...providerEvent,
                projectId: configuration.projectId,
                configurationId: configuration.id,
                runId: worker.id,
                roleId: worker.roleId,
                provider: role.provider,
                model: role.model,
              };
              emit({
                type: "awaiting_approval",
                workerId: worker.id,
                roleId: worker.roleId,
                approvalId: providerEvent.id,
                checkpoint: providerEvent.checkpoint,
              });
              const approval = await awaitWithAbort(
                requestApproval({
                  ...approvalRequest,
                  signal: controller.signal,
                }),
                controller.signal,
              );
              const bound =
                approval?.id === providerEvent.id &&
                approval?.projectId === configuration.projectId &&
                approval?.runId === worker.id;
              if (!approval?.approved || !bound) {
                worker.status = "failed";
                worker.error = {
                  code: "APPROVAL_DENIED",
                  reason: bound
                    ? (approval?.reason ?? "Approval was denied.")
                    : "Approval result did not match the requested binding.",
                };
                emit({
                  type: "failed",
                  workerId: worker.id,
                  roleId: worker.roleId,
                  error: worker.error,
                });
                if (configuration.partialFailurePolicy === "cancel_remaining") {
                  stop("partial_failure", worker.id);
                }
                return;
              }
              await awaitWithAbort(
                provider.executeAction?.(worker, providerEvent, {
                  approval,
                  signal: controller.signal,
                }),
                controller.signal,
              );
              continue;
            }
            if (providerEvent.type === "error") {
              worker.status = "failed";
              worker.error = {
                code: providerEvent.code ?? "PROVIDER_ERROR",
                message: providerEvent.message,
              };
              emit({
                type: "failed",
                workerId: worker.id,
                roleId: worker.roleId,
                error: worker.error,
              });
              if (configuration.partialFailurePolicy === "cancel_remaining") {
                stop("partial_failure", worker.id);
              }
              return;
            }
          }
          if (!accountedRuntime) {
            const runtimeMs = Math.max(0, now() - startedAt);
            worker.usage.runtimeMs += runtimeMs;
            aggregateUsage.runtimeMs += runtimeMs;
          }
          if (worker.status === "started") {
            worker.status = "completed";
            emit({
              type: "completed",
              workerId: worker.id,
              roleId: worker.roleId,
            });
          }
        } catch (error) {
          if (isAbortError(error) || controller.signal.aborted) {
            if (worker.status !== "budget_exhausted") {
              worker.status = "canceled";
              worker.error = {
                code: "CANCELED",
                reason: stopReason ?? "signal",
              };
              emit({
                type: "canceled",
                workerId: worker.id,
                roleId: worker.roleId,
                reason: stopReason ?? "signal",
              });
            }
            return;
          }
          worker.status = "failed";
          worker.error = {
            code: error?.code ?? "PROVIDER_ERROR",
            message: error instanceof Error ? error.message : String(error),
          };
          emit({
            type: "failed",
            workerId: worker.id,
            roleId: worker.roleId,
            error: worker.error,
          });
          if (configuration.partialFailurePolicy === "cancel_remaining") {
            stop("partial_failure", worker.id);
          }
        }
      };

      if (!hasRemainingBudget(aggregateUsage, configuration.maxTotalBudget)) {
        const exhausted = exhaustedBudget(
          aggregateUsage,
          configuration.maxTotalBudget,
        );
        emit({
          type: "budget_exhausted",
          budget: exhausted?.[0],
          scope: "aggregate",
        });
        stop("budget_exhausted");
      }

      while (pending.length || active.size) {
        if (stopReason) cancelQueued(stopReason);
        let launched = false;
        while (!stopReason && active.size < configuration.maxParallel) {
          const pendingIndex = pending.findIndex((worker) => {
            const role = roleById.get(worker.roleId);
            return (activeByRole.get(worker.roleId) ?? 0) < role.maxParallel;
          });
          if (pendingIndex < 0) break;
          if (
            !hasRemainingBudget(aggregateUsage, configuration.maxTotalBudget)
          ) {
            stop("budget_exhausted");
            break;
          }
          const [worker] = pending.splice(pendingIndex, 1);
          const controller = new AbortController();
          if (signal?.aborted) controller.abort();
          activeByRole.set(
            worker.roleId,
            (activeByRole.get(worker.roleId) ?? 0) + 1,
          );
          const promise = runWorker(worker, controller).finally(() => {
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
        events,
      };
    },
  };
}
