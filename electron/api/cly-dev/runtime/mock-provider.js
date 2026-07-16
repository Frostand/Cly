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
    const timer =
      milliseconds === undefined ? null : setTimeout(resolve, milliseconds);
    const cancel = () => {
      if (timer) clearTimeout(timer);
      reject(abortError());
    };
    signal.addEventListener("abort", cancel, { once: true });
  });

const scriptFor = (script, request) => {
  if (typeof script === "function") return script(request);
  if (Array.isArray(script)) return script;
  return script?.[request.requestId] ?? script?.default ?? [];
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
      const requestId = request.requestId;
      const cancel = () => controller.abort();
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) controller.abort();
      active.set(requestId, controller);
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
        active.delete(requestId);
      }
    },
    async cancel(requestId) {
      active.get(requestId)?.abort();
    },
    normalizeError: normalizeProviderError,
  });
  return provider;
}
