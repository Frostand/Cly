// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closePersistedStateDatabase,
  getStateDatabase,
} from "../../../persisted-state.js";
import { createClyDevSessionRepository } from "../session-repository.js";
import { createDurableToolEffects } from "./durable-tool-effects.js";
import { deriveTransferableContextSummary } from "./execution-runtime.js";

const NOW = "2026-07-16T12:00:00.000Z";

const createFixture = () => {
  const directory = mkdtempSync(path.join(tmpdir(), "cly-dev-effects-"));
  const db = getStateDatabase(path.join(directory, "state.sqlite"));
  db.prepare(
    `INSERT INTO projects
      (id, path, normalized_path, name, status, sort_order, metadata, created_at, updated_at)
     VALUES ('project-1', ?, ?, 'Project', 'open', 0, '{}', ?, ?)`,
  ).run(directory, directory, NOW, NOW);
  createClyDevSessionRepository({ db, now: () => NOW }).createSessionAggregate(
    "project-1",
    {
      workspace: {
        schemaVersion: 1,
        idempotencyKey: "workspace-key",
        id: "workspace-1",
        name: "Workspace",
        repository: { id: "repo-1" },
        worktree: { id: "worktree-1", branch: "main" },
        machine: { id: "machine-1", platform: "darwin" },
        localOnly: { repositoryPath: directory, worktreePath: directory },
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
        transferable: {
          summary: deriveTransferableContextSummary([]),
          entries: [],
        },
      },
      task: {
        schemaVersion: 1,
        idempotencyKey: "task-key",
        id: "task-1",
        title: "Task",
        objective: "Test atomic effects",
        researchObjectIds: [],
      },
      session: {
        schemaVersion: 1,
        idempotencyKey: "session-key",
        id: "session-1",
        title: "Session",
        provider: { id: "openai-codex", model: "test-model" },
        commit: { sha: "a".repeat(40) },
        state: "running",
      },
    },
  );
  return { db };
};

afterEach(() => closePersistedStateDatabase());

describe("DB-backed Cly Dev durable tool effects", () => {
  it("executes concurrent and later duplicate stable keys exactly once", async () => {
    const { db } = createFixture();
    const effects = createDurableToolEffects({ db, now: () => NOW });
    let release!: (value: { ok: boolean }) => void;
    const blocked = new Promise<{ ok: boolean }>((resolve) => {
      release = resolve;
    });
    const execute = vi.fn(() => blocked);
    const input = {
      key: "cly-dev:project-1:session-1:request-1:tool:call-1",
      scope: {
        projectId: "project-1",
        sessionId: "session-1",
        requestId: "request-1",
        toolCallId: "call-1",
        toolName: "writeFile",
        argumentsSha256: "a".repeat(64),
      },
      execute,
    };

    const first = effects.executeOnce(input);
    const concurrent = effects.executeOnce(input);
    release({ ok: true });

    await expect(first).resolves.toEqual({
      executed: true,
      result: { ok: true },
    });
    await expect(concurrent).resolves.toEqual({
      executed: false,
      result: { ok: true },
    });
    await expect(
      createDurableToolEffects({ db, now: () => NOW }).executeOnce({
        ...input,
        execute: vi.fn(() => ({ ok: false })),
      }),
    ).resolves.toEqual({ executed: false, result: { ok: true } });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(
      db
        .prepare(
          "SELECT status, result_json, tool_name, arguments_sha256 FROM cly_dev_tool_effects WHERE stable_execution_key = ?",
        )
        .get(input.key),
    ).toMatchObject({
      status: "completed",
      result_json: '{"ok":true}',
      tool_name: "writeFile",
      arguments_sha256: "a".repeat(64),
    });

    for (const scope of [
      { ...input.scope, toolName: "runCommand" },
      { ...input.scope, argumentsSha256: "b".repeat(64) },
    ]) {
      await expect(
        createDurableToolEffects({ db, now: () => NOW }).executeOnce({
          ...input,
          scope,
          execute: vi.fn(),
        }),
      ).rejects.toMatchObject({ code: "DURABLE_EFFECT_FINGERPRINT_MISMATCH" });
    }
  });

  it("fails closed for a crash-left claim instead of silently replaying it", async () => {
    const { db } = createFixture();
    const key = "cly-dev:project-1:session-1:request-2:tool:call-2";
    db.prepare(
      `INSERT INTO cly_dev_tool_effects
       (stable_execution_key, project_id, session_id, request_id, tool_call_id,
        tool_name, arguments_sha256,
        status, result_json, error_json, claimed_at, completed_at, failed_at)
       VALUES (?, 'project-1', 'session-1', 'request-2', 'call-2',
        'runCommand', ?,
        'claimed', NULL, NULL, ?, NULL, NULL)`,
    ).run(key, "c".repeat(64), NOW);
    const execute = vi.fn();

    await expect(
      createDurableToolEffects({ db, now: () => NOW }).executeOnce({
        key,
        scope: {
          projectId: "project-1",
          sessionId: "session-1",
          requestId: "request-2",
          toolCallId: "call-2",
          toolName: "runCommand",
          argumentsSha256: "c".repeat(64),
        },
        execute,
      }),
    ).rejects.toMatchObject({ code: "DURABLE_EFFECT_INDETERMINATE" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("fails closed when a recorded pre-0020 effect has no fingerprint", async () => {
    const { db } = createFixture();
    const key = "cly-dev:project-1:session-1:legacy:tool:call-legacy";
    db.exec("DROP TRIGGER cly_dev_tool_effects_fingerprint_insert");
    db.prepare(
      `INSERT INTO cly_dev_tool_effects
       (stable_execution_key, project_id, session_id, request_id, tool_call_id,
        status, result_json, error_json, claimed_at, completed_at, failed_at)
       VALUES (?, 'project-1', 'session-1', 'legacy', 'call-legacy',
        'completed', '{"legacy":true}', NULL, ?, ?, NULL)`,
    ).run(key, NOW, NOW);
    const execute = vi.fn();

    await expect(
      createDurableToolEffects({ db, now: () => NOW }).executeOnce({
        key,
        scope: {
          projectId: "project-1",
          sessionId: "session-1",
          requestId: "legacy",
          toolCallId: "call-legacy",
          toolName: "writeFile",
          argumentsSha256: "d".repeat(64),
        },
        execute,
      }),
    ).rejects.toMatchObject({ code: "DURABLE_EFFECT_FINGERPRINT_MISSING" });
    expect(execute).not.toHaveBeenCalled();
  });
});
