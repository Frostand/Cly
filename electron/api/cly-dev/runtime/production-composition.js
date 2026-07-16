import {
  hashApprovalAction,
  waitForToolApproval,
} from "../../tool-approvals.js";
import { createClyDevSessionRepository } from "../session-repository.js";
import { createApprovalGate } from "./approval-gate.js";
import { createSignedInClaudeRunner } from "./claude-runner.js";
import { createSignedInCodexRunner } from "./codex-runner.js";
import { createDurableToolEffects } from "./durable-tool-effects.js";
import { createClyDevExecutionRuntime } from "./execution-runtime.js";
import { createProductionClyDevProvider } from "./production-provider.js";
import { createProjectScopedToolExecutor } from "./project-tool-executor.js";

const parseJson = (value, fallback = null) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const loadProjectPolicy = (db, projectId) => {
  const row = db
    .prepare("SELECT metadata FROM projects WHERE id = ?")
    .get(projectId);
  if (!row) throw new Error("Project was not found.");
  return parseJson(row.metadata, {})?.clyDevPolicy ?? null;
};

const loadApproval = (db, approvalId, scope) => {
  const row = db
    .prepare(
      `SELECT * FROM cly_dev_approvals
       WHERE id = ? AND project_id = ? AND session_id = ?`,
    )
    .get(approvalId, scope.projectId, scope.sessionId);
  if (!row) return null;
  const payload = parseJson(row.payload_json, {});
  const durableScope = parseJson(payload.detail, {});
  return {
    ...durableScope,
    approvalId: row.id,
    state: row.state,
    ...(payload.resolvedBy ? { resolvedBy: payload.resolvedBy } : {}),
    resolutionRecorded: row.resolution_sequence !== null,
  };
};

export function createProductionClyDevRuntime({
  db,
  repository = db ? createClyDevSessionRepository({ db }) : undefined,
  runner,
  claudeRunner,
  provider,
  claudeProvider,
  approvalGate,
  executeTool,
  durableToolEffects,
  requestApproval,
  now,
} = {}) {
  if (!db) throw new Error("A SQLite database is required.");
  if (!repository) throw new Error("A Cly Dev session repository is required.");
  const productionRunner = runner ?? createSignedInCodexRunner({ db });
  const productionClaudeRunner =
    claudeRunner ?? createSignedInClaudeRunner({ db });
  const productionProvider =
    provider ?? createProductionClyDevProvider({ runner: productionRunner });
  const productionClaudeProvider =
    claudeProvider ??
    createProductionClyDevProvider({
      id: "anthropic-claude",
      runner: productionClaudeRunner,
    });
  const productionGate =
    approvalGate ??
    createApprovalGate({
      loadProjectPolicy: (projectId) => loadProjectPolicy(db, projectId),
      loadApproval: (approvalId, scope) => loadApproval(db, approvalId, scope),
      ...(now ? { now } : {}),
    });
  const productionExecuteTool =
    executeTool ?? createProjectScopedToolExecutor({ db });
  const productionDurableEffects =
    durableToolEffects ??
    createDurableToolEffects({ db, ...(now ? { now } : {}) });
  const productionApprovalBroker =
    requestApproval ??
    (async ({ approval, request, signal, toolCall }) => {
      const brokerRequest = {
        durableScope: approval,
        input: toolCall.arguments,
        toolName: toolCall.tool,
      };
      const runId = request.requestId;
      const response = await waitForToolApproval({
        id: approval.approvalId,
        projectId: request.projectId,
        provider: "anthropic",
        request: brokerRequest,
        runId,
        signal,
      });
      if (
        response.id !== approval.approvalId ||
        response.projectId !== request.projectId ||
        response.runId !== runId ||
        response.actionHash !== hashApprovalAction(brokerRequest) ||
        (response.approved && response.expiresAt <= Date.now())
      ) {
        const error = new Error(
          "The approval broker response did not match the exact pending effect.",
        );
        error.code = "APPROVAL_BINDING_MISMATCH";
        error.retryable = false;
        throw error;
      }
      return response;
    });
  const createCore = (selectedProvider, useApprovalBroker) =>
    createClyDevExecutionRuntime({
      repository,
      provider: selectedProvider,
      approvalGate: productionGate,
      executeTool: productionExecuteTool,
      durableToolEffects: productionDurableEffects,
      ...(useApprovalBroker
        ? { requestApproval: productionApprovalBroker }
        : {}),
      ...(now ? { now } : {}),
    });
  const cores = Object.freeze({
    anthropic: createCore(productionClaudeProvider, true),
    openai: createCore(productionProvider, false),
  });

  const prepare = (request) => {
    const session = repository.getSnapshot(
      request.projectId,
      request.sessionId,
    );
    const providerFamily = new Set(["openai", "openai-codex"]).has(
      session.provider.id,
    )
      ? "openai"
      : new Set(["anthropic", "anthropic-claude"]).has(session.provider.id)
        ? "anthropic"
        : null;
    if (!providerFamily) {
      throw new Error(
        `Session provider ${session.provider.id} is not supported by the production Cly Dev runtime.`,
      );
    }
    return {
      core: cores[providerFamily],
      request: { ...request, model: session.provider.model },
    };
  };

  return Object.freeze({
    execute(request) {
      const prepared = prepare(request);
      return prepared.core.execute(prepared.request);
    },
    resume(request) {
      const prepared = prepare(request);
      return prepared.core.resume(prepared.request);
    },
    cancel(scope) {
      const prepared = prepare({ ...scope, prompt: "", mode: "read_only" });
      return prepared.core.cancel(scope);
    },
  });
}

export const productionClyDevLoaders = Object.freeze({
  loadApproval,
  loadProjectPolicy,
});
