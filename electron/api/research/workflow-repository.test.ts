// @vitest-environment node
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createResearchWorkflowRepository } from "./workflow-repository.js";

let database: DatabaseSync;
let sequence: number;
let appendProvenance: ReturnType<typeof vi.fn>;

beforeEach(() => {
  database = new DatabaseSync(":memory:");
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE projects (id TEXT PRIMARY KEY, path TEXT NOT NULL, normalized_path TEXT NOT NULL UNIQUE, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', sort_order INTEGER NOT NULL DEFAULT 0, metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    INSERT INTO projects (id, path, normalized_path, name, created_at, updated_at) VALUES ('project-a', '/a', '/a', 'A', '2026-07-24T00:00:00.000Z', '2026-07-24T00:00:00.000Z'), ('project-b', '/b', '/b', 'B', '2026-07-24T00:00:00.000Z', '2026-07-24T00:00:00.000Z');
  `);
  database.exec(
    readFileSync(
      new URL("../../drizzle/0023_research_workflows.sql", import.meta.url),
      "utf8",
    ).replaceAll("--> statement-breakpoint", ""),
  );
  sequence = 0;
  appendProvenance = vi.fn();
});

const repository = () =>
  createResearchWorkflowRepository(database, {
    appendProvenance,
    createId: () => `id-${++sequence}`,
    clock: () =>
      new Date(`2026-07-24T00:00:${String(sequence).padStart(2, "0")}.000Z`),
  });

describe("research workflow repository", () => {
  it("persists decision edits and supersession as immutable history", () => {
    const first = repository().createDecision("project-a", {
      title: "Choose cohort",
      decision: "Use wave one",
      reason: "Complete fields",
      actor: "researcher-a",
    });
    const edited = repository().updateDecision("project-a", first.id, {
      reason: "Complete fields and fasting weights",
      actor: "researcher-a",
    });
    const result = repository().supersedeDecision("project-a", first.id, {
      title: "Choose cohort",
      decision: "Use waves one and two",
      reason: "External validation",
      actor: "researcher-a",
    });

    expect(edited.reason).toContain("fasting weights");
    expect(result.decision).toMatchObject({
      status: "Superseded",
      supersededBy: result.replacement.id,
    });
    const restarted = repository();
    expect(restarted.listSnapshot("project-a").decisions).toHaveLength(2);
    expect(restarted.listSnapshot("project-b").decisions).toEqual([]);
    expect(
      restarted
        .listDecisionHistory("project-a", first.id)
        .map((item) => item.action),
    ).toEqual(["created", "updated", "superseded"]);
    expect(appendProvenance).toHaveBeenCalledTimes(3);
  });

  it("persists planner generation and every status transition", () => {
    const step = {
      id: "step-a",
      title: "Validate the primary claim",
      category: "Claim",
      rationale: "No external validation is linked.",
      impact: "High",
      effort: "Medium",
      urgency: "Now",
      evidenceIds: ["claim-a"],
      claimId: "claim-a",
      agentPreset: "Evidence reviewer",
      contextPack: "Claims and sources",
      status: "Recommended",
    };
    const saved = repository().replacePlannerSteps(
      "project-a",
      [step],
      "researcher-a",
    );
    const stepId = saved[0].id;
    repository().transitionPlannerStep(
      "project-a",
      stepId,
      "Accepted",
      "researcher-a",
    );
    repository().transitionPlannerStep(
      "project-a",
      stepId,
      "In progress",
      "researcher-a",
    );

    expect(repository().listSnapshot("project-a").nextSteps).toEqual([
      expect.objectContaining({
        id: "project-a:step-a",
        status: "In progress",
      }),
    ]);
    expect(
      database
        .prepare(
          "SELECT from_status, to_status FROM planner_step_transitions ORDER BY created_at, id",
        )
        .all(),
    ).toEqual([
      { from_status: "Recommended", to_status: "Accepted" },
      { from_status: "Accepted", to_status: "In progress" },
    ]);
  });

  it("persists audit findings and supports assign, defer, resolve, and reopen", () => {
    const audit = {
      id: "audit-a",
      score: 70,
      status: "Mostly reproducible",
      createdAt: "2026-07-24T01:00:00.000Z",
      findingIds: ["finding-a"],
      areas: [{ area: "Code", passed: false, findingCount: 1 }],
    };
    const finding = {
      id: "finding-a",
      category: "Code",
      title: "Commit missing",
      detail: "No commit is linked.",
      severity: "High",
      status: "Open",
      objectIds: ["run-a"],
      area: "Code",
      affectedClaimIds: ["claim-a"],
      recommendedFix: "Capture a commit.",
    };
    const saved = repository().saveAudit(
      "project-a",
      audit,
      [finding],
      "auditor-a",
    );
    const findingId = saved.findings[0].id;
    repository().transitionFinding("project-a", findingId, {
      status: "Assigned",
      assignee: "researcher-a",
      actor: "auditor-a",
    });
    repository().transitionFinding("project-a", findingId, {
      status: "Deferred",
      reason: "Awaiting rerun",
      actor: "researcher-a",
    });
    repository().transitionFinding("project-a", findingId, {
      status: "Resolved",
      actor: "researcher-a",
    });
    const reopened = repository().transitionFinding("project-a", findingId, {
      status: "Open",
      actor: "reviewer-a",
    });

    expect(reopened.status).toBe("Open");
    expect(repository().listSnapshot("project-a")).toMatchObject({
      audits: [
        {
          id: "project-a:audit-a",
          findingIds: ["project-a:audit-a:finding-a"],
        },
      ],
      findings: [{ id: "project-a:audit-a:finding-a", status: "Open" }],
    });
    expect(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM reproducibility_finding_transitions",
        )
        .get(),
    ).toEqual({ count: 4 });
  });
});
