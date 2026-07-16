const json = (value) => JSON.stringify(value);
const parse = (value) => JSON.parse(value);

class DurableToolEffectError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "DurableToolEffectError";
    this.code = code;
    this.retryable = false;
  }
}

const validateInput = ({ key, scope, execute }) => {
  if (typeof key !== "string" || !key) {
    throw new DurableToolEffectError(
      "INVALID_DURABLE_EFFECT_KEY",
      "A stable durable effect execution key is required.",
    );
  }
  if (
    !scope ||
    typeof scope !== "object" ||
    !scope.projectId ||
    !scope.sessionId ||
    !scope.requestId ||
    !scope.toolCallId
  ) {
    throw new DurableToolEffectError(
      "INVALID_DURABLE_EFFECT_SCOPE",
      "Durable effects require exact project, session, request, and tool-call scope.",
    );
  }
  if (typeof execute !== "function") {
    throw new DurableToolEffectError(
      "INVALID_DURABLE_EFFECT_EXECUTOR",
      "A durable effect executor is required.",
    );
  }
};

const sameScope = (row, scope) =>
  row.project_id === scope.projectId &&
  row.session_id === scope.sessionId &&
  row.request_id === scope.requestId &&
  row.tool_call_id === scope.toolCallId;

const equalScopes = (left, right) =>
  left.projectId === right.projectId &&
  left.sessionId === right.sessionId &&
  left.requestId === right.requestId &&
  left.toolCallId === right.toolCallId;

const storedFailure = (row) => {
  let stored = {};
  try {
    stored = parse(row.error_json);
  } catch {
    stored = {};
  }
  return new DurableToolEffectError(
    stored.code ?? "DURABLE_EFFECT_PREVIOUSLY_FAILED",
    stored.message ??
      "The durable effect previously failed and will not be replayed.",
  );
};

const errorRecord = (error) => ({
  code:
    typeof error?.code === "string" && error.code
      ? error.code
      : "TOOL_EFFECT_FAILED",
  message:
    typeof error?.message === "string" && error.message
      ? error.message
      : "The tool effect failed.",
});

export function createDurableToolEffects({
  db,
  now = () => new Date().toISOString(),
} = {}) {
  if (!db) throw new Error("A SQLite database is required.");
  const inFlight = new Map();

  const inspectOrClaim = (key, scope) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const existing = db
        .prepare(
          "SELECT * FROM cly_dev_tool_effects WHERE stable_execution_key = ?",
        )
        .get(key);
      if (existing) {
        if (!sameScope(existing, scope)) {
          throw new DurableToolEffectError(
            "DURABLE_EFFECT_SCOPE_MISMATCH",
            "The stable effect key is already bound to a different execution scope.",
          );
        }
        db.exec("COMMIT");
        if (existing.status === "completed") {
          return { kind: "completed", result: parse(existing.result_json) };
        }
        if (existing.status === "failed") throw storedFailure(existing);
        throw new DurableToolEffectError(
          "DURABLE_EFFECT_INDETERMINATE",
          "A previous process claimed this effect without recording an outcome; it will not be silently replayed.",
        );
      }
      db.prepare(
        `INSERT INTO cly_dev_tool_effects
         (stable_execution_key, project_id, session_id, request_id, tool_call_id,
          status, result_json, error_json, claimed_at, completed_at, failed_at)
         VALUES (?, ?, ?, ?, ?, 'claimed', NULL, NULL, ?, NULL, NULL)`,
      ).run(
        key,
        scope.projectId,
        scope.sessionId,
        scope.requestId,
        scope.toolCallId,
        now(),
      );
      db.exec("COMMIT");
      return { kind: "claimed" };
    } catch (error) {
      if (db.isTransaction) db.exec("ROLLBACK");
      throw error;
    }
  };

  const executeClaim = async ({ key, scope, execute }) => {
    const claim = inspectOrClaim(key, scope);
    if (claim.kind === "completed") {
      return { executed: false, result: claim.result };
    }
    try {
      const result = await execute();
      const resultJson = json(result);
      if (resultJson === undefined) {
        throw new DurableToolEffectError(
          "INVALID_DURABLE_EFFECT_RESULT",
          "Tool effects must return a JSON-serializable result.",
        );
      }
      const completedAt = now();
      const update = db
        .prepare(
          `UPDATE cly_dev_tool_effects
           SET status = 'completed', result_json = ?, completed_at = ?
           WHERE stable_execution_key = ? AND project_id = ? AND session_id = ?
             AND request_id = ? AND tool_call_id = ? AND status = 'claimed'`,
        )
        .run(
          resultJson,
          completedAt,
          key,
          scope.projectId,
          scope.sessionId,
          scope.requestId,
          scope.toolCallId,
        );
      if (update.changes !== 1) {
        throw new DurableToolEffectError(
          "DURABLE_EFFECT_FINALIZATION_FAILED",
          "The claimed tool effect could not be finalized atomically.",
        );
      }
      return { executed: true, result };
    } catch (error) {
      if (error?.code !== "DURABLE_EFFECT_FINALIZATION_FAILED") {
        db.prepare(
          `UPDATE cly_dev_tool_effects
           SET status = 'failed', error_json = ?, failed_at = ?
           WHERE stable_execution_key = ? AND project_id = ? AND session_id = ?
             AND request_id = ? AND tool_call_id = ? AND status = 'claimed'`,
        ).run(
          json(errorRecord(error)),
          now(),
          key,
          scope.projectId,
          scope.sessionId,
          scope.requestId,
          scope.toolCallId,
        );
      }
      throw error;
    }
  };

  return Object.freeze({
    async executeOnce(input) {
      validateInput(input);
      const active = inFlight.get(input.key);
      if (active) {
        if (!equalScopes(active.scope, input.scope)) {
          throw new DurableToolEffectError(
            "DURABLE_EFFECT_SCOPE_MISMATCH",
            "The in-flight stable effect key belongs to another scope.",
          );
        }
        const outcome = await active.promise;
        return { executed: false, result: outcome.result };
      }
      const promise = executeClaim(input);
      inFlight.set(input.key, { promise, scope: input.scope });
      try {
        return await promise;
      } finally {
        if (inFlight.get(input.key)?.promise === promise) {
          inFlight.delete(input.key);
        }
      }
    },
  });
}

export { DurableToolEffectError };
