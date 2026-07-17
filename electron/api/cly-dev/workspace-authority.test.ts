// @vitest-environment node
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => tmpdir() },
}));

import { ProjectAuthorityRegistry } from "../../project-authority-registry.js";
import { createClyDevWorkspaceAuthorityResolver } from "./workspace-authority.js";

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

describe("Cly Dev workspace authority", () => {
  it("canonicalizes a registered project root and rejects another directory", async () => {
    const projectRoot = temporaryDirectory("cly-dev-authorized-");
    const arbitraryRoot = temporaryDirectory("cly-dev-arbitrary-");
    const registry = new ProjectAuthorityRegistry();
    registry.hydrate({
      projects: [{ id: "project-1", path: projectRoot }],
      closedProjects: [],
    });
    const resolveAuthority = createClyDevWorkspaceAuthorityResolver({
      resolveAlternateProjectPath: async () => null,
      resolveProjectPathById: registry.resolveProjectPathById,
    });

    await expect(
      resolveAuthority({
        projectId: "project-1",
        localOnly: {
          repositoryPath: projectRoot,
          worktreePath: projectRoot,
        },
      }),
    ).resolves.toEqual({
      repositoryPath: realpathSync(projectRoot),
      worktreePath: realpathSync(projectRoot),
    });
    await expect(
      resolveAuthority({
        projectId: "project-1",
        localOnly: {
          repositoryPath: projectRoot,
          worktreePath: arbitraryRoot,
        },
      }),
    ).rejects.toThrow("does not match the persisted project");
  });
});
