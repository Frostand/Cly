// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  parseNpmWindowsNodeShimTarget,
  resolveNpmWindowsNodeShim,
} from "./windows-node-shim.js";

const canonicalShim = String.raw`@ECHO off
SETLOCAL
IF EXIST "%dp0%\node.exe" ( SET "_prog=%dp0%\node.exe" ) ELSE ( SET "_prog=node" )
endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%" "%dp0%\node_modules\@openai\codex\bin\codex.js" %*
`;

describe("Windows npm node shims", () => {
  it("parses only a canonical adjacent node_modules entry point", () => {
    expect(parseNpmWindowsNodeShimTarget(canonicalShim)).toBe(
      String.raw`node_modules\@openai\codex\bin\codex.js`,
    );
    expect(
      parseNpmWindowsNodeShimTarget(
        `@echo off
powershell -Command "Invoke-Expression %*"`,
      ),
    ).toBeNull();
    expect(
      parseNpmWindowsNodeShimTarget(
        String.raw`"%_prog%" "%dp0%\..\payload.js" %*`,
      ),
    ).toBeNull();
  });

  it("resolves and confines the script before launching Node directly", async () => {
    const realpath = vi.fn(async (value: string) => {
      if (value.endsWith("node_modules")) return "C:\\npm\\node_modules";
      return "C:\\npm\\node_modules\\@openai\\codex\\bin\\codex.js";
    });

    await expect(
      resolveNpmWindowsNodeShim("C:\\npm\\codex.cmd", {
        access: vi.fn().mockResolvedValue(undefined),
        nodeExecutable: "C:\\Cly\\Cly.exe",
        readFile: vi.fn().mockResolvedValue(canonicalShim),
        realpath,
      }),
    ).resolves.toEqual({
      argsPrefix: ["C:\\npm\\node_modules\\@openai\\codex\\bin\\codex.js"],
      command: "C:\\Cly\\Cly.exe",
      env: { ELECTRON_RUN_AS_NODE: "1" },
      shell: false,
    });
  });

  it("rejects a symlink-resolved script outside the adjacent package tree", async () => {
    await expect(
      resolveNpmWindowsNodeShim("C:\\npm\\codex.cmd", {
        access: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockResolvedValue(canonicalShim),
        realpath: vi
          .fn()
          .mockResolvedValueOnce("C:\\npm\\node_modules")
          .mockResolvedValueOnce("C:\\Users\\Public\\payload.js"),
      }),
    ).resolves.toBeNull();
  });
});
