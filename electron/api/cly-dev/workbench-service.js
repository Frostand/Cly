import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createApprovalGate } from "./runtime/approval-gate.js";
import { productionClyDevLoaders } from "./runtime/production-composition.js";
import { createProjectScopedToolExecutor } from "./runtime/project-tool-executor.js";
import { createClyDevSessionRepository } from "./session-repository.js";

const MAX_EVENT_OUTPUT_CHARS = 500_000;
const activeProcesses = new Map();

const processKey = ({ projectId, sessionId, requestId }) =>
  `${projectId}:${sessionId}:${requestId}`;

const event = ({
  actor = { kind: "user", id: "local-user" },
  idempotencyKey,
  now,
  payload,
  type,
}) => ({
  schemaVersion: 1,
  payloadVersion: 1,
  idempotencyKey,
  type,
  transferability: "local-only",
  occurredAt: now(),
  actor,
  payload,
});

const clipOutput = (value) => {
  const text = typeof value === "string" ? value : "";
  return text.length > MAX_EVENT_OUTPUT_CHARS
    ? { text: text.slice(0, MAX_EVENT_OUTPUT_CHARS), truncated: true }
    : { text, truncated: false };
};

const packageManagerCommand = (packageManager) => {
  const name =
    typeof packageManager === "string" ? packageManager.split("@")[0] : null;
  return new Set(["npm", "pnpm", "yarn", "bun"]).has(name) ? name : "npm";
};

export async function discoverProjectTestCommands(root) {
  try {
    const raw = await fs.readFile(path.join(root, "package.json"), "utf8");
    const manifest = JSON.parse(raw);
    const runner = packageManagerCommand(manifest.packageManager);
    return Object.entries(manifest.scripts ?? {})
      .filter(
        ([name, command]) =>
          typeof command === "string" &&
          /^(?:test|e2e|check)(?::|$)/i.test(name),
      )
      .slice(0, 20)
      .map(([name, script]) => ({
        id: `package:${name}`,
        label: name,
        command:
          runner === "npm" || runner === "bun"
            ? `${runner} run ${name}`
            : `${runner} ${name}`,
        script,
      }));
  } catch {
    return [];
  }
}

export const parseTestCounts = (output) => {
  const passed =
    [...output.matchAll(/(\d+)\s+passed\b/gi)]
      .map((match) => Number(match[1]))
      .filter(Number.isFinite)
      .at(-1) ?? 0;
  const failed =
    [...output.matchAll(/(\d+)\s+failed\b/gi)]
      .map((match) => Number(match[1]))
      .filter(Number.isFinite)
      .at(-1) ?? 0;
  return { passed, failed };
};

export function createClyDevWorkbenchService({
  db,
  repository = db ? createClyDevSessionRepository({ db }) : undefined,
  approvalGate,
  authorizeCommand,
  executeTool,
  resolveWorkspaceAuthority = async ({ localOnly }) => localOnly,
  now = () => new Date().toISOString(),
} = {}) {
  if (!db) throw new Error("A SQLite database is required.");
  if (!repository) throw new Error("A Cly Dev session repository is required.");
  const gate =
    approvalGate ??
    createApprovalGate({
      loadProjectPolicy: (projectId) =>
        productionClyDevLoaders.loadProjectPolicy(db, projectId),
      loadApproval: (approvalId, scope) =>
        productionClyDevLoaders.loadApproval(db, approvalId, scope),
      now,
    });
  const executor =
    executeTool ?? createProjectScopedToolExecutor({ db, authorizeCommand });

  const loadScope = async (projectId, sessionId) => {
    const source = repository.getHandoffSource(projectId, sessionId);
    const localOnly = await resolveWorkspaceAuthority({
      projectId,
      localOnly: source.workspace.localOnly,
    });
    const root = localOnly?.worktreePath;
    if (typeof root !== "string" || !path.isAbsolute(root)) {
      throw new Error(
        "The Cly Dev worktree path is unavailable on this machine.",
      );
    }
    return {
      root: path.resolve(root),
      source: {
        ...source,
        workspace: { ...source.workspace, localOnly },
      },
    };
  };

  const toolCallFor = ({ command, requestId }) => ({
    toolCallId: requestId,
    tool: "runCommand",
    arguments: { command },
  });

  const contextHashFor = (projectId, sessionId) =>
    repository.getOutboundContext(projectId, sessionId).previewSha256;

  const append = (projectId, sessionId, value) =>
    repository.appendEvent(projectId, sessionId, value);

  return Object.freeze({
    async getContext(projectId, sessionId) {
      const { root, source } = await loadScope(projectId, sessionId);
      return {
        workspace: source.workspace,
        task: source.task,
        session: source.session,
        snapshot: repository.getSnapshot(projectId, sessionId),
        events: source.events.slice(-500),
        testCommands: await discoverProjectTestCommands(root),
        processIds: [...activeProcesses.values()]
          .filter(
            (item) =>
              item.projectId === projectId && item.sessionId === sessionId,
          )
          .map((item) => item.requestId),
      };
    },

    async requestCommand({
      projectId,
      sessionId,
      requestId = randomUUID(),
      command,
    }) {
      await loadScope(projectId, sessionId);
      const toolCall = toolCallFor({ command, requestId });
      const contextHash = contextHashFor(projectId, sessionId);
      const decision = await gate.evaluate({
        projectId,
        sessionId,
        requestId,
        toolCall,
        contextHash,
      });
      if (decision.type === "deny") {
        const error = new Error(
          decision.reason ?? "Project policy denied this command.",
        );
        error.code = decision.code;
        throw error;
      }
      if (decision.type === "allow") {
        return { status: "approved", requestId, approval: null };
      }
      const approval = decision.approval;
      append(
        projectId,
        sessionId,
        event({
          now,
          idempotencyKey: `workbench:${requestId}:approval-requested`,
          type: "approval.requested",
          payload: {
            approvalId: approval.approvalId,
            title: "Run project command",
            detail: JSON.stringify(approval),
            requestedAction: "command",
          },
        }),
      );
      return { status: "approval_required", requestId, approval };
    },

    async executeCommand({
      projectId,
      sessionId,
      requestId,
      command,
      approvalId,
    }) {
      const { root } = await loadScope(projectId, sessionId);
      const recorded = repository.findEventByIdempotencyKey(
        projectId,
        sessionId,
        `workbench:${requestId}:process`,
      );
      if (recorded) {
        return { ...recorded.payload, requestId, duplicate: true };
      }
      const key = processKey({ projectId, sessionId, requestId });
      if (activeProcesses.has(key)) {
        throw new Error("This command is already running.");
      }
      const toolCall = toolCallFor({ command, requestId });
      const contextHash = contextHashFor(projectId, sessionId);
      const decision = await gate.evaluate({
        projectId,
        sessionId,
        requestId,
        toolCall,
        contextHash,
        approval: approvalId,
      });
      if (decision.type !== "allow") {
        const error = new Error(
          decision.reason ??
            (decision.type === "pending"
              ? "Command approval is still pending."
              : "Command approval was denied."),
        );
        error.code = decision.code;
        throw error;
      }

      const controller = new AbortController();
      const startedAt = now();
      activeProcesses.set(key, { projectId, sessionId, requestId, controller });
      append(
        projectId,
        sessionId,
        event({
          now,
          idempotencyKey: `workbench:${requestId}:tool-started`,
          type: "tool.recorded",
          payload: {
            toolCallId: requestId,
            tool: "runCommand",
            status: "started",
          },
        }),
      );

      try {
        const result = await executor(toolCall, {
          projectId,
          sessionId,
          signal: controller.signal,
        });
        const stdout = clipOutput(result.stdout);
        const stderr = clipOutput(result.stderr);
        const status = result.exitCode === 0 ? "completed" : "failed";
        append(
          projectId,
          sessionId,
          event({
            now,
            idempotencyKey: `workbench:${requestId}:process`,
            type: "process.recorded",
            payload: {
              requestId,
              command,
              cwd: root,
              status,
              stdout: stdout.text,
              stderr: stderr.text,
              exitCode: result.exitCode,
              signal: result.signal,
              startedAt,
              finishedAt: now(),
              truncated: stdout.truncated || stderr.truncated,
            },
          }),
        );
        append(
          projectId,
          sessionId,
          event({
            now,
            idempotencyKey: `workbench:${requestId}:tool-finished`,
            type: "tool.recorded",
            payload: {
              toolCallId: requestId,
              tool: "runCommand",
              status: status === "completed" ? "completed" : "failed",
              exitCode: result.exitCode,
            },
          }),
        );
        if (/\b(?:test|vitest|jest|playwright|pytest)\b/i.test(command)) {
          const counts = parseTestCounts(`${result.stdout}\n${result.stderr}`);
          append(
            projectId,
            sessionId,
            event({
              now,
              idempotencyKey: `workbench:${requestId}:test`,
              type: "test.recorded",
              payload: {
                commandId: requestId,
                passed: counts.passed,
                failed: Math.max(counts.failed, result.exitCode === 0 ? 0 : 1),
                durationMs: Math.max(
                  0,
                  Date.parse(now()) - Date.parse(startedAt),
                ),
              },
            }),
          );
        }
        return {
          ...result,
          requestId,
          command,
          cwd: root,
          status,
          truncated: stdout.truncated || stderr.truncated,
        };
      } catch (error) {
        const canceled =
          controller.signal.aborted || error?.name === "AbortError";
        append(
          projectId,
          sessionId,
          event({
            now,
            idempotencyKey: `workbench:${requestId}:process`,
            type: "process.recorded",
            payload: {
              requestId,
              command,
              cwd: root,
              status: canceled ? "canceled" : "failed",
              stdout: "",
              stderr:
                error instanceof Error ? error.message : "Command failed.",
              exitCode: null,
              signal: canceled ? "SIGTERM" : null,
              startedAt,
              finishedAt: now(),
              truncated: false,
            },
          }),
        );
        append(
          projectId,
          sessionId,
          event({
            now,
            idempotencyKey: `workbench:${requestId}:tool-finished`,
            type: "tool.recorded",
            payload: {
              toolCallId: requestId,
              tool: "runCommand",
              status: "failed",
              exitCode: null,
            },
          }),
        );
        throw error;
      } finally {
        activeProcesses.delete(key);
      }
    },

    cancelCommand({ projectId, sessionId, requestId }) {
      const active = activeProcesses.get(
        processKey({ projectId, sessionId, requestId }),
      );
      if (!active) return false;
      active.controller.abort();
      return true;
    },
  });
}
