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
import { buildEditorArguments, resolveEditorTarget } from "./editors.js";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "cly-editor-root-"));
  const outside = mkdtempSync(path.join(tmpdir(), "cly-editor-outside-"));
  directories.push(root, outside);
  mkdirSync(path.join(root, "src"));
  writeFileSync(path.join(root, "src", "app.ts"), "export {};\n");
  writeFileSync(path.join(outside, "secret.ts"), "secret\n");
  symlinkSync(
    path.join(outside, "secret.ts"),
    path.join(root, "src", "escape.ts"),
  );
  return { root, outside };
}

describe("external editor targets", () => {
  it("builds VS Code and Cursor goto arguments for a confined file", () => {
    const { root } = fixture();
    const target = resolveEditorTarget({
      projectPath: root,
      filePath: "src/app.ts",
      line: 12,
      column: 4,
    });
    expect(target).not.toBeNull();
    if (!target) throw new Error("Expected a confined editor target.");
    expect(buildEditorArguments("vscode", target, () => [])).toEqual([
      target.repositoryPath,
      "--goto",
      `${target.filePath}:12:4`,
    ]);
  });

  it("rejects traversal, symlink escapes, control characters, and invalid lines", () => {
    const { root, outside } = fixture();
    expect(
      resolveEditorTarget({
        projectPath: root,
        filePath: path.join(outside, "secret.ts"),
      }),
    ).toBeNull();
    expect(
      resolveEditorTarget({ projectPath: root, filePath: "src/escape.ts" }),
    ).toBeNull();
    expect(
      resolveEditorTarget({ projectPath: root, filePath: "src/app.ts\0" }),
    ).toBeNull();
    expect(
      resolveEditorTarget({
        projectPath: root,
        filePath: "src/app.ts",
        line: 0,
      }),
    ).toBeNull();
  });
});
