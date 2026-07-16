import { streamCodexAppServerResponse } from "../../chat/codex-app-server.js";
import { resolveCodexCliLaunch } from "../../chat/codex-cli-launch.js";
import { readCodexAccessToken } from "../../providers/codex-auth.js";
import { fetchOpenAiModels } from "../../providers/provider-models.js";

const parseJson = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
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
  const localOnly = parseJson(row?.local_only_json);
  if (typeof localOnly?.worktreePath !== "string") {
    const error = new Error("The Cly Dev worktree path was not found.");
    error.code = "PROVIDER_UNAVAILABLE";
    throw error;
  }
  return localOnly.worktreePath;
};

const normalizeStreamLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(":")) return null;
  const value = trimmed.startsWith("data:")
    ? trimmed.slice("data:".length).trim()
    : trimmed;
  if (!value || value === "[DONE]") return null;
  return parseJson(value);
};

const messageText = (messages) =>
  (messages ?? [])
    .flatMap((message) => message?.parts ?? [])
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");

export const buildClyDevCodexPrompt = ({
  currentTurnProjectReferences,
  messages,
  systemPrompt,
}) =>
  [
    systemPrompt,
    currentTurnProjectReferences
      ? `Cly Dev normalized transferable context:\n${currentTurnProjectReferences}`
      : null,
    `User request:\n${messageText(messages)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

async function* decodeProviderEvents(response, signal) {
  if (!response.ok) {
    throw new Error(
      (await response.text()) || `Codex returned HTTP ${response.status}.`,
    );
  }
  if (!response.body) throw new Error("Codex returned an empty stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const cumulativeUsage = { inputTokens: 0, outputTokens: 0 };
  const mapEvent = (event) => {
    if (
      event?.providerExecuted === true &&
      typeof event?.type === "string" &&
      event.type.startsWith("tool-")
    ) {
      throw new Error(
        "Codex reported a provider-executed effect; Cly Dev cannot verify pre-effect interception.",
      );
    }
    if (event?.type === "text-delta") {
      return { type: "text", text: event.delta ?? "" };
    }
    if (event?.type === "reasoning-delta") {
      return {
        type: "reasoning",
        decisionId: event.id,
        summary: "Codex reasoning",
        text: event.delta ?? "",
      };
    }
    if (event?.type === "tool-output-available" && event.toolCallId) {
      return {
        type: "tool_result",
        toolCallId: event.toolCallId,
        result: event.output,
      };
    }
    if (event?.type === "message-metadata") {
      const usage = event.messageMetadata?.usage;
      const nextInput = Number(usage?.inputTokens);
      const nextOutput = Number(usage?.outputTokens);
      if (
        !Number.isFinite(nextInput) ||
        nextInput < 0 ||
        !Number.isFinite(nextOutput) ||
        nextOutput < 0
      ) {
        return null;
      }
      const inputTokens = Math.max(0, nextInput - cumulativeUsage.inputTokens);
      const outputTokens = Math.max(
        0,
        nextOutput - cumulativeUsage.outputTokens,
      );
      cumulativeUsage.inputTokens = Math.max(
        cumulativeUsage.inputTokens,
        nextInput,
      );
      cumulativeUsage.outputTokens = Math.max(
        cumulativeUsage.outputTokens,
        nextOutput,
      );
      return inputTokens || outputTokens
        ? { type: "usage", inputTokens, outputTokens }
        : null;
    }
    if (event?.type === "tool-output-error" || event?.type === "error") {
      throw new Error(
        event.errorText ?? event.error ?? "Codex stream reported an error.",
      );
    }
    return null;
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = done ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        const event = normalizeStreamLine(line);
        if (!event) continue;
        const mapped = mapEvent(event);
        if (mapped) yield mapped;
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
  yield signal?.aborted ? { type: "canceled" } : { type: "completed" };
}

export function createSignedInCodexRunner({
  db,
  readAuthentication = readCodexAccessToken,
  discoverModels = fetchOpenAiModels,
  resolveLaunch = resolveCodexCliLaunch,
  streamResponse = streamCodexAppServerResponse,
} = {}) {
  if (!db) throw new Error("A SQLite database is required.");
  const active = new Map();

  return Object.freeze({
    async getAuthentication() {
      try {
        await resolveLaunch();
      } catch {
        return { status: "unavailable" };
      }
      return (await readAuthentication())
        ? { status: "authenticated" }
        : { status: "absent" };
    },
    async listModels() {
      const catalog = await discoverModels();
      return Array.isArray(catalog?.models) ? catalog.models : [];
    },
    getCapabilities() {
      return {
        streaming: true,
        reasoning: true,
        toolCalls: false,
        interceptBeforeEffect: false,
      };
    },
    async *stream(request, { signal } = {}) {
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) controller.abort();
      active.set(request.executionId, controller);
      try {
        const projectPath = loadProjectPath(db, request);
        const response = streamResponse({
          abortSignal: controller.signal,
          chatId: request.executionId,
          codexPermissionMode: "default",
          messages: [
            {
              id: request.clientRequestId,
              role: "user",
              parts: [{ type: "text", text: request.prompt }],
            },
          ],
          model: request.model,
          projectReferencesPrompt: request.contextBytes,
          projectId: request.projectId,
          projectPath,
          responseMessageMetadata: {},
          conversationPromptBuilder: buildClyDevCodexPrompt,
          sandboxMode: "read-only",
          systemPrompt:
            "Cly Dev production execution is read-only in this Codex bridge. Do not modify files, run effectful commands, access the network, or request additional permissions.",
          turnSandboxPolicy: { type: "readOnly" },
        });
        yield* decodeProviderEvents(await response, controller.signal);
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
