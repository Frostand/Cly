const retryAfterDelay = (response, attempt, baseDelayMs, maxRetryDelayMs) => {
  const header = response.headers.get("retry-after");
  const seconds = Number(header);
  const dated = header ? Date.parse(header) - Date.now() : Number.NaN;
  const requested = Number.isFinite(seconds)
    ? seconds * 1_000
    : Number.isFinite(dated)
      ? dated
      : baseDelayMs * 2 ** attempt;
  return Math.min(maxRetryDelayMs, Math.max(0, requested));
};

export const attachProviderCalls = (records, providerCalls) => {
  Object.defineProperty(records, "providerCalls", {
    configurable: false,
    enumerable: false,
    value: providerCalls,
  });
  return records;
};

export async function requestLiteratureProvider(
  provider,
  url,
  {
    fetchImpl = fetch,
    timeoutMs = 20_000,
    maxAttempts = 3,
    baseDelayMs = 250,
    maxRetryDelayMs = 3_000,
    sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
    now = () => Date.now(),
  } = {},
) {
  const startedAt = now();
  const attempts = [];
  for (let index = 0; index < maxAttempts; index += 1) {
    const attemptStartedAt = now();
    try {
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      const retryable = response.status === 429 || response.status >= 500;
      const retryAfterMs = retryable
        ? retryAfterDelay(response, index, baseDelayMs, maxRetryDelayMs)
        : null;
      attempts.push({
        attempt: index + 1,
        durationMs: Math.max(0, now() - attemptStartedAt),
        outcome: response.ok
          ? "success"
          : retryable
            ? "retryable_http"
            : "http_error",
        retryAfterMs,
        status: response.status,
      });
      if (retryable && index + 1 < maxAttempts) {
        await sleep(retryAfterMs);
        continue;
      }
      return {
        response,
        providerCall: {
          attempts,
          durationMs: Math.max(0, now() - startedAt),
          operation: "search",
          provider,
          status: response.ok ? "completed" : "failed",
        },
      };
    } catch (error) {
      const timedOut =
        error?.name === "AbortError" || error?.name === "TimeoutError";
      attempts.push({
        attempt: index + 1,
        durationMs: Math.max(0, now() - attemptStartedAt),
        outcome: timedOut ? "timeout" : "network_error",
        retryAfterMs: null,
        status: null,
      });
      if (index + 1 < maxAttempts) {
        await sleep(Math.min(maxRetryDelayMs, baseDelayMs * 2 ** index));
        continue;
      }
      error.providerCall = {
        attempts,
        durationMs: Math.max(0, now() - startedAt),
        operation: "search",
        provider,
        status: "failed",
      };
      throw error;
    }
  }
  throw new Error(`${provider} search exhausted its retry budget.`);
}
