// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";

import { createResearchRepository } from "./repository.js";
import { createRepositoryWorkflowCoordinator } from "./repository-workflow-coordinator.js";

let database: DatabaseSync;

function createDatabase() {
  const value = new DatabaseSync(":memory:");
  value.exec(`
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
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE research_relationships (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, from_object_id TEXT NOT NULL,
      to_object_id TEXT NOT NULL, type TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE provenance_events (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, object_id TEXT, action TEXT NOT NULL,
      actor_type TEXT NOT NULL, actor_id TEXT, metadata TEXT NOT NULL, created_at TEXT NOT NULL
    );
  `);
  return value;
}

beforeEach(() => {
  database = createDatabase();
});

describe("repository workflow coordinator", () => {
  it("requires an exact, project-bound, one-time approval to opt in", () => {
    const repository = createResearchRepository(database);
    repository.upsertProject({
      id: "project / one",
      name: "One",
      path: "/tmp/one",
    });
    repository.upsertProject({
      id: "project-two",
      name: "Two",
      path: "/tmp/two",
    });
    const coordinator = createRepositoryWorkflowCoordinator(repository, {
      createId: () => "approval-enable",
    });
    const request = coordinator.requestApproval("project / one", {
      enabled: true,
      type: "set-observation",
    });

    expect(request).toMatchObject({
      id: "approval-enable",
      projectId: "project / one",
      state: "pending",
    });
    expect(() =>
      coordinator.approveAction("project-two", request.id, "reviewer-1"),
    ).toThrow("not found for this project");
    expect(() =>
      coordinator.setObservationEnabled("project / one", {
        approvalId: request.id,
        enabled: true,
      }),
    ).toThrow("does not match this exact action");

    const approved = coordinator.approveAction(
      "project / one",
      request.id,
      "reviewer-1",
    );
    const result = coordinator.setObservationEnabled("project / one", {
      approvalId: approved.id,
      enabled: true,
    });

    expect(result).toMatchObject({ enabled: true, projectId: "project / one" });
    expect(repository.getProject("project / one").metadata).toMatchObject({
      repositoryObservation: {
        approvalId: "approval-enable",
        approvedBy: "reviewer-1",
        enabled: true,
      },
    });
    expect(
      repository.listProvenance("project / one").map((event) => event.action),
    ).toEqual(
      expect.arrayContaining([
        "repository.action.approved",
        "repository.observation.enabled",
      ]),
    );
    expect(() =>
      coordinator.setObservationEnabled("project / one", {
        approvalId: approved.id,
        enabled: true,
      }),
    ).toThrow("not found for this project");
  });

  it("creates reviewable object provenance and project-preserving deep links for commits and pull requests", () => {
    const repository = createResearchRepository(database);
    repository.upsertProject({
      id: "project / one",
      metadata: {
        repositoryObservation: { approvalId: "existing-opt-in", enabled: true },
      },
      name: "One",
      path: "/tmp/one",
    });
    repository.appendProvenance({
      action: "repository.observation.enabled",
      actorType: "human",
      metadata: { approvalId: "existing-opt-in" },
      projectId: "project / one",
    });
    const claim = repository.createObject({
      id: "claim-1",
      projectId: "project / one",
      type: "claim",
      title: "Claim",
      payload: { kind: "claim", status: "draft" },
    });
    const experiment = repository.createObject({
      id: "experiment-1",
      projectId: "project / one",
      type: "experiment",
      title: "Experiment",
      payload: { kind: "experiment" },
    });
    let nextId = 0;
    const coordinator = createRepositoryWorkflowCoordinator(repository, {
      createId: () => `approval-${++nextId}`,
    });
    const commitAction = {
      type: "link-reference" as const,
      reference: {
        kind: "commit" as const,
        sha: "a".repeat(40),
        title: "Calibrate analysis",
        url: `https://github.com/example/repo/commit/${"a".repeat(40)}`,
      },
      researchObjectIds: [claim.id, experiment.id],
    };
    const commitApproval = coordinator.requestApproval(
      "project / one",
      commitAction,
    );
    coordinator.approveAction("project / one", commitApproval.id, "reviewer-1");
    const commit = coordinator.linkReference("project / one", {
      ...commitAction,
      approvalId: commitApproval.id,
    });

    expect(commit.events).toHaveLength(2);
    expect(commit.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "repository.commit.linked",
          objectId: "claim-1",
          projectId: "project / one",
        }),
        expect.objectContaining({
          action: "repository.commit.linked",
          objectId: "experiment-1",
        }),
      ]),
    );
    for (const event of commit.events) {
      expect(event.deepLink).toContain(
        "/projects/project%20%2F%20one/provenance/",
      );
    }

    const pullRequestAction = {
      type: "link-reference" as const,
      reference: {
        kind: "pull-request" as const,
        number: 44,
        title: "Repository coordinator",
        url: "https://github.com/example/repo/pull/44",
      },
      researchObjectIds: [claim.id],
    };
    const pullRequestApproval = coordinator.requestApproval(
      "project / one",
      pullRequestAction,
    );
    coordinator.approveAction(
      "project / one",
      pullRequestApproval.id,
      "reviewer-2",
    );
    const pullRequest = coordinator.linkReference("project / one", {
      ...pullRequestAction,
      approvalId: pullRequestApproval.id,
    });

    expect(pullRequest.events[0]).toMatchObject({
      action: "repository.pull-request.linked",
      objectId: "claim-1",
      projectId: "project / one",
    });
    expect(
      repository
        .listProvenance("project / one")
        .filter((event) => event.action.endsWith(".linked")),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: "reviewer-1",
          actorType: "human",
          objectId: "claim-1",
          metadata: expect.objectContaining({
            approvalId: commitApproval.id,
            reference: commitAction.reference,
          }),
        }),
        expect.objectContaining({
          actorId: "reviewer-2",
          objectId: "claim-1",
          metadata: expect.objectContaining({
            approvalId: pullRequestApproval.id,
            reference: pullRequestAction.reference,
          }),
        }),
      ]),
    );
  });

  it("fails closed for disabled projects, cross-project objects, changed actions, and expired approvals", () => {
    const repository = createResearchRepository(database);
    repository.upsertProject({
      id: "project-1",
      metadata: {
        repositoryObservation: { approvalId: "forged", enabled: true },
      },
      name: "One",
      path: "/tmp/one",
    });
    repository.upsertProject({
      id: "project-2",
      name: "Two",
      path: "/tmp/two",
    });
    repository.createObject({
      id: "claim-2",
      projectId: "project-2",
      type: "claim",
      title: "Other claim",
      payload: { kind: "claim", status: "draft" },
    });
    let now = new Date("2026-07-19T12:00:00.000Z");
    let nextId = 0;
    const coordinator = createRepositoryWorkflowCoordinator(repository, {
      approvalTtlMs: 1_000,
      clock: () => now,
      createId: () => `approval-${++nextId}`,
    });
    const action = {
      type: "link-reference" as const,
      reference: {
        kind: "commit" as const,
        sha: "b".repeat(40),
        url: `https://github.com/example/repo/commit/${"b".repeat(40)}`,
      },
      researchObjectIds: ["claim-2"],
    };
    const disabledApproval = coordinator.requestApproval("project-1", action);
    coordinator.approveAction("project-1", disabledApproval.id, "reviewer");
    expect(() =>
      coordinator.linkReference("project-1", {
        ...action,
        approvalId: disabledApproval.id,
      }),
    ).toThrow("observation is not enabled");

    repository.upsertProject({
      id: "project-1",
      metadata: {
        repositoryObservation: { approvalId: "existing-opt-in", enabled: true },
      },
      name: "One",
      path: "/tmp/one",
    });
    repository.appendProvenance({
      action: "repository.observation.enabled",
      actorType: "human",
      metadata: { approvalId: "existing-opt-in" },
      projectId: "project-1",
    });
    const crossProjectApproval = coordinator.requestApproval(
      "project-1",
      action,
    );
    coordinator.approveAction("project-1", crossProjectApproval.id, "reviewer");
    expect(() =>
      coordinator.linkReference("project-1", {
        ...action,
        approvalId: crossProjectApproval.id,
      }),
    ).toThrow("does not belong to this project");

    const exactApproval = coordinator.requestApproval("project-1", action);
    coordinator.approveAction("project-1", exactApproval.id, "reviewer");
    expect(() =>
      coordinator.linkReference("project-1", {
        ...action,
        approvalId: exactApproval.id,
        reference: { ...action.reference, sha: "c".repeat(40) },
      }),
    ).toThrow("does not match this exact action");

    const expiringApproval = coordinator.requestApproval("project-1", action);
    coordinator.approveAction("project-1", expiringApproval.id, "reviewer");
    now = new Date("2026-07-19T12:00:02.000Z");
    expect(() =>
      coordinator.linkReference("project-1", {
        ...action,
        approvalId: expiringApproval.id,
      }),
    ).toThrow("approval has expired");
    expect(() =>
      coordinator.requestApproval("project-1", {
        ...action,
        reference: {
          ...action.reference,
          url: "https://user:secret@example.com/repo/commit/value",
        },
      }),
    ).toThrow("cannot contain credentials");
  });
});
