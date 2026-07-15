// @vitest-environment node
import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  spawnProcess: vi.fn(),
  spawnPty: vi.fn(),
}));

vi.mock("node:child_process", () => ({ spawn: mocks.spawnProcess }));
vi.mock("node-pty", () => ({ spawn: mocks.spawnPty }));
vi.mock("electron", () => ({
  app: { getPath: () => "/tmp" },
}));

import { createProcessSessionManager } from "./process-sessions.js";

class FakeChildProcess extends EventEmitter {
  killed = false;
  kill = vi.fn(() => {
    this.killed = true;
  });
  pid: number;
  stderr = new EventEmitter();
  stdout = new EventEmitter();

  constructor(pid: number) {
    super();
    this.pid = pid;
  }
}

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

  it("does not let a replaced runner remove or emit output for its successor", () => {
    const first = new FakeChildProcess(101);
    const second = new FakeChildProcess(102);
    mocks.spawnProcess.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const sendToRenderer = vi.fn();
    const manager = createProcessSessionManager({ sendToRenderer });

    manager.startRunner({
      command: "first",
      cwd: "/tmp",
      projectId: "project-a",
      projectName: "A",
    });
    manager.startRunner({
      command: "second",
      cwd: "/tmp",
      projectId: "project-a",
      projectName: "A",
    });
    sendToRenderer.mockClear();

    first.stdout.emit("data", Buffer.from("stale output"));
    first.emit("close", 0, null);
    manager.stopRunProcess("project-a");

    expect(sendToRenderer).not.toHaveBeenCalledWith(
      "runner:data",
      expect.objectContaining({ chunk: "stale output" }),
    );
    expect(second.kill).toHaveBeenCalledOnce();
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
});
