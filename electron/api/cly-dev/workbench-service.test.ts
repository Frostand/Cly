// @vitest-environment node
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closePersistedStateDatabase,
  getStateDatabase,
} from "../../persisted-state.js";
import { createClyDevSessionRepository } from "./session-repository.js";
import {
  createClyDevWorkbenchService,
  discoverProjectTestCommands,
  parseTestCounts,
} from "./workbench-service.js";

const NOW = "2026-07-16T12:00:00.000Z";

afterEach(() => closePersistedStateDatabase());

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "cly-workbench-"));
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      packageManager: "pnpm@11",
      scripts: { test: "vitest run" },
    }),
  );
  const db = getStateDatabase(path.join(root, "state.sqlite"));
  db.prepare(
    `INSERT INTO projects
      (id, path, normalized_path, name, status, sort_order, metadata, created_at, updated_at)
     VALUES ('project-1', ?, ?, 'Project', 'open', 0, '{}', ?, ?)`,
  ).run(root, root, NOW, NOW);
  const repository = createClyDevSessionRepository({ db, now: () => NOW });
  repository.createSessionAggregate("project-1", {
    workspace: {
      schemaVersion: 1,
      idempotencyKey: "workspace-key",
      id: "workspace-1",
      name: "Workspace",
      repository: { id: "repo-1" },
      worktree: { id: "worktree-1", branch: "main" },
      machine: { id: "machine-1", platform: "darwin" },
      localOnly: { repositoryPath: root, worktreePath: root },
    },
    contextManifest: {
      schemaVersion: 1,
      idempotencyKey: "manifest-key",
      id: "manifest-1",
      localOnly: {
        absolutePaths: [],
        environmentVariableNames: [],
        notes: [],
        uncommittedFilePaths: [],
      },
      transferable: { summary: "Approved context", entries: [] },
    },
    task: {
      schemaVersion: 1,
      idempotencyKey: "task-key",
      id: "task-1",
      title: "Task",
      objective: "Run the durable workbench",
      researchObjectIds: ["research-1"],
    },
    session: {
      schemaVersion: 1,
      idempotencyKey: "session-key",
      id: "session-1",
      title: "Session",
      provider: { id: "openai", model: "gpt-5" },
      commit: { sha: "a".repeat(40) },
      state: "running",
    },
  });
  return { db, repository, root };
}

describe("live Cly Dev workbench service", () => {
  it("parses Jest and Vitest summaries without treating totals as failures", () => {
    expect(parseTestCounts("Tests: 5 passed, 5 total")).toEqual({
      passed: 5,
      failed: 0,
    });
    expect(parseTestCounts("Tests  1 failed | 2 passed (3)")).toEqual({
      passed: 2,
      failed: 1,
    });
  });

  it("runs Bun package scripts explicitly instead of invoking built-in subcommands", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "cly-bun-workbench-"));
    writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({
        packageManager: "bun@1.2.0",
        scripts: { test: "vitest run", "test:unit": "vitest run unit" },
      }),
    );

    await expect(discoverProjectTestCommands(root)).resolves.toEqual([
      expect.objectContaining({ command: "bun run test" }),
      expect.objectContaining({ command: "bun run test:unit" }),
    ]);
  });

  it("discovers tests and records exact approval-gated command effects durably", async () => {
    const { db, repository, root } = fixture();
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({
        type: "pending",
        approval: {
          approvalId: "approval-1",
          projectId: "project-1",
          sessionId: "session-1",
          contextHash: "hash-1",
          toolCall: {
            toolCallId: "request-1",
            tool: "runCommand",
            arguments: { command: "pnpm test" },
          },
        },
      })
      .mockResolvedValueOnce({ type: "allow" });
    const executeTool = vi.fn().mockResolvedValue({
      stdout: "Tests 3 passed",
      stderr: "",
      exitCode: 0,
      signal: null,
    });
    const service = createClyDevWorkbenchService({
      db,
      repository,
      approvalGate: { evaluate },
      executeTool,
      now: () => NOW,
    });

    const context = await service.getContext("project-1", "session-1");
    expect(context.testCommands).toEqual([
      expect.objectContaining({ command: "pnpm test", script: "vitest run" }),
    ]);
    expect(context.workspace.localOnly.worktreePath).toBe(root);

    const pending = await service.requestCommand({
      projectId: "project-1",
      sessionId: "session-1",
      requestId: "request-1",
      command: "pnpm test",
    });
    expect(pending).toMatchObject({
      status: "approval_required",
      approval: { approvalId: "approval-1" },
    });

    await service.executeCommand({
      projectId: "project-1",
      sessionId: "session-1",
      requestId: "request-1",
      command: "pnpm test",
      approvalId: "approval-1",
    });
    expect(executeTool).toHaveBeenCalledWith(
      {
        toolCallId: "request-1",
        tool: "runCommand",
        arguments: { command: "pnpm test" },
      },
      expect.objectContaining({
        projectId: "project-1",
        sessionId: "session-1",
      }),
    );
    expect(evaluate.mock.calls[1]?.[0]).toMatchObject({
      projectId: "project-1",
      sessionId: "session-1",
      approval: "approval-1",
      toolCall: {
        toolCallId: "request-1",
        arguments: { command: "pnpm test" },
      },
    });
    expect(
      repository.listEvents("project-1", "session-1").map((item) => item.type),
    ).toEqual(
      expect.arrayContaining([
        "approval.requested",
        "tool.recorded",
        "process.recorded",
        "test.recorded",
      ]),
    );
    const duplicate = await service.executeCommand({
      projectId: "project-1",
      sessionId: "session-1",
      requestId: "request-1",
      command: "pnpm test",
      approvalId: "approval-1",
    });
    expect(duplicate).toMatchObject({ duplicate: true, status: "completed" });
    expect(executeTool).toHaveBeenCalledTimes(1);
  });

  it("deduplicates a command even when its process event is beyond the first 500 events", async () => {
    const { db, repository } = fixture();
    for (let index = 0; index < 500; index += 1) {
      repository.appendEvent("project-1", "session-1", {
        schemaVersion: 1,
        payloadVersion: 1,
        idempotencyKey: `filler-${index}`,
        type: "message.recorded",
        transferability: "local-only",
        occurredAt: NOW,
        actor: { kind: "system", id: "test" },
        payload: { role: "system", body: `Filler ${index}` },
      });
    }
    const executeTool = vi.fn().mockResolvedValue({
      stdout: "done",
      stderr: "",
      exitCode: 0,
      signal: null,
    });
    const evaluate = vi.fn().mockResolvedValue({ type: "allow" });
    const service = createClyDevWorkbenchService({
      db,
      repository,
      approvalGate: { evaluate },
      executeTool,
      now: () => NOW,
    });
    const command = {
      projectId: "project-1",
      sessionId: "session-1",
      requestId: "late-request",
      command: "printf done",
    };

    await service.executeCommand(command);
    await expect(service.executeCommand(command)).resolves.toMatchObject({
      duplicate: true,
      status: "completed",
    });
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });
});
