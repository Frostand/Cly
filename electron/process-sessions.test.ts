// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  spawnProcess: vi.fn(),
  spawnPty: vi.fn(),
}));

vi.mock("node:child_process", () => ({ spawn: mocks.spawnProcess }));
vi.mock("node-pty", () => ({ spawn: mocks.spawnPty }));

import {
  createProcessSessionManager,
  resolveApprovedTerminalShell,
} from "./process-sessions.js";

class FakePty {
  dataListener: (chunk: string) => void = () => {};
  exitListener: (event: { exitCode: number; signal?: number }) => void =
    () => {};
  kill = vi.fn();
  pid: number;
  resize = vi.fn();
  write = vi.fn();

  constructor(pid: number) {
    this.pid = pid;
  }

  onData(listener: (chunk: string) => void) {
    this.dataListener = listener;
  }

  onExit(listener: (event: { exitCode: number; signal?: number }) => void) {
    this.exitListener = listener;
  }
}

describe("process session replacement", () => {
  beforeEach(() => {
    mocks.spawnProcess.mockReset();
    mocks.spawnPty.mockReset();
  });

  it("does not let a replaced PTY remove or emit output for its successor", () => {
    const first = new FakePty(201);
    const second = new FakePty(202);
    mocks.spawnPty.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const sendToRenderer = vi.fn();
    const manager = createProcessSessionManager({ sendToRenderer });

    manager.startTerminal({
      command: "",
      cwd: "/tmp",
      projectId: "project-a",
      shellPath: "/bin/zsh",
    });
    manager.startTerminal({
      command: "",
      cwd: "/tmp",
      projectId: "project-a",
      shellPath: "/bin/zsh",
    });
    sendToRenderer.mockClear();

    first.dataListener("stale output");
    first.exitListener({ exitCode: 0 });
    manager.writeTerminalInput({ data: "pwd\r", projectId: "project-a" });
    manager.stopTerminalSession("project-a");

    expect(sendToRenderer).not.toHaveBeenCalledWith(
      "terminal:data",
      expect.objectContaining({ chunk: "stale output" }),
    );
    expect(second.write).toHaveBeenCalledWith("pwd\r");
    expect(second.kill).toHaveBeenCalledOnce();
  });

  it("never launches a renderer-configured executable or shell arguments", () => {
    const terminal = new FakePty(301);
    mocks.spawnPty.mockReturnValue(terminal);
    const manager = createProcessSessionManager({ sendToRenderer: vi.fn() });

    manager.startTerminal({
      command: "",
      cwd: "/tmp",
      projectId: "project-a",
      shellPath: "/tmp/project-shell --execute attacker-command",
    });

    expect(mocks.spawnPty).toHaveBeenCalled();
    expect(mocks.spawnPty.mock.calls[0]?.[0]).not.toBe("/tmp/project-shell");
    expect(resolveApprovedTerminalShell("/bin/sh -c attacker-command")).toBe(
      null,
    );
    expect(resolveApprovedTerminalShell("/tmp/project-shell")).toBe(null);
  });
});
