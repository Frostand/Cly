// @vitest-environment node
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { createClyDevSessionRepository } from "./api/cly-dev/session-repository.js";
import { createResearchRepository } from "./api/research/repository.js";
import {
  closePersistedStateDatabase,
  getStateDatabase,
  loadClyDevWindowLayout,
  saveClyDevWindowLayout,
  savePersistedState,
} from "./persisted-state.js";
import { createStateSaveQueue } from "./state-save-queue.js";

const tempDirectories: string[] = [];

afterEach(() => {
  closePersistedStateDatabase();
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function createDatabasePath() {
  const directory = mkdtempSync(path.join(tmpdir(), "cly-storage-"));
  tempDirectories.push(directory);
  return path.join(directory, "dream.db");
}

function seedResearchProjects(database: DatabaseSync) {
  database.exec(`
    INSERT INTO projects (id, path, normalized_path, name, status, sort_order, metadata, created_at, updated_at)
    VALUES
      ('project-a', '/tmp/a', '/tmp/a', 'A', 'open', 0, '{}', '2026-01-01', '2026-01-01'),
      ('project-b', '/tmp/b', '/tmp/b', 'B', 'open', 1, '{}', '2026-01-01', '2026-01-01');
    INSERT INTO research_objects (id, project_id, type, title, payload, created_at, updated_at)
    VALUES
      ('object-a', 'project-a', 'source', 'A', '{"kind":"source"}', '2026-01-01', '2026-01-01'),
      ('object-a-claim', 'project-a', 'claim', 'A claim', '{"kind":"claim","status":"draft"}', '2026-01-01', '2026-01-01'),
      ('object-b', 'project-b', 'claim', 'B', '{"kind":"claim","status":"draft"}', '2026-01-01', '2026-01-01');
    INSERT INTO research_relationships
      (id, project_id, from_object_id, to_object_id, type, created_at)
    VALUES
      ('seed-relationship-a', 'project-a', 'object-a', 'object-a-claim', 'supports', '2026-01-01');
    INSERT INTO provenance_events
      (id, project_id, object_id, action, actor_type, metadata, created_at)
    VALUES
      ('seed-event-a', 'project-a', 'object-a', 'source.created', 'human', '{}', '2026-01-01');
  `);
}

function foreignKeyContract(database: DatabaseSync, table: string) {
  const rows = database.prepare(`PRAGMA foreign_key_list(${table})`).all() as {
    id: number;
    seq: number;
    table: string;
    from: string;
    to: string;
    on_delete: string;
  }[];
  return [...Map.groupBy(rows, (row) => row.id).values()].map((group) => ({
    columns: group
      .toSorted((left, right) => left.seq - right.seq)
      .map((row) => row.from),
    foreignColumns: group
      .toSorted((left, right) => left.seq - right.seq)
      .map((row) => row.to),
    foreignTable: group[0]?.table,
    onDelete: group[0]?.on_delete,
  }));
}

function indexContract(database: DatabaseSync, indexName: string) {
  return (
    database.prepare(`PRAGMA index_xinfo(${indexName})`).all() as {
      name: string;
      desc: number;
      key: number;
    }[]
  )
    .filter((row) => row.key === 1)
    .map((row) => ({ name: row.name, order: row.desc ? "desc" : "asc" }));
}

function expectAgentContextDatabaseContract(database: DatabaseSync) {
  expect(foreignKeyContract(database, "agent_context_packs")).toEqual(
    expect.arrayContaining([
      {
        columns: ["project_id"],
        foreignColumns: ["id"],
        foreignTable: "projects",
        onDelete: "CASCADE",
      },
      {
        columns: ["configuration_id", "project_id"],
        foreignColumns: ["id", "project_id"],
        foreignTable: "agent_configurations",
        onDelete: "CASCADE",
      },
      {
        columns: ["configuration_id", "role_id"],
        foreignColumns: ["configuration_id", "id"],
        foreignTable: "agent_role_configurations",
        onDelete: "NO ACTION",
      },
    ]),
  );
  expect(foreignKeyContract(database, "agent_context_manifests")).toEqual(
    expect.arrayContaining([
      {
        columns: ["configuration_id", "role_id"],
        foreignColumns: ["configuration_id", "id"],
        foreignTable: "agent_role_configurations",
        onDelete: "NO ACTION",
      },
      {
        columns: ["transmission_approval_id", "project_id"],
        foreignColumns: ["id", "project_id"],
        foreignTable: "agent_context_transmission_approvals",
        onDelete: "NO ACTION",
      },
    ]),
  );
  expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  expect(
    indexContract(database, "idx_agent_context_items_project_updated"),
  ).toEqual([
    { name: "project_id", order: "asc" },
    { name: "updated_at", order: "desc" },
    { name: "id", order: "asc" },
  ]);
  expect(indexContract(database, "idx_agent_context_revisions_item")).toEqual([
    { name: "project_id", order: "asc" },
    { name: "item_id", order: "asc" },
    { name: "revision", order: "desc" },
  ]);
  expect(
    database.prepare("PRAGMA table_info(agent_context_manifests)").all(),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "entry_count", notnull: 1 }),
      expect.objectContaining({
        name: "obligation_operation_json",
        notnull: 1,
      }),
      expect.objectContaining({
        name: "obligation_operation_hash",
        notnull: 1,
      }),
    ]),
  );
}

describe("persisted research storage", () => {
  const agentContextTables = [
    "agent_context_items",
    "agent_context_revisions",
    "agent_context_packs",
    "agent_context_pack_entries",
    "agent_context_manifests",
    "agent_context_manifest_entries",
    "agent_context_transmission_approvals",
    "agent_context_audit_events",
  ];

  it("persists detached-window layout independently of IDE snapshots", () => {
    const databasePath = createDatabasePath();
    expect(
      saveClyDevWindowLayout(
        {
          version: 1,
          workspace: {
            detached: true,
            displayId: 7,
            maximized: false,
            bounds: { x: 40, y: 60, width: 900, height: 700 },
          },
        },
        { databasePath },
      ),
    ).toBe(true);
    expect(loadClyDevWindowLayout({ databasePath })).toMatchObject({
      version: 1,
      workspace: { detached: true, displayId: 7 },
    });
  });

  it("installs every agent-context table and immutable trigger on a clean database", () => {
    const database = getStateDatabase(createDatabasePath());
    const tables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'agent_context_%' ORDER BY name",
      )
      .all()
      .map((row) => row.name);
    expect(tables).toEqual([...agentContextTables].sort());
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'agent_context_%' ORDER BY name",
        )
        .all()
        .map((row) => row.name),
    ).toEqual([
      "agent_context_approval_immutable_delete",
      "agent_context_approval_initial_state",
      "agent_context_approval_scope_immutable",
      "agent_context_approval_transition",
      "agent_context_approved_revision_insert",
      "agent_context_approved_revision_update",
      "agent_context_audit_immutable_delete",
      "agent_context_audit_immutable_update",
      "agent_context_manifest_approval_binding",
      "agent_context_manifest_entries_immutable_delete",
      "agent_context_manifest_entries_immutable_update",
      "agent_context_manifest_entry_current_approval",
      "agent_context_manifest_entry_position",
      "agent_context_manifest_entry_revision_scope",
      "agent_context_manifest_pack_policy_binding",
      "agent_context_manifest_restricted_approval",
      "agent_context_manifest_seal",
      "agent_context_manifests_immutable_delete",
      "agent_context_manifests_immutable_update",
      "agent_context_pack_entry_current_approval_insert",
      "agent_context_pack_entry_current_approval_update",
      "agent_context_pack_entry_revision_scope",
      "agent_context_revisions_immutable_delete",
      "agent_context_revisions_immutable_update",
    ]);
    expectAgentContextDatabaseContract(database);
  });

  it("applies reserved migration 0014 after an existing database through 0015", () => {
    const databasePath = createDatabasePath();
    getStateDatabase(databasePath);
    closePersistedStateDatabase();
    const throughClyDev = new DatabaseSync(databasePath);
    throughClyDev.exec("PRAGMA foreign_keys = OFF");
    for (const table of [...agentContextTables].reverse())
      throughClyDev.exec(`DROP TABLE ${table}`);
    throughClyDev
      .prepare("DELETE FROM __drizzle_migrations WHERE created_at > ?")
      .run(1784134800000);
    expect(
      throughClyDev
        .prepare(
          "SELECT MAX(created_at) AS createdAt FROM __drizzle_migrations",
        )
        .get(),
    ).toEqual({ createdAt: 1784134800000 });
    throughClyDev.close();

    const upgraded = getStateDatabase(databasePath);
    expect(
      upgraded
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'agent_context_%' ORDER BY name",
        )
        .all()
        .map((row) => row.name),
    ).toEqual([...agentContextTables].sort());
    expect(
      upgraded
        .prepare(
          "SELECT MAX(created_at) AS createdAt FROM __drizzle_migrations",
        )
        .get(),
    ).toEqual({ createdAt: 1784138400000 });
    expectAgentContextDatabaseContract(upgraded);
  });

  it("configures a bounded wait for concurrent SQLite writers", () => {
    const database = getStateDatabase(createDatabasePath());

    expect(database.prepare("PRAGMA busy_timeout").get()).toEqual({
      timeout: 5_000,
    });
  });

  it("preserves research objects, relationships, and provenance during IDE state saves", () => {
    const databasePath = createDatabasePath();
    const database = getStateDatabase(databasePath);
    seedResearchProjects(database);

    expect(
      savePersistedState(
        {
          projects: [{ id: "project-a", name: "A renamed", path: "/tmp/a" }],
          closedProjects: [],
          chats: [],
          messagesByChatId: {},
          settings: {},
        },
        { databasePath },
      ),
    ).toBe(true);

    expect(
      database.prepare("SELECT id FROM research_objects ORDER BY id").all(),
    ).toEqual([
      { id: "object-a" },
      { id: "object-a-claim" },
      { id: "object-b" },
    ]);
    expect(
      database.prepare("SELECT id FROM research_relationships").all(),
    ).toEqual([{ id: "seed-relationship-a" }]);
    expect(database.prepare("SELECT id FROM provenance_events").all()).toEqual([
      { id: "seed-event-a" },
    ]);
    expect(
      database.prepare("SELECT id, status FROM projects ORDER BY id").all(),
    ).toEqual([
      { id: "project-a", status: "open" },
      { id: "project-b", status: "closed" },
    ]);
  });

  it("preserves append-only Cly Dev events during IDE snapshots and recovers running sessions after reopen", () => {
    const databasePath = createDatabasePath();
    const database = getStateDatabase(databasePath);
    database.exec(`
      INSERT INTO projects (id, path, normalized_path, name, status, sort_order, metadata, created_at, updated_at)
      VALUES ('project-dev', '/tmp/dev', '/tmp/dev', 'Dev', 'open', 0, '{}', '2026-01-01', '2026-01-01');
    `);
    const repository = createClyDevSessionRepository({ db: database });
    const workspace = repository.createWorkspace("project-dev", {
      schemaVersion: 1,
      idempotencyKey: "workspace-dev-key",
      id: "workspace-dev",
      name: "Dev",
      repository: { id: "repository-dev" },
      worktree: { id: "worktree-dev", branch: "main" },
      machine: { id: "machine-dev", platform: "darwin" },
      localOnly: { repositoryPath: "/tmp/dev", worktreePath: "/tmp/dev" },
    });
    const contextManifest = repository.createContextManifest(
      "project-dev",
      workspace.id,
      {
        schemaVersion: 1,
        idempotencyKey: "context-dev-key",
        id: "context-dev",
        localOnly: {
          absolutePaths: ["/tmp/dev"],
          environmentVariableNames: [],
          notes: [],
          uncommittedFilePaths: [],
        },
        transferable: { summary: "Safe context", entries: [] },
      },
    );
    const task = repository.createTask("project-dev", workspace.id, {
      schemaVersion: 1,
      idempotencyKey: "task-dev-key",
      id: "task-dev",
      title: "Durable task",
      objective: "Recover safely",
    });
    const session = repository.createSession("project-dev", task.id, {
      schemaVersion: 1,
      idempotencyKey: "session-dev-key",
      id: "session-dev",
      title: "Durable session",
      contextManifestId: contextManifest.id,
      provider: { id: "openai", model: "gpt-5" },
      commit: { sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      state: "running",
    });
    repository.appendEvent("project-dev", session.id, {
      schemaVersion: 1,
      payloadVersion: 1,
      idempotencyKey: "tool-1",
      type: "tool.recorded",
      transferability: "local-only",
      occurredAt: "2026-01-01T00:01:00.000Z",
      actor: { kind: "tool", id: "test-runner" },
      payload: {
        toolCallId: "tool-1",
        tool: "test-runner",
        status: "completed",
        exitCode: 0,
      },
    });

    savePersistedState(
      {
        projects: [{ id: "project-dev", name: "Dev", path: "/tmp/dev" }],
        closedProjects: [],
        chats: [],
        messagesByChatId: {},
        settings: {},
      },
      { databasePath },
    );
    expect(repository.listEvents("project-dev", session.id)).toHaveLength(1);

    closePersistedStateDatabase();
    const reopened = getStateDatabase(databasePath);
    const recovered = createClyDevSessionRepository({ db: reopened });
    expect(recovered.getSnapshot("project-dev", session.id)).toMatchObject({
      state: "resumable",
      process: null,
      lastSequence: 3,
    });
    expect(
      recovered.listEvents("project-dev", session.id).map((item) => item.type),
    ).toEqual(["tool.recorded", "session.interrupted", "session.resumable"]);
  });

  it("serializes burst state saves with research writes without loss or contention", async () => {
    const databasePath = createDatabasePath();
    const database = getStateDatabase(databasePath);
    seedResearchProjects(database);
    const repository = createResearchRepository(database);
    const queue = createStateSaveQueue({
      saveState: (state: unknown) =>
        savePersistedState(state, { databasePath }),
    });
    const saves: Array<Promise<unknown>> = [];

    for (let index = 0; index < 100; index += 1) {
      saves.push(
        queue.save({
          projects: [{ id: "project-a", name: `A ${index}`, path: "/tmp/a" }],
          closedProjects: [],
          chats: [],
          messagesByChatId: {},
          settings: {},
        }),
      );
      repository.appendProvenance({
        action: "repository.change.observed",
        actorType: "system",
        metadata: { index },
        projectId: "project-a",
      });
    }

    await Promise.all(saves);
    await queue.flushAndClose();
    expect(repository.verifyProvenance("project-a")).toMatchObject({
      eventCount: 101,
      valid: true,
    });
    expect(
      database
        .prepare("SELECT name FROM projects WHERE id = 'project-a'")
        .get(),
    ).toEqual({ name: "A 99" });
  });

  it("creates a consistent pre-migration snapshot for an existing database", () => {
    const databasePath = createDatabasePath();
    const legacyDatabase = new DatabaseSync(databasePath);
    legacyDatabase.exec("CREATE TABLE legacy_state (value TEXT NOT NULL)");
    legacyDatabase.exec("INSERT INTO legacy_state VALUES ('preserved')");
    legacyDatabase.close();

    getStateDatabase(databasePath);

    const backupName = readdirSync(path.dirname(databasePath)).find((name) =>
      name.startsWith("dream.db.pre-migration-"),
    );
    if (!backupName) {
      throw new Error("Expected a pre-migration backup.");
    }

    const backup = new DatabaseSync(
      path.join(path.dirname(databasePath), backupName),
    );
    expect(backup.prepare("SELECT value FROM legacy_state").get()).toEqual({
      value: "preserved",
    });
    backup.close();
  });

  it("adds additive research tables to a migrated database without changing its provenance layout", () => {
    const databasePath = createDatabasePath();
    const legacyDatabase = new DatabaseSync(databasePath);
    legacyDatabase.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE projects (
        id TEXT PRIMARY KEY, path TEXT NOT NULL, normalized_path TEXT NOT NULL,
        name TEXT NOT NULL, status TEXT NOT NULL, sort_order INTEGER NOT NULL,
        metadata TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE provenance_events (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL, object_id TEXT, action TEXT NOT NULL,
        actor_type TEXT NOT NULL, actor_id TEXT, metadata TEXT NOT NULL, created_at TEXT NOT NULL,
        sequence INTEGER, previous_hash TEXT, event_hash TEXT
      );
      CREATE TABLE __drizzle_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at NUMERIC
      );
      INSERT INTO projects VALUES ('legacy-project', '/tmp/legacy', '/tmp/legacy', 'Legacy', 'open', 0, '{}', '2026-01-01', '2026-01-01');
      INSERT INTO provenance_events VALUES ('legacy-event', 'legacy-project', NULL, 'legacy.event', 'system', NULL, '{}', '2026-01-01', 1, NULL, 'hash');
      INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('0005', 1783910000000);
    `);
    legacyDatabase.close();

    const database = getStateDatabase(databasePath);

    expect(
      database
        .prepare("SELECT id FROM projects WHERE id = 'legacy-project'")
        .get(),
    ).toEqual({ id: "legacy-project" });
    expect(
      database
        .prepare("PRAGMA table_info(provenance_events)")
        .all()
        .map((column) => column.name),
    ).toEqual(
      expect.arrayContaining(["sequence", "previous_hash", "event_hash"]),
    );
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'lineage_%' ORDER BY name",
        )
        .all(),
    ).toEqual([
      { name: "lineage_evidence" },
      { name: "lineage_scan_measurements" },
      { name: "lineage_suggestions" },
    ]);
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'decision_brief%' ORDER BY name",
        )
        .all(),
    ).toEqual([
      { name: "decision_brief_finding_evidence" },
      { name: "decision_brief_finding_transitions" },
      { name: "decision_brief_findings" },
      { name: "decision_brief_measurements" },
      { name: "decision_briefs" },
    ]);
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cost_entries'",
        )
        .get(),
    ).toEqual({ name: "cost_entries" });
    expect(
      database
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table' AND (
             name LIKE 'preregistration_%' OR
             name LIKE 'analysis_deviation%'
           ) ORDER BY name`,
        )
        .all(),
    ).toEqual([
      { name: "analysis_deviation_acknowledgements" },
      { name: "analysis_deviations" },
      { name: "preregistration_evaluations" },
      { name: "preregistration_snapshots" },
    ]);
  });

  it("enforces cost-ledger run ownership for direct SQLite writes", () => {
    const database = getStateDatabase(createDatabasePath());
    seedResearchProjects(database);
    database.exec(`
      INSERT INTO research_objects (id, project_id, type, title, payload, created_at, updated_at)
      VALUES
        ('run-a', 'project-a', 'run', 'Run A', '{"kind":"run","status":"completed"}', '2026-01-01', '2026-01-01'),
        ('run-b', 'project-b', 'run', 'Run B', '{"kind":"run","status":"completed"}', '2026-01-01', '2026-01-01');
    `);

    const insert = database.prepare(`
      INSERT INTO cost_entries
        (id, project_id, run_id, source, dedup_key, amount_minor, currency,
         category, started_at, ended_at, confidence_bps, raw_json, created_at)
      VALUES (?, ?, ?, 'manual', ?, 100, 'USD', 'gpu',
              '2026-01-01', '2026-01-01', 9000, '{}', '2026-01-01')
    `);
    expect(() =>
      insert.run("cross-cost", "project-a", "run-b", "manual:cross-cost"),
    ).toThrow("Cost entry run must belong to its project.");
    expect(() =>
      insert.run("not-run", "project-a", "object-a", "manual:not-run"),
    ).toThrow("Cost entry run must belong to its project.");
    expect(() =>
      insert.run("fractional", "project-a", "run-a", "manual:fractional"),
    ).not.toThrow();
    expect(() =>
      database
        .prepare(
          "UPDATE cost_entries SET run_id = 'run-b' WHERE id = 'fractional'",
        )
        .run(),
    ).toThrow("Cost entry run must belong to its project.");
  });

  it("enforces decision-brief evidence project isolation and immutable records", () => {
    const database = getStateDatabase(createDatabasePath());
    seedResearchProjects(database);
    database.exec(`
      INSERT INTO provenance_events
        (id, project_id, object_id, action, actor_type, metadata, created_at)
      VALUES
        ('brief-event-a', 'project-a', 'object-a', 'claim.created', 'human', '{}', '2026-01-01'),
        ('brief-event-b', 'project-b', 'object-b', 'claim.created', 'human', '{}', '2026-01-01');
      INSERT INTO decision_briefs
        (id, project_id, start_sequence, cutoff_sequence, generated_by, created_at)
      VALUES ('brief-a', 'project-a', 0, 1, 'facilitator', '2026-01-01');
      INSERT INTO decision_brief_findings
        (id, project_id, brief_id, category, sort_order, title, detail, recommended_action, status, created_at, updated_at)
      VALUES ('brief-finding-a', 'project-a', 'brief-a', 'unresolved-decision', 1, 'Owner needed', 'Detail', 'Assign', 'open', '2026-01-01', '2026-01-01');
    `);

    expect(() =>
      database
        .prepare(
          `INSERT INTO decision_brief_finding_evidence
            (id, project_id, finding_id, object_id, provenance_event_id, created_at)
           VALUES ('cross-brief-evidence', 'project-a', 'brief-finding-a', 'object-b', 'brief-event-b', '2026-01-01')`,
        )
        .run(),
    ).toThrow("Decision brief evidence object must belong to its project.");
    expect(() =>
      database
        .prepare(
          "UPDATE decision_briefs SET generated_by = 'other' WHERE id = 'brief-a'",
        )
        .run(),
    ).toThrow("Decision briefs are immutable");
  });

  it("enforces lineage evidence ownership for direct inserts and updates", () => {
    const database = getStateDatabase(createDatabasePath());
    database.exec(`
      INSERT INTO projects
        (id, path, normalized_path, name, status, sort_order, metadata, created_at, updated_at)
      VALUES
        ('lineage-a', '/tmp/lineage-a', '/tmp/lineage-a', 'A', 'open', 0, '{}', '2026-01-01', '2026-01-01'),
        ('lineage-b', '/tmp/lineage-b', '/tmp/lineage-b', 'B', 'open', 0, '{}', '2026-01-01', '2026-01-01');
    `);
    const hasLogicalKey = database
      .prepare("PRAGMA table_info(lineage_suggestions)")
      .all()
      .some((column) => column.name === "logical_key");
    if (hasLogicalKey) {
      database.exec(`
        INSERT INTO lineage_suggestions
          (id, project_id, logical_key, fingerprint, revision, lifecycle_state,
           chain_json, confidence, rationale, origin, review_state, created_at, updated_at)
        VALUES
          ('suggestion-b', 'lineage-b', 'logical-b', '${"a".repeat(64)}', 1, 'current',
           '[]', 0.5, 'B', 'inferred', 'unreviewed', '2026-01-01', '2026-01-01');
      `);
    } else {
      database.exec(`
        INSERT INTO lineage_suggestions
          (id, project_id, fingerprint, chain_json, confidence, rationale,
           origin, review_state, created_at, updated_at)
        VALUES
          ('suggestion-b', 'lineage-b', '${"a".repeat(64)}', '[]', 0.5, 'B',
           'inferred', 'unreviewed', '2026-01-01', '2026-01-01');
      `);
    }

    expect(() =>
      database
        .prepare(
          `INSERT INTO lineage_evidence
            (id, project_id, suggestion_id, evidence_type, coordinates, content_hash, created_at)
           VALUES ('cross-project-evidence', 'lineage-a', 'suggestion-b', 'file', '{}', ?, '2026-01-01')`,
        )
        .run("b".repeat(64)),
    ).toThrow();

    database
      .prepare(
        `INSERT INTO lineage_evidence
          (id, project_id, suggestion_id, evidence_type, coordinates, content_hash, created_at)
         VALUES ('evidence-b', 'lineage-b', 'suggestion-b', 'file', '{}', ?, '2026-01-01')`,
      )
      .run("c".repeat(64));
    expect(() =>
      database
        .prepare(
          "UPDATE lineage_evidence SET project_id = 'lineage-a' WHERE id = 'evidence-b'",
        )
        .run(),
    ).toThrow();
  });

  it("enforces project isolation even for direct SQLite writes", () => {
    const database = getStateDatabase(createDatabasePath());
    seedResearchProjects(database);

    expect(() =>
      database
        .prepare(
          `INSERT INTO research_relationships
            (id, project_id, from_object_id, to_object_id, type, created_at)
           VALUES ('cross-project', 'project-a', 'object-a', 'object-b', 'supports', '2026-01-01')`,
        )
        .run(),
    ).toThrow("Research relationship target must belong to its project.");

    database.exec(`
      INSERT INTO research_objects (id, project_id, type, title, payload, created_at, updated_at)
      VALUES ('object-a-2', 'project-a', 'claim', 'A2', '{"kind":"claim"}', '2026-01-01', '2026-01-01');
      INSERT INTO research_relationships
        (id, project_id, from_object_id, to_object_id, type, created_at)
      VALUES ('relationship-a', 'project-a', 'object-a', 'object-a-2', 'supports', '2026-01-01');
    `);

    expect(() =>
      database
        .prepare(
          "UPDATE research_relationships SET to_object_id = 'object-b' WHERE id = 'relationship-a'",
        )
        .run(),
    ).toThrow("Research relationship objects must belong to its project.");

    expect(() =>
      database
        .prepare(
          "UPDATE research_relationships SET project_id = 'project-b' WHERE id = 'relationship-a'",
        )
        .run(),
    ).toThrow("Research relationship objects must belong to its project.");
  });

  it("enforces provenance object ownership on inserts and updates", () => {
    const database = getStateDatabase(createDatabasePath());
    seedResearchProjects(database);

    expect(() =>
      database
        .prepare(
          `INSERT INTO provenance_events
            (id, project_id, object_id, action, actor_type, metadata, created_at)
           VALUES ('cross-project', 'project-a', 'object-b', 'source.created', 'human', '{}', '2026-01-01')`,
        )
        .run(),
    ).toThrow("Provenance object must belong to its project.");

    database.exec(`
      INSERT INTO provenance_events
        (id, project_id, object_id, action, actor_type, metadata, created_at)
      VALUES ('event-a', 'project-a', 'object-a', 'source.created', 'human', '{}', '2026-01-01');
    `);

    expect(() =>
      database
        .prepare(
          "UPDATE provenance_events SET object_id = 'object-b' WHERE id = 'event-a'",
        )
        .run(),
    ).toThrow("Provenance object must belong to its project.");

    expect(() =>
      database
        .prepare(
          "UPDATE provenance_events SET project_id = 'project-b' WHERE id = 'event-a'",
        )
        .run(),
    ).toThrow("Provenance object must belong to its project.");
  });
});
