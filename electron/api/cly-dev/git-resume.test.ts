// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  inspectGitResumeDestination,
  normalizeGitRemoteUrl,
} from "./git-resume.js";

const sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const envelope = {
  repository: { id: "repo-1", remoteUrl: "git@github.com:cly/repo.git" },
  worktree: { id: "wt-1", branch: "feature/resume", baseRef: "main" },
  commit: { sha },
};

const responses = (
  overrides: Record<string, { ok: boolean; stdout?: string }> = {},
) => ({
  "rev-parse --show-toplevel": { ok: true, stdout: "/repo\n" },
  "remote get-url origin": {
    ok: true,
    stdout: "https://github.com/cly/repo.git\n",
  },
  "status --porcelain=v2 --untracked-files=all": { ok: true, stdout: "" },
  [`cat-file -e ${sha}^{commit}`]: { ok: true, stdout: "" },
  "branch --show-current": { ok: true, stdout: "feature/resume\n" },
  "rev-parse HEAD": { ok: true, stdout: `${sha}\n` },
  "submodule status --recursive": { ok: true, stdout: "" },
  ...overrides,
});

const inspect = (
  overrides = {},
  options: Record<string, unknown> = {},
  dependencyOverrides: Record<string, unknown> = {},
) => {
  const commandResponses = responses(overrides);
  return inspectGitResumeDestination(
    {
      envelope,
      destination: { path: "/repo", requiredTools: ["node", "git"] },
      ...options,
    },
    {
      pathExists: () => true,
      assertWritable: () => undefined,
      toolResolver: async () => true,
      runGit: async (_cwd: string, args: string[]) =>
        commandResponses[args.join(" ")] ?? { ok: false, stdout: "" },
      ...dependencyOverrides,
    },
  );
};

describe("Git resume readiness", () => {
  it("normalizes common SSH and HTTPS remote identities", () => {
    expect(normalizeGitRemoteUrl("git@github.com:cly/repo.git")).toBe(
      "github.com/cly/repo",
    );
    expect(normalizeGitRemoteUrl("https://github.com/cly/repo.git/")).toBe(
      "github.com/cly/repo",
    );
  });

  it("accepts a clean repository at the handed-off commit", async () => {
    await expect(inspect()).resolves.toMatchObject({
      status: "ready",
      blocking: false,
      actions: [],
    });
  });

  it.each([
    [
      "remote-mismatch",
      {
        "remote get-url origin": {
          ok: true,
          stdout: "https://github.com/other/repo.git\n",
        },
      },
      ["clone", "defer", "return-to-source"],
    ],
    [
      "uncommitted-work",
      {
        "status --porcelain=v2 --untracked-files=all": {
          ok: true,
          stdout: "? local-only.txt\n",
        },
      },
      ["inspect-changes", "create-worktree", "defer", "return-to-source"],
    ],
    [
      "commit-missing",
      { [`cat-file -e ${sha}^{commit}`]: { ok: false, stdout: "" } },
      ["fetch", "defer", "return-to-source"],
    ],
    [
      "divergent-branch",
      { "rev-parse HEAD": { ok: true, stdout: `${"b".repeat(40)}\n` } },
      [
        "create-branch",
        "create-worktree",
        "inspect-changes",
        "defer",
        "return-to-source",
      ],
    ],
    [
      "submodule-mismatch",
      {
        "submodule status --recursive": {
          ok: true,
          stdout: "+bbbb dependency\n",
        },
      },
      ["fetch", "inspect-changes", "defer", "return-to-source"],
    ],
  ])("blocks %s with explicit safe actions", async (status, overrides, actions) => {
    await expect(inspect(overrides)).resolves.toMatchObject({
      status,
      blocking: true,
      actions,
    });
  });

  it("distinguishes offline commit lookup from a missing commit", async () => {
    await expect(
      inspect(
        { [`cat-file -e ${sha}^{commit}`]: { ok: false, stdout: "" } },
        { offline: true },
      ),
    ).resolves.toMatchObject({
      status: "offline",
      actions: ["defer", "return-to-source"],
    });
  });

  it("blocks missing repositories, permissions, and tools", async () => {
    await expect(
      inspectGitResumeDestination(
        { envelope, destination: { path: "/missing", requiredTools: [] } },
        { pathExists: () => false },
      ),
    ).resolves.toMatchObject({
      status: "missing-repository",
      actions: ["clone", "defer", "return-to-source"],
    });

    await expect(
      inspectGitResumeDestination(
        { envelope, destination: { path: "/repo", requiredTools: [] } },
        {
          pathExists: () => true,
          assertWritable: () => {
            throw new Error("denied");
          },
        },
      ),
    ).resolves.toMatchObject({ status: "permission-denied" });

    await expect(
      inspect(
        {},
        { destination: { path: "/repo", requiredTools: ["missing-tool"] } },
        { toolResolver: async () => false },
      ),
    ).resolves.toMatchObject({ status: "tool-missing" });
  });
});
