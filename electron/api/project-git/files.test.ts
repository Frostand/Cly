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

import { resolveProjectPath } from "./files.js";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function createFixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "cly-project-path-"));
  tempDirectories.push(directory);
  const projectRoot = path.join(directory, "project");
  const outsideRoot = path.join(directory, "outside");
  mkdirSync(projectRoot);
  mkdirSync(outsideRoot);
  return { outsideRoot, projectRoot };
}

describe("resolveProjectPath", () => {
  it("rejects an existing file symlink that escapes the project", () => {
    const { outsideRoot, projectRoot } = createFixture();
    const outsideFile = path.join(outsideRoot, "secret.txt");
    writeFileSync(outsideFile, "secret\n");
    symlinkSync(outsideFile, path.join(projectRoot, "linked-secret.txt"));

    expect(() => resolveProjectPath(projectRoot, "linked-secret.txt")).toThrow(
      "Path is outside of the project root.",
    );
  });

  it("rejects a missing write target beneath an escaping directory symlink", () => {
    const { outsideRoot, projectRoot } = createFixture();
    symlinkSync(outsideRoot, path.join(projectRoot, "linked-directory"), "dir");

    expect(() =>
      resolveProjectPath(projectRoot, "linked-directory/new-secret.txt"),
    ).toThrow("Path is outside of the project root.");
  });

  it("allows symlinks whose canonical target remains inside the project", () => {
    const { projectRoot } = createFixture();
    const internalDirectory = path.join(projectRoot, "internal");
    mkdirSync(internalDirectory);
    symlinkSync(
      internalDirectory,
      path.join(projectRoot, "internal-link"),
      "dir",
    );

    expect(resolveProjectPath(projectRoot, "internal-link/new-file.txt")).toBe(
      path.join(projectRoot, "internal-link", "new-file.txt"),
    );
  });
});
