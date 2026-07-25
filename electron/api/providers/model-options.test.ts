// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchClaudeCodeModelOptionsFromModelsDev,
  fetchOpenCodeContextWindowsFromModelsDev,
} from "./model-options.js";

const createHangingFetch = () =>
  vi.fn((_url, options: { signal?: AbortSignal } = {}) => {
    return new Promise((_resolve, reject) => {
      options.signal?.addEventListener(
        "abort",
        () => reject(options.signal?.reason ?? new Error("aborted")),
        { once: true },
      );
    });
  });

describe("provider catalog network deadlines", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("aborts Claude catalog fetches at the configured deadline", async () => {
    const fetchMock = createHangingFetch();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchClaudeCodeModelOptionsFromModelsDev({ timeoutMs: 10 }),
    ).rejects.toBeDefined();
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("bounds OpenCode context lookup and degrades to an empty map", async () => {
    vi.stubGlobal("fetch", createHangingFetch());

    await expect(
      fetchOpenCodeContextWindowsFromModelsDev({ timeoutMs: 10 }),
    ).resolves.toEqual(new Map());
  });
});
