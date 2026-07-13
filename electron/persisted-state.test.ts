// @vitest-environment node
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import {
  closePersistedStateDatabase,
  getStateDatabase,
  savePersistedState,
} from "./persisted-state.js";

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

describe("persisted research storage", () => {
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
