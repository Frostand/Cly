import {
  createClyDevProviderAdapter,
  normalizeProviderError,
} from "./provider-contract.js";

const abortError = () => {
  const error = new Error("Provider request was canceled.");
  error.name = "AbortError";
  return error;
};

const abortableWait = (milliseconds, signal) =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    let timer = null;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
    };
    const settle = () => {
      cleanup();
      resolve();
    };
    const cancel = () => {
      cleanup();
      reject(abortError());
    };
    timer =
      milliseconds === undefined ? null : setTimeout(settle, milliseconds);
    signal.addEventListener("abort", cancel, { once: true });
  });

const scriptFor = (script, request) => {
  if (typeof script === "function") return script(request);
  if (Array.isArray(script)) return script;
  return (
    script?.[request.executionId] ??
    script?.[request.clientRequestId] ??
    script?.[request.requestId] ??
    script?.default ??
    []
  );
};

export function createDeterministicMockProvider(script, options = {}) {
  const active = new Map();
  const provider = createClyDevProviderAdapter({
    id: options.id ?? "deterministic-mock",
    async getAuthentication() {
      return options.authentication ?? { status: "authenticated" };
    },
    async listModels() {
      return options.models ?? [{ id: "mock-model", name: "Mock model" }];
    },
    async getCapabilities() {
      if (options.capabilities === null) return null;
      return {
        streaming: true,
        reasoning: true,
        toolCalls: true,
        interceptBeforeEffect: true,
        ...options.capabilities,
      };
    },
    async *stream(request, { signal } = {}) {
      const controller = new AbortController();
      const executionId = request.executionId ?? request.requestId;
      const cancel = () => controller.abort();
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) controller.abort();
      active.set(executionId, controller);
      try {
        for (const event of await scriptFor(script, request)) {
          if (controller.signal.aborted) throw abortError();
          if (event.type === "delay") {
            await abortableWait(event.ms, controller.signal);
            continue;
          }
          if (event.type === "wait_until_canceled") {
            await abortableWait(undefined, controller.signal);
            continue;
          }
          yield structuredClone(event);
        }
      } finally {
        signal?.removeEventListener("abort", cancel);
        active.delete(executionId);
      }
    },
    async cancel(executionId) {
      active.get(executionId)?.abort();
    },
    normalizeError: normalizeProviderError,
  });
  return provider;
}
