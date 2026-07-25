// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getCodexAppTurnSandboxPolicy } from "./codex-common.js";

describe("Codex turn sandbox policy", () => {
  it("limits writable roots and does not request full-disk read authority", () => {
    const policy = getCodexAppTurnSandboxPolicy({
      projectPath: "/authorized/project",
    });

    expect(policy).toEqual({
      excludeSlashTmp: true,
      excludeTmpdirEnvVar: true,
      networkAccess: false,
      type: "workspaceWrite",
      writableRoots: ["/authorized/project"],
    });
    expect(policy).not.toHaveProperty("readOnlyAccess");
  });
});
