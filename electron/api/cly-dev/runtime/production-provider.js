import {
  createClyDevProviderAdapter,
  normalizeProviderError,
} from "./provider-contract.js";

const unavailable = () => {
  const error = new Error("The installed provider runner is unavailable.");
  error.code = "PROVIDER_UNAVAILABLE";
  error.retryable = false;
  return error;
};

export function createProductionClyDevProvider({
  id = "openai-codex",
  runner,
  normalizeError = normalizeProviderError,
} = {}) {
  return createClyDevProviderAdapter({
    id,
    async getAuthentication() {
      if (!runner) return { status: "unavailable" };
      return runner.getAuthentication();
    },
    async listModels() {
      if (!runner) return [];
      return runner.listModels();
    },
    async getCapabilities() {
      if (!runner) {
        return {
          streaming: false,
          reasoning: false,
          toolCalls: false,
          interceptBeforeEffect: false,
        };
      }
      return {
        streaming: true,
        reasoning: true,
        toolCalls: true,
        interceptBeforeEffect: false,
        ...(await runner.getCapabilities()),
      };
    },
    async *stream(request, context) {
      if (!runner) throw unavailable();
      yield* runner.stream(request, context);
    },
    async cancel(requestId) {
      if (!runner) return;
      await runner.cancel(requestId);
    },
    normalizeError,
  });
}
