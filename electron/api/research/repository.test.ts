// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";

import { createResearchRepository } from "./repository.js";

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
    INSERT INTO projects
      (id, path, normalized_path, name, metadata, created_at, updated_at)
    VALUES
      ('project-1', '/tmp/project-1', '/tmp/project-1', 'Project 1', '{}', '2026-07-11', '2026-07-11'),
      ('project-2', '/tmp/project-2', '/tmp/project-2', 'Project 2', '{}', '2026-07-11', '2026-07-11');
  `);
});

describe("research repository", () => {
  it("gets registered projects and records reviewable system provenance", () => {
    const repository = createResearchRepository(database);

    expect(repository.getProject("project-1")).toMatchObject({
      id: "project-1",
      name: "Project 1",
      path: "/tmp/project-1",
    });

    const first = repository.appendProvenance({
      action: "repository.scan.completed",
      actorId: "repository-observer",
      actorType: "system",
      metadata: { changeCount: 2 },
      projectId: "project-1",
    });
    const second = repository.appendProvenance({
      action: "repository.change.observed",
      actorId: "repository-observer",
      actorType: "system",
      metadata: { path: "src/index.ts", worktreeStatus: "M" },
      projectId: "project-1",
    });

    expect(repository.listProvenance("project-1", { limit: 1 })).toEqual([
      expect.objectContaining({
        id: second.id,
        action: "repository.change.observed",
        actorType: "system",
        metadata: { path: "src/index.ts", worktreeStatus: "M" },
        projectId: "project-1",
      }),
    ]);
    expect(first.projectId).toBe("project-1");
    expect(() => repository.getProject("missing-project")).toThrow(
      "Research project does not exist.",
    );
    expect(() =>
      repository.appendProvenance({
        action: "repository.scan.completed",
        actorType: "system",
        projectId: "missing-project",
      }),
    ).toThrow("Research project does not exist.");
  });

  it("upserts a renderer project before project-scoped research operations", () => {
    database.prepare("DELETE FROM projects WHERE id = ?").run("project-1");
    const repository = createResearchRepository(database);

    expect(
      repository.upsertProject({
        id: "project-1",
        name: "Neural surrogate reliability",
        path: "~/Research/surrogate-reliability/",
        metadata: { phase: "Evidence consolidation" },
      }),
    ).toMatchObject({
      id: "project-1",
      name: "Neural surrogate reliability",
      path: "~/Research/surrogate-reliability/",
    });
    expect(
      database
        .prepare(
          "SELECT id, normalized_path, metadata FROM projects WHERE id = ?",
        )
        .get("project-1"),
    ).toMatchObject({
      id: "project-1",
      normalized_path: "~/Research/surrogate-reliability",
      metadata: JSON.stringify({ phase: "Evidence consolidation" }),
    });
    expect(repository.listProject("project-1")).toEqual({
      objects: [],
      relationships: [],
    });
  });

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

    const graph = repository.listProject("project-1");
    expect(graph.objects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "source-1" }),
        expect.objectContaining({ id: "claim-1" }),
      ]),
    );
    expect(graph.relationships).toEqual([
      expect.objectContaining({
        fromObjectId: "source-1",
        toObjectId: "claim-1",
        type: "supports",
      }),
    ]);
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM provenance_events").get(),
    ).toEqual({ count: 3 });
  });

  it("validates typed payloads before writing objects or provenance", () => {
    const repository = createResearchRepository(database);

    expect(() =>
      repository.createObject({
        projectId: "project-1",
        type: "source",
        title: "Untraceable source",
        payload: { kind: "source" },
      }),
    ).toThrow("A source requires a URL or citation");
    expect(() =>
      repository.createObject({
        projectId: "project-1",
        type: "claim",
        title: "Invalid claim",
        payload: { kind: "claim", status: "accepted" },
      }),
    ).toThrow();
    expect(() =>
      repository.createObject({
        projectId: "project-1",
        type: "run",
        title: "Invalid run",
        payload: { kind: "run", status: "unknown" },
      }),
    ).toThrow();

    expect(
      database.prepare("SELECT COUNT(*) AS count FROM research_objects").get(),
    ).toEqual({ count: 0 });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM provenance_events").get(),
    ).toEqual({ count: 0 });
  });

  it("persists an explicitly marked source placeholder without evidence coordinates", () => {
    const repository = createResearchRepository(database);

    expect(
      repository.createObject({
        id: "source-placeholder",
        projectId: "project-1",
        type: "source",
        title: "Untitled source",
        payload: { kind: "source", status: "placeholder" },
      }),
    ).toMatchObject({
      id: "source-placeholder",
      payload: { kind: "source", status: "placeholder" },
    });
  });

  it("persists experiment and run primitives", () => {
    const repository = createResearchRepository(database);
    const experiment = repository.createObject({
      id: "experiment-1",
      projectId: "project-1",
      type: "experiment",
      title: "Recall benchmark",
      payload: { kind: "experiment", hypothesis: "Recall improves." },
    });
    const run = repository.createObject({
      id: "run-1",
      projectId: "project-1",
      type: "run",
      title: "Benchmark run",
      payload: { kind: "run", status: "completed", commitSha: "abc1234" },
    });
    repository.createRelationship({
      projectId: "project-1",
      fromObjectId: run.id,
      toObjectId: experiment.id,
      type: "generated-by",
    });

    expect(repository.listProject("project-1")).toMatchObject({
      objects: expect.arrayContaining([
        expect.objectContaining({ id: "experiment-1", type: "experiment" }),
        expect.objectContaining({ id: "run-1", type: "run" }),
      ]),
      relationships: [expect.objectContaining({ type: "generated-by" })],
    });
  });

  it("persists claim review status changes and experiment evidence links", () => {
    const repository = createResearchRepository(database);
    repository.createObject({
      id: "claim-status",
      projectId: "project-1",
      type: "claim",
      title: "Claim under review",
      payload: {
        kind: "claim",
        status: "draft",
        reviewStatus: "Unsupported",
      },
    });
    repository.createObject({
      id: "experiment-status",
      projectId: "project-1",
      type: "experiment",
      title: "Evidence experiment",
      payload: { kind: "experiment", hypothesis: "The claim holds." },
    });

    expect(
      repository.updateClaimStatus({
        id: "claim-status",
        projectId: "project-1",
        reviewStatus: "Strong",
      }),
    ).toMatchObject({
      payload: {
        kind: "claim",
        status: "supported",
        reviewStatus: "Strong",
      },
    });
    repository.createRelationship({
      id: "experiment-tests-claim",
      projectId: "project-1",
      fromObjectId: "experiment-status",
      toObjectId: "claim-status",
      type: "tests",
    });

    expect(repository.listProject("project-1")).toMatchObject({
      relationships: [
        expect.objectContaining({
          id: "experiment-tests-claim",
          type: "tests",
        }),
      ],
    });
    const events = database
      .prepare("SELECT action FROM provenance_events WHERE object_id = ?")
      .all("claim-status") as Array<{ action: string }>;
    expect(events.map((event) => event.action)).toContain(
      "claim.status.updated",
    );
  });

  it("creates and lists attributable project-scoped provenance", () => {
    const repository = createResearchRepository(database);
    repository.createObject({
      id: "claim-1",
      projectId: "project-1",
      type: "claim",
      title: "Claim",
      payload: { kind: "claim", status: "draft" },
    });

    const event = repository.createProvenanceEvent({
      id: "event-1",
      projectId: "project-1",
      objectId: "claim-1",
      action: "claim.reviewed",
      actorType: "agent",
      actorId: "review-agent",
      metadata: { model: "local" },
    });

    expect(event).toMatchObject({
      id: "event-1",
      objectId: "claim-1",
      actorType: "agent",
      metadata: { model: "local" },
    });
    expect(repository.listProvenance("project-1")).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "event-1" })]),
    );
    expect(() =>
      repository.createProvenanceEvent({
        projectId: "project-2",
        objectId: "claim-1",
        action: "claim.reviewed",
        actorType: "human",
      }),
    ).toThrow("Provenance object does not belong to the project");
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

  it("records literature retrieval and ranking metadata in provenance", () => {
    const repository = createResearchRepository(database);
    repository.createObject({
      id: "source-ranked",
      projectId: "project-1",
      type: "source",
      title: "Ranked paper",
      payload: {
        kind: "source",
        url: "https://example.test/ranked",
        provider: "semantic-scholar",
        providerId: "paper-123",
        query: "robust calibration",
        rankingMethod: "keyword_overlap_v1",
        rankingModel: "BAAI/bge-reranker-base",
        rankingScore: 0.91,
        retrievedAt: "2026-07-12T12:00:00.000Z",
      },
    });

    const row = database
      .prepare("SELECT metadata FROM provenance_events WHERE object_id = ?")
      .get("source-ranked") as { metadata: string };
    expect(JSON.parse(row.metadata)).toMatchObject({
      provider: "semantic-scholar",
      providerId: "paper-123",
      query: "robust calibration",
      rankingMethod: "keyword_overlap_v1",
      rankingModel: "BAAI/bge-reranker-base",
      rankingScore: 0.91,
    });
  });

  it("persists structured source enrichment with provenance", () => {
    const repository = createResearchRepository(database);
    repository.createObject({
      id: "source-enriched",
      projectId: "project-1",
      type: "source",
      title: "Paper",
      payload: { kind: "source", url: "https://example.test/paper" },
    });
    const updated = repository.updateSource({
      id: "source-enriched",
      projectId: "project-1",
      description: "Research problem",
      payload: {
        methods: ["Benchmark"],
        findings: ["Coverage improved."],
        limitations: ["Small sample."],
        enrichmentMethod: "deterministic_metadata_fixture_v1",
        enrichedAt: "2026-07-12T12:00:00.000Z",
      },
    });
    expect(updated).toMatchObject({
      description: "Research problem",
      payload: { findings: ["Coverage improved."] },
    });
    const events = database
      .prepare(
        "SELECT action FROM provenance_events WHERE object_id = ? ORDER BY created_at",
      )
      .all("source-enriched") as Array<{ action: string }>;
    expect(events.map((event) => event.action)).toContain("source.enriched");
  });
});
