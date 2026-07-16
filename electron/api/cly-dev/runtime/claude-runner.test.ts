// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import {
  CLY_DEV_CLAUDE_ALLOWED_TOOLS,
  createClyDevClaudeMcp,
  createSignedInClaudeRunner,
} from "./claude-runner.js";

const createDb = () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE cly_dev_sessions (id TEXT, project_id TEXT, task_id TEXT);
    CREATE TABLE cly_dev_tasks (id TEXT, project_id TEXT, workspace_id TEXT);
    CREATE TABLE cly_dev_workspaces (id TEXT, project_id TEXT, local_only_json TEXT);
    INSERT INTO cly_dev_sessions VALUES ('session-1', 'project-1', 'task-1');
    INSERT INTO cly_dev_tasks VALUES ('task-1', 'project-1', 'workspace-1');
    INSERT INTO cly_dev_workspaces VALUES
      ('workspace-1', 'project-1', '{"worktreePath":"/tmp/private-cly-tree"}');
  `);
  return db;
};

type ObservedClaudeStream = {
  bridge: { tools: Record<string, unknown> };
  prompt: string;
  settings: {
    allowedTools: string[];
    cwd: string;
    settingSources: unknown[];
    tools: unknown[];
  };
};

describe("Claude Cly Dev MCP runner", () => {
  it("exposes only fixed MCP tools with deterministic occurrence ids", async () => {
    const executeToolCall = vi.fn((call) => ({ tool: call.tool, ok: true }));
    const bridge = createClyDevClaudeMcp({ executeToolCall });

    expect(Object.keys(bridge.tools)).toEqual([
      "listFiles",
      "readFile",
      "writeFile",
      "runCommand",
    ]);
    expect(bridge.allowedTools).toEqual(CLY_DEV_CLAUDE_ALLOWED_TOOLS);
    expect(bridge.mcpServer).toEqual(expect.any(Object));
    await bridge.tools.writeFile.execute?.(
      { filePath: "a.txt", content: "one", mode: "overwrite" },
      { toolCallId: "json-rpc-1" },
    );
    await bridge.tools.writeFile.execute?.(
      { filePath: "a.txt", content: "one", mode: "overwrite" },
      { toolCallId: "json-rpc-999" },
    );
    expect(executeToolCall).toHaveBeenCalledTimes(2);
    expect(executeToolCall.mock.calls[0][0].toolCallId).not.toBe(
      executeToolCall.mock.calls[1][0].toolCallId,
    );
    expect(executeToolCall.mock.calls[0][0].toolCallId).not.toContain(
      "json-rpc",
    );

    const replay = createClyDevClaudeMcp({ executeToolCall });
    await replay.tools.writeFile.execute?.({
      filePath: "a.txt",
      content: "one",
      mode: "overwrite",
    });
    expect(executeToolCall.mock.calls[2][0].toolCallId).toBe(
      executeToolCall.mock.calls[0][0].toolCallId,
    );
  });

  it("pins built-ins/settings off and treats provider tool parts as audit-only", async () => {
    const db = createDb();
    const executeToolCall = vi.fn(() => ({ written: true }));
    let observed: ObservedClaudeStream | undefined;
    const runner = createSignedInClaudeRunner({
      db,
      checkAuthentication: () => ({ status: "authenticated" }),
      discoverModels: () => ({ models: [{ id: "sonnet" }] }),
      resolveExecutable: () => "/usr/local/bin/claude",
      streamModel: async (options) => {
        observed = options;
        await options.bridge.tools.writeFile.execute({
          filePath: "result.txt",
          content: "done",
          mode: "overwrite",
        });
        return (async function* () {
          yield {
            type: "tool-call",
            toolCallId: "provider-audit-call",
            toolName: "mcp__clyDev__writeFile",
          };
          yield {
            type: "tool-result",
            toolCallId: "provider-audit-call",
            output: { written: true },
          };
          yield { type: "text-delta", text: "done" };
          yield {
            type: "finish",
            totalUsage: { inputTokens: 4, outputTokens: 2 },
          };
        })();
      },
    });
    const events = [];
    for await (const event of runner.stream(
      {
        executionId: "execution-1",
        projectId: "project-1",
        sessionId: "session-1",
        model: "sonnet",
        prompt: "Make a change",
        contextBytes: '{"manifest":{"id":"manifest-1"}}',
        tools: [{ name: "writeFile" }],
      },
      { executeToolCall },
    )) {
      events.push(event);
    }
    if (!observed) throw new Error("Claude stream options were not observed.");

    expect(observed.settings).toMatchObject({
      allowedTools: ["mcp__clyDev__writeFile"],
      cwd: "/tmp/private-cly-tree",
      settingSources: [],
      tools: [],
    });
    expect(observed.settings.allowedTools).not.toContain("Read");
    expect(observed.prompt).not.toContain("/tmp/private-cly-tree");
    expect(executeToolCall).toHaveBeenCalledOnce();
    expect(events).not.toContainEqual(
      expect.objectContaining({ type: "tool_call" }),
    );
    expect(events).toEqual([
      {
        type: "tool_result",
        toolCallId: "provider-audit-call",
        result: { written: true },
      },
      { type: "text", text: "done" },
      { type: "usage", inputTokens: 4, outputTokens: 2 },
      { type: "completed" },
    ]);
    db.close();
  });

  it("exposes only the tools declared for this execution", async () => {
    const db = createDb();
    let observed: ObservedClaudeStream | undefined;
    const runner = createSignedInClaudeRunner({
      db,
      resolveExecutable: () => "/usr/local/bin/claude",
      streamModel: async (options) => {
        observed = options;
        return (async function* () {
          yield { type: "finish", totalUsage: {} };
        })();
      },
    });

    for await (const _event of runner.stream(
      {
        executionId: "execution-declared-tools",
        projectId: "project-1",
        sessionId: "session-1",
        model: "sonnet",
        prompt: "Inspect it",
        contextBytes: "{}",
        tools: [{ name: "readFile" }],
      },
      { executeToolCall: vi.fn() },
    )) {
      // Drain the provider stream.
    }
    if (!observed) throw new Error("Claude stream options were not observed.");

    expect(Object.keys(observed.bridge.tools)).toEqual(["readFile"]);
    expect(observed.settings.allowedTools).toEqual(["mcp__clyDev__readFile"]);
    db.close();
  });

  it("fails the provider stream after a rejected MCP effect even if Claude continues", async () => {
    const db = createDb();
    const rejected = new Error("User rejected the effect");
    const runner = createSignedInClaudeRunner({
      db,
      resolveExecutable: () => "/usr/local/bin/claude",
      streamModel: async ({ bridge }) => {
        await expect(
          bridge.tools.runCommand.execute({ command: "touch bypass" }),
        ).rejects.toThrow(rejected);
        return (async function* () {
          yield { type: "text-delta", text: "continued" };
          yield { type: "finish", totalUsage: {} };
        })();
      },
    });

    await expect(async () => {
      for await (const _event of runner.stream(
        {
          executionId: "execution-rejected",
          projectId: "project-1",
          sessionId: "session-1",
          model: "sonnet",
          prompt: "Run it",
          contextBytes: "{}",
          tools: [{ name: "runCommand" }],
        },
        { executeToolCall: vi.fn(() => Promise.reject(rejected)) },
      )) {
        // Fail closed before any continued provider output is accepted.
      }
    }).rejects.toThrow(rejected);
    db.close();
  });

  it("reports injected authentication and model discovery without network access", async () => {
    const db = createDb();
    const runner = createSignedInClaudeRunner({
      db,
      checkAuthentication: () => ({ status: "absent" }),
      discoverModels: () => ({ models: [{ id: "claude-test" }] }),
    });
    expect(runner.getAuthentication()).toEqual({ status: "absent" });
    await expect(runner.listModels()).resolves.toEqual([{ id: "claude-test" }]);
    db.close();
  });
});
