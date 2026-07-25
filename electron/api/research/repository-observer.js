import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { isRepositoryObservationEnabled } from "./repository-workflow-coordinator.js";

const execFileAsync = promisify(execFile);
const PROJECT_ID_SCHEMA = z.string().trim().min(1).max(500);
const ADAPTER_VERSION = "repository-observer-v1";
const IGNORE_POLICY_VERSION = "git-status-v1";
const DEFAULT_MAX_GIT_OUTPUT_BYTES = 5 * 1024 * 1024;
const CONTROL_COMMAND_OUTPUT_BYTES = 64 * 1024;
const NULL_DEVICE = process.platform === "win32" ? "NUL" : "/dev/null";

const gitEnvironment = () => {
  const environment = {
    GIT_CONFIG_GLOBAL: NULL_DEVICE,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_PAGER: "cat",
    GIT_TERMINAL_PROMPT: "0",
    LANG: "C",
    LC_ALL: "C",
    PATH: process.env.PATH,
  };
  if (process.platform === "win32") {
    environment.SystemRoot = process.env.SystemRoot;
  }
  return environment;
};

const fixedGitArguments = (operationArguments) => [
  "--no-optional-locks",
  "-c",
  `core.hooksPath=${NULL_DEVICE}`,
  "-c",
  "core.fsmonitor=false",
  "-c",
  "core.pager=cat",
  "-c",
  "credential.helper=",
  "-c",
  "diff.external=",
  ...operationArguments,
];

async function runGit(
  root,
  operationArguments,
  maxBuffer,
  { allowFailure = false } = {},
) {
  try {
    const { stdout } = await execFileAsync(
      "git",
      fixedGitArguments(operationArguments),
      {
        cwd: root,
        encoding: "utf8",
        env: gitEnvironment(),
        maxBuffer,
        windowsHide: true,
      },
    );
    return stdout;
  } catch (error) {
    if (
      error?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" ||
      String(error?.message).includes("maxBuffer")
    ) {
      throw new Error("Repository observation exceeded its output limit.");
    }
    if (allowFailure) return null;
    throw new Error("Registered project is not an observable Git repository.");
  }
}

const samePath = (left, right) =>
  process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;

function validateRelativeGitPath(value) {
  if (
    !value ||
    value.length > 4_000 ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    value.split(/[\\/]/).includes("..")
  ) {
    throw new Error("Git returned a path outside the registered project.");
  }
  return value.replaceAll("\\", "/");
}

function parsePorcelainStatus(output) {
  if (!output) return [];
  const records = output.split("\0");
  const changes = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    if (record.length < 4 || record[2] !== " ") {
      throw new Error("Git returned an unsupported repository status record.");
    }
    const indexStatus = record[0];
    const worktreeStatus = record[1];
    const change = {
      indexStatus,
      path: validateRelativeGitPath(record.slice(3)),
      worktreeStatus,
    };
    if (indexStatus === "R" || indexStatus === "C") {
      index += 1;
      change.originalPath = validateRelativeGitPath(records[index]);
    }
    changes.push(change);
  }
  return changes;
}

export function createRepositoryObserver(
  repository,
  {
    maxGitOutputBytes = DEFAULT_MAX_GIT_OUTPUT_BYTES,
    onChanges = async () => [],
  } = {},
) {
  if (!Number.isSafeInteger(maxGitOutputBytes) || maxGitOutputBytes < 1) {
    throw new Error("Repository observation output limit must be positive.");
  }

  return {
    async scan(projectIdInput) {
      const projectId = PROJECT_ID_SCHEMA.parse(projectIdInput);
      const project = repository.getProject(projectId);
      if (
        !isRepositoryObservationEnabled(
          project,
          repository.listProvenance(projectId, { limit: 500 }),
        )
      ) {
        throw new Error(
          "Repository observation is not enabled for this project.",
        );
      }
      const configuredRoot = path.resolve(project.path);
      const canonicalRoot = await realpath(configuredRoot);
      if (!samePath(configuredRoot, canonicalRoot)) {
        throw new Error("The registered project path is not canonical.");
      }

      const reportedGitRoot = (
        await runGit(
          canonicalRoot,
          ["rev-parse", "--show-toplevel"],
          CONTROL_COMMAND_OUTPUT_BYTES,
        )
      ).trim();
      const canonicalGitRoot = await realpath(reportedGitRoot);
      if (!samePath(canonicalGitRoot, canonicalRoot)) {
        throw new Error(
          "The registered project root must be the Git repository root.",
        );
      }

      const rawHead = await runGit(
        canonicalRoot,
        ["rev-parse", "--verify", "HEAD"],
        CONTROL_COMMAND_OUTPUT_BYTES,
        { allowFailure: true },
      );
      const head = rawHead?.trim() || null;
      const rawBranch = await runGit(
        canonicalRoot,
        ["symbolic-ref", "--quiet", "--short", "HEAD"],
        CONTROL_COMMAND_OUTPUT_BYTES,
        { allowFailure: true },
      );
      const branch = rawBranch?.trim() || null;
      if (branch && (branch.length > 500 || /[\0\r\n]/.test(branch))) {
        throw new Error("Git returned an invalid branch name.");
      }
      const status = await runGit(
        canonicalRoot,
        ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
        maxGitOutputBytes,
      );
      const changes = parsePorcelainStatus(status);
      const observedAt = new Date().toISOString();

      repository.appendProvenance({
        action: "repository.scan.completed",
        actorId: ADAPTER_VERSION,
        actorType: "system",
        metadata: {
          adapterVersion: ADAPTER_VERSION,
          capability: "repository.observe.metadata",
          changeCount: changes.length,
          gitBranch: branch,
          gitHead: head,
          ignorePolicyVersion: IGNORE_POLICY_VERSION,
          observedAt,
        },
        projectId,
      });
      for (const change of changes) {
        repository.appendProvenance({
          action: "repository.change.observed",
          actorId: ADAPTER_VERSION,
          actorType: "system",
          metadata: {
            ...change,
            adapterVersion: ADAPTER_VERSION,
            gitBranch: branch,
            gitHead: head,
            observedAt,
          },
          projectId,
        });
      }

      const staleLinks = await onChanges(projectId, changes, {
        gitHead: head,
        observedAt,
      });

      return {
        changes,
        observedAt,
        projectId,
        repository: { branch, head },
        staleLinks,
      };
    },
  };
}
