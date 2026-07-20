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
      origin TEXT NOT NULL DEFAULT 'human', review_state TEXT NOT NULL DEFAULT 'unreviewed',
      reviewed_by TEXT, reviewed_at TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE research_relationships (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, from_object_id TEXT NOT NULL,
      to_object_id TEXT NOT NULL, type TEXT NOT NULL,
      origin TEXT NOT NULL DEFAULT 'human', review_state TEXT NOT NULL DEFAULT 'unreviewed',
      confidence REAL, reviewed_by TEXT, reviewed_at TEXT,
      version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (from_object_id) REFERENCES research_objects(id) ON DELETE CASCADE,
      FOREIGN KEY (to_object_id) REFERENCES research_objects(id) ON DELETE CASCADE
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
    CREATE TABLE decision_briefs (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, start_sequence INTEGER NOT NULL,
      cutoff_sequence INTEGER NOT NULL, generated_by TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(id, project_id), UNIQUE(project_id, start_sequence, cutoff_sequence)
    );
    CREATE TABLE decision_brief_findings (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, brief_id TEXT NOT NULL,
      category TEXT NOT NULL, sort_order INTEGER NOT NULL, title TEXT NOT NULL,
      detail TEXT NOT NULL, recommended_action TEXT NOT NULL, status TEXT NOT NULL,
      owner TEXT, deferred_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE decision_brief_finding_evidence (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, finding_id TEXT NOT NULL,
      object_id TEXT NOT NULL, provenance_event_id TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE decision_brief_finding_transitions (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, finding_id TEXT NOT NULL,
      from_status TEXT NOT NULL, to_status TEXT NOT NULL, actor TEXT NOT NULL,
      owner TEXT, reason TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE decision_brief_measurements (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, brief_id TEXT NOT NULL,
      meeting_number INTEGER NOT NULL, target_meetings INTEGER NOT NULL,
      surfaced_decision_count INTEGER NOT NULL, assigned_or_resolved_count INTEGER NOT NULL,
      assignment_or_resolution_rate REAL NOT NULL, recorded_at TEXT NOT NULL
    );
    INSERT INTO projects
      (id, path, normalized_path, name, metadata, created_at, updated_at)
    VALUES
      ('project-1', '/tmp/project-1', '/tmp/project-1', 'Project 1', '{}', '2026-07-11', '2026-07-11'),
      ('project-2', '/tmp/project-2', '/tmp/project-2', 'Project 2', '{}', '2026-07-11', '2026-07-11');
  `);
});

describe("research repository", () => {
  it("generates an idempotent sequence-bounded brief and records immutable finding transitions", () => {
    const ids = [
      "brief-1",
      "finding-1",
      "evidence-1",
      "measurement-1",
      "transition-1",
      "event-1",
    ];
    let fallbackId = 0;
    const repository = createResearchRepository(database, {
      clock: () => "2026-07-13T12:00:00.000Z",
      createId: () => ids.shift() ?? `overflow-${++fallbackId}`,
    });
    repository.createObject({
      id: "run-failed",
      projectId: "project-1",
      type: "run",
      title: "Failed ablation",
      payload: { kind: "run", status: "failed" },
    });

    const first = repository.generateDecisionBrief(
      "project-1",
      "facilitator-1",
    );
    const repeated = repository.generateDecisionBrief(
      "project-1",
      "facilitator-1",
    );

    expect(first.created).toBe(true);
    expect(first.brief).toMatchObject({
      id: "brief-1",
      startSequence: 0,
      cutoffSequence: 1,
      pilot: { meetingNumber: 1, targetMeetings: 4 },
    });
    expect(first.brief.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "failed-run",
          evidence: [
            expect.objectContaining({
              objectId: "run-failed",
              provenanceEventId: expect.any(String),
            }),
          ],
        }),
      ]),
    );
    expect(repeated).toEqual({
      brief: first.brief,
      created: false,
      noChanges: false,
    });

    repository.createObject({
      id: "claim-needs-owner",
      projectId: "project-1",
      type: "claim",
      title: "Unresolved calibration decision",
      payload: { kind: "claim", status: "needs-evidence" },
    });
    const second = repository.generateDecisionBrief(
      "project-1",
      "facilitator-1",
    );
    expect(second).toMatchObject({
      created: true,
      noChanges: false,
      brief: {
        startSequence: first.brief.cutoffSequence,
        cutoffSequence: expect.any(Number),
      },
    });
    expect(second.brief.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "unresolved-decision" }),
      ]),
    );
    expect(second.brief.cutoffSequence).toBeGreaterThan(
      first.brief.cutoffSequence,
    );

    const finding = first.brief.findings[0];
    const transitioned = repository.transitionDecisionBriefFinding({
      projectId: "project-1",
      briefId: first.brief.id,
      findingId: finding.id,
      status: "assigned",
      owner: "owner-1",
      actor: "facilitator-1",
    });
    expect(transitioned.status).toBe("assigned");
    expect(transitioned.owner).toBe("owner-1");
    expect(
      repository
        .listDecisionBriefs("project-1")
        .find((brief) => brief.id === first.brief.id)?.pilot
        .assignmentOrResolutionRate,
    ).toBe(0.5);
    expect(() =>
      repository.transitionDecisionBriefFinding({
        projectId: "project-1",
        briefId: first.brief.id,
        findingId: finding.id,
        status: "deferred",
        actor: "facilitator-1",
      }),
    ).toThrow("Deferring a finding requires a reason.");
    expect(
      database
        .prepare(
          "SELECT action FROM provenance_events ORDER BY sequence DESC LIMIT 1",
        )
        .get(),
    ).toEqual({ action: "decision-brief.finding.assigned" });
  });
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
        confidence: null,
        fromObjectId: "source-1",
        origin: "human",
        reviewState: "unreviewed",
        toObjectId: "claim-1",
        type: "supports",
      }),
    ]);
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM provenance_events").get(),
    ).toEqual({ count: 3 });
  });

  it("persists source review passages and verification without provider coupling", () => {
    const repository = createResearchRepository(database);
    const created = repository.createObject({
      id: "source-review-contract",
      projectId: "project-1",
      type: "source",
      title: "Local repository review",
      payload: {
        kind: "source",
        sourceType: "repository",
        citation: "local://repository",
        folder: "Implementation evidence",
        extractedFields: {
          method: {
            value: "Static symbol scan",
            passage: {
              quote: "Symbols are scanned from the checked-out repository.",
              locator: "README.md:14",
            },
            confidence: 88,
            verificationState: "verified",
            verifiedBy: "local-user",
            verifiedAt: "2026-07-19T12:00:00.000Z",
          },
        },
        contradictoryEvidence: [
          { quote: "Generated symbols are excluded.", locator: "README.md:21" },
        ],
      },
    });
    expect(created).toMatchObject({
      payload: {
        sourceType: "repository",
        folder: "Implementation evidence",
        extractedFields: {
          method: {
            confidence: 88,
            verificationState: "verified",
            passage: { locator: "README.md:14" },
          },
        },
      },
    });
    expect(repository.listProject("project-1").objects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "source-review-contract" }),
      ]),
    );
  });

  it("recovers project objects, relationships, and provenance after service restart", () => {
    const firstService = createResearchRepository(database);
    firstService.createObject({
      id: "restart-source",
      projectId: "project-1",
      type: "source",
      title: "Restart evidence",
      payload: { kind: "source", url: "https://example.com/restart" },
    });
    firstService.createObject({
      id: "restart-claim",
      projectId: "project-1",
      type: "claim",
      title: "Persistence survives service restart",
      payload: { kind: "claim", status: "supported" },
    });
    firstService.createRelationship({
      id: "restart-link",
      projectId: "project-1",
      fromObjectId: "restart-source",
      toObjectId: "restart-claim",
      type: "supports",
    });

    const restartedService = createResearchRepository(database);

    expect(restartedService.listProject("project-1")).toMatchObject({
      objects: expect.arrayContaining([
        expect.objectContaining({ id: "restart-source" }),
        expect.objectContaining({ id: "restart-claim" }),
      ]),
      relationships: [expect.objectContaining({ id: "restart-link" })],
    });
    expect(restartedService.verifyProvenance("project-1")).toMatchObject({
      valid: true,
      eventCount: 3,
    });
    expect(restartedService.listProject("project-2")).toEqual({
      objects: [],
      relationships: [],
    });
  });

  it("keeps new objects and relationships unreviewed until an attributable review", () => {
    const repository = createResearchRepository(database);
    const source = repository.createObject({
      id: "source-review",
      projectId: "project-1",
      type: "source",
      title: "Review source",
      payload: { kind: "source", url: "https://example.com/review" },
    });
    const claim = repository.createObject({
      id: "claim-review",
      projectId: "project-1",
      type: "claim",
      title: "Review claim",
      payload: { kind: "claim", status: "draft" },
    });
    const relationship = repository.createRelationship({
      id: "relationship-review",
      projectId: "project-1",
      fromObjectId: source.id,
      toObjectId: claim.id,
      type: "supports",
    });

    expect(source).toMatchObject({
      origin: "human",
      reviewState: "unreviewed",
      reviewedAt: null,
      reviewedBy: null,
    });
    expect(relationship).toMatchObject({
      confidence: null,
      origin: "human",
      reviewState: "unreviewed",
      reviewedAt: null,
      reviewedBy: null,
    });

    expect(
      repository.reviewRelationship({
        id: relationship.id,
        projectId: "project-1",
        reviewState: "approved",
        reviewerId: "reviewer-1",
        confidence: 0.82,
      }),
    ).toMatchObject({
      confidence: 0.82,
      reviewState: "approved",
      reviewedBy: "reviewer-1",
      reviewedAt: expect.any(String),
    });
  });

  it("atomically persists, deduplicates, reviews, and recovers an exact evidence chain", () => {
    const ids = ["evidence-1", "contains-1", "supports-1"];
    const repository = createResearchRepository(database, {
      clock: () => "2026-07-19T12:00:00.000Z",
      createId: () => ids.shift() ?? "unexpected-id",
    });
    repository.createObject({
      id: "source-chain",
      projectId: "project-1",
      type: "source",
      title: "Durable evidence source",
      payload: { kind: "source", url: "https://example.com/evidence" },
    });
    repository.createObject({
      id: "claim-chain",
      projectId: "project-1",
      type: "claim",
      title: "Exact passages survive restart",
      payload: { kind: "claim", status: "draft" },
    });

    const first = repository.createEvidenceLink({
      projectId: "project-1",
      sourceId: "source-chain",
      claimId: "claim-chain",
      quote: "The exact reported effect was 24 percent.",
      locator: "Results, p. 14",
      type: "supports",
      origin: "inferred",
      actorId: "agent-1",
      confidence: 0.84,
    });
    expect(first).toMatchObject({
      duplicate: false,
      evidence: {
        id: "evidence-1",
        origin: "inferred",
        reviewState: "unreviewed",
        version: 1,
        payload: {
          kind: "evidence",
          sourceId: "source-chain",
          quote: "The exact reported effect was 24 percent.",
          locator: "Results, p. 14",
          verificationState: "unverified",
        },
      },
      claimRelationship: {
        id: "supports-1",
        origin: "inferred",
        reviewState: "unreviewed",
        confidence: 0.84,
      },
    });
    expect(repository.listProvenance("project-1", { limit: 20 })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "evidence.created",
          actorType: "agent",
          actorId: "agent-1",
          objectId: "evidence-1",
        }),
      ]),
    );

    const duplicate = repository.createEvidenceLink({
      projectId: "project-1",
      sourceId: "source-chain",
      claimId: "claim-chain",
      quote: "The exact reported effect was 24 percent.",
      locator: "Results, p. 14",
      type: "supports",
      origin: "inferred",
    });
    expect(duplicate).toMatchObject({
      duplicate: true,
      evidence: { id: "evidence-1" },
      claimRelationship: { id: "supports-1" },
    });
    expect(() =>
      repository.createEvidenceLink({
        projectId: "project-1",
        sourceId: "source-chain",
        claimId: "claim-chain",
        quote: "The exact reported effect was 24 percent.",
        locator: "Results, p. 14",
        type: "contradicts",
      }),
    ).toThrow("already linked with the opposite disposition");
    expect(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM research_objects WHERE type = 'evidence'",
        )
        .get(),
    ).toEqual({ count: 1 });

    const reviewedLink = repository.reviewRelationship({
      id: "supports-1",
      projectId: "project-1",
      reviewState: "approved",
      reviewerId: "reviewer-1",
      confidence: 0.9,
    });
    const reviewedPassage = repository.reviewEvidence({
      id: "evidence-1",
      projectId: "project-1",
      verificationState: "verified",
      reviewerId: "reviewer-1",
    });
    expect(reviewedLink).toMatchObject({
      reviewState: "approved",
      reviewedBy: "reviewer-1",
      version: 2,
    });
    expect(reviewedPassage).toMatchObject({
      reviewState: "approved",
      reviewedBy: "reviewer-1",
      version: 2,
      payload: { verificationState: "verified" },
    });

    const restarted = createResearchRepository(database);
    expect(restarted.listProject("project-1")).toMatchObject({
      objects: expect.arrayContaining([
        expect.objectContaining({
          id: "evidence-1",
          version: 2,
          payload: expect.objectContaining({ verificationState: "verified" }),
        }),
      ]),
      relationships: expect.arrayContaining([
        expect.objectContaining({
          id: "supports-1",
          reviewState: "approved",
          version: 2,
        }),
      ]),
    });
    expect(restarted.listProject("project-2")).toEqual({
      objects: [],
      relationships: [],
    });
    expect(() =>
      restarted.createEvidenceLink({
        projectId: "project-2",
        sourceId: "source-chain",
        claimId: "claim-chain",
        quote: "Cross-project passage",
        type: "supports",
      }),
    ).toThrow("The source and claim must belong to the project.");
  });

  it("rolls back the whole evidence chain when an interrupted relationship write fails", () => {
    const repository = createResearchRepository(database);
    repository.createObject({
      id: "source-interrupted",
      projectId: "project-1",
      type: "source",
      title: "Interrupted source",
      payload: { kind: "source", url: "https://example.com/interrupted" },
    });
    repository.createObject({
      id: "claim-interrupted",
      projectId: "project-1",
      type: "claim",
      title: "Interrupted claim",
      payload: { kind: "claim", status: "draft" },
    });
    const before = database
      .prepare("SELECT COUNT(*) AS count FROM provenance_events")
      .get();
    database.exec(`
      CREATE TRIGGER fail_evidence_claim_link
      BEFORE INSERT ON research_relationships
      WHEN NEW.type IN ('supports', 'contradicts')
      BEGIN
        SELECT RAISE(ABORT, 'simulated interrupted write');
      END;
    `);

    expect(() =>
      repository.createEvidenceLink({
        projectId: "project-1",
        sourceId: "source-interrupted",
        claimId: "claim-interrupted",
        quote: "This write must be all or nothing.",
        type: "supports",
      }),
    ).toThrow("simulated interrupted write");
    expect(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM research_objects WHERE type = 'evidence'",
        )
        .get(),
    ).toEqual({ count: 0 });
    expect(
      database
        .prepare("SELECT COUNT(*) AS count FROM research_relationships")
        .get(),
    ).toEqual({ count: 0 });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM provenance_events").get(),
    ).toEqual(before);
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

  it("rejects strong and paper-ready claim transitions until integrity gates pass", () => {
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

    expect(() =>
      repository.updateClaimStatus({
        id: "claim-status",
        projectId: "project-1",
        reviewStatus: "Strong",
        reviewerId: "reviewer-1",
      }),
    ).toThrow("reviewed supporting evidence");

    const support = repository.createRelationship({
      id: "experiment-tests-claim",
      projectId: "project-1",
      fromObjectId: "experiment-status",
      toObjectId: "claim-status",
      type: "tests",
    });
    repository.reviewRelationship({
      id: support.id,
      projectId: "project-1",
      reviewState: "approved",
      reviewerId: "reviewer-1",
      confidence: 0.9,
    });

    expect(
      repository.updateClaimStatus({
        id: "claim-status",
        projectId: "project-1",
        reviewStatus: "Strong",
        reviewerId: "reviewer-1",
      }),
    ).toMatchObject({
      payload: expect.objectContaining({ reviewStatus: "Strong" }),
    });

    expect(() =>
      repository.updateClaimStatus({
        id: "claim-status",
        projectId: "project-1",
        reviewStatus: "Paper-ready",
        reviewerId: "reviewer-1",
      }),
    ).toThrow("reproducibility");

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

  it("allows paper-ready only with a reviewed completed reproducibility chain", () => {
    const repository = createResearchRepository(database);
    repository.createObject({
      id: "claim-paper-ready",
      projectId: "project-1",
      type: "claim",
      title: "Paper-ready claim",
      payload: {
        kind: "claim",
        status: "draft",
        reproducibilityStatus: "passed",
        openRiskCount: 0,
      },
    });
    repository.createObject({
      id: "experiment-paper-ready",
      projectId: "project-1",
      type: "experiment",
      title: "Reviewed experiment",
      payload: { kind: "experiment", hypothesis: "The claim holds." },
    });
    repository.createObject({
      id: "run-paper-ready",
      projectId: "project-1",
      type: "run",
      title: "Completed run",
      payload: { kind: "run", status: "completed" },
    });
    const tests = repository.createRelationship({
      id: "tests-paper-ready",
      projectId: "project-1",
      fromObjectId: "experiment-paper-ready",
      toObjectId: "claim-paper-ready",
      type: "tests",
    });
    const generated = repository.createRelationship({
      id: "generated-paper-ready",
      projectId: "project-1",
      fromObjectId: "run-paper-ready",
      toObjectId: "experiment-paper-ready",
      type: "generated-by",
    });
    for (const relationship of [tests, generated]) {
      repository.reviewRelationship({
        id: relationship.id,
        projectId: "project-1",
        reviewState: "approved",
        reviewerId: "reviewer-1",
        confidence: 0.9,
      });
    }

    expect(
      repository.updateClaimStatus({
        id: "claim-paper-ready",
        projectId: "project-1",
        reviewStatus: "Paper-ready",
        reviewerId: "reviewer-1",
      }),
    ).toMatchObject({
      payload: expect.objectContaining({ reviewStatus: "Paper-ready" }),
    });
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

  it("chains provenance events and detects tampering", () => {
    const repository = createResearchRepository(database);
    repository.appendProvenance({
      action: "repository.scan.completed",
      actorType: "system",
      projectId: "project-1",
    });
    repository.appendProvenance({
      action: "repository.change.observed",
      actorType: "system",
      metadata: { path: "src/index.ts" },
      projectId: "project-1",
    });

    expect(repository.verifyProvenance("project-1")).toMatchObject({
      eventCount: 2,
      headHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      valid: true,
    });
    expect(() =>
      database
        .prepare(
          "UPDATE provenance_events SET metadata = '{}' WHERE sequence = 1",
        )
        .run(),
    ).toThrow("Provenance events are immutable");

    database.exec("DROP TRIGGER provenance_events_immutable_update");
    database
      .prepare(
        "UPDATE provenance_events SET metadata = '{\"tampered\":true}' WHERE sequence = 1",
      )
      .run();
    expect(repository.verifyProvenance("project-1")).toMatchObject({
      valid: false,
      reason: expect.stringContaining("mismatch"),
    });
  });

  it.each([
    "reordered",
    "deleted",
  ] as const)("detects %s provenance events even if database triggers are bypassed", (mutation) => {
    const repository = createResearchRepository(database);
    for (const index of [1, 2, 3]) {
      repository.appendProvenance({
        action: "repository.change.observed",
        actorType: "system",
        metadata: { index },
        projectId: "project-1",
      });
    }
    database.exec(`
        DROP TRIGGER provenance_events_immutable_update;
        DROP TRIGGER provenance_events_immutable_delete;
      `);
    if (mutation === "reordered") {
      database
        .prepare(
          "UPDATE provenance_events SET sequence = 99 WHERE sequence = 1",
        )
        .run();
    } else {
      database
        .prepare("DELETE FROM provenance_events WHERE sequence = 2")
        .run();
    }

    expect(repository.verifyProvenance("project-1")).toMatchObject({
      valid: false,
    });
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
