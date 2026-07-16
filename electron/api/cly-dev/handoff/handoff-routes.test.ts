// @vitest-environment node
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { createClyDevSessionRepository } from "../session-repository.js";
import { hashHandoffPayload } from "./canonical-json.js";
import { registerClyDevHandoffRoutes } from "./handoff-routes.js";

const openDatabases: DatabaseSync[] = [];
const migration = (name: string) =>
  readFileSync(
    new URL(`../../../drizzle/${name}`, import.meta.url),
    "utf8",
  ).replaceAll("--> statement-breakpoint", "");

const validEnvelope = () => {
  const envelope = JSON.parse(
    readFileSync(new URL("./fixtures/valid-v1.json", import.meta.url), "utf8"),
  );
  envelope.integrity.digest = hashHandoffPayload(envelope.payload);
  return envelope;
};

function setup() {
  const directory = mkdtempSync(path.join(tmpdir(), "cly-handoff-routes-"));
  const db = new DatabaseSync(path.join(directory, "state.sqlite"));
  openDatabases.push(db);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("CREATE TABLE projects (id TEXT PRIMARY KEY NOT NULL);");
  db.exec(migration("0015_cly_dev_sessions.sql"));
  db.exec(migration("0016_cly_dev_handoffs.sql"));
  db.prepare("INSERT INTO projects (id) VALUES (?), (?)").run(
    "source-project",
    "target-project",
  );

  const now = () => "2026-07-16T12:00:00.000Z";
  const sessions = createClyDevSessionRepository({ db, now });
  const source = sessions.createSessionAggregate("source-project", {
    workspace: {
      schemaVersion: 1,
      idempotencyKey: "source-workspace",
      name: "Source workspace",
      repository: {
        id: "repo-1",
        remoteUrl: "https://github.com/example/cly.git",
      },
      worktree: { id: "worktree-1", branch: "feature/handoff" },
      machine: { id: "source-machine", platform: "darwin" },
      localOnly: {
        repositoryPath: "/source/private/repository",
        worktreePath: "/source/private/worktree",
      },
    },
    contextManifest: {
      schemaVersion: 1,
      idempotencyKey: "source-context",
      localOnly: {
        absolutePaths: ["/source/private/config"],
        environmentVariableNames: ["SOURCE_TOKEN"],
        notes: ["source-only"],
        uncommittedFilePaths: ["private.txt"],
      },
      transferable: {
        summary: "Committed implementation context",
        entries: [
          {
            kind: "repository_file",
            repositoryId: "repo-1",
            relativePath: "src/index.ts",
            commitSha: "a".repeat(40),
            objectHash: "b".repeat(40),
          },
          { kind: "research_object", researchObjectId: "research-1" },
        ],
      },
    },
    task: {
      schemaVersion: 1,
      idempotencyKey: "source-task",
      title: "Implement durable handoff",
      objective: "Resume without replaying chat",
      researchObjectIds: ["research-1"],
    },
    session: {
      schemaVersion: 1,
      idempotencyKey: "source-session",
      title: "Durable handoff session",
      provider: { id: "source-provider", model: "source-model" },
      commit: { sha: "a".repeat(40) },
      state: "resumable",
    },
  });
  sessions.appendEvent("source-project", source.session.id, {
    schemaVersion: 1,
    payloadVersion: 1,
    idempotencyKey: "source-plan",
    type: "plan.recorded",
    transferability: "local-only",
    occurredAt: now(),
    actor: { kind: "agent", id: "source-agent" },
    payload: {
      steps: [
        {
          id: "step-1",
          text: "Materialize imported state",
          status: "in_progress",
        },
      ],
    },
  });
  sessions.appendEvent("source-project", source.session.id, {
    schemaVersion: 1,
    payloadVersion: 1,
    idempotencyKey: "source-remaining-work",
    type: "remaining_work.recorded",
    transferability: "local-only",
    occurredAt: now(),
    actor: { kind: "agent", id: "source-agent" },
    payload: { items: ["Verify the linked resumable session"] },
  });
  const targetWorkspace = sessions.createWorkspace("target-project", {
    schemaVersion: 1,
    idempotencyKey: "target-workspace",
    name: "Target workspace",
    repository: {
      id: "repo-1",
      remoteUrl: "https://github.com/example/cly.git",
    },
    worktree: { id: "worktree-1", branch: "feature/handoff" },
    machine: { id: "target-machine", platform: "linux" },
    localOnly: {
      repositoryPath: "/target/local/repository",
      worktreePath: "/target/local/worktree",
    },
  });

  const inspection = {
    repository: {
      id: "repo-1",
      branch: "feature/handoff",
      worktreeId: "worktree-1",
      commitSha: "a".repeat(40),
      files: [{ relativePath: "src/index.ts", objectHash: "b".repeat(40) }],
    },
    research: {
      objects: [
        { id: "research-1", version: "v3", contentHash: "c".repeat(64) },
      ],
    },
    capabilities: ["tool_calls", "structured_output"],
  };
  const app = new Hono();
  registerClyDevHandoffRoutes(app, {
    getDatabase: () => db,
    getSessionRepository: () => sessions,
    projectExists: ({ projectId }) =>
      db.prepare("SELECT id FROM projects WHERE id = ?").get(projectId),
    inspectRepository: () => inspection.repository,
    inspectResearch: () => inspection.research,
    getProviderCapabilities: () => inspection.capabilities,
    inspectPermissions: () => ({
      compatible: true,
      current: {
        filesystem: "workspace-write",
        network: "restricted",
        commands: ["pnpm vitest"],
      },
    }),
    inspectApprovals: () => ({
      compatible: true,
      currentApprovalIds: ["fresh-target-approval"],
    }),
    getProviderRequirements: () => ({
      required: true,
      capabilities: ["tool_calls", "structured_output"],
    }),
    inspectSourceResearch: () => inspection.research,
    resolveTargetWorkspace: () => targetWorkspace,
    resolveTargetProvider: () => ({
      id: "target-provider",
      model: "target-model",
    }),
    now,
  });
  return { app, db, inspection, sessions, source, targetWorkspace };
}

afterEach(() => {
  while (openDatabases.length) openDatabases.pop()?.close();
});

describe("Cly Dev handoff routes", () => {
  it("exports a durable aggregate and imports linked actionable state without chat", async () => {
    const { app, db, sessions, source, targetWorkspace } = setup();
    const exportedResponse = await app.request(
      "/api/projects/source-project/cly-dev/handoffs/export",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: source.session.id }),
      },
    );
    expect(exportedResponse.status).toBe(200);
    const envelope = await exportedResponse.json();
    expect(envelope.payload.messages).toEqual([]);
    expect(envelope.payload.conversationSync).toBe("excluded");
    expect(envelope.payload.goal.objective).toBe(
      "Resume without replaying chat",
    );
    expect(envelope.payload.contextManifest.summary).toBe(
      "Committed implementation context",
    );
    expect(envelope.payload.plan.steps).toEqual([
      expect.objectContaining({
        text: "Materialize imported state",
        status: "in_progress",
      }),
    ]);
    expect(envelope.payload.remainingWork).toEqual([
      expect.objectContaining({
        description: "Verify the linked resumable session",
      }),
    ]);
    expect(JSON.stringify(envelope)).not.toMatch(
      /source\/private|SOURCE_TOKEN|source-only|private\.txt|source-provider|source-machine/,
    );

    const inspectedResponse = await app.request(
      "/api/projects/target-project/cly-dev/handoffs/inspect",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ envelope }),
      },
    );
    expect(inspectedResponse.status).toBe(200);
    expect(await inspectedResponse.json()).toEqual(
      expect.objectContaining({ compatible: true, stale: [], conflicts: [] }),
    );

    const importRequest = () =>
      app.request("/api/projects/target-project/cly-dev/handoffs/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ envelope }),
      });
    const firstResponse = await importRequest();
    expect(firstResponse.status).toBe(201);
    const first = await firstResponse.json();
    expect(first.duplicate).toBe(false);
    expect(first.record.materializedSessionId).toBe(
      first.materialized.session.id,
    );
    expect(first.materialized.workspace.id).toBe(targetWorkspace.id);
    expect(first.materialized.session).toEqual(
      expect.objectContaining({
        state: "resumable",
        provider: { id: "target-provider", model: "target-model" },
        commit: { sha: "a".repeat(40) },
      }),
    );
    expect(first.materialized.task.objective).toBe(
      "Resume without replaying chat",
    );
    expect(first.record.payload.plan).toEqual(envelope.payload.plan);
    expect(first.record.payload.remainingWork).toEqual(
      envelope.payload.remainingWork,
    );
    expect(first.materialized.contextManifest.localOnly).toEqual({
      absolutePaths: [],
      environmentVariableNames: [],
      notes: [],
      uncommittedFilePaths: [],
    });
    expect(
      sessions.getSnapshot("target-project", first.materialized.session.id),
    ).toEqual(expect.objectContaining({ state: "resumable", approvals: [] }));

    const secondResponse = await importRequest();
    expect(secondResponse.status).toBe(200);
    const second = await secondResponse.json();
    expect(second.duplicate).toBe(true);
    expect(second.materialized.session.id).toBe(first.materialized.session.id);
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM cly_dev_sessions WHERE project_id = ? AND idempotency_key LIKE 'handoff:%'",
        )
        .get("target-project"),
    ).toEqual({ count: 1 });
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM cly_dev_handoffs WHERE project_id = ? AND direction = 'import'",
        )
        .get("target-project"),
    ).toEqual({ count: 1 });
  });

  it("rejects unsupported, corrupt, conflicted, and stale imports with safe codes", async () => {
    const { app, inspection } = setup();
    const cases: Array<[string, () => unknown, number, string]> = [
      [
        "unsupported",
        () => ({
          ...validEnvelope(),
          schemaVersion: 2,
          minimumReaderVersion: 2,
        }),
        400,
        "unsupported_version",
      ],
      [
        "corrupt",
        () => ({
          ...validEnvelope(),
          integrity: { ...validEnvelope().integrity, digest: "0".repeat(64) },
        }),
        400,
        "integrity_mismatch",
      ],
      [
        "conflicted",
        () => {
          inspection.capabilities = [];
          return validEnvelope();
        },
        409,
        "provider_capability_missing",
      ],
      [
        "stale",
        () => {
          inspection.repository = {
            ...inspection.repository,
            commitSha: "d".repeat(40),
          };
          return validEnvelope();
        },
        409,
        "stale_handoff",
      ],
    ];

    for (const [, makeEnvelope, status, code] of cases) {
      const response = await app.request(
        "/api/projects/target-project/cly-dev/handoffs/import",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ envelope: makeEnvelope() }),
        },
      );
      expect(response.status).toBe(status);
      const body = await response.json();
      expect(body.error).toEqual(
        expect.objectContaining({ code, message: expect.any(String) }),
      );
      expect(JSON.stringify(body)).not.toMatch(/Error:|\bat .*\.js:/);
      inspection.capabilities = ["tool_calls", "structured_output"];
      inspection.repository = {
        ...inspection.repository,
        commitSha: "a".repeat(40),
      };
    }
  });

  it("rejects extra route fields instead of widening the protocol", async () => {
    const { app, source } = setup();
    const response = await app.request(
      "/api/projects/source-project/cly-dev/handoffs/export",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: source.session.id,
          absolutePath: "/tmp/x",
        }),
      },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: expect.objectContaining({ code: "invalid_request" }),
    });
  });
});
