// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { createSignedInCodexRunner } from "./codex-runner.js";

const createRunnerDb = (localOnly = { worktreePath: "/tmp/project-1" }) => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE cly_dev_sessions (id TEXT, project_id TEXT, task_id TEXT);
    CREATE TABLE cly_dev_tasks (id TEXT, project_id TEXT, workspace_id TEXT);
    CREATE TABLE cly_dev_workspaces (id TEXT, project_id TEXT, local_only_json TEXT);
    INSERT INTO cly_dev_sessions VALUES ('session-1', 'project-1', 'task-1');
    INSERT INTO cly_dev_tasks VALUES ('task-1', 'project-1', 'workspace-1');
  `);
  db.prepare(
    "INSERT INTO cly_dev_workspaces VALUES ('workspace-1', 'project-1', ?)",
  ).run(JSON.stringify(localOnly));
  return db;
};

describe("signed-in Codex Cly Dev runner", () => {
  it("discovers installed auth/models and adapts the existing app-server stream read-only", async () => {
    const worktreePath = "/tmp/private-worktree";
    const repositoryPath = "/tmp/private-repository";
    const db = createRunnerDb({ worktreePath, repositoryPath });
    const resolveLaunch = vi.fn(() => ({ command: "codex" }));
    const readAuthentication = vi.fn(() => "signed-in-token");
    const discoverModels = vi.fn(() => ({
      installed: true,
      source: "cli",
      models: [{ id: "gpt-test" }],
    }));
    let outgoingPrompt = "";
    const streamResponse = vi.fn((options) => {
      outgoingPrompt = options.conversationPromptBuilder({
        currentTurnAttachments: null,
        currentTurnProjectReferences: options.projectReferencesPrompt,
        messages: options.messages,
        projectPath: options.projectPath,
        systemPrompt: options.systemPrompt,
      });
      return new Response(
        [
          'data: {"type":"text-delta","delta":"hello"}',
          'data: {"type":"reasoning-delta","id":"reason-1","delta":"why"}',
          'data: {"type":"tool-output-available","toolCallId":"read-1","output":{"ok":true}}',
          "data: [DONE]",
          "",
        ].join("\n"),
      );
    });
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
    const contextBytes = JSON.stringify({
      schemaVersion: 1,
      manifest: { id: "manifest-1", entries: [] },
    });
    for await (const event of runner.stream({
      executionId: "execution-1",
      clientRequestId: "request-1",
      projectId: "project-1",
      sessionId: "session-1",
      prompt: "Inspect the project",
      model: "gpt-test",
      contextBytes,
      localOnly: {
        repositoryPath,
        worktreePath,
        environmentVariableNames: ["OPENAI_API_KEY"],
        secret: "sk-private-value",
      },
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
        projectPath: worktreePath,
        sandboxMode: "read-only",
        turnSandboxPolicy: { type: "readOnly" },
      }),
    );
    expect(outgoingPrompt).toContain(contextBytes);
    expect(outgoingPrompt).toContain("Inspect the project");
    expect(outgoingPrompt).not.toContain(worktreePath);
    expect(outgoingPrompt).not.toContain(repositoryPath);
    expect(outgoingPrompt).not.toContain("OPENAI_API_KEY");
    expect(outgoingPrompt).not.toContain("sk-private-value");
    db.close();
  });

  it("converts cumulative Codex metadata to nonnegative usage deltas without double counting", async () => {
    const db = createRunnerDb();
    const streamResponse = () =>
      new Response(
        [
          'data: {"type":"message-metadata","messageMetadata":{"usage":{"inputTokens":5,"outputTokens":2}}}',
          'data: {"type":"message-metadata","messageMetadata":{"usage":{"inputTokens":5,"outputTokens":2}}}',
          'data: {"type":"message-metadata","messageMetadata":{"usage":{"inputTokens":12,"outputTokens":4}}}',
          'data: {"type":"message-metadata","messageMetadata":{"usage":{"inputTokens":10,"outputTokens":3}}}',
          "data: [DONE]",
          "",
        ].join("\n"),
      );
    const runner = createSignedInCodexRunner({ db, streamResponse });
    const events = [];

    for await (const event of runner.stream({
      executionId: "usage-execution",
      clientRequestId: "usage-request",
      projectId: "project-1",
      sessionId: "session-1",
      prompt: "Inspect usage",
      model: "gpt-test",
      contextBytes: "{}",
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "usage", inputTokens: 5, outputTokens: 2 },
      { type: "usage", inputTokens: 7, outputTokens: 2 },
      { type: "completed" },
    ]);
    db.close();
  });

  it.each([
    "runCommand",
    "writeFile",
    "permissions",
    "futureNativeEffect",
  ])("fails closed when the app-server stream reports a provider-executed %s effect", async (toolName) => {
    const db = createRunnerDb();
    const runner = createSignedInCodexRunner({
      db,
      streamResponse: () =>
        new Response(
          [
            `data: ${JSON.stringify({
              type: "tool-input-available",
              providerExecuted: true,
              toolCallId: "native-effect-1",
              toolName,
              input: { command: "touch bypass", filePath: "bypass.txt" },
            })}`,
            "data: [DONE]",
            "",
          ].join("\n"),
        ),
    });

    await expect(async () => {
      for await (const _event of runner.stream({
        executionId: `native-${toolName}`,
        clientRequestId: "native-request",
        projectId: "project-1",
        sessionId: "session-1",
        prompt: "Do not bypass",
        model: "gpt-test",
        contextBytes: "{}",
      })) {
        // The bridge must reject before yielding a provider-side effect.
      }
    }).rejects.toThrow(/provider-executed effect/i);
    expect(runner.getCapabilities()).toMatchObject({
      toolCalls: false,
      interceptBeforeEffect: false,
    });
    db.close();
  });

  it("fails closed on a provider-executed output frame without a preceding visible input", async () => {
    const db = createRunnerDb();
    const runner = createSignedInCodexRunner({
      db,
      streamResponse: () =>
        new Response(
          [
            `data: ${JSON.stringify({
              type: "tool-output-available",
              providerExecuted: true,
              toolCallId: "hidden-native-effect",
              toolName: "unknownNativeTool",
              output: { ok: true },
            })}`,
            "data: [DONE]",
            "",
          ].join("\n"),
        ),
    });

    await expect(async () => {
      for await (const _event of runner.stream({
        executionId: "native-output-only",
        clientRequestId: "native-request",
        projectId: "project-1",
        sessionId: "session-1",
        prompt: "Do not bypass",
        model: "gpt-test",
        contextBytes: "{}",
      })) {
        // Provider-owned native effects must never become accepted audit output.
      }
    }).rejects.toThrow(/provider-executed effect/i);
    db.close();
  });
});
