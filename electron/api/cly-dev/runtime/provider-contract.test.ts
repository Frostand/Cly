// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createDeterministicMockProvider } from "./mock-provider.js";
import { createProductionClyDevProvider } from "./production-provider.js";
import {
  createClyDevProviderAdapter,
  ProviderContractError,
} from "./provider-contract.js";

const collect = async (iterable: AsyncIterable<unknown>) => {
  const values = [];
  for await (const value of iterable) values.push(value);
  return values;
};

describe("Cly Dev provider contract", () => {
  it("discovers authentication, models, and capabilities without provider-specific knowledge", async () => {
    const provider = createDeterministicMockProvider([]);

    await expect(provider.getAuthentication()).resolves.toEqual({
      status: "authenticated",
    });
    await expect(provider.listModels()).resolves.toEqual([
      { id: "mock-model", name: "Mock model" },
    ]);
    await expect(provider.getCapabilities()).resolves.toMatchObject({
      streaming: true,
      reasoning: true,
      toolCalls: true,
      interceptBeforeEffect: true,
    });
  });

  it("streams every event kind in deterministic order with one terminal outcome", async () => {
    const script = [
      { type: "text", text: "hello" },
      { type: "reasoning", text: "thinking" },
      {
        type: "tool_call",
        toolCallId: "call-1",
        tool: "readFile",
        arguments: { path: "README.md" },
      },
      { type: "tool_result", toolCallId: "call-1", result: { text: "ok" } },
      {
        type: "usage",
        inputTokens: 2,
        outputTokens: 3,
        costMinor: 1,
        currency: "USD",
      },
      { type: "completed" },
    ];
    const provider = createDeterministicMockProvider(script);

    await expect(
      collect(provider.stream({ requestId: "request-1" }, {})),
    ).resolves.toEqual(script);
  });

  it("accepts failed and canceled terminals and rejects missing or repeated terminals", async () => {
    const failed = createDeterministicMockProvider([
      {
        type: "failed",
        error: { code: "PROVIDER_ERROR", message: "boom", retryable: false },
      },
    ]);
    await expect(
      collect(failed.stream({ requestId: "failed" }, {})),
    ).resolves.toHaveLength(1);

    const canceled = createDeterministicMockProvider([{ type: "canceled" }]);
    await expect(
      collect(canceled.stream({ requestId: "canceled" }, {})),
    ).resolves.toHaveLength(1);

    const missing = createDeterministicMockProvider([
      { type: "text", text: "partial" },
    ]);
    await expect(
      collect(missing.stream({ requestId: "missing" }, {})),
    ).rejects.toMatchObject({
      code: "INVALID_PROVIDER_STREAM",
    });

    const repeated = createDeterministicMockProvider([
      { type: "completed" },
      { type: "canceled" },
    ]);
    await expect(
      collect(repeated.stream({ requestId: "repeated" }, {})),
    ).rejects.toMatchObject({
      code: "INVALID_PROVIDER_STREAM",
    });
  });

  it.each([
    [
      Object.assign(new Error("not installed"), { code: "ENOENT" }),
      "PROVIDER_UNAVAILABLE",
    ],
    [
      Object.assign(new Error("sign in"), { status: 401 }),
      "AUTHENTICATION_REQUIRED",
    ],
    [
      Object.assign(new Error("token expired"), { code: "TOKEN_EXPIRED" }),
      "AUTHENTICATION_EXPIRED",
    ],
    [Object.assign(new Error("slow down"), { status: 429 }), "RATE_LIMITED"],
    [
      Object.assign(new Error("budget exceeded"), { code: "BUDGET_EXHAUSTED" }),
      "BUDGET_EXHAUSTED",
    ],
    [Object.assign(new Error("aborted"), { name: "AbortError" }), "CANCELED"],
  ])("normalizes provider failures to %s", (error, code) => {
    const provider = createDeterministicMockProvider([]);
    expect(provider.normalizeError(error)).toMatchObject({ code });
  });

  it("cancels a live request through both AbortSignal and request id", async () => {
    const provider = createDeterministicMockProvider([
      { type: "text", text: "before" },
      { type: "wait_until_canceled" },
      { type: "completed" },
    ]);
    const events: unknown[] = [];
    const consuming = (async () => {
      for await (const event of provider.stream(
        { requestId: "cancel-me" },
        {},
      )) {
        events.push(event);
      }
    })();
    await Promise.resolve();
    await provider.cancel("cancel-me");
    await consuming;
    expect(events).toEqual([
      { type: "text", text: "before" },
      { type: "canceled" },
    ]);

    const controller = new AbortController();
    controller.abort();
    await expect(
      collect(
        provider.stream(
          { requestId: "already-aborted" },
          { signal: controller.signal },
        ),
      ),
    ).resolves.toEqual([{ type: "canceled" }]);
  });

  it("wraps an installed production runner behind the same seam", async () => {
    const runner = {
      getAuthentication: async () => ({ status: "authenticated" }),
      listModels: async () => [{ id: "gpt-5", name: "GPT-5" }],
      getCapabilities: async () => ({ interceptBeforeEffect: false }),
      async *stream() {
        yield { type: "text", text: "real seam" };
        yield { type: "completed" };
      },
      cancel: async () => undefined,
    };
    const provider = createProductionClyDevProvider({
      id: "openai-codex",
      runner,
    });

    expect(provider.id).toBe("openai-codex");
    await expect(provider.getCapabilities()).resolves.toMatchObject({
      interceptBeforeEffect: false,
    });
    await expect(
      collect(provider.stream({ requestId: "real-1" }, {})),
    ).resolves.toEqual([
      { type: "text", text: "real seam" },
      { type: "completed" },
    ]);
  });

  it("rejects invalid adapter definitions and event kinds", async () => {
    expect(() =>
      createClyDevProviderAdapter({ id: "broken" } as never),
    ).toThrow(ProviderContractError);

    const provider = createClyDevProviderAdapter({
      id: "invalid-stream",
      getAuthentication: async () => ({ status: "authenticated" }),
      listModels: async () => [],
      getCapabilities: async () => ({}),
      async *stream() {
        yield { type: "mystery" };
      },
      cancel: async () => undefined,
      normalizeError: (error) => error,
    });
    await expect(
      collect(provider.stream({ requestId: "bad" }, {})),
    ).rejects.toMatchObject({
      code: "INVALID_PROVIDER_STREAM",
    });
  });
});
