// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGitRepositoryInfo: vi.fn(),
  getProjectGitMetadata: vi.fn(),
  gitRefExists: vi.fn(),
  listProjectGitChanges: vi.fn(),
  runGhCommand: vi.fn(),
  runGitCommand: vi.fn(),
}));

vi.mock("./core.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./core.js")>()),
  getGitRepositoryInfo: mocks.getGitRepositoryInfo,
  getProjectGitMetadata: mocks.getProjectGitMetadata,
  gitRefExists: mocks.gitRefExists,
  listProjectGitChanges: mocks.listProjectGitChanges,
  runGhCommand: mocks.runGhCommand,
  runGitCommand: mocks.runGitCommand,
}));

import { createProjectPullRequest } from "./actions.js";

describe("createProjectPullRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGitRepositoryInfo.mockResolvedValue({
      branch: "feature/release-ready",
      isRepo: true,
      repoRoot: "/canonical/repository",
    });
    mocks.getProjectGitMetadata.mockResolvedValue({
      aheadCount: 1,
      baseBranch: "main",
      behindCount: 0,
      remoteName: "origin",
      upstreamBranch: "origin/feature/release-ready",
    });
    mocks.gitRefExists.mockResolvedValue(true);
    mocks.runGitCommand.mockImplementation(async (_cwd, args) => ({
      ok: true,
      stderr: "",
      stdout: args[0] === "log" ? "Prepare release\n" : "2 files changed\n",
    }));
    mocks.runGhCommand.mockResolvedValue({
      ok: true,
      stderr: "",
      stdout: "https://github.com/example/cly/pull/42\n",
    });
    mocks.listProjectGitChanges.mockResolvedValue({
      branch: "feature/release-ready",
      changes: [],
      isRepo: true,
      repoRoot: "/canonical/repository",
    });
  });

  it("runs gh pr create from the canonical repository root", async () => {
    const result = await createProjectPullRequest("/selected/subdirectory", {
      baseBranch: "main",
      draft: false,
      title: "Ship the release",
    });

    expect(mocks.runGhCommand).toHaveBeenCalledWith(
      "/canonical/repository",
      expect.arrayContaining([
        "pr",
        "create",
        "--base",
        "main",
        "--head",
        "feature/release-ready",
        "--title",
        "Ship the release",
      ]),
    );
    expect(result.url).toBe("https://github.com/example/cly/pull/42");
  });
});
