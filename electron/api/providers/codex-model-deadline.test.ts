// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./codex-auth.js", () => ({
  readCodexAccessToken: vi.fn(),
  readCodexModelsCache: vi.fn().mockResolvedValue([]),
}));

import { fetchOpenAiModelsWithCodexChatgpt } from "./provider-models.js";

describe("Codex model discovery deadline", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("aborts a stalled ChatGPT model request", async () => {
    const fetchMock = vi.fn((_url, options: { signal?: AbortSignal } = {}) => {
      return new Promise((_resolve, reject) => {
        options.signal?.addEventListener(
          "abort",
          () => reject(options.signal?.reason ?? new Error("aborted")),
          { once: true },
        );
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchOpenAiModelsWithCodexChatgpt("test-token", { timeoutMs: 10 }),
    ).rejects.toBeDefined();
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });
});
