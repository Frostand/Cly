// @vitest-environment node
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createClaudePermissionHandler,
  isClaudeProjectPathAuthorized,
} from "./claude-stream.js";

const directories: string[] = [];
const temporaryDirectory = (prefix: string) => {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  directories.push(directory);
  return directory;
};

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("Claude accept-edits filesystem authority", () => {
  it("allows project files but denies absolute, traversal, and symlink escapes", async () => {
    const projectRoot = temporaryDirectory("cly-claude-project-");
    const outsideRoot = temporaryDirectory("cly-claude-outside-");
    mkdirSync(path.join(projectRoot, "src"));
    writeFileSync(path.join(projectRoot, "src", "inside.ts"), "inside\n");
    const outsideFile = path.join(outsideRoot, "secret.txt");
    writeFileSync(outsideFile, "secret\n");
    symlinkSync(outsideRoot, path.join(projectRoot, "outside-link"), "dir");

    await expect(
      isClaudeProjectPathAuthorized({
        input: { file_path: "src/inside.ts" },
        projectPath: projectRoot,
        toolName: "Read",
      }),
    ).resolves.toBe(true);
    await expect(
      isClaudeProjectPathAuthorized({
        input: { file_path: "src/new.ts" },
        projectPath: projectRoot,
        toolName: "Write",
      }),
    ).resolves.toBe(true);
    await expect(
      isClaudeProjectPathAuthorized({
        input: { file_path: outsideFile },
        projectPath: projectRoot,
        toolName: "Read",
      }),
    ).resolves.toBe(false);
    await expect(
      isClaudeProjectPathAuthorized({
        input: { file_path: "outside-link/secret.txt" },
        projectPath: projectRoot,
        toolName: "Read",
      }),
    ).resolves.toBe(false);
    await expect(
      isClaudeProjectPathAuthorized({
        input: { path: projectRoot, pattern: "../../*" },
        projectPath: projectRoot,
        toolName: "Glob",
      }),
    ).resolves.toBe(false);
  });

  it("fails closed on edits and commands in authoritative plan mode", async () => {
    const projectRoot = temporaryDirectory("cly-claude-plan-");
    writeFileSync(path.join(projectRoot, "inside.ts"), "inside\n");
    const handler = createClaudePermissionHandler(
      { write() {} },
      {
        mode: "plan",
        projectId: "project-1",
        projectPath: projectRoot,
        runId: "run-1",
      },
    );

    await expect(
      handler("Read", { file_path: "inside.ts" }, { toolUseID: "read-1" }),
    ).resolves.toMatchObject({ behavior: "allow" });
    await expect(
      handler(
        "Write",
        { content: "changed", file_path: "inside.ts" },
        { toolUseID: "write-1" },
      ),
    ).resolves.toMatchObject({ behavior: "deny" });
    await expect(
      handler(
        "Bash",
        { command: "cat ~/.ssh/id_ed25519" },
        { toolUseID: "bash-1" },
      ),
    ).resolves.toMatchObject({ behavior: "deny" });
    await expect(
      handler("ExitPlanMode", {}, { toolUseID: "exit-1" }),
    ).resolves.toMatchObject({ behavior: "deny" });
  });
});
