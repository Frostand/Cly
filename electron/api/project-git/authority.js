import { realpathSync } from "node:fs";
import path from "node:path";
import { projectAuthorityRegistry } from "../../project-authority-registry.js";

export class ProjectAuthorityError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ProjectAuthorityError";
    this.status = status;
  }
}

const normalizeAuthorityPath = (value) => {
  let resolved = path.resolve(value);
  try {
    resolved = realpathSync(resolved);
  } catch {
    // Preserve the submitted absolute path so an unavailable or forged path
    // still fails the comparison with the registered canonical root.
  }
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
};

export const createProjectAuthorityResolver = ({
  resolveAlternateProjectPath,
  resolveProjectPathById = projectAuthorityRegistry.resolveProjectPathById,
} = {}) => {
  return async ({ projectId, projectPath }) => {
    const persistedProjectPath = await resolveProjectPathById({ projectId });
    if (
      typeof persistedProjectPath !== "string" ||
      !persistedProjectPath.trim()
    ) {
      throw new ProjectAuthorityError("Unknown projectId.", 404);
    }

    const canonicalProjectPath = path.resolve(persistedProjectPath);
    if (
      projectPath &&
      normalizeAuthorityPath(projectPath) !==
        normalizeAuthorityPath(canonicalProjectPath)
    ) {
      const alternateProjectPath = await resolveAlternateProjectPath?.({
        projectId,
        projectPath,
        projectRoot: canonicalProjectPath,
      });
      if (
        alternateProjectPath &&
        normalizeAuthorityPath(projectPath) ===
          normalizeAuthorityPath(alternateProjectPath)
      ) {
        return path.resolve(alternateProjectPath);
      }
      throw new ProjectAuthorityError(
        "projectPath does not match the persisted project.",
        409,
      );
    }

    return canonicalProjectPath;
  };
};
