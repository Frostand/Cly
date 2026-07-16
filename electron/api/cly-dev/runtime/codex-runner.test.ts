// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { createSignedInCodexRunner } from "./codex-runner.js";

describe("signed-in Codex Cly Dev runner", () => {
  it("discovers installed auth/models and adapts the existing app-server stream read-only", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE cly_dev_sessions (id TEXT, project_id TEXT, task_id TEXT);
      CREATE TABLE cly_dev_tasks (id TEXT, project_id TEXT, workspace_id TEXT);
      CREATE TABLE cly_dev_workspaces (id TEXT, project_id TEXT, local_only_json TEXT);
      INSERT INTO cly_dev_sessions VALUES ('session-1', 'project-1', 'task-1');
      INSERT INTO cly_dev_tasks VALUES ('task-1', 'project-1', 'workspace-1');
      INSERT INTO cly_dev_workspaces
        VALUES ('workspace-1', 'project-1', '{"worktreePath":"/tmp/project-1"}');
    `);
    const resolveLaunch = vi.fn(() => ({ command: "codex" }));
    const readAuthentication = vi.fn(() => "signed-in-token");
    const discoverModels = vi.fn(() => ({
      installed: true,
      source: "cli",
      models: [{ id: "gpt-test" }],
    }));
    const streamResponse = vi.fn(
      () =>
        new Response(
          [
            'data: {"type":"text-delta","delta":"hello"}',
            'data: {"type":"reasoning-delta","id":"reason-1","delta":"why"}',
            'data: {"type":"tool-output-available","toolCallId":"read-1","output":{"ok":true}}',
            "data: [DONE]",
            "",
          ].join("\n"),
        ),
    );
    const runner = createSignedInCodexRunner({
      db,
      resolveLaunch,
      readAuthentication,
      discoverModels,
      streamResponse,
    });

    await expect(runner.getAuthentication()).resolves.toEqual({
      status: "authenticated",
    });
    await expect(runner.listModels()).resolves.toEqual([{ id: "gpt-test" }]);
    expect(runner.getCapabilities()).toEqual({
      streaming: true,
      reasoning: true,
      toolCalls: false,
      interceptBeforeEffect: false,
    });
    const events = [];
    for await (const event of runner.stream({
      executionId: "execution-1",
      clientRequestId: "request-1",
      projectId: "project-1",
      sessionId: "session-1",
      prompt: "Inspect the project",
      model: "gpt-test",
      contextBytes: "{}",
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "text", text: "hello" },
      {
        type: "reasoning",
        decisionId: "reason-1",
        summary: "Codex reasoning",
        text: "why",
      },
      { type: "tool_result", toolCallId: "read-1", result: { ok: true } },
      { type: "completed" },
    ]);
    expect(streamResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "execution-1",
        model: "gpt-test",
        projectId: "project-1",
        projectPath: "/tmp/project-1",
        sandboxMode: "read-only",
        turnSandboxPolicy: { type: "readOnly" },
      }),
    );
    db.close();
  });
});
