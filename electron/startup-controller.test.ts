import { describe, expect, it, vi } from "vitest";
import { createStartupController } from "./startup-controller.js";

describe("startup recovery controller", () => {
  it("surfaces a safe failure and retries successfully", async () => {
    const boot = vi
      .fn()
      .mockImplementationOnce(async (report) => {
        report("database", "Opening local project data…");
        throw new Error("/Users/private/project.sqlite secret detail");
      })
      .mockResolvedValueOnce(undefined);
    const cleanup = vi.fn();
    const onFailure = vi.fn();
    const controller = createStartupController({
      boot,
      cleanup,
      onFailure,
      onProgress: vi.fn(),
    });

    await expect(controller.start()).resolves.toBe(false);
    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "CLY_STARTUP_FAILED",
        stage: "database",
      }),
    );
    expect(JSON.stringify(onFailure.mock.calls[0]?.[0])).not.toContain(
      "/Users/private",
    );
    expect(cleanup).toHaveBeenCalledOnce();
    await expect(controller.start()).resolves.toBe(true);
    expect(controller.getState()).toBe("ready");
  });
});
