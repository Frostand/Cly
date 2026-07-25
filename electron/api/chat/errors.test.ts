// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { logProviderError } from "./errors.js";

describe("provider error logging", () => {
  it("never logs prompt, stderr, response body, or nested error text", () => {
    const sentinel = "CLY_PRIVATE_PROMPT_7f6d9f";
    const logger = vi.fn();
    const error = Object.assign(new Error(`request failed: ${sentinel}`), {
      code: "E_PROVIDER",
      data: { error: { message: sentinel } },
      responseBody: JSON.stringify({ prompt: sentinel }),
      status: 429,
      stderr: `provider echoed ${sentinel}`,
    });

    logProviderError("[chat provider error]", error, logger);

    expect(logger).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logger.mock.calls)).not.toContain(sentinel);
    expect(logger).toHaveBeenCalledWith("[chat provider error]", {
      code: "E_PROVIDER",
      name: "Error",
      status: 429,
    });
  });
});
