import { promises as fs } from "node:fs";
import path from "node:path";
import { listProjectGitWorktrees } from "./core.js";

const normalizedPathKey = (value) => {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
};

const canonicalDirectory = async (value) => {
  try {
    const canonicalPath = await fs.realpath(path.resolve(value));
    return (await fs.stat(canonicalPath)).isDirectory() ? canonicalPath : null;
  } catch {
    return null;
  }
};

/**
 * Treat a linked Git worktree as a derived project capability. The renderer's
 * path is only a selector: Git's main-process-owned worktree registry must
 * independently list the exact canonical directory under the registered root.
 */
export async function resolveRegisteredProjectWorktree({
  projectPath,
  projectRoot,
}) {
  const submittedPath = await canonicalDirectory(projectPath);
  const canonicalRoot = await canonicalDirectory(projectRoot);
  if (!submittedPath || !canonicalRoot) return null;

  try {
    const { worktrees } = await listProjectGitWorktrees(canonicalRoot);
    for (const worktree of worktrees) {
      if (worktree.bare || typeof worktree.path !== "string") continue;
      const candidate = await canonicalDirectory(worktree.path);
      if (
        candidate &&
        normalizedPathKey(candidate) === normalizedPathKey(submittedPath)
      ) {
        return candidate;
      }
    }
  } catch {
    // A missing or invalid Git registry never broadens path authority.
  }
  return null;
}
