// @vitest-environment node
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createProjectScopedToolExecutor } from "./project-tool-executor.js";

describe("project-scoped Cly Dev tool executor", () => {
  it("executes inside the durable session worktree and rejects traversal", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "cly-dev-tools-"));
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE cly_dev_sessions (id TEXT, project_id TEXT, task_id TEXT);
      CREATE TABLE cly_dev_tasks (id TEXT, project_id TEXT, workspace_id TEXT);
      CREATE TABLE cly_dev_workspaces (id TEXT, project_id TEXT, local_only_json TEXT);
    `);
    db.prepare(
      "INSERT INTO cly_dev_sessions VALUES ('session-1', 'project-1', 'task-1')",
    ).run();
    db.prepare(
      "INSERT INTO cly_dev_tasks VALUES ('task-1', 'project-1', 'workspace-1')",
    ).run();
    db.prepare(
      "INSERT INTO cly_dev_workspaces VALUES ('workspace-1', 'project-1', ?)",
    ).run(JSON.stringify({ worktreePath: root }));
    const execute = createProjectScopedToolExecutor({ db });
    const metadata = {
      projectId: "project-1",
      sessionId: "session-1",
      requestId: "request-1",
      signal: new AbortController().signal,
    };

    await expect(
      execute(
        {
          tool: "writeFile",
          arguments: { filePath: "nested/result.txt", content: "safe" },
        },
        metadata,
      ),
    ).resolves.toMatchObject({
      bytesWritten: 4,
      filePath: "nested/result.txt",
    });
    expect(readFileSync(path.join(root, "nested/result.txt"), "utf8")).toBe(
      "safe",
    );
    await expect(
      execute(
        {
          tool: "readFile",
          arguments: { filePath: "../../outside.txt" },
        },
        metadata,
      ),
    ).rejects.toThrow(/outside of the project root/i);
    await expect(
      execute(
        {
          tool: "runCommand",
          arguments: { command: "printf should-not-run" },
        },
        metadata,
      ),
    ).rejects.toThrow(/native command authorization is unavailable/i);
    db.close();
  });
});
