// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { terminateProcessTree } from "./process-tree.js";

describe("provider process-tree termination", () => {
  it("sends a graceful signal to the POSIX process group, then force kills it", () => {
    const scheduled: Array<() => void> = [];
    const killProcess = vi.fn();
    const child = { pid: 4321, once: vi.fn() };

    terminateProcessTree(child, {
      graceMs: 100,
      killProcess,
      platform: "darwin",
      schedule: (callback: () => void) => {
        scheduled.push(callback);
        return 1;
      },
    });

    expect(killProcess).toHaveBeenCalledWith(-4321, "SIGTERM");
    scheduled[0]();
    expect(killProcess).toHaveBeenLastCalledWith(-4321, "SIGKILL");
  });

  it("uses taskkill for the Windows tree and adds force only after the bound", () => {
    const scheduled: Array<() => void> = [];
    const spawnProcess = vi.fn(() => ({ once: vi.fn() }));

    terminateProcessTree(
      { pid: 987, once: vi.fn() },
      {
        platform: "win32",
        schedule: (callback: () => void) => {
          scheduled.push(callback);
          return 1;
        },
        spawnProcess,
      },
    );

    expect(spawnProcess).toHaveBeenCalledWith(
      "taskkill",
      ["/pid", "987", "/t"],
      expect.objectContaining({ stdio: "ignore" }),
    );
    scheduled[0]();
    expect(spawnProcess).toHaveBeenLastCalledWith(
      "taskkill",
      ["/pid", "987", "/t", "/f"],
      expect.objectContaining({ stdio: "ignore" }),
    );
  });
});
