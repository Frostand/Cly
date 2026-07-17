// @vitest-environment node
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

import { updateGenericPassword } from "./macos-keychain.js";

describe("macOS keychain writes", () => {
  it("sends the credential through stdin instead of process arguments", async () => {
    const child = new EventEmitter() as EventEmitter & {
      stderr: EventEmitter;
      stdin: EventEmitter & { end: ReturnType<typeof vi.fn> };
    };
    child.stderr = new EventEmitter();
    child.stdin = Object.assign(new EventEmitter(), { end: vi.fn() });
    const spawnProcess = vi.fn(() => child);

    const pending = updateGenericPassword(
      {
        account: "claude-user",
        password: "serialized-secret",
        service: "Claude Code-credentials",
      },
      { spawnProcess },
    );
    child.emit("close", 0);
    await pending;

    expect(spawnProcess).toHaveBeenCalledWith(
      "security",
      [
        "add-generic-password",
        "-U",
        "-a",
        "claude-user",
        "-s",
        "Claude Code-credentials",
        "-w",
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    expect(spawnProcess.mock.calls.flat()).not.toContain("serialized-secret");
    expect(child.stdin.end).toHaveBeenCalledWith("serialized-secret\n");
  });
});
