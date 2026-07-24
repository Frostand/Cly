import { createHash } from "node:crypto";
import { streamText, tool } from "ai";
import { claudeCode, createAiSdkMcpServer } from "ai-sdk-provider-claude-code";
import { z } from "zod";
import { normalizeClaudeCodeModel } from "../../providers/model-options.js";
import { checkClaudeAuthentication } from "../../providers/provider-health.js";
import { fetchAnthropicModels } from "../../providers/provider-models.js";
import { resolveCliCommandPath } from "../../shared/cli.js";
import { hashToolArguments } from "./approval-gate.js";

export const CLY_DEV_CLAUDE_MCP_SERVER = "clyDev";
export const CLY_DEV_CLAUDE_TOOLS = Object.freeze([
  "listFiles",
  "readFile",
  "writeFile",
  "runCommand",
]);
export const CLY_DEV_CLAUDE_ALLOWED_TOOLS = Object.freeze(
  CLY_DEV_CLAUDE_TOOLS.map(
    (name) => `mcp__${CLY_DEV_CLAUDE_MCP_SERVER}__${name}`,
  ),
);

const logicalToolFingerprint = (toolName, argumentsValue) =>
  createHash("sha256")
    .update(`${toolName}:${hashToolArguments(argumentsValue)}`)
    .digest("hex");

const schemas = Object.freeze({
  listFiles: z.object({
    directory: z.string().min(1).default("."),
    maxResults: z.number().int().min(1).max(400).default(200),
  }),
  readFile: z.object({ filePath: z.string().min(1) }),
  writeFile: z.object({
    filePath: z.string().min(1),
    content: z.string(),
    mode: z.enum(["overwrite", "append"]).default("overwrite"),
  }),
  runCommand: z.object({ command: z.string().min(1) }),
});

export const createClyDevClaudeMcp = ({
  executeToolCall,
  toolNames = CLY_DEV_CLAUDE_TOOLS,
}) => {
  if (typeof executeToolCall !== "function") {
    throw new Error("Claude MCP tools require a runtime tool executor.");
  }
  let effectFailure = null;
  const occurrences = new Map();
  const selectedTools = [
    ...new Set(toolNames.filter((name) => CLY_DEV_CLAUDE_TOOLS.includes(name))),
  ];
  const tools = Object.fromEntries(
    selectedTools.map((toolName) => [
      toolName,
      tool({
        description: `Cly Dev runtime-owned ${toolName} operation.`,
        inputSchema: schemas[toolName],
        execute: async (argumentsValue) => {
          try {
            const fingerprint = logicalToolFingerprint(
              toolName,
              argumentsValue,
            );
            const occurrence = (occurrences.get(fingerprint) ?? 0) + 1;
            occurrences.set(fingerprint, occurrence);
            return await executeToolCall({
              toolCallId: `claude-${fingerprint}-${occurrence}`,
              tool: toolName,
              arguments: argumentsValue,
            });
          } catch (error) {
            effectFailure ??= error;
            throw error;
          }
        },
      }),
    ]),
  );
  return Object.freeze({
    allowedTools: selectedTools.map(
      (name) => `mcp__${CLY_DEV_CLAUDE_MCP_SERVER}__${name}`,
    ),
    getEffectFailure: () => effectFailure,
    mcpServer: createAiSdkMcpServer(CLY_DEV_CLAUDE_MCP_SERVER, tools),
    tools,
  });
};

const loadProjectPath = (db, request) => {
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
    .get(request.sessionId, request.projectId);
  try {
    const path = JSON.parse(row?.local_only_json)?.worktreePath;
    if (typeof path === "string") return path;
  } catch {
    // Fail below with the same public provider error.
  }
  const error = new Error("The Cly Dev worktree path was not found.");
  error.code = "PROVIDER_UNAVAILABLE";
  error.retryable = false;
  throw error;
};

const defaultAuthentication = async () => {
  const authentication = await checkClaudeAuthentication();
  if (!authentication.installed) return { status: "unavailable" };
  return authentication.authenticated
    ? { status: "authenticated" }
    : { status: "absent" };
};

const defaultModelStream = ({ model, prompt, settings, signal }) =>
  streamText({
    abortSignal: signal,
    model: claudeCode(normalizeClaudeCodeModel(model), settings),
    prompt,
  }).fullStream;

const positiveNumber = (value) =>
  Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

export function createSignedInClaudeRunner({
  db,
  checkAuthentication = defaultAuthentication,
  discoverModels = fetchAnthropicModels,
  resolveExecutable = () => resolveCliCommandPath("claude"),
  streamModel = defaultModelStream,
} = {}) {
  if (!db) throw new Error("A SQLite database is required.");
  const active = new Map();

  return Object.freeze({
    getAuthentication: () => checkAuthentication(),
    async listModels() {
      const catalog = await discoverModels();
      return Array.isArray(catalog?.models) ? catalog.models : [];
    },
    getCapabilities() {
      return {
        streaming: true,
        reasoning: true,
        toolCalls: true,
        interceptBeforeEffect: true,
      };
    },
    async *stream(request, { executeToolCall, signal } = {}) {
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) controller.abort();
      active.set(request.executionId, controller);
      try {
        const executable = await resolveExecutable();
        if (!executable) {
          const error = new Error("Claude Code CLI is unavailable.");
          error.code = "PROVIDER_UNAVAILABLE";
          error.retryable = false;
          throw error;
        }
        const bridge = createClyDevClaudeMcp({
          executeToolCall,
          toolNames: (request.tools ?? []).map(
            (declared) => declared.name ?? declared.tool,
          ),
        });
        const projectPath = loadProjectPath(db, request);
        const settings = {
          allowedTools: bridge.allowedTools,
          allowDangerouslySkipPermissions: true,
          continue: false,
          cwd: projectPath,
          mcpServers: { [CLY_DEV_CLAUDE_MCP_SERVER]: bridge.mcpServer },
          permissionMode: "bypassPermissions",
          persistSession: false,
          settingSources: [],
          tools: [],
          ...(executable ? { pathToClaudeCodeExecutable: executable } : {}),
        };
        const prompt = [
          request.contextBytes
            ? `Cly Dev normalized transferable context:\n${request.contextBytes}`
            : null,
          `User request:\n${String(request.prompt ?? "")}`,
        ]
          .filter(Boolean)
          .join("\n\n");
        let finished = false;
        for await (const part of await streamModel({
          bridge,
          model: request.model,
          prompt,
          settings,
          signal: controller.signal,
        })) {
          if (bridge.getEffectFailure()) throw bridge.getEffectFailure();
          if (part.type === "text-delta") {
            yield { type: "text", text: part.text ?? part.delta ?? "" };
          } else if (part.type === "reasoning-delta") {
            yield {
              type: "reasoning",
              decisionId: part.id ?? request.executionId,
              summary: "Claude reasoning",
              text: part.text ?? part.delta ?? "",
            };
          } else if (part.type === "tool-result") {
            yield {
              type: "tool_result",
              toolCallId: part.toolCallId,
              result: part.output,
            };
          } else if (part.type === "finish") {
            const usage = part.totalUsage ?? part.usage ?? {};
            const inputTokens = positiveNumber(usage.inputTokens);
            const outputTokens = positiveNumber(usage.outputTokens);
            if (inputTokens || outputTokens) {
              yield { type: "usage", inputTokens, outputTokens };
            }
            finished = true;
          }
        }
        if (bridge.getEffectFailure()) throw bridge.getEffectFailure();
        yield controller.signal.aborted
          ? { type: "canceled" }
          : { type: "completed" };
        if (!finished && !controller.signal.aborted) return;
      } finally {
        signal?.removeEventListener("abort", abort);
        active.delete(request.executionId);
      }
    },
    async cancel(executionId) {
      active.get(executionId)?.abort();
    },
  });
}
