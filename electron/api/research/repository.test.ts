// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";

import { createResearchRepository } from "./repository.js";

let database: DatabaseSync;

beforeEach(() => {
  database = new DatabaseSync(":memory:");
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE projects (id TEXT PRIMARY KEY);
    CREATE TABLE research_objects (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL,
      title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', payload TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE research_relationships (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, from_object_id TEXT NOT NULL,
      to_object_id TEXT NOT NULL, type TEXT NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (from_object_id) REFERENCES research_objects(id) ON DELETE CASCADE,
      FOREIGN KEY (to_object_id) REFERENCES research_objects(id) ON DELETE CASCADE
    );
    CREATE TABLE provenance_events (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, object_id TEXT, action TEXT NOT NULL,
      actor_type TEXT NOT NULL, actor_id TEXT, metadata TEXT NOT NULL, created_at TEXT NOT NULL
    );
    INSERT INTO projects (id) VALUES ('project-1'), ('project-2');
  `);
});

describe("research repository", () => {
  it("persists a source, claim, and directed evidence link", () => {
    const repository = createResearchRepository(database);
    const source = repository.createObject({
      id: "source-1",
      projectId: "project-1",
      type: "source",
      title: "Paper",
      payload: { kind: "source", url: "https://example.com/paper" },
    });
    const claim = repository.createObject({
      id: "claim-1",
      projectId: "project-1",
      type: "claim",
      title: "The method improves recall",
      payload: { kind: "claim", status: "supported" },
    });
    repository.createRelationship({
      id: "relationship-1",
      projectId: "project-1",
      fromObjectId: source.id,
      toObjectId: claim.id,
      type: "supports",
    });

    expect(repository.listProject("project-1")).toMatchObject({
      objects: [{ id: "source-1" }, { id: "claim-1" }],
      relationships: [
        { fromObjectId: "source-1", toObjectId: "claim-1", type: "supports" },
      ],
    });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM provenance_events").get(),
    ).toEqual({ count: 3 });
  });

  it("rejects relationships across projects", () => {
    const repository = createResearchRepository(database);
    repository.createObject({
      id: "source-1",
      projectId: "project-1",
      type: "source",
      title: "Paper",
      payload: { kind: "source", citation: "Citation" },
    });
    repository.createObject({
      id: "claim-2",
      projectId: "project-2",
      type: "claim",
      title: "Claim",
      payload: { kind: "claim", status: "draft" },
    });

    expect(() =>
      repository.createRelationship({
        projectId: "project-1",
        fromObjectId: "source-1",
        toObjectId: "claim-2",
        type: "supports",
      }),
    ).toThrow("Both research objects must belong to the project");
  });
});
