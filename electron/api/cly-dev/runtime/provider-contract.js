const PROVIDER_EVENT_TYPES = new Set([
  "text",
  "reasoning",
  "tool_call",
  "tool_result",
  "usage",
  "completed",
  "failed",
  "canceled",
]);
const TERMINAL_EVENT_TYPES = new Set(["completed", "failed", "canceled"]);
const REQUIRED_METHODS = [
  "getAuthentication",
  "listModels",
  "getCapabilities",
  "stream",
  "cancel",
  "normalizeError",
];

export class ProviderContractError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "ProviderContractError";
    this.code = code;
    this.retryable = options.retryable ?? false;
  }
}

const stringValue = (value) =>
  typeof value === "string" ? value.toLowerCase() : "";

export const normalizeProviderError = (error) => {
  if (error?.code && error?.message && error?.retryable !== undefined) {
    return {
      code: error.code,
      message: error.message,
      retryable: Boolean(error.retryable),
      ...(error.retryAfterMs === undefined
        ? {}
        : { retryAfterMs: error.retryAfterMs }),
    };
  }

  const code = stringValue(error?.code);
  const name = stringValue(error?.name);
  const message =
    typeof error?.message === "string" && error.message
      ? error.message
      : "The provider operation failed.";
  const description = `${code} ${name} ${message.toLowerCase()}`;
  const status = Number(error?.status ?? error?.statusCode);

  if (
    name === "aborterror" ||
    code === "abort_err" ||
    description.includes("cancel") ||
    description.includes("aborted")
  ) {
    return { code: "CANCELED", message, retryable: false };
  }
  if (
    code.includes("expired") ||
    description.includes("token expired") ||
    description.includes("authentication expired")
  ) {
    return { code: "AUTHENTICATION_EXPIRED", message, retryable: false };
  }
  if (
    code === "enoent" ||
    code === "provider_unavailable" ||
    description.includes("not installed") ||
    description.includes("provider unavailable")
  ) {
    return { code: "PROVIDER_UNAVAILABLE", message, retryable: false };
  }
  if (
    status === 401 ||
    status === 403 ||
    description.includes("sign in") ||
    description.includes("not authenticated")
  ) {
    return { code: "AUTHENTICATION_REQUIRED", message, retryable: false };
  }
  if (
    status === 429 ||
    code.includes("rate") ||
    description.includes("rate limit") ||
    description.includes("slow down")
  ) {
    return {
      code: "RATE_LIMITED",
      message,
      retryable: true,
      ...(error?.retryAfterMs === undefined
        ? {}
        : { retryAfterMs: error.retryAfterMs }),
    };
  }
  if (
    code.includes("budget") ||
    description.includes("budget") ||
    description.includes("quota exhausted")
  ) {
    return { code: "BUDGET_EXHAUSTED", message, retryable: false };
  }
  return { code: "PROVIDER_ERROR", message, retryable: true };
};

const invalidStream = (message, cause) =>
  new ProviderContractError("INVALID_PROVIDER_STREAM", message, { cause });

const validateEvent = (event) => {
  if (
    !event ||
    typeof event !== "object" ||
    !PROVIDER_EVENT_TYPES.has(event.type)
  ) {
    throw invalidStream(
      `Unknown provider stream event: ${event?.type ?? "(missing)"}.`,
    );
  }
  if (event.type === "tool_call") {
    if (
      !event.toolCallId ||
      !event.tool ||
      !event.arguments ||
      typeof event.arguments !== "object"
    ) {
      throw invalidStream(
        "Tool-call events require a call id, tool name, and arguments.",
      );
    }
  }
  if (event.type === "tool_result" && !event.toolCallId) {
    throw invalidStream("Tool-result events require a tool-call id.");
  }
  if (event.type === "failed" && !event.error) {
    throw invalidStream("Failed terminal events require a normalized error.");
  }
  return event;
};

const asThrowable = (normalized, cause) => {
  const throwable = new ProviderContractError(
    normalized?.code ?? "PROVIDER_ERROR",
    normalized?.message ?? "The provider operation failed.",
    { cause, retryable: Boolean(normalized?.retryable) },
  );
  if (normalized?.retryAfterMs !== undefined) {
    throwable.retryAfterMs = normalized.retryAfterMs;
  }
  return throwable;
};

export function createClyDevProviderAdapter(definition) {
  if (
    !definition ||
    typeof definition.id !== "string" ||
    !definition.id.trim()
  ) {
    throw new ProviderContractError(
      "INVALID_PROVIDER_DEFINITION",
      "A provider adapter requires a stable id.",
    );
  }
  for (const method of REQUIRED_METHODS) {
    if (typeof definition[method] !== "function") {
      throw new ProviderContractError(
        "INVALID_PROVIDER_DEFINITION",
        `Provider ${definition.id} must implement ${method}().`,
      );
    }
  }

  const normalizeError = (error) => {
    try {
      return definition.normalizeError(error) ?? normalizeProviderError(error);
    } catch {
      return normalizeProviderError(error);
    }
  };

  return Object.freeze({
    id: definition.id,
    getAuthentication: (...args) => definition.getAuthentication(...args),
    listModels: (...args) => definition.listModels(...args),
    getCapabilities: (...args) => definition.getCapabilities(...args),
    async *stream(request, { signal } = {}) {
      let terminal = false;
      try {
        if (signal?.aborted) {
          terminal = true;
          yield { type: "canceled" };
          return;
        }
        const stream = definition.stream(request, { signal });
        if (!stream || typeof stream[Symbol.asyncIterator] !== "function") {
          throw invalidStream(
            "Provider stream() must return an async iterable.",
          );
        }
        for await (const rawEvent of stream) {
          if (terminal) {
            throw invalidStream(
              "Provider emitted an event after its terminal outcome.",
            );
          }
          const validatedEvent = validateEvent(rawEvent);
          const event =
            validatedEvent.type === "failed"
              ? {
                  ...validatedEvent,
                  error: normalizeError(validatedEvent.error),
                }
              : validatedEvent;
          terminal = TERMINAL_EVENT_TYPES.has(event.type);
          yield event;
        }
        if (!terminal) {
          throw invalidStream(
            "Provider stream ended without a terminal outcome.",
          );
        }
      } catch (error) {
        if (error instanceof ProviderContractError) throw error;
        const normalized = normalizeError(error);
        if (normalized.code === "CANCELED" && !terminal) {
          yield { type: "canceled" };
          return;
        }
        throw asThrowable(normalized, error);
      }
    },
    cancel: (...args) => definition.cancel(...args),
    normalizeError,
  });
}
