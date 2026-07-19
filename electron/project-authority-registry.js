import { realpathSync, statSync } from "node:fs";
import path from "node:path";

const normalizePathKey = (value) => {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
};

const normalizeProjectId = (value) =>
  typeof value === "string" && value.trim().length <= 200 ? value.trim() : "";

const getStateProjects = (state) => [
  ...(Array.isArray(state?.projects) ? state.projects : []),
  ...(Array.isArray(state?.closedProjects) ? state.closedProjects : []),
];

export class ProjectAuthorityRegistry {
  #pendingPaths = new Map();
  #projects = new Map();

  #inspectPath(value, { requireExisting = true } = {}) {
    const submittedPath =
      typeof value === "string" && value.trim() ? path.resolve(value) : "";
    if (!submittedPath) {
      throw new Error("Project path is required.");
    }

    try {
      const canonicalPath = realpathSync(submittedPath);
      if (!statSync(canonicalPath).isDirectory()) {
        throw new Error("Project path must point to a directory.");
      }
      return {
        canonicalKey: normalizePathKey(canonicalPath),
        canonicalPath,
        submittedKey: normalizePathKey(submittedPath),
        submittedPath,
      };
    } catch (error) {
      if (requireExisting) {
        throw new Error("Project path is unavailable.", { cause: error });
      }
      return {
        canonicalKey: null,
        canonicalPath: null,
        submittedKey: normalizePathKey(submittedPath),
        submittedPath,
      };
    }
  }

  hydrate(state) {
    this.#pendingPaths.clear();
    this.#projects.clear();

    for (const project of getStateProjects(state)) {
      const projectId = normalizeProjectId(project?.id);
      if (!projectId || typeof project?.path !== "string") continue;
      const inspected = this.#inspectPath(project.path, {
        requireExisting: false,
      });
      const existing = this.#projects.get(projectId);
      if (
        existing &&
        existing.submittedKey !== inspected.submittedKey &&
        (!existing.canonicalKey ||
          existing.canonicalKey !== inspected.canonicalKey)
      ) {
        throw new Error(
          `Project ${projectId} has conflicting persisted roots.`,
        );
      }
      this.#projects.set(projectId, existing ?? inspected);
    }
  }

  authorizePathForRegistration(projectPath) {
    const inspected = this.#inspectPath(projectPath);
    this.#pendingPaths.set(inspected.canonicalKey, inspected);
    return inspected.canonicalPath;
  }

  validateState(state) {
    const additions = [];
    const claimedIds = new Map();

    for (const project of getStateProjects(state)) {
      const projectId = normalizeProjectId(project?.id);
      if (!projectId || typeof project?.path !== "string") {
        throw new Error("Persisted projects require a valid id and path.");
      }

      const inspected = this.#inspectPath(project.path, {
        requireExisting: false,
      });
      const priorClaim = claimedIds.get(projectId);
      if (
        priorClaim &&
        priorClaim.submittedKey !== inspected.submittedKey &&
        (!priorClaim.canonicalKey ||
          priorClaim.canonicalKey !== inspected.canonicalKey)
      ) {
        throw new Error(`Project ${projectId} cannot claim multiple roots.`);
      }
      claimedIds.set(projectId, priorClaim ?? inspected);

      const existing = this.#projects.get(projectId);
      if (existing) {
        const sameSubmittedPath =
          existing.submittedKey === inspected.submittedKey;
        const sameCanonicalPath =
          existing.canonicalKey &&
          inspected.canonicalKey &&
          existing.canonicalKey === inspected.canonicalKey;
        if (!sameSubmittedPath && !sameCanonicalPath) {
          throw new Error(
            `Project ${projectId} cannot change its authorized root.`,
          );
        }
        continue;
      }

      const authorizedExistingRoot = [...this.#projects.values()].find(
        (record) =>
          (record.canonicalKey &&
            inspected.canonicalKey &&
            record.canonicalKey === inspected.canonicalKey) ||
          record.submittedKey === inspected.submittedKey,
      );
      const pending = inspected.canonicalKey
        ? this.#pendingPaths.get(inspected.canonicalKey)
        : this.#pendingPaths.get(inspected.submittedKey);
      const authority = pending ?? authorizedExistingRoot;
      if (!authority) {
        throw new Error(
          `Project ${projectId} root was not selected or created by Cly.`,
        );
      }
      additions.push({ projectId, record: authority });
    }

    for (const { projectId, record } of additions) {
      this.#projects.set(projectId, record);
      if (record.canonicalKey) this.#pendingPaths.delete(record.canonicalKey);
      this.#pendingPaths.delete(record.submittedKey);
    }
    for (const projectId of this.#projects.keys()) {
      if (!claimedIds.has(projectId)) this.#projects.delete(projectId);
    }
    return state;
  }

  resolveProjectPathById = ({ projectId } = {}) => {
    const record = this.#projects.get(normalizeProjectId(projectId));
    if (!record) return null;

    const trustedPath = record.canonicalPath ?? record.submittedPath;
    try {
      const current = this.#inspectPath(trustedPath);
      if (record.canonicalKey && current.canonicalKey !== record.canonicalKey) {
        return null;
      }
      if (!record.canonicalKey) {
        record.canonicalKey = current.canonicalKey;
        record.canonicalPath = current.canonicalPath;
      }
      return current.canonicalPath;
    } catch {
      return null;
    }
  };

  hasProject(projectId) {
    return this.#projects.has(normalizeProjectId(projectId));
  }
}

export const projectAuthorityRegistry = new ProjectAuthorityRegistry();
