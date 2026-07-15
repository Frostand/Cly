// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { createResearchRepository } from "../research/repository.js";
import { createLiteratureRepository } from "./repository.js";

let database: DatabaseSync;

beforeEach(() => {
  database = new DatabaseSync(":memory:");
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE projects (
      id TEXT PRIMARY KEY, path TEXT NOT NULL, normalized_path TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', sort_order INTEGER NOT NULL DEFAULT 0,
      metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE research_objects (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL,
      title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', payload TEXT NOT NULL,
      origin TEXT NOT NULL DEFAULT 'human', review_state TEXT NOT NULL DEFAULT 'unreviewed',
      reviewed_by TEXT, reviewed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE research_relationships (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, from_object_id TEXT NOT NULL,
      to_object_id TEXT NOT NULL, type TEXT NOT NULL, origin TEXT NOT NULL DEFAULT 'human',
      review_state TEXT NOT NULL DEFAULT 'unreviewed', confidence REAL, reviewed_by TEXT,
      reviewed_at TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE provenance_events (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, object_id TEXT, action TEXT NOT NULL,
      actor_type TEXT NOT NULL, actor_id TEXT, metadata TEXT NOT NULL, created_at TEXT NOT NULL,
      sequence INTEGER, previous_hash TEXT, event_hash TEXT
    );
    CREATE TABLE provenance_heads (
      project_id TEXT PRIMARY KEY, event_count INTEGER NOT NULL,
      last_sequence INTEGER NOT NULL, last_hash TEXT NOT NULL
    );
    CREATE TABLE literature_reading_lists (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL,
      normalized_name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(project_id, normalized_name)
    );
    CREATE TABLE literature_reading_list_sources (
      reading_list_id TEXT NOT NULL, source_id TEXT NOT NULL, project_id TEXT NOT NULL,
      added_at TEXT NOT NULL, PRIMARY KEY(reading_list_id, source_id)
    );
    INSERT INTO projects
      (id, path, normalized_path, name, metadata, created_at, updated_at)
    VALUES ('project-1', '/tmp/project-1', '/tmp/project-1', 'Project 1', '{}',
      '2026-07-14T12:00:00.000Z', '2026-07-14T12:00:00.000Z');
  `);
});

describe("literature repository", () => {
  it("imports once, reuses DOI duplicates, and persists reading-list membership", () => {
    const researchRepository = createResearchRepository(database);
    const ids = ["list-1"];
    const repository = createLiteratureRepository(database, {
      clock: () => "2026-07-14T12:00:00.000Z",
      createId: () => ids.shift() ?? "unexpected-id",
      researchRepository,
    });
    const readingList = repository.createReadingList("project-1", {
      name: "Calibration",
    }).readingList;
    const first = repository.importRecords(
      "project-1",
      [
        {
          title: "Reliable calibration",
          authors: ["A. Researcher"],
          year: 2026,
          doi: "10.1000/calibration",
          abstract: "We measure calibration. Performance falls under shift.",
        },
      ],
      { readingListIds: [readingList.id] },
    );
    const repeated = repository.importRecords("project-1", [
      {
        title: "Reliable calibration: revised",
        doi: "https://doi.org/10.1000/CALIBRATION",
      },
    ]);

    expect(first).toMatchObject({ importedCount: 1, duplicateCount: 0 });
    expect(first.results[0].source.payload.groundedSummary.claims).toHaveLength(
      2,
    );
    expect(repeated).toMatchObject({
      importedCount: 0,
      duplicateCount: 1,
      results: [{ duplicate: true, matchedBy: "doi" }],
    });
    expect(repository.listReadingLists("project-1")).toEqual([
      expect.objectContaining({ id: readingList.id, sourceCount: 1 }),
    ]);
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM research_objects").get(),
    ).toEqual({ count: 1 });
    expect(
      database
        .prepare("SELECT action FROM provenance_events ORDER BY sequence")
        .all()
        .map((row) => row.action),
    ).toEqual(
      expect.arrayContaining([
        "reading-list.created",
        "source.imported",
        "source.duplicate-detected",
      ]),
    );
  });
});
