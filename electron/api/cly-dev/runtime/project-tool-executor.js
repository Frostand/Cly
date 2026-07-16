import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  listProjectFiles,
  resolveProjectPath,
} from "../../project-git/files.js";

const MAX_COMMAND_OUTPUT_BYTES = 1024 * 1024;

const requireString = (value, name, { allowEmpty = false } = {}) => {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) {
    throw new Error(`${name} must be a non-empty string.`);
  }
  return value;
};

const loadProjectRoot = (db, { projectId, sessionId }) => {
  const row = db
    .prepare(
      `SELECT workspaces.local_only_json
       FROM cly_dev_sessions sessions
       JOIN cly_dev_tasks tasks
         ON tasks.id = sessions.task_id AND tasks.project_id = sessions.project_id
       JOIN cly_dev_workspaces workspaces
         ON workspaces.id = tasks.workspace_id AND workspaces.project_id = tasks.project_id
       WHERE sessions.id = ? AND sessions.project_id = ?`,
    )
    .get(sessionId, projectId);
  if (!row) {
    throw new Error("The Cly Dev tool execution scope was not found.");
  }
  let localOnly;
  try {
    localOnly = JSON.parse(row.local_only_json);
  } catch {
    localOnly = null;
  }
  const root = localOnly?.worktreePath;
  if (typeof root !== "string" || !path.isAbsolute(root)) {
    throw new Error("The Cly Dev worktree path is unavailable.");
  }
  return path.resolve(root);
};

const runCommand = ({ command, root, signal }) =>
  new Promise((resolve, reject) => {
    const child = spawn(requireString(command, "command"), {
      cwd: root,
      env: process.env,
      shell: true,
      signal,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    let outputExceeded = false;
    const collect = (target) => (chunk) => {
      if (outputExceeded) return;
      outputBytes += chunk.length;
      if (outputBytes > MAX_COMMAND_OUTPUT_BYTES) {
        outputExceeded = true;
        child.kill("SIGTERM");
        return;
      }
      target.push(chunk);
    };
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    child.once("error", reject);
    child.once("close", (exitCode, terminatedBy) => {
      if (outputExceeded) {
        reject(new Error("Command output exceeded the 1 MiB safety limit."));
        return;
      }
      resolve({
        command,
        cwd: root,
        exitCode,
        signal: terminatedBy,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });

export function createProjectScopedToolExecutor({ db } = {}) {
  if (!db) throw new Error("A SQLite database is required.");

  return async (toolCall, metadata) => {
    const root = loadProjectRoot(db, metadata);
    const input = toolCall?.arguments ?? {};
    switch (toolCall?.tool) {
      case "listFiles": {
        const directory = input.directory ?? ".";
        const maxResults = input.maxResults ?? 200;
        if (
          !Number.isInteger(maxResults) ||
          maxResults < 1 ||
          maxResults > 400
        ) {
          throw new Error("maxResults must be between 1 and 400.");
        }
        const files = await listProjectFiles(
          root,
          requireString(directory, "directory"),
          maxResults,
        );
        return { count: files.length, files };
      }
      case "readFile": {
        const filePath = requireString(
          input.filePath ?? input.path,
          "filePath",
        );
        return {
          filePath,
          content: await fs.readFile(
            resolveProjectPath(root, filePath),
            "utf8",
          ),
        };
      }
      case "writeFile": {
        const filePath = requireString(
          input.filePath ?? input.path,
          "filePath",
        );
        const content = requireString(input.content, "content", {
          allowEmpty: true,
        });
        const mode = input.mode ?? "overwrite";
        if (!new Set(["overwrite", "append"]).has(mode)) {
          throw new Error("writeFile mode must be overwrite or append.");
        }
        const absolutePath = resolveProjectPath(root, filePath);
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        if (mode === "append") {
          await fs.appendFile(absolutePath, content, "utf8");
        } else {
          await fs.writeFile(absolutePath, content, "utf8");
        }
        return {
          bytesWritten: Buffer.byteLength(content, "utf8"),
          filePath,
          mode,
        };
      }
      case "runCommand":
      case "command":
      case "shell":
      case "exec":
        return runCommand({
          command: input.command,
          root,
          signal: metadata.signal,
        });
      default:
        throw new Error(
          `Tool ${toolCall?.tool ?? "(missing)"} is unavailable in the project-scoped executor.`,
        );
    }
  };
}
