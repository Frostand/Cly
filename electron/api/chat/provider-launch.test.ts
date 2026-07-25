// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { resolveCursorCliLaunch } from "../providers/cursor-cli.js";
import { resolveCodexCliLaunch } from "./codex-cli-launch.js";

describe("direct provider launches", () => {
  it("resolves Codex directly with shell disabled", async () => {
    await expect(
      resolveCodexCliLaunch({
        platform: "linux",
        resolveCommand: vi.fn().mockResolvedValue("/usr/local/bin/codex"),
      }),
    ).resolves.toEqual({
      argsPrefix: [],
      command: "/usr/local/bin/codex",
      shell: false,
    });
  });

  it("resolves Cursor directly and rejects unverified Windows command shims", async () => {
    await expect(
      resolveCursorCliLaunch({
        platform: "linux",
        resolveCommand: vi
          .fn()
          .mockResolvedValue("/usr/local/bin/cursor-agent"),
      }),
    ).resolves.toEqual({
      argsPrefix: [],
      command: "/usr/local/bin/cursor-agent",
      shell: false,
    });

    await expect(
      resolveCursorCliLaunch({
        platform: "win32",
        resolveCommand: vi.fn().mockResolvedValue("C:\\bin\\cursor-agent.cmd"),
        resolveWindowsShim: vi.fn().mockResolvedValue(null),
      }),
    ).rejects.toThrow(/could not safely resolve/i);
  });

  it("launches verified npm Windows shims through Node without a shell", async () => {
    const verifiedLaunch = {
      argsPrefix: ["C:\\npm\\node_modules\\@openai\\codex\\bin\\codex.js"],
      command: "C:\\Cly\\Cly.exe",
      env: { ELECTRON_RUN_AS_NODE: "1" },
      shell: false,
    };

    await expect(
      resolveCodexCliLaunch({
        platform: "win32",
        resolveCommand: vi.fn().mockResolvedValue("C:\\npm\\codex.cmd"),
        resolveWindowsShim: vi.fn().mockResolvedValue(verifiedLaunch),
      }),
    ).resolves.toEqual(verifiedLaunch);
  });
});
