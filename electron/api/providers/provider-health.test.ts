// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  checkClaudeAuthentication,
  checkCursorAuthentication,
  checkOpenCodeAuthentication,
  parseClaudeAuthentication,
  parseCursorAuthentication,
  parseOpenCodeAuthentication,
} from "./provider-health.js";

describe("provider health", () => {
  it("parses Claude authentication only from an explicit positive status", () => {
    expect(parseClaudeAuthentication('{"loggedIn":true}')).toBe(true);
    expect(parseClaudeAuthentication('{"authenticated":true}')).toBe(true);
    expect(parseClaudeAuthentication('{"loggedIn":false}')).toBe(false);
    expect(parseClaudeAuthentication("Not logged in")).toBe(false);
    expect(parseClaudeAuthentication("Authenticated as researcher")).toBe(true);
  });

  it("distinguishes a missing Claude CLI from an unauthenticated install", async () => {
    await expect(
      checkClaudeAuthentication({
        resolveCommand: vi.fn().mockResolvedValue(null),
      }),
    ).resolves.toEqual({ authenticated: false, installed: false });

    await expect(
      checkClaudeAuthentication({
        execCommand: vi.fn().mockResolvedValue({
          stderr: "",
          stdout: '{"loggedIn":false}',
        }),
        resolveCommand: vi.fn().mockResolvedValue("/usr/local/bin/claude"),
      }),
    ).resolves.toEqual({ authenticated: false, installed: true });
  });

  it("reports an authenticated Claude install", async () => {
    const execCommand = vi.fn().mockResolvedValue({
      stderr: "",
      stdout: '{"loggedIn":true}',
    });

    await expect(
      checkClaudeAuthentication({
        execCommand,
        resolveCommand: vi.fn().mockResolvedValue("/usr/local/bin/claude"),
      }),
    ).resolves.toEqual({ authenticated: true, installed: true });
    expect(execCommand).toHaveBeenCalledWith(
      "claude",
      ["auth", "status", "--json"],
      { signal: undefined, timeout: 5000 },
    );
  });
});

describe("Cursor provider health", () => {
  it("parses explicit Cursor login state without treating installation as authentication", () => {
    expect(
      parseCursorAuthentication("Logged in as researcher@example.com"),
    ).toBe(true);
    expect(parseCursorAuthentication("Not logged in")).toBe(false);
    expect(parseCursorAuthentication("Cursor Agent CLI 2026.07")).toBe(false);
  });

  it("reports an installed but logged-out Cursor CLI", async () => {
    const execCommand = vi.fn().mockResolvedValue({
      stderr: "",
      stdout: "Not logged in",
    });

    await expect(
      checkCursorAuthentication({
        execCommand,
        resolveCommand: vi.fn().mockResolvedValue("cursor-agent"),
      }),
    ).resolves.toEqual({ authenticated: false, installed: true });
    expect(execCommand).toHaveBeenCalledWith(["status"], {
      signal: undefined,
      timeout: 5000,
    });
  });
});

describe("OpenCode provider health", () => {
  it("parses credential counts without treating an empty store as authenticated", () => {
    expect(parseOpenCodeAuthentication("3 credentials")).toBe(true);
    expect(parseOpenCodeAuthentication("0 credentials")).toBe(false);
    expect(parseOpenCodeAuthentication("Credentials\n● DeepSeek api")).toBe(
      true,
    );
  });

  it("requires both the CLI and a configured credential", async () => {
    const execCommand = vi.fn().mockResolvedValue({
      stderr: "",
      stdout: "0 credentials",
    });
    await expect(
      checkOpenCodeAuthentication({
        execCommand,
        resolveCommand: vi.fn().mockResolvedValue("/usr/local/bin/opencode"),
      }),
    ).resolves.toEqual({ authenticated: false, installed: true });
    expect(execCommand).toHaveBeenCalledWith("opencode", ["auth", "list"], {
      signal: undefined,
      timeout: 5000,
    });
  });
});
