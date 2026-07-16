import { constants, existsSync } from "node:fs";
import { access } from "node:fs/promises";
import { execFileAsync, resolveCliCommandPath } from "../shared/cli.js";

const actions = (...items) => items;
const blocked = (status, summary, availableActions, checks = []) => ({
  status,
  blocking: true,
  checks: [...checks, { id: status, status: "fail", summary }],
  actions: availableActions,
});
const passed = (checks, id, summary) => [
  ...checks,
  { id, status: "pass", summary },
];

export function normalizeGitRemoteUrl(value) {
  const remote = typeof value === "string" ? value.trim() : "";
  if (!remote) return null;
  const scp = remote.match(/^(?:[^@]+@)?([^:]+):(.+)$/);
  if (scp && !remote.includes("://")) {
    return `${scp[1].toLowerCase()}/${scp[2]}`
      .replace(/\.git\/?$/i, "")
      .replace(/\/$/, "");
  }
  try {
    const url = new URL(remote);
    return `${url.hostname.toLowerCase()}${url.pathname}`
      .replace(/\.git\/?$/i, "")
      .replace(/\/$/, "");
  } catch {
    return remote.replace(/\.git\/?$/i, "").replace(/\/$/, "");
  }
}

const runGitCommand = async (cwd, args) => {
  try {
    const result = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      ok: false,
      error,
      stdout: typeof error?.stdout === "string" ? error.stdout : "",
      stderr: typeof error?.stderr === "string" ? error.stderr : "",
    };
  }
};

export async function inspectGitResumeDestination(
  { envelope, destination, offline = false },
  {
    pathExists = existsSync,
    assertWritable = (target) =>
      access(target, constants.R_OK | constants.W_OK),
    toolResolver = async (tool) => Boolean(await resolveCliCommandPath(tool)),
    runGit = runGitCommand,
  } = {},
) {
  const destinationPath = destination?.path;
  let checks = [];
  if (!destinationPath || !pathExists(destinationPath)) {
    return blocked(
      "missing-repository",
      "The repository is not available on this machine.",
      actions("clone", "defer", "return-to-source"),
    );
  }
  try {
    await assertWritable(destinationPath);
    checks = passed(
      checks,
      "permissions",
      "Repository is readable and writable.",
    );
  } catch {
    return blocked(
      "permission-denied",
      "Cly cannot read and write the selected repository.",
      actions("defer", "return-to-source"),
      checks,
    );
  }

  const root = await runGit(destinationPath, ["rev-parse", "--show-toplevel"]);
  if (!root.ok) {
    return blocked(
      "missing-repository",
      "The selected folder is not a Git repository.",
      actions("clone", "defer", "return-to-source"),
      checks,
    );
  }
  checks = passed(checks, "repository", "Git repository located.");

  const remote = await runGit(destinationPath, ["remote", "get-url", "origin"]);
  const expectedRemote = normalizeGitRemoteUrl(envelope.repository.remoteUrl);
  const actualRemote = normalizeGitRemoteUrl(remote.stdout);
  if (!remote.ok || (expectedRemote && expectedRemote !== actualRemote)) {
    return blocked(
      "remote-mismatch",
      "The destination remote does not match the handed-off repository.",
      actions("clone", "defer", "return-to-source"),
      checks,
    );
  }
  checks = passed(checks, "remote", "Repository remote matches.");

  const status = await runGit(destinationPath, [
    "status",
    "--porcelain=v2",
    "--untracked-files=all",
  ]);
  if (!status.ok || status.stdout.trim()) {
    return blocked(
      "uncommitted-work",
      "The destination has uncommitted work; Cly will not overwrite or copy it.",
      actions(
        "inspect-changes",
        "create-worktree",
        "defer",
        "return-to-source",
      ),
      checks,
    );
  }
  checks = passed(checks, "working-tree", "Working tree is clean.");

  const commit = await runGit(destinationPath, [
    "cat-file",
    "-e",
    `${envelope.commit.sha}^{commit}`,
  ]);
  if (!commit.ok) {
    return blocked(
      offline ? "offline" : "commit-missing",
      offline
        ? "The handed-off commit is unavailable while this machine is offline."
        : "The handed-off commit is not available locally.",
      offline
        ? actions("defer", "return-to-source")
        : actions("fetch", "defer", "return-to-source"),
      checks,
    );
  }
  checks = passed(checks, "commit", "Handed-off commit is available.");

  const [branch, head] = await Promise.all([
    runGit(destinationPath, ["branch", "--show-current"]),
    runGit(destinationPath, ["rev-parse", "HEAD"]),
  ]);
  if (
    !branch.ok ||
    !head.ok ||
    branch.stdout.trim() !== envelope.worktree.branch ||
    head.stdout.trim().toLowerCase() !== envelope.commit.sha.toLowerCase()
  ) {
    return blocked(
      "divergent-branch",
      "The checked-out branch or commit diverges from the handed-off task.",
      actions(
        "create-branch",
        "create-worktree",
        "inspect-changes",
        "defer",
        "return-to-source",
      ),
      checks,
    );
  }
  checks = passed(checks, "branch", "Branch and commit match the handoff.");

  const submodules = await runGit(destinationPath, [
    "submodule",
    "status",
    "--recursive",
  ]);
  if (!submodules.ok || /^[-+U]/m.test(submodules.stdout)) {
    return blocked(
      "submodule-mismatch",
      "One or more submodules do not match the handed-off commit.",
      actions("fetch", "inspect-changes", "defer", "return-to-source"),
      checks,
    );
  }
  checks = passed(checks, "submodules", "Submodules match.");

  const missingTools = [];
  for (const tool of destination.requiredTools ?? []) {
    if (!(await toolResolver(tool))) missingTools.push(tool);
  }
  if (missingTools.length) {
    return {
      ...blocked(
        "tool-missing",
        `Required tools are unavailable: ${missingTools.join(", ")}.`,
        actions("defer", "return-to-source"),
        checks,
      ),
      missingTools,
    };
  }
  checks = passed(checks, "tools", "Required tools are available.");
  return { status: "ready", blocking: false, checks, actions: [] };
}
