// @vitest-environment node
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Worker } from "node:worker_threads";
import { afterEach, describe, expect, it } from "vitest";
import {
  closePersistedStateDatabase,
  getStateDatabase,
} from "../../persisted-state.js";
import {
  createClyDevHandoffService,
  createMemoryHandoffTransport,
} from "./handoff-service.js";
import { createClyDevSessionRepository } from "./session-repository.js";
import {
  clyDevContextManifestInputSchema,
  clyDevEventInputSchema,
  clyDevWorkspaceInputSchema,
} from "./session-schema.js";

const databases: DatabaseSync[] = [];
const workers: Worker[] = [];

function appendInWorker(
  databasePath: string,
  projectId: string,
  sessionId: string,
  input: ReturnType<typeof event>,
) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const worker = new Worker(
      new URL("./session-repository.worker.js", import.meta.url),
      {
        workerData: {
          mode: "append",
          databasePath,
          projectId,
          sessionId,
          event: input,
        },
      },
    );
    workers.push(worker);
    worker.once("message", (message) => {
      if (message.error) reject(new Error(message.error));
      else resolve(message.result);
    });
    worker.once("error", reject);
  });
}

function openDatabasePair() {
  const databasePath = path.join(
    mkdtempSync(path.join(tmpdir(), "cly-dev-sessions-")),
    "state.sqlite",
  );
  getStateDatabase(databasePath);
  closePersistedStateDatabase();
  const open = () => {
    const database = new DatabaseSync(databasePath);
    database.exec(
      "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
    );
    databases.push(database);
    return database;
  };
  return { databasePath, first: open(), second: open() };
}

function insertProject(database: DatabaseSync, projectId: string) {
  const now = "2026-07-15T12:00:00.000Z";
  database
    .prepare(
      `INSERT INTO projects
        (id, path, normalized_path, name, status, sort_order, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'open', 0, '{}', ?, ?)`,
    )
    .run(
      projectId,
      `/tmp/${projectId}`,
      `/tmp/${projectId}`,
      projectId,
      now,
      now,
    );
}

function createSession(
  repository: ReturnType<typeof createClyDevSessionRepository>,
  projectId: string,
) {
  const workspace = repository.createWorkspace(projectId, {
    schemaVersion: 1,
    idempotencyKey: `workspace-key-${projectId}`,
    id: `workspace-${projectId}`,
    name: "Main worktree",
    repository: { id: "repo-1" },
    worktree: { id: "worktree-1", branch: "main" },
    machine: { id: "machine-1", platform: "darwin" },
    localOnly: { repositoryPath: "/tmp/repo", worktreePath: "/tmp/repo" },
  });
  const contextManifest = repository.createContextManifest(
    projectId,
    workspace.id,
    {
      schemaVersion: 1,
      idempotencyKey: `context-key-${projectId}`,
      id: `context-${projectId}`,
      localOnly: {
        absolutePaths: ["/tmp/repo"],
        environmentVariableNames: [],
        notes: [],
        uncommittedFilePaths: [],
      },
      transferable: {
        summary: "Committed research context",
        entries: [
          {
            kind: "repository_file",
            repositoryId: "repo-1",
            relativePath: "src/index.ts",
            commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            objectHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          },
        ],
      },
    },
  );
  const task = repository.createTask(projectId, workspace.id, {
    schemaVersion: 1,
    idempotencyKey: `task-key-${projectId}`,
    id: `task-${projectId}`,
    title: "Durable task",
    objective: "Survive a restart",
    researchObjectIds: ["research-1"],
  });
  return repository.createSession(projectId, task.id, {
    schemaVersion: 1,
    idempotencyKey: `session-key-${projectId}`,
    id: `session-${projectId}`,
    title: "Durable session",
    contextManifestId: contextManifest.id,
    provider: { id: "openai", model: "gpt-5" },
    commit: { sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    state: "running",
  });
}

const event = (
  key: string,
  type = "tool.recorded",
  payload: Record<string, unknown> = {
    toolCallId: `tool-${key}`,
    tool: "test-runner",
    status: "completed",
    exitCode: 0,
  },
) => ({
  schemaVersion: 1 as const,
  payloadVersion: 1 as const,
  idempotencyKey: key,
  type,
  transferability: "local-only" as const,
  occurredAt: "2026-07-15T12:01:00.000Z",
  actor: { kind: "agent" as const, id: "agent-1" },
  payload,
});

afterEach(() => {
  closePersistedStateDatabase();
  while (databases.length) databases.pop()?.close();
  while (workers.length) void workers.pop()?.terminate();
});

describe("ClyDevSessionRepository", () => {
  it("publishes transferable events after the first 500 session events", async () => {
    const { first } = openDatabasePair();
    insertProject(first, "project-a");
    const repository = createClyDevSessionRepository({ db: first });
    const session = createSession(repository, "project-a");
    for (let index = 0; index < 500; index += 1) {
      repository.appendEvent("project-a", session.id, event(`local-${index}`));
    }
    repository.appendEvent("project-a", session.id, {
      ...event("transferable-501", "message.recorded", {
        role: "agent",
        body: "This event must survive handoff pagination.",
      }),
      transferability: "transferable",
    });

    const transport = createMemoryHandoffTransport();
    const service = createClyDevHandoffService({ repository, transport });
    await service.pairDevice({ deviceId: "machine-1", pairingCode: "123456" });
    const envelope = await service.publish("project-a", session.id, {
      deviceId: "machine-1",
      expectedRevision: 0,
    });

    expect(
      repository.getHandoffSource("project-a", session.id).events,
    ).toHaveLength(501);
    expect(envelope.events).toEqual([
      expect.objectContaining({
        idempotencyKey: "transferable-501",
        payload: expect.objectContaining({
          body: "This event must survive handoff pagination.",
        }),
      }),
    ]);
  });

  it("resumes transferable task state on a second machine without source paths", async () => {
    const sourceDatabase = openDatabasePair().first;
    const destinationDatabase = openDatabasePair().first;
    insertProject(sourceDatabase, "project-a");
    insertProject(destinationDatabase, "project-a");
    const sourceRepository = createClyDevSessionRepository({
      db: sourceDatabase,
    });
    const destinationRepository = createClyDevSessionRepository({
      db: destinationDatabase,
    });
    const session = createSession(sourceRepository, "project-a");
    sourceRepository.appendEvent("project-a", session.id, {
      ...event("message-transfer", "message.recorded", {
        role: "user",
        body: "Continue from the approved plan.",
      }),
      transferability: "transferable",
    });
    const transport = createMemoryHandoffTransport();
    const sourceService = createClyDevHandoffService({
      repository: sourceRepository,
      transport,
    });
    const destinationService = createClyDevHandoffService({
      repository: destinationRepository,
      transport,
      inspectDestination: async () => ({
        status: "ready",
        blocking: false,
        checks: [],
        actions: [],
      }),
    });
    await sourceService.pairDevice({
      deviceId: "machine-1",
      pairingCode: "123456",
    });
    await destinationService.pairDevice({
      deviceId: "machine-2",
      pairingCode: "654321",
    });
    const envelope = await sourceService.publish("project-a", session.id, {
      deviceId: "machine-1",
      expectedRevision: 0,
    });
    const resumed = await destinationService.resume(envelope.handoffId, {
      deviceId: "machine-2",
      destination: {
        name: "Machine B worktree",
        machine: { id: "machine-2", platform: "linux" },
        repositoryPath: "/home/b/repo",
        worktreePath: "/home/b/repo",
      },
    });

    expect(resumed.readiness).toMatchObject({ blocking: false });
    expect(
      destinationRepository.listEvents("project-a", session.id),
    ).toMatchObject([
      {
        type: "message.recorded",
        payload: { body: "Continue from the approved plan." },
      },
    ]);
    const imported = destinationRepository.getHandoffSource(
      "project-a",
      session.id,
    );
    expect(imported.workspace.localOnly).toEqual({
      repositoryPath: "/home/b/repo",
      worktreePath: "/home/b/repo",
    });
    expect(JSON.stringify(imported)).not.toContain("/tmp/repo");
  });

  it("requires versioned structured payloads and rejects restricted transferable context fields", () => {
    const { first } = openDatabasePair();
    insertProject(first, "project-a");
    const repository = createClyDevSessionRepository({ db: first });

    expect(() =>
      repository.createWorkspace("project-a", {
        idempotencyKey: "workspace-key",
        schemaVersion: 1,
        name: "Workspace",
        repository: { id: "repo", path: "/repo" },
        worktree: { id: "tree", branch: "main" },
        machine: { id: "machine", platform: "darwin" },
        localOnly: { repositoryPath: "/repo", worktreePath: "/repo" },
        unexpected: "must not persist",
      }),
    ).toThrow();
    for (const remoteUrl of [
      "https://user:password@example.com/repo.git",
      "file:///private/repo",
      "http://localhost/repo.git",
      "https://localhost./repo.git",
      "https://127.1/repo.git",
      "https://10.0.0.1/repo.git",
      "https://172.16.0.1/repo.git",
      "https://192.168.0.1/repo.git",
      "https://169.254.1.1/repo.git",
      "https://100.64.0.1/repo.git",
      "https://224.0.0.1/repo.git",
      "https://239.255.255.255/repo.git",
      "https://240.0.0.1/repo.git",
      "https://255.255.255.255/repo.git",
      "https://[::]/repo.git",
      "https://[::1]/repo.git",
      "https://[0:0:0:0:0:0:0:1]/repo.git",
      "https://[::ffff:127.0.0.1]/repo.git",
      "https://[fc00::1]/repo.git",
      "https://[fd12::1]/repo.git",
      "https://[fe80::1]/repo.git",
    ]) {
      expect(
        clyDevWorkspaceInputSchema.safeParse({
          schemaVersion: 1,
          idempotencyKey: "workspace-key",
          name: "Workspace",
          repository: { id: "repo", remoteUrl },
          worktree: { id: "tree", branch: "main" },
          machine: { id: "machine", platform: "darwin" },
          localOnly: { repositoryPath: "/repo", worktreePath: "/repo" },
        }).success,
      ).toBe(false);
    }
    for (const remoteUrl of [
      "https://github.com/openai/example.git",
      "https://223.0.0.1/repo.git",
      "https://223.255.255.255/repo.git",
    ]) {
      expect(
        clyDevWorkspaceInputSchema.safeParse({
          schemaVersion: 1,
          idempotencyKey: "workspace-key",
          name: "Workspace",
          repository: { id: "repo", remoteUrl },
          worktree: { id: "tree", branch: "main" },
          machine: { id: "machine", platform: "darwin" },
          localOnly: { repositoryPath: "/repo", worktreePath: "/repo" },
        }).success,
      ).toBe(true);
    }
    for (const relativePath of [
      "/private/secret.txt",
      "../secret.txt",
      "src/../../secret.txt",
      "C:/secret.txt",
      "src\\secret.txt",
    ]) {
      expect(
        clyDevContextManifestInputSchema.safeParse({
          schemaVersion: 1,
          idempotencyKey: "context-key",
          localOnly: {},
          transferable: {
            summary: "Safe",
            entries: [
              {
                kind: "repository_file",
                repositoryId: "repo",
                relativePath,
                commitSha: "a".repeat(40),
                objectHash: "b".repeat(40),
              },
            ],
          },
        }).success,
      ).toBe(false);
    }
    for (const repositoryFile of [
      {
        commitSha: "a".repeat(7),
        objectHash: "b".repeat(40),
      },
      {
        commitSha: "a".repeat(40),
      },
      {
        commitSha: "a".repeat(40),
        objectHash: "not-a-full-git-object-id",
      },
    ]) {
      expect(
        clyDevContextManifestInputSchema.safeParse({
          schemaVersion: 1,
          idempotencyKey: "context-key",
          localOnly: {},
          transferable: {
            summary: "Safe",
            entries: [
              {
                kind: "repository_file",
                repositoryId: "repo",
                relativePath: "src/index.ts",
                ...repositoryFile,
              },
            ],
          },
        }).success,
      ).toBe(false);
    }
    expect(() =>
      repository.createContextManifest("project-a", "workspace", {
        idempotencyKey: "context-key",
        schemaVersion: 1,
        localOnly: { absolutePaths: ["/secret"] },
        transferable: {
          summary: "Safe",
          entries: [],
          secret: "must never cross the boundary",
        },
      }),
    ).toThrow();
  });

  it("returns project-scoped creation duplicates and creates aggregates atomically", () => {
    const { first } = openDatabasePair();
    insertProject(first, "project-a");
    const repository = createClyDevSessionRepository({ db: first });
    const input = {
      schemaVersion: 1,
      idempotencyKey: "workspace-key",
      name: "Main",
      repository: { id: "repo" },
      worktree: { id: "tree", branch: "main" },
      machine: { id: "machine", platform: "darwin" },
      localOnly: { repositoryPath: "/repo", worktreePath: "/repo" },
    };
    const firstResult = repository.createWorkspace("project-a", input);
    expect(repository.createWorkspace("project-a", input)).toEqual(firstResult);
    expect(() =>
      first
        .prepare(
          "UPDATE cly_dev_workspaces SET schema_version = 2 WHERE id = ?",
        )
        .run(firstResult.id),
    ).toThrow();
    expect(() =>
      repository.createSessionAggregate("project-a", {
        workspace: { ...input, idempotencyKey: "aggregate-workspace" },
        contextManifest: { invalid: true },
        task: { invalid: true },
        session: { invalid: true },
      }),
    ).toThrow();
    expect(repository.listWorkspaces("project-a")).toHaveLength(1);

    const aggregateInput = {
      workspace: {
        ...input,
        idempotencyKey: "aggregate-workspace",
      },
      contextManifest: {
        schemaVersion: 1,
        idempotencyKey: "aggregate-context",
        localOnly: {
          absolutePaths: ["/repo"],
          environmentVariableNames: [],
          notes: [],
          uncommittedFilePaths: [],
        },
        transferable: { summary: "Safe context", entries: [] },
      },
      task: {
        schemaVersion: 1,
        idempotencyKey: "aggregate-task",
        title: "Task",
        objective: "Complete atomically",
        researchObjectIds: ["research-1"],
      },
      session: {
        schemaVersion: 1,
        idempotencyKey: "aggregate-session",
        title: "Session",
        provider: { id: "openai", model: "gpt-5" },
        commit: { sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        state: "queued",
      },
    };
    const aggregate = repository.createSessionAggregate(
      "project-a",
      aggregateInput,
    );
    expect(
      repository.createSessionAggregate("project-a", aggregateInput),
    ).toEqual(aggregate);
    expect(repository.listWorkspaces("project-a")).toHaveLength(2);
    expect(repository.listSessions("project-a")).toHaveLength(1);
  });

  it("uses one immutable outbound envelope for byte-identical preview and egress with safe provenance", () => {
    const { first } = openDatabasePair();
    insertProject(first, "project-a");
    const repository = createClyDevSessionRepository({ db: first });
    const session = createSession(repository, "project-a");
    const manifest = repository.getContextManifest(
      "project-a",
      session.contextManifestId,
    );

    const outbound = repository.getOutboundContext("project-a", session.id);
    expect(outbound.preview).toEqual(outbound.egress);
    expect(outbound.previewBytes).toBe(outbound.egressBytes);
    expect(outbound.previewSha256).toBe(outbound.egressSha256);
    expect(JSON.parse(outbound.previewBytes)).toEqual(outbound.preview);
    expect(outbound.preview).toMatchObject({
      schemaVersion: 1,
      kind: "cly.context_manifest",
      provenance: {
        repository: { id: "repo-1" },
        worktree: { id: "worktree-1", branch: "main" },
        commit: { sha: "a".repeat(40) },
        machine: { id: "machine-1", platform: "darwin" },
        provider: { id: "openai", model: "gpt-5" },
        research: { objectIds: ["research-1"] },
      },
    });
    expect(outbound.preview).not.toHaveProperty("localOnly");
    const transferableEvent = repository.appendEvent("project-a", session.id, {
      schemaVersion: 1,
      payloadVersion: 1,
      idempotencyKey: "context-transfer",
      type: "context.manifest.recorded",
      transferability: "transferable",
      occurredAt: "2026-07-15T12:01:00.000Z",
      actor: { kind: "system", id: "context-boundary" },
      payload: { manifestId: manifest.id },
    });
    expect(transferableEvent.outboundEnvelope).toEqual(outbound.preview);
    expect(transferableEvent.outboundSha256).toBe(outbound.previewSha256);
    expect(() =>
      first
        .prepare(
          "UPDATE cly_dev_context_manifests SET transferable_json = '{}' WHERE id = ?",
        )
        .run(manifest.id),
    ).toThrow(/immutable/i);
  });

  it("enforces every structured event category and rejects arbitrary transferable payloads", () => {
    const common = {
      schemaVersion: 1,
      payloadVersion: 1,
      idempotencyKey: "event-key",
      transferability: "local-only",
      occurredAt: "2026-07-15T12:01:00.000Z",
      actor: { kind: "agent", id: "agent-1" },
    } as const;
    const cases = [
      ["message.recorded", { role: "agent", body: "Done" }],
      ["summary.recorded", { title: "Summary", sections: ["Result"] }],
      [
        "plan.recorded",
        { steps: [{ id: "one", text: "Do it", status: "pending" }] },
      ],
      ["progress.recorded", { completed: 1, total: 2, label: "Half" }],
      [
        "tool.recorded",
        { toolCallId: "call", tool: "shell", status: "completed", exitCode: 0 },
      ],
      [
        "decision.recorded",
        {
          decisionId: "decision",
          summary: "Use SQLite",
          rationale: "Local durability",
        },
      ],
      [
        "cost.recorded",
        { amountMinor: 25, currency: "USD", category: "tokens" },
      ],
      [
        "diff.recorded",
        {
          relativePaths: ["src/a.ts"],
          additions: 1,
          deletions: 0,
          commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
      [
        "test.recorded",
        { commandId: "tests", passed: 2, failed: 0, durationMs: 10 },
      ],
      [
        "failure.recorded",
        { code: "E_TEST", message: "Failed", retryable: true },
      ],
      ["remaining_work.recorded", { items: ["Review"] }],
    ] as const;
    for (const [type, payload] of cases) {
      expect(() =>
        clyDevEventInputSchema.parse({ ...common, type, payload }),
      ).not.toThrow();
    }
    expect(() =>
      clyDevEventInputSchema.parse({
        ...common,
        type: "message.recorded",
        transferability: "transferable",
        payload: { role: "agent", body: "Approved summary" },
      }),
    ).not.toThrow();
    expect(() =>
      clyDevEventInputSchema.parse({
        ...common,
        type: "context.manifest.recorded",
        transferability: "transferable",
        payload: { manifestId: "manifest-1" },
      }),
    ).not.toThrow();
    expect(() =>
      clyDevEventInputSchema.parse({
        ...common,
        type: "context.manifest.recorded",
        transferability: "transferable",
        payload: { manifestId: "manifest-1", absolutePath: "/secret" },
      }),
    ).toThrow();
    expect(() =>
      clyDevEventInputSchema.parse({
        ...common,
        type: "unknown.recorded",
        payload: {},
      }),
    ).toThrow();
  });
  it("allocates ordered sequences and duplicate returns across genuinely concurrent SQLite writers", async () => {
    const { databasePath, first } = openDatabasePair();
    insertProject(first, "project-a");
    const one = createClyDevSessionRepository({ db: first });
    const session = createSession(one, "project-a");

    const appended = await Promise.all([
      appendInWorker(databasePath, "project-a", session.id, event("one")),
      appendInWorker(databasePath, "project-a", session.id, event("two")),
      appendInWorker(databasePath, "project-a", session.id, event("three")),
      appendInWorker(databasePath, "project-a", session.id, event("two")),
    ]);

    expect([...new Set(appended.map((item) => item.sequence))].sort()).toEqual([
      1, 2, 3,
    ]);
    const duplicateEvents = appended.filter(
      (item) => item.idempotencyKey === "two",
    );
    expect(duplicateEvents).toHaveLength(2);
    expect(duplicateEvents[0]?.id).toBe(duplicateEvents[1]?.id);
    expect(
      one.listEvents("project-a", session.id).map((item) => item.sequence),
    ).toEqual([1, 2, 3]);
    expect(one.listEvents("project-a", session.id)[0]).toMatchObject({
      schemaVersion: 1,
      payloadVersion: 1,
      provenance: {
        repository: { id: "repo-1" },
        worktree: { id: "worktree-1", branch: "main" },
        commit: { sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        machine: { id: "machine-1", platform: "darwin" },
        provider: { id: "openai", model: "gpt-5" },
        research: { objectIds: ["research-1"] },
      },
    });
    expect(
      first
        .prepare("SELECT COUNT(*) AS count FROM cly_dev_session_events")
        .get(),
    ).toMatchObject({ count: 3 });
  });

  it("returns lightweight overviews and bounded event pages", () => {
    const { first } = openDatabasePair();
    insertProject(first, "project-a");
    const repository = createClyDevSessionRepository({ db: first });
    const session = createSession(repository, "project-a");
    const secondSession = repository.createSession(
      "project-a",
      session.taskId,
      {
        schemaVersion: 1,
        idempotencyKey: "session-key-project-a-second",
        id: "session-project-a-second",
        title: "Second durable session",
        contextManifestId: session.contextManifestId,
        provider: { id: "openai", model: "gpt-5" },
        commit: { sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        state: "queued",
      },
    );
    for (const key of ["one", "two", "three"]) {
      repository.appendEvent("project-a", session.id, event(key));
    }

    const firstPage = repository.listSessionOverviews("project-a", 0, 1);
    const secondPage = repository.listSessionOverviews("project-a", 1, 1);
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextOffset).toBe(1);
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.nextOffset).toBeNull();
    expect(
      new Set([...firstPage.items, ...secondPage.items].map((item) => item.id)),
    ).toEqual(new Set([session.id, secondSession.id]));
    expect(repository.getSnapshot("project-a", session.id)).not.toHaveProperty(
      "events",
    );
    expect(
      repository
        .listEvents("project-a", session.id, 1, 1)
        .map((item) => item.sequence),
    ).toEqual([2]);
  });

  it("waits for a contending BEGIN IMMEDIATE writer instead of losing an append", async () => {
    const { databasePath, first } = openDatabasePair();
    insertProject(first, "project-a");
    const repository = createClyDevSessionRepository({ db: first });
    const session = createSession(repository, "project-a");
    const locker = new Worker(
      new URL("./session-repository.worker.js", import.meta.url),
      { workerData: { mode: "lock", databasePath, holdMs: 250 } },
    );
    workers.push(locker);
    await new Promise<void>((resolve, reject) => {
      locker.once("message", (message) => {
        if (message.locked) resolve();
        else reject(new Error(message.error ?? "Lock worker did not lock."));
      });
      locker.once("error", reject);
    });

    const startedAt = performance.now();
    const appended = await appendInWorker(
      databasePath,
      "project-a",
      session.id,
      event("contended"),
    );

    expect(performance.now() - startedAt).toBeGreaterThanOrEqual(150);
    expect(appended).toMatchObject({
      sequence: 1,
      idempotencyKey: "contended",
    });
    expect(repository.listEvents("project-a", session.id)).toHaveLength(1);
  });

  it("enforces project isolation for sessions, events, and snapshots", () => {
    const { first } = openDatabasePair();
    insertProject(first, "project-a");
    insertProject(first, "project-b");
    const repository = createClyDevSessionRepository({ db: first });
    const session = createSession(repository, "project-a");

    expect(() =>
      repository.appendEvent("project-b", session.id, event("wrong-project")),
    ).toThrow(/not found/i);
    expect(() => repository.listEvents("project-b", session.id)).toThrow(
      /not found/i,
    );
    expect(() => repository.getSnapshot("project-b", session.id)).toThrow(
      /not found/i,
    );
  });

  it("keeps approval ordering and state after the SQLite file is reopened", () => {
    const { databasePath, first } = openDatabasePair();
    insertProject(first, "project-a");
    const repository = createClyDevSessionRepository({ db: first });
    const session = createSession(repository, "project-a");

    repository.appendEvent(
      "project-a",
      session.id,
      event("approval-request", "approval.requested", {
        approvalId: "approval-1",
        title: "Run tests",
        detail: "Run the focused suite",
        requestedAction: "tests.run",
      }),
    );
    repository.appendEvent(
      "project-a",
      session.id,
      event("approval-resolve", "approval.resolved", {
        approvalId: "approval-1",
        state: "approved",
        resolvedBy: "local-user",
      }),
    );
    first.close();
    databases.splice(databases.indexOf(first), 1);

    const reopened = new DatabaseSync(databasePath);
    reopened.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    databases.push(reopened);
    const snapshot = createClyDevSessionRepository({
      db: reopened,
    }).getSnapshot("project-a", session.id);

    expect(snapshot.approvals).toEqual([
      expect.objectContaining({
        id: "approval-1",
        state: "approved",
        requestSequence: 1,
        resolutionSequence: 2,
      }),
    ]);
    expect(snapshot.lastSequence).toBe(2);
  });

  it("records interrupted recovery before exposing a resumable session without reviving a process", () => {
    const { first } = openDatabasePair();
    insertProject(first, "project-a");
    const repository = createClyDevSessionRepository({
      db: first,
      now: () => "2026-07-15T12:05:00.000Z",
    });
    const session = createSession(repository, "project-a");

    const recovered = repository.recoverInterruptedSessions("project-a");
    const snapshot = repository.getSnapshot("project-a", session.id);

    expect(recovered).toEqual([
      expect.objectContaining({ id: session.id, state: "resumable" }),
    ]);
    expect(snapshot.state).toBe("resumable");
    expect(snapshot.process).toBeNull();
    expect(
      repository.listEvents("project-a", session.id).map((item) => item.type),
    ).toEqual(["session.interrupted", "session.resumable"]);
    expect(repository.recoverInterruptedSessions("project-a")).toEqual([]);

    repository.appendEvent(
      "project-a",
      session.id,
      event("run-again", "session.state.changed", { state: "running" }),
    );
    expect(repository.recoverInterruptedSessions("project-a")).toEqual([
      expect.objectContaining({ id: session.id, state: "resumable" }),
    ]);
    expect(repository.listEvents("project-a", session.id)).toHaveLength(5);
  });

  it("rejects an approval resolution that was not durably requested first", () => {
    const { first } = openDatabasePair();
    insertProject(first, "project-a");
    const repository = createClyDevSessionRepository({ db: first });
    const session = createSession(repository, "project-a");

    expect(() =>
      repository.appendEvent(
        "project-a",
        session.id,
        event(randomUUID(), "approval.resolved", {
          approvalId: "missing",
          state: "approved",
          resolvedBy: "local-user",
        }),
      ),
    ).toThrow(/requested/i);
    expect(repository.listEvents("project-a", session.id)).toEqual([]);
  });
});
