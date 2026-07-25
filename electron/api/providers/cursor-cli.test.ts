// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execCliCommand: vi.fn(),
  getCliVersion: vi.fn(),
  resolveCliCommandPath: vi.fn(),
}));

vi.mock("../shared/cli.js", () => ({
  execCliCommand: mocks.execCliCommand,
  getCliVersion: mocks.getCliVersion,
  resolveCliCommandPath: mocks.resolveCliCommandPath,
}));

import { getCursorCliCommand } from "./cursor-cli.js";

describe("Cursor CLI resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execCliCommand.mockResolvedValue({
      stderr: "",
      stdout: "Cursor Agent CLI",
    });
    mocks.resolveCliCommandPath.mockImplementation(async (command: string) =>
      command === "cursor-agent" ? "/resolved/bin/cursor-agent" : null,
    );
  });

  it("returns the resolved executable path rather than a bare command", async () => {
    await expect(getCursorCliCommand({ force: true })).resolves.toBe(
      "/resolved/bin/cursor-agent",
    );
    expect(mocks.execCliCommand).not.toHaveBeenCalled();
  });

  it("accepts the legacy generic agent name only after validating its help", async () => {
    mocks.resolveCliCommandPath.mockImplementation(async (command: string) =>
      command === "agent" ? "/resolved/bin/agent" : null,
    );

    await expect(getCursorCliCommand({ force: true })).resolves.toBe(
      "/resolved/bin/agent",
    );
    expect(mocks.execCliCommand).toHaveBeenCalledWith(
      "/resolved/bin/agent",
      ["--help"],
      { timeout: 3000 },
    );
  });
});
