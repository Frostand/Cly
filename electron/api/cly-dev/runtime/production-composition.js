import { createClyDevSessionRepository } from "../session-repository.js";
import { createApprovalGate } from "./approval-gate.js";
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
  provider,
  approvalGate,
  executeTool,
  durableToolEffects,
  now,
} = {}) {
  if (!db) throw new Error("A SQLite database is required.");
  if (!repository) throw new Error("A Cly Dev session repository is required.");
  const productionRunner = runner ?? createSignedInCodexRunner({ db });
  const productionProvider =
    provider ?? createProductionClyDevProvider({ runner: productionRunner });
  const productionGate =
    approvalGate ??
    createApprovalGate({
      loadProjectPolicy: (projectId) => loadProjectPolicy(db, projectId),
      loadApproval: (approvalId, scope) => loadApproval(db, approvalId, scope),
      ...(now ? { now } : {}),
    });
  const core = createClyDevExecutionRuntime({
    repository,
    provider: productionProvider,
    approvalGate: productionGate,
    executeTool: executeTool ?? createProjectScopedToolExecutor({ db }),
    durableToolEffects:
      durableToolEffects ??
      createDurableToolEffects({ db, ...(now ? { now } : {}) }),
    ...(now ? { now } : {}),
  });

  const prepare = (request) => {
    const session = repository.getSnapshot(
      request.projectId,
      request.sessionId,
    );
    if (!new Set(["openai", "openai-codex"]).has(session.provider.id)) {
      throw new Error(
        `Session provider ${session.provider.id} is not supported by the production Cly Dev runtime.`,
      );
    }
    return { ...request, model: session.provider.model };
  };

  return Object.freeze({
    execute: (request) => core.execute(prepare(request)),
    resume: (request) => core.resume(prepare(request)),
    cancel(scope) {
      repository.getSnapshot(scope.projectId, scope.sessionId);
      return core.cancel(scope);
    },
  });
}

export const productionClyDevLoaders = Object.freeze({
  loadApproval,
  loadProjectPolicy,
});
