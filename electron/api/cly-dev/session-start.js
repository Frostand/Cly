import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import os from "node:os";
import { promisify } from "node:util";
import { z } from "zod";
import { getGitRepositoryInfo } from "../project-git/core.js";

const execFileAsync = promisify(execFile);

const providerSchema = z
  .object({
    id: z.enum(["openai-codex", "anthropic-claude"]),
    model: z.string().trim().min(1).max(500),
  })
  .strict();

const budgetSchema = z
  .object({
    maxInputTokens: z.number().int().min(0).optional(),
    maxOutputTokens: z.number().int().min(0).optional(),
    maxTotalTokens: z.number().int().min(0).optional(),
    maxCostMinor: z.number().int().min(0).optional(),
  })
  .strict();

export const clyDevSessionStartInputSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    objective: z.string().trim().min(1).max(20_000).optional(),
    linearIssue: z.string().trim().min(1).max(500).optional(),
    provider: providerSchema,
    researchObjectIds: z
      .array(z.string().trim().min(1).max(500))
      .max(500)
      .default([]),
    budget: budgetSchema.optional(),
  })
  .strict()
  .refine((value) => value.objective || value.linearIssue, {
    message: "Provide an objective or a Linear issue reference.",
  });

const git = async (cwd, args) => {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  return stdout.trim();
};

const platform = () => {
  const value = os.platform();
  if (["darwin", "linux", "win32"].includes(value)) return value;
  throw new Error(`Unsupported local platform: ${value}.`);
};

/**
 * Resolves immutable workspace identity in the main process. The renderer only
 * supplies task intent; project paths, Git state, and machine details stay
 * local and are checked against the registered project authority.
 */
export async function resolveClyDevSessionStartContext({
  projectId,
  researchObjectIds = [],
  getDatabase,
  resolveWorkspaceAuthority,
}) {
  const db = getDatabase();
  const project = db
    .prepare("SELECT id, name, path FROM projects WHERE id = ?")
    .get(projectId);
  if (!project) throw new Error("Project was not found.");

  const uniqueResearchObjectIds = [...new Set(researchObjectIds)];
  const findResearchObject = db.prepare(
    "SELECT id FROM research_objects WHERE id = ? AND project_id = ?",
  );
  const missingResearchObjectId = uniqueResearchObjectIds.find(
    (id) => !findResearchObject.get(id, projectId),
  );
  if (missingResearchObjectId) {
    throw new Error(
      `Research object ${missingResearchObjectId} was not found in this project.`,
    );
  }

  const localOnly = await resolveWorkspaceAuthority({
    projectId,
    localOnly: {
      repositoryPath: project.path,
      worktreePath: project.path,
    },
  });
  const repo = await getGitRepositoryInfo(localOnly.worktreePath);
  if (!repo.isRepo || !repo.repoRoot || !repo.branch) {
    throw new Error(
      "Start Cly Dev from a Git worktree registered to this project.",
    );
  }

  const [commitSha, remoteUrl] = await Promise.all([
    git(repo.repoRoot, ["rev-parse", "HEAD"]),
    git(repo.repoRoot, ["remote", "get-url", "origin"]).catch(() => null),
  ]);
  if (!/^[a-f0-9]{40,64}$/i.test(commitSha)) {
    throw new Error(
      "The registered worktree does not have a valid Git commit.",
    );
  }

  return {
    project,
    workspace: {
      repositoryPath: localOnly.repositoryPath,
      worktreePath: localOnly.worktreePath,
      branch: repo.branch,
      commitSha,
      ...(remoteUrl?.startsWith("https://") ? { remoteUrl } : {}),
    },
    machine: {
      id: os.hostname() || "local-machine",
      platform: platform(),
      architecture: os.arch(),
    },
  };
}

export function buildClyDevSessionStartAggregate(input, context) {
  const requestId = randomUUID();
  const workspaceId = `workspace-${randomUUID()}`;
  const taskTitle = input.linearIssue
    ? `${input.title} (${input.linearIssue})`
    : input.title;
  const objective =
    input.objective ?? `Resolve Linear issue ${input.linearIssue}.`;
  const researchObjectIds = [...new Set(input.researchObjectIds)];
  const repository = {
    id: `repository-${context.project.id}`,
    ...(context.workspace.remoteUrl
      ? { remoteUrl: context.workspace.remoteUrl }
      : {}),
  };
  const worktree = {
    id: `worktree-${context.project.id}`,
    branch: context.workspace.branch,
    baseRef: context.workspace.branch,
  };
  const canExecuteEffects = input.provider.id === "anthropic-claude";
  return {
    aggregate: {
      workspace: {
        schemaVersion: 1,
        idempotencyKey: `workspace-${requestId}`,
        id: workspaceId,
        name: `${context.project.name} workspace`,
        repository,
        worktree,
        machine: context.machine,
        localOnly: {
          repositoryPath: context.workspace.repositoryPath,
          worktreePath: context.workspace.worktreePath,
        },
      },
      contextManifest: {
        schemaVersion: 1,
        idempotencyKey: `context-${requestId}`,
        localOnly: {
          absolutePaths: [context.workspace.worktreePath],
          environmentVariableNames: [],
          notes: [],
          uncommittedFilePaths: [],
        },
        transferable: {
          summary: `Task context for ${taskTitle}.`,
          entries: researchObjectIds.map((researchObjectId) => ({
            kind: "research_object",
            researchObjectId,
          })),
        },
      },
      task: {
        schemaVersion: 1,
        idempotencyKey: `task-${requestId}`,
        title: taskTitle,
        objective,
        researchObjectIds,
      },
      session: {
        schemaVersion: 1,
        idempotencyKey: `session-${requestId}`,
        title: taskTitle,
        provider: input.provider,
        commit: { sha: context.workspace.commitSha },
        state: "queued",
      },
    },
    execution: {
      schemaVersion: 1,
      payloadVersion: 1,
      requestId,
      prompt: objective,
      mode: canExecuteEffects ? "execute" : "read_only",
      tools: canExecuteEffects
        ? [
            { name: "listFiles" },
            { name: "readFile" },
            { name: "writeFile" },
            { name: "runCommand" },
          ]
        : [{ name: "readFile" }],
      ...(input.budget ? { budget: input.budget } : {}),
      actorId: "local-user",
    },
  };
}
