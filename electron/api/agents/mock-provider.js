const abortError = () => {
  const error = new Error("Agent provider operation was canceled.");
  error.name = "AbortError";
  return error;
};

const abortableDelay = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(resolve, ms);
    const handleAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener("abort", handleAbort, { once: true });
  });

const waitUntilAborted = (signal) =>
  new Promise((_, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    signal?.addEventListener("abort", () => reject(abortError()), {
      once: true,
    });
  });

export function createMockAgentProvider({ scripts = {}, onWorkerStart } = {}) {
  const provider = {
    active: 0,
    activeByRole: {},
    maximumActive: 0,
    maximumActiveByRole: {},
    executedActions: [],
    startedWorkers: [],

    async *run(worker, { signal } = {}) {
      provider.active += 1;
      provider.activeByRole[worker.roleId] =
        (provider.activeByRole[worker.roleId] ?? 0) + 1;
      provider.maximumActive = Math.max(
        provider.maximumActive,
        provider.active,
      );
      provider.maximumActiveByRole[worker.roleId] = Math.max(
        provider.maximumActiveByRole[worker.roleId] ?? 0,
        provider.activeByRole[worker.roleId],
      );
      provider.startedWorkers.push(worker.id);
      onWorkerStart?.(worker);
      try {
        for (const event of scripts[worker.id] ?? []) {
          if (signal?.aborted) throw abortError();
          if (event.type === "delay") {
            await abortableDelay(event.ms, signal);
            continue;
          }
          if (event.type === "wait_until_aborted") {
            await waitUntilAborted(signal);
            continue;
          }
          yield event;
        }
      } finally {
        provider.active -= 1;
        provider.activeByRole[worker.roleId] -= 1;
      }
    },

    async executeAction(worker, action) {
      provider.executedActions.push({ workerId: worker.id, action });
      return { executed: true };
    },
  };

  return provider;
}
