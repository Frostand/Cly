// @vitest-environment node
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createNextStepPlanner } from "./next-step-planner.js";

type PlannerFixture = {
  projectId: string;
  objects: Array<{
    id: string;
    type: string;
    title: string;
    payload: Record<string, unknown>;
  }>;
  relationships: Array<{
    id: string;
    fromObjectId: string;
    toObjectId: string;
    type: string;
  }>;
  staleArtifact: {
    id: string;
    runId: string;
    kind: string;
    reasons: string[];
  };
};

const fixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/next-step-planner.json", import.meta.url),
    "utf8",
  ),
) as PlannerFixture;

const plannerMigration = readFileSync(
  new URL("../../drizzle/0027_research_next_step_planner.sql", import.meta.url),
  "utf8",
).replaceAll("--> statement-breakpoint", "");

function createFixtureDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE projects (id TEXT PRIMARY KEY, metadata TEXT NOT NULL);
    CREATE TABLE research_objects (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL,
      title TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE research_relationships (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, from_object_id TEXT NOT NULL,
      to_object_id TEXT NOT NULL, type TEXT NOT NULL,
      review_state TEXT NOT NULL DEFAULT 'approved'
    );
    CREATE TABLE provenance_events (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, object_id TEXT,
      action TEXT NOT NULL, created_at TEXT NOT NULL, sequence INTEGER
    );
    CREATE TABLE run_artifacts (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, run_id TEXT NOT NULL,
      kind TEXT NOT NULL, state TEXT NOT NULL, stale_reasons_json TEXT NOT NULL,
      provenance_event_id TEXT NOT NULL
    );
  `);
  database.exec(plannerMigration);
  database.prepare("INSERT INTO projects (id, metadata) VALUES (?, ?)").run(
    fixture.projectId,
    JSON.stringify({
      openQuestions: ["Which calibration metric should be primary?"],
      risks: [{ title: "Dataset license unresolved", blocking: true }],
    }),
  );
  const insertObject = database.prepare(
    `INSERT INTO research_objects
       (id, project_id, type, title, payload, updated_at)
     VALUES (?, ?, ?, ?, ?, '2026-07-19T12:00:00.000Z')`,
  );
  const insertEvent = database.prepare(
    `INSERT INTO provenance_events
       (id, project_id, object_id, action, created_at, sequence)
     VALUES (?, ?, ?, 'fixture.created', '2026-07-19T12:00:00.000Z', ?)`,
  );
  fixture.objects.forEach((object, index) => {
    insertObject.run(
      object.id,
      fixture.projectId,
      object.type,
      object.title,
      JSON.stringify(object.payload),
    );
    insertEvent.run(
      `event-${object.id}`,
      fixture.projectId,
      object.id,
      index + 1,
    );
  });
  const insertRelationship = database.prepare(
    `INSERT INTO research_relationships
       (id, project_id, from_object_id, to_object_id, type, review_state)
     VALUES (?, ?, ?, ?, ?, 'approved')`,
  );
  fixture.relationships.forEach((relationship) => {
    insertRelationship.run(
      relationship.id,
      fixture.projectId,
      relationship.fromObjectId,
      relationship.toObjectId,
      relationship.type,
    );
  });
  database
    .prepare(
      `INSERT INTO run_artifacts
         (id, project_id, run_id, kind, state, stale_reasons_json, provenance_event_id)
       VALUES (?, ?, ?, ?, 'stale', ?, ?)`,
    )
    .run(
      fixture.staleArtifact.id,
      fixture.projectId,
      fixture.staleArtifact.runId,
      fixture.staleArtifact.kind,
      JSON.stringify(fixture.staleArtifact.reasons),
      `event-${fixture.staleArtifact.id}`,
    );
  return database;
}

describe("research next-step planner", () => {
  it("deterministically prioritizes blockers, verification, and reproducibility with linked evidence", () => {
    const database = createFixtureDatabase();
    const planner = createNextStepPlanner(database, {
      clock: () => "2026-07-19T14:00:00.000Z",
    });

    const first = planner.generate(fixture.projectId, "researcher-1");
    const repeated = planner.generate(fixture.projectId, "researcher-1");

    expect(first.created).toBe(true);
    expect(repeated).toEqual({ ...first, created: false });
    expect(first.recommendations.map((item) => item.title)).toEqual([
      "Unblock failed run: Failed verification run",
      "Resolve blocking risk: Dataset license unresolved",
      "Resolve conflicting evidence for Conflicting claim",
      "Add verifiable evidence for Missing evidence claim",
      "Regenerate stale figure: Figure 4",
      "Clarify open question: Which calibration metric should be primary?",
    ]);
    expect(
      first.recommendations.every((item) => item.evidence.length > 0),
    ).toBe(true);
    expect(
      first.recommendations.every((item) => item.requiresExplicitApproval),
    ).toBe(true);
    expect(
      first.recommendations.every(
        (item) => item.executionState === "not-created",
      ),
    ).toBe(true);
    expect(
      first.recommendations.find(
        (item) =>
          item.title === "Resolve conflicting evidence for Conflicting claim",
      ),
    ).toMatchObject({
      category: "verification",
      evidence: expect.arrayContaining([
        expect.objectContaining({ relationshipId: "edge-support" }),
        expect.objectContaining({ relationshipId: "edge-contradict" }),
      ]),
    });

    database
      .prepare("UPDATE research_objects SET payload = ? WHERE id = ?")
      .run(JSON.stringify({ kind: "run", status: "completed" }), "run-failed");
    const refreshed = planner.generate(fixture.projectId, "researcher-1");
    expect(refreshed.created).toBe(true);
    expect(planner.list(fixture.projectId)).toEqual(refreshed.recommendations);
    expect(refreshed.recommendations.map((item) => item.title)).not.toContain(
      "Unblock failed run: Failed verification run",
    );
  });

  it("records accept, edit, defer, and dismiss as decision, graph, and audit rows without execution", () => {
    const database = createFixtureDatabase();
    let sequence = 0;
    const planner = createNextStepPlanner(database, {
      clock: () => "2026-07-19T15:00:00.000Z",
      createId: () => `review-${++sequence}`,
    });
    const generated = planner.generate(fixture.projectId);
    const [accepted, edited, deferred, dismissed] = generated.recommendations;

    const acceptedResult = planner.decide({
      projectId: fixture.projectId,
      recommendationId: accepted.id,
      action: "accept",
      actor: "researcher-1",
    });
    const editedResult = planner.decide({
      projectId: fixture.projectId,
      recommendationId: edited.id,
      action: "edit",
      actor: "researcher-1",
      reason: "Narrow the review scope.",
      edit: {
        title: "Resolve the primary evidence conflict",
        rationale: "Review the approved support and contradiction together.",
      },
    });
    planner.decide({
      projectId: fixture.projectId,
      recommendationId: deferred.id,
      action: "defer",
      actor: "researcher-1",
      reason: "Waiting for the source PDF.",
    });
    planner.decide({
      projectId: fixture.projectId,
      recommendationId: dismissed.id,
      action: "dismiss",
      actor: "researcher-1",
      reason: "The figure is no longer in scope.",
    });

    expect(acceptedResult).toMatchObject({
      recommendation: { status: "accepted" },
      execution: { created: false, state: "not-created" },
    });
    expect(() =>
      planner.decide({
        projectId: fixture.projectId,
        recommendationId: accepted.id,
        action: "accept",
      }),
    ).toThrow("already has a review decision");
    expect(editedResult.recommendation).toMatchObject({
      title: "Resolve the primary evidence conflict",
      status: "recommended",
    });
    expect(
      database.prepare("SELECT count(*) AS count FROM planner_decisions").get(),
    ).toEqual({ count: 4 });
    expect(
      database
        .prepare("SELECT count(*) AS count FROM planner_audit_events")
        .get(),
    ).toEqual({ count: 4 });
    expect(
      database
        .prepare("SELECT count(*) AS count FROM planner_graph_records")
        .get(),
    ).toEqual({
      count: [accepted, edited, deferred, dismissed].reduce(
        (total, recommendation) => total + recommendation.evidence.length,
        0,
      ),
    });
    expect(
      database
        .prepare(
          "SELECT count(*) AS count FROM planner_audit_events WHERE metadata_json LIKE '%not-created%'",
        )
        .get(),
    ).toEqual({ count: 4 });
  });

  it("requires an explicit rationale before deferring or dismissing", () => {
    const database = createFixtureDatabase();
    const planner = createNextStepPlanner(database);
    const recommendation = planner.generate(fixture.projectId)
      .recommendations[0];

    expect(() =>
      planner.decide({
        projectId: fixture.projectId,
        recommendationId: recommendation.id,
        action: "defer",
      }),
    ).toThrow("Deferring a recommendation requires a reason.");
    expect(
      database.prepare("SELECT count(*) AS count FROM planner_decisions").get(),
    ).toEqual({
      count: 0,
    });
  });
});
