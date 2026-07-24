// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createProviderLoginLauncher } from "./provider-login.js";

describe("provider login launcher", () => {
  it("rejects unknown providers and missing CLIs without opening a terminal", async () => {
    const spawnProcess = vi.fn();
    const launcher = createProviderLoginLauncher({
      isCommandAvailable: vi.fn().mockResolvedValue(false),
      platform: "darwin",
      spawnProcess,
    });

    await expect(launcher("unknown")).resolves.toBe(false);
    await expect(launcher("anthropic")).resolves.toBe(false);
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it("fails closed when the platform terminal launcher is unavailable", async () => {
    const spawnProcess = vi.fn();
    const isCommandAvailable = vi.fn(
      async (command: string) => command === "codex",
    );
    const launcher = createProviderLoginLauncher({
      isCommandAvailable,
      platform: "darwin",
      spawnProcess,
    });

    await expect(launcher("openai")).resolves.toBe(false);
    expect(isCommandAvailable).toHaveBeenCalledWith("osascript");
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it("opens the provider sign-in command after the CLI is verified", async () => {
    const child = { unref: vi.fn() };
    const spawnProcess = vi.fn(() => child);
    const launcher = createProviderLoginLauncher({
      isCommandAvailable: vi.fn().mockResolvedValue(true),
      platform: "darwin",
      spawnProcess,
    });

    await expect(launcher("openai")).resolves.toBe(true);
    expect(spawnProcess).toHaveBeenCalledWith(
      "osascript",
      ["-e", expect.stringContaining("codex login")],
      expect.objectContaining({ detached: true, stdio: "ignore" }),
    );
    expect(child.unref).toHaveBeenCalledOnce();
  });

  it("fails closed when the terminal process cannot be launched", async () => {
    const launcher = createProviderLoginLauncher({
      isCommandAvailable: vi.fn().mockResolvedValue(true),
      platform: "linux",
      spawnProcess: vi.fn(() => {
        throw new Error("terminal unavailable");
      }),
    });

    await expect(launcher("opencode")).resolves.toBe(false);
  });
});
