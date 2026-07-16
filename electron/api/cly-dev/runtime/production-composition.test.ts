// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closePersistedStateDatabase,
  getStateDatabase,
} from "../../../persisted-state.js";
import { API_SESSION_TOKEN_HEADER, createApiApp } from "../../app.js";
import { createClyDevSessionRepository } from "../session-repository.js";
import { deriveTransferableContextSummary } from "./execution-runtime.js";

const NOW = "2026-07-16T12:00:00.000Z";
const TOKEN = "production-composition-test-token";
const headers = {
  [API_SESSION_TOKEN_HEADER]: TOKEN,
  "content-type": "application/json",
};

const createFixture = (metadata: Record<string, unknown> = {}) => {
  const directory = mkdtempSync(path.join(tmpdir(), "cly-dev-production-"));
  const db = getStateDatabase(path.join(directory, "state.sqlite"));
  db.prepare(
    `INSERT INTO projects
      (id, path, normalized_path, name, status, sort_order, metadata, created_at, updated_at)
     VALUES ('project-1', ?, ?, 'Project', 'open', 0, ?, ?, ?)`,
  ).run(directory, directory, JSON.stringify(metadata), NOW, NOW);
  const repository = createClyDevSessionRepository({ db, now: () => NOW });
  repository.createSessionAggregate("project-1", {
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
      objective: "Exercise production composition",
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
  });
  return { db, repository };
};

const requestBody = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  payloadVersion: 1,
  requestId: "request-1",
  prompt: "Make the approved change",
  mode: "execute",
  tools: [{ name: "writeFile" }],
  ...overrides,
});

afterEach(() => closePersistedStateDatabase());

describe("production Cly Dev execution composition", () => {
  it("registers strict routes and completes a durably approved provider/tool flow", async () => {
    const { db, repository } = createFixture({
      clyDevPolicy: { categories: { file_write: "approval" } },
    });
    const providerRequests: Record<string, unknown>[] = [];
    const runner = {
      getAuthentication: vi.fn(() => ({ status: "authenticated" })),
      listModels: vi.fn(() => [{ id: "test-model" }]),
      getCapabilities: vi.fn(() => ({
        streaming: true,
        reasoning: true,
        toolCalls: true,
        interceptBeforeEffect: true,
      })),
      async *stream(request: Record<string, unknown>) {
        providerRequests.push(request);
        yield {
          type: "tool_call",
          toolCallId: "call-1",
          tool: "writeFile",
          arguments: { filePath: "result.txt", content: "done" },
        };
        yield { type: "completed" };
      },
      cancel: vi.fn(),
    };
    const executeTool = vi.fn(() => ({ path: "result.txt", written: true }));
    const app = createApiApp(TOKEN, {
      clyDev: { getDatabase: () => db, runner, executeTool, now: () => NOW },
    });
    const route = "/api/projects/project-1/cly-dev/sessions/session-1/execute";

    const invalid = await app.request(route, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody({ unexpected: true })),
    });
    expect(invalid.status).toBe(400);

    const pendingResponse = await app.request(route, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody()),
    });
    expect(pendingResponse.status).toBe(200);
    const pending = await pendingResponse.json();
    expect(pending).toMatchObject({
      status: "awaiting_approval",
      approval: { projectId: "project-1", sessionId: "session-1" },
    });

    const resolution = await app.request(
      "/api/projects/project-1/cly-dev/sessions/session-1/events",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          schemaVersion: 1,
          payloadVersion: 1,
          idempotencyKey: "approve-call-1",
          type: "approval.resolved",
          transferability: "local-only",
          occurredAt: NOW,
          actor: { kind: "user", id: "user-1" },
          payload: {
            approvalId: pending.approval.approvalId,
            state: "approved",
            resolvedBy: "user-1",
          },
        }),
      },
    );
    expect(resolution.status).toBe(201);

    const resumed = await app.request(
      "/api/projects/project-1/cly-dev/sessions/session-1/resume",
      {
        method: "POST",
        headers,
        body: JSON.stringify(
          requestBody({
            approvals: {
              "call-1": { approvalId: pending.approval.approvalId },
            },
          }),
        ),
      },
    );
    expect(resumed.status).toBe(200);
    expect(await resumed.json()).toEqual({ status: "completed" });
    expect(providerRequests).toHaveLength(2);
    expect(runner.getAuthentication).toHaveBeenCalledTimes(2);
    expect(runner.listModels).toHaveBeenCalledTimes(2);
    expect(runner.getCapabilities).toHaveBeenCalledTimes(2);
    expect(providerRequests[1]).toMatchObject({
      projectId: "project-1",
      sessionId: "session-1",
      model: "test-model",
    });
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(
      repository
        .listEvents("project-1", "session-1")
        .map((event) => event.type),
    ).toEqual(
      expect.arrayContaining([
        "context.manifest.recorded",
        "approval.requested",
        "approval.resolved",
        "tool.recorded",
        "session.state.changed",
      ]),
    );
    expect(
      db
        .prepare(
          "SELECT status FROM cly_dev_tool_effects WHERE project_id = 'project-1' AND session_id = 'session-1'",
        )
        .get(),
    ).toEqual({ status: "completed" });
  });

  it("keeps concurrent cancellation scoped to the exact request", async () => {
    const { db } = createFixture({ clyDevPolicy: { default: "deny" } });
    const releases = new Map<string, () => void>();
    const executionIds = new Map<string, string>();
    const cancel = vi.fn();
    const runner = {
      getAuthentication: () => ({ status: "authenticated" }),
      listModels: () => [{ id: "test-model" }],
      getCapabilities: () => ({
        streaming: true,
        reasoning: true,
        toolCalls: false,
        interceptBeforeEffect: false,
      }),
      async *stream(request: Record<string, unknown>, { signal }) {
        executionIds.set(
          String(request.clientRequestId),
          String(request.executionId),
        );
        await new Promise<void>((resolve) => {
          releases.set(String(request.clientRequestId), resolve);
          signal.addEventListener("abort", resolve, { once: true });
        });
        yield signal.aborted ? { type: "canceled" } : { type: "completed" };
      },
      cancel,
    };
    const app = createApiApp(TOKEN, {
      clyDev: { getDatabase: () => db, runner, now: () => NOW },
    });
    const execute = (requestId: string) =>
      app.request(
        "/api/projects/project-1/cly-dev/sessions/session-1/execute",
        {
          method: "POST",
          headers,
          body: JSON.stringify(
            requestBody({
              requestId,
              prompt: `wait ${requestId}`,
              mode: "read_only",
              tools: [],
            }),
          ),
        },
      );
    const first = execute("request-a");
    const second = execute("request-b");
    await vi.waitFor(() => expect(releases.size).toBe(2));

    const canceled = await app.request(
      "/api/projects/project-1/cly-dev/sessions/session-1/cancel",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          schemaVersion: 1,
          payloadVersion: 1,
          requestId: "request-a",
        }),
      },
    );
    expect(canceled.status).toBe(200);
    expect(cancel).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledWith(executionIds.get("request-a"));
    expect(cancel).not.toHaveBeenCalledWith(executionIds.get("request-b"));
    releases.get("request-b")?.();

    expect(await (await first).json()).toEqual({ status: "canceled" });
    expect(await (await second).json()).toEqual({ status: "completed" });
  });
});
