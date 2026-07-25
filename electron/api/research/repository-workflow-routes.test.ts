// @vitest-environment node

import { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { createResearchRepository } from "./repository.js";
import { createRepositoryWorkflowCoordinator } from "./repository-workflow-coordinator.js";
import { registerResearchRoutes } from "./routes.js";

function createDatabase() {
  const database = new DatabaseSync(":memory:");
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
      reviewed_by TEXT, reviewed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
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
  return database;
}

const jsonRequest = (path: string, method: string, body: unknown) =>
  new Request(`http://localhost${path}`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method,
  });

describe("repository workflow routes", () => {
  it("coordinates approved opt-in, observation, and provenance links", async () => {
    const repository = createResearchRepository(createDatabase());
    repository.upsertProject({
      id: "project-1",
      name: "Project",
      path: "/tmp/project-1",
    });
    repository.createObject({
      id: "claim-1",
      projectId: "project-1",
      type: "claim",
      title: "Claim",
      payload: { kind: "claim", status: "draft" },
    });
    let nextId = 0;
    const coordinator = createRepositoryWorkflowCoordinator(repository, {
      createId: () => `approval-${++nextId}`,
    });
    const app = new Hono();
    registerResearchRoutes(app, {
      getRepository: () => repository,
      getRepositoryObserver: () => ({
        scan: async (projectId: string) => ({
          changes: [],
          observedAt: "2026-07-19T12:00:00.000Z",
          projectId,
          repository: { branch: "main", head: "a".repeat(40) },
        }),
      }),
      getRepositoryWorkflowCoordinator: () => coordinator,
    });

    const enableAction = { enabled: true, type: "set-observation" };
    let response = await app.fetch(
      jsonRequest(
        "/api/projects/project-1/repository-action-approvals",
        "POST",
        enableAction,
      ),
    );
    expect(response.status).toBe(201);
    const enableApproval = await response.json();

    response = await app.fetch(
      jsonRequest(
        `/api/projects/project-1/repository-action-approvals/${enableApproval.id}/approve`,
        "POST",
        { actorId: "reviewer-1" },
      ),
    );
    expect(response.status).toBe(200);
    response = await app.fetch(
      jsonRequest(
        "/api/projects/project-1/repository-observation-setting",
        "PUT",
        { approvalId: enableApproval.id, enabled: true },
      ),
    );
    expect(await response.json()).toMatchObject({
      enabled: true,
      projectId: "project-1",
    });

    response = await app.fetch(
      new Request(
        "http://localhost/api/projects/project-1/repository-observations",
        { method: "POST" },
      ),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ projectId: "project-1" });

    const linkAction = {
      reference: {
        kind: "pull-request",
        number: 44,
        url: "https://github.com/example/repo/pull/44",
      },
      researchObjectIds: ["claim-1"],
      type: "link-reference",
    };
    response = await app.fetch(
      jsonRequest(
        "/api/projects/project-1/repository-action-approvals",
        "POST",
        linkAction,
      ),
    );
    const linkApproval = await response.json();
    await app.fetch(
      jsonRequest(
        `/api/projects/project-1/repository-action-approvals/${linkApproval.id}/approve`,
        "POST",
        { actorId: "reviewer-2" },
      ),
    );
    response = await app.fetch(
      jsonRequest("/api/projects/project-1/repository-links", "POST", {
        approvalId: linkApproval.id,
        reference: linkAction.reference,
        researchObjectIds: linkAction.researchObjectIds,
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      events: [
        {
          action: "repository.pull-request.linked",
          objectId: "claim-1",
          projectId: "project-1",
          reference: linkAction.reference,
        },
      ],
      projectId: "project-1",
    });
  });
});
