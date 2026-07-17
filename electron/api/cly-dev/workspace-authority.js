import { createProjectAuthorityResolver } from "../project-git/authority.js";
import { resolveRegisteredProjectWorktree } from "../project-git/worktree-authority.js";

export const createClyDevWorkspaceAuthorityResolver = ({
  resolveAlternateProjectPath = resolveRegisteredProjectWorktree,
  resolveProjectPathById,
} = {}) => {
  const resolveProjectPath = createProjectAuthorityResolver({
    resolveAlternateProjectPath,
    resolveProjectPathById,
  });

  return async ({ projectId, localOnly }) => {
    if (
      !localOnly ||
      typeof localOnly.repositoryPath !== "string" ||
      typeof localOnly.worktreePath !== "string"
    ) {
      throw new Error("Cly Dev workspace paths are unavailable.");
    }

    const [repositoryPath, worktreePath] = await Promise.all([
      resolveProjectPath({ projectId, projectPath: localOnly.repositoryPath }),
      resolveProjectPath({ projectId, projectPath: localOnly.worktreePath }),
    ]);
    return { repositoryPath, worktreePath };
  };
};

export const resolveClyDevWorkspaceAuthority =
  createClyDevWorkspaceAuthorityResolver();
