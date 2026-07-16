// @vitest-environment node
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { createClyDevSessionRepository } from "../session-repository.js";
import { hashHandoffPayload } from "./canonical-json.js";
import { createClyDevHandoffRepository } from "./handoff-repository.js";

const databases: DatabaseSync[] = [];
const migration = (name: string) =>
  readFileSync(
    new URL(`../../../drizzle/${name}`, import.meta.url),
    "utf8",
  ).replaceAll("--> statement-breakpoint", "");

const envelope = (title: string) => {
  const value = JSON.parse(
    readFileSync(new URL("./fixtures/valid-v1.json", import.meta.url), "utf8"),
  );
  value.payload.task.title = title;
  value.integrity.digest = hashHandoffPayload(value.payload);
  return value;
};

function setup() {
  const directory = mkdtempSync(path.join(tmpdir(), "cly-handoff-links-"));
  const databasePath = path.join(directory, "state.sqlite");
  const db = new DatabaseSync(databasePath);
  databases.push(db);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("CREATE TABLE projects (id TEXT PRIMARY KEY NOT NULL);");
  for (const name of [
    "0015_cly_dev_sessions.sql",
    "0016_cly_dev_handoffs.sql",
    "0017_cly_dev_tool_effects.sql",
    "0018_cly_dev_handoff_materialization.sql",
    "0019_cly_dev_handoff_link_invariants.sql",
    "0020_cly_dev_tool_effect_fingerprints.sql",
    "0021_cly_dev_handoff_link_deletion.sql",
  ]) {
    db.exec(migration(name));
  }
  db.exec("INSERT INTO projects (id) VALUES ('project-1'), ('project-2')");
  const sessions = createClyDevSessionRepository({ db });
  const createSession = (projectId: string, suffix: string) =>
    sessions.createSessionAggregate(projectId, {
      workspace: {
        schemaVersion: 1,
        idempotencyKey: `workspace-${suffix}`,
        name: `Workspace ${suffix}`,
        repository: { id: `repo-${suffix}` },
        worktree: { id: `tree-${suffix}`, branch: "main" },
        machine: { id: `machine-${suffix}`, platform: "linux" },
        localOnly: {
          repositoryPath: `/tmp/repo-${suffix}`,
          worktreePath: `/tmp/tree-${suffix}`,
        },
      },
      contextManifest: {
        schemaVersion: 1,
        idempotencyKey: `context-${suffix}`,
        localOnly: {},
        transferable: { summary: "Context", entries: [] },
      },
      task: {
        schemaVersion: 1,
        idempotencyKey: `task-${suffix}`,
        title: `Task ${suffix}`,
        objective: "Resume safely",
        researchObjectIds: [],
      },
      session: {
        schemaVersion: 1,
        idempotencyKey: `session-${suffix}`,
        title: `Session ${suffix}`,
        provider: { id: "openai-codex", model: "test-model" },
        commit: { sha: "a".repeat(40) },
        state: "resumable",
      },
    });
  const aggregate1 = createSession("project-1", "one");
  const aggregate2 = createSession("project-2", "two");
  const session1 = aggregate1.session;
  const session2 = aggregate2.session;
  const handoffs = createClyDevHandoffRepository({ db });
  return {
    aggregate1,
    aggregate2,
    databasePath,
    db,
    handoffs,
    session1,
    session2,
  };
}

afterEach(() => {
  while (databases.length) databases.pop()?.close();
});

describe("Cly Dev handoff link persistence", () => {
  it("enforces link direction, pairing, existence, and project scope in SQLite", () => {
    const { db, handoffs, session1, session2 } = setup();
    const imported = (title: string) =>
      handoffs.recordImport("project-1", envelope(title), {}).record;
    const orphan = imported("Orphan");
    expect(() =>
      db
        .prepare(
          "UPDATE cly_dev_handoffs SET materialized_session_id = ?, materialized_at = ? WHERE id = ?",
        )
        .run("missing-session", "2026-07-16T12:00:00.000Z", orphan.id),
    ).toThrow(/materialized|session|project/i);

    const crossProject = imported("Cross project");
    expect(() =>
      db
        .prepare(
          "UPDATE cly_dev_handoffs SET materialized_session_id = ?, materialized_at = ? WHERE id = ?",
        )
        .run(session2.id, "2026-07-16T12:00:00.000Z", crossProject.id),
    ).toThrow(/materialized|session|project/i);

    const half = imported("Half populated");
    expect(() =>
      db
        .prepare(
          "UPDATE cly_dev_handoffs SET materialized_session_id = ? WHERE id = ?",
        )
        .run(session1.id, half.id),
    ).toThrow(/materialized|paired/i);
    expect(() =>
      db
        .prepare("UPDATE cly_dev_handoffs SET materialized_at = ? WHERE id = ?")
        .run("2026-07-16T12:00:00.000Z", half.id),
    ).toThrow(/materialized|paired/i);

    const exported = handoffs.recordExport("project-1", envelope("Export"));
    expect(() =>
      db
        .prepare(
          "UPDATE cly_dev_handoffs SET materialized_session_id = ?, materialized_at = ? WHERE id = ?",
        )
        .run(session1.id, "2026-07-16T12:00:00.000Z", exported.id),
    ).toThrow(/materialized|import/i);

    const valid = imported("Valid link");
    handoffs.linkMaterializedSession("project-1", valid.id, session1.id);
    expect(handoffs.get("project-1", valid.id)).toEqual(
      expect.objectContaining({ materializedSessionId: session1.id }),
    );
  });

  it("enforces the same invariants on direct inserts and after reopen", () => {
    const { databasePath, db, handoffs, session1 } = setup();
    const exported = handoffs.recordExport(
      "project-1",
      envelope("Insert direction"),
    );
    expect(() =>
      db
        .prepare(
          `INSERT INTO cly_dev_handoffs
           SELECT ?, project_id, direction, protocol, schema_version,
                  minimum_reader_version, canonical_payload_json, ?,
                  repository_fingerprint_json, research_fingerprint_json,
                  inspection_json, exported_at, imported_at, ?, ?, created_at
           FROM cly_dev_handoffs WHERE id = ?`,
        )
        .run(
          "invalid-linked-export",
          "f".repeat(64),
          session1.id,
          "2026-07-16T12:00:00.000Z",
          exported.id,
        ),
    ).toThrow(/materialized|import/i);

    const valid = handoffs.recordImport(
      "project-1",
      envelope("Reopen link"),
      {},
    ).record;
    handoffs.linkMaterializedSession("project-1", valid.id, session1.id);
    const reopened = new DatabaseSync(databasePath);
    reopened.exec("PRAGMA foreign_keys = ON;");
    databases.push(reopened);
    expect(
      createClyDevHandoffRepository({ db: reopened }).get(
        "project-1",
        valid.id,
      ),
    ).toEqual(expect.objectContaining({ materializedSessionId: session1.id }));
  });

  it("blocks direct deletion of a linked session and preserves reverse lookup after reopen", () => {
    const { databasePath, db, handoffs, session1 } = setup();
    const imported = handoffs.recordImport(
      "project-1",
      envelope("Direct delete"),
      {},
    ).record;
    handoffs.linkMaterializedSession("project-1", imported.id, session1.id);

    expect(() =>
      db.prepare("DELETE FROM cly_dev_sessions WHERE id = ?").run(session1.id),
    ).toThrow(/handoff|materialized|linked/i);
    const reopened = new DatabaseSync(databasePath);
    reopened.exec("PRAGMA foreign_keys = ON;");
    databases.push(reopened);
    expect(
      createClyDevHandoffRepository({
        db: reopened,
      }).findImportByMaterializedSession("project-1", session1.id),
    ).toEqual(expect.objectContaining({ id: imported.id }));
  });

  it("blocks task deletion when its cascade contains a linked session", () => {
    const { aggregate1, db, handoffs, session1 } = setup();
    const imported = handoffs.recordImport(
      "project-1",
      envelope("Task cascade"),
      {},
    ).record;
    handoffs.linkMaterializedSession("project-1", imported.id, session1.id);

    expect(() =>
      db
        .prepare("DELETE FROM cly_dev_tasks WHERE id = ?")
        .run(aggregate1.task.id),
    ).toThrow(/handoff|materialized|linked/i);
    expect(
      db
        .prepare("SELECT id FROM cly_dev_sessions WHERE id = ?")
        .get(session1.id),
    ).toEqual({ id: session1.id });
  });

  it.each([
    ["workspace", "cly_dev_workspaces", (aggregate) => aggregate.workspace.id],
    ["project", "projects", () => "project-1"],
  ])("preserves a linked session and reverse lookup when %s cascade deletion is blocked", (_, table, id) => {
    const { aggregate1, db, handoffs, session1 } = setup();
    const imported = handoffs.recordImport(
      "project-1",
      envelope(`Blocked ${table} cascade`),
      {},
    ).record;
    handoffs.linkMaterializedSession("project-1", imported.id, session1.id);

    expect(() =>
      db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id(aggregate1)),
    ).toThrow(/immutable|handoff|materialized|linked/i);
    expect(
      db
        .prepare("SELECT id FROM cly_dev_sessions WHERE id = ?")
        .get(session1.id),
    ).toEqual({ id: session1.id });
    expect(
      handoffs.findImportByMaterializedSession("project-1", session1.id),
    ).toEqual(expect.objectContaining({ id: imported.id }));
  });

  it("allows deletion of an unlinked session and its now-empty task", () => {
    const { aggregate2, db, session2 } = setup();

    expect(
      db.prepare("DELETE FROM cly_dev_sessions WHERE id = ?").run(session2.id)
        .changes,
    ).toBe(1);
    expect(
      db
        .prepare("DELETE FROM cly_dev_tasks WHERE id = ?")
        .run(aggregate2.task.id).changes,
    ).toBe(1);
  });
});
