// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { createResearchRepository } from "./repository.js";
import {
  assertSafeSerializedCapsule,
  createReviewerCapsuleService,
} from "./reviewer-capsule.js";
import { registerResearchRoutes } from "./routes.js";

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
      reviewed_by TEXT, reviewed_at TEXT, version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE research_relationships (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, from_object_id TEXT NOT NULL,
      to_object_id TEXT NOT NULL, type TEXT NOT NULL,
      origin TEXT NOT NULL DEFAULT 'human', review_state TEXT NOT NULL DEFAULT 'unreviewed',
      confidence REAL, reviewed_by TEXT, reviewed_at TEXT,
      version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
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
    INSERT INTO projects
      (id, path, normalized_path, name, metadata, created_at, updated_at)
    VALUES
      ('project-a', '/Users/private/reviewer-project', '/Users/private/reviewer-project', 'Reviewer project', '{}', '2026-07-11', '2026-07-11'),
      ('project-b', '/Users/private/other-project', '/Users/private/other-project', 'Other project', '{}', '2026-07-11', '2026-07-11');
  `);
});

function seed() {
  const repository = createResearchRepository(database);
  repository.createObject({
    id: "claim-reproducible",
    projectId: "project-a",
    type: "claim",
    title: "Calibrated models improve recall",
    description: "Validated in the selected experiment.",
    payload: {
      kind: "claim",
      status: "supported",
      reviewStatus: "Strong",
      reproducibilityStatus: "passed",
    },
  });
  repository.createObject({
    id: "claim-documented",
    projectId: "project-a",
    type: "claim",
    title: "A documented claim",
    payload: {
      kind: "claim",
      status: "needs-evidence",
      reproducibilityStatus: "not-assessed",
    },
  });
  repository.createObject({
    id: "claim-unverifiable",
    projectId: "project-a",
    type: "claim",
    title: "An unverifiable claim",
    payload: { kind: "claim", status: "draft" },
  });
  repository.createObject({
    id: "source-private",
    projectId: "project-a",
    type: "source",
    title: "Evidence from /Users/reviewer/private.pdf",
    description:
      "Bearer private-token and api_key=super-secret came from .env and provider configuration.",
    payload: {
      kind: "source",
      citation: "Reviewer et al. (2026)",
      url: "https://private.example/evidence",
      status: "resolved",
    },
  });
  repository.createObject({
    id: "source-stale",
    projectId: "project-a",
    type: "source",
    title: "Unresolved supporting source",
    payload: { kind: "source", status: "placeholder" },
  });
  repository.createObject({
    id: "experiment-inferred",
    projectId: "project-a",
    type: "experiment",
    title: "Calibration sweep",
    origin: "inferred",
    payload: { kind: "experiment", hypothesis: "Calibration improves recall." },
  });
  repository.createObject({
    id: "artifact-reference",
    projectId: "project-a",
    type: "artifact",
    title: "Figure 1",
    payload: {
      kind: "artifact",
      mediaType: "image/png",
      path: "/Users/reviewer/project/outputs/figure-1.png",
      sha256: "a".repeat(64),
    },
  });
  repository.createObject({
    id: "other-project-claim",
    projectId: "project-b",
    type: "claim",
    title: "Never export this other project",
    payload: { kind: "claim", status: "draft" },
  });
  for (const [id, fromObjectId, toObjectId, type] of [
    ["supports", "source-private", "claim-reproducible", "supports"],
    ["stale-support", "source-stale", "claim-reproducible", "supports"],
    ["contradicts", "experiment-inferred", "claim-reproducible", "contradicts"],
    ["uses", "artifact-reference", "experiment-inferred", "uses"],
  ] as const) {
    repository.createRelationship({
      id,
      projectId: "project-a",
      fromObjectId,
      toObjectId,
      type,
    });
  }
  repository.reviewRelationship({
    id: "supports",
    projectId: "project-a",
    reviewState: "approved",
    confidence: 0.9,
    reviewerId: "reviewer",
  });
  repository.appendProvenance({
    action: "decision.recorded",
    actorType: "human",
    objectId: "claim-reproducible",
    projectId: "project-a",
    metadata: { token: "must-not-export", decision: "Keep the claim" },
  });
  return repository;
}

describe("reviewer capsule", () => {
  it("distinguishes included and omitted records with current and verification states", () => {
    const service = createReviewerCapsuleService(seed(), {
      now: () => "2026-07-13T12:00:00.000Z",
    });
    const capsule = service.preview("project-a", ["claim-reproducible"]);

    expect(capsule.manifest.included).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "claim-reproducible",
          currentness: "current",
          verification: "verified",
          reproducibility: "reproducible",
        }),
        expect.objectContaining({
          id: "experiment-inferred",
          verification: "inferred",
        }),
        expect.objectContaining({
          id: "source-stale",
          currentness: "stale",
        }),
      ]),
    );
    expect(capsule.manifest.omitted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "claim-documented",
          reason: "not-selected",
        }),
        expect.objectContaining({
          id: "claim-unverifiable",
          reason: "not-selected",
        }),
      ]),
    );
  });

  it("reports reproducible, documented-only, and unverifiable selected claims", () => {
    const service = createReviewerCapsuleService(seed(), {
      now: () => "2026-07-13T12:00:00.000Z",
    });
    const capsule = service.preview("project-a", [
      "claim-reproducible",
      "claim-documented",
      "claim-unverifiable",
    ]);

    expect(capsule.manifest.included).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "claim-reproducible",
          reproducibility: "reproducible",
        }),
        expect.objectContaining({
          id: "claim-documented",
          reproducibility: "documented-only",
        }),
        expect.objectContaining({
          id: "claim-unverifiable",
          reproducibility: "unverifiable",
        }),
      ]),
    );
  });

  it("uses only the selected project's canonical graph and removes private output", () => {
    const service = createReviewerCapsuleService(seed(), {
      now: () => "2026-07-13T12:00:00.000Z",
    });
    const capsule = service.preview("project-a", ["claim-reproducible"]);

    expect(capsule.html).not.toContain("Never export this other project");
    expect(capsule.html).not.toMatch(
      /\/Users\/|private-token|super-secret|\.env|provider configuration|https:\/\//i,
    );
    expect(capsule.html).toContain("Reviewer et al. (2026)");
    expect(capsule.html).toContain("a".repeat(64));
    expect(capsule.html).toContain("Keep the claim");
    expect(capsule.html).not.toContain("must-not-export");
    expect(capsule.html).toContain("Content-Security-Policy");
    expect(capsule.html).not.toContain("<script");
  });

  it("is byte-stable for a fixed clock and selection", () => {
    const service = createReviewerCapsuleService(seed(), {
      now: () => "2026-07-13T12:00:00.000Z",
    });
    const first = service.preview("project-a", ["claim-reproducible"]);
    const second = service.preview("project-a", ["claim-reproducible"]);

    expect(second.html).toBe(first.html);
    expect(second.sha256).toBe(first.sha256);
  });

  it("blocks unsafe serialized output after redaction", () => {
    expect(() =>
      assertSafeSerializedCapsule(
        '<!doctype html><img src="https://evil.example/image.png">',
      ),
    ).toThrow("Reviewer capsule safety scan failed");
  });

  it("validates project-scoped capsule routes and records an export hash", async () => {
    const repository = seed();
    const app = new Hono();
    registerResearchRoutes(app, {
      getRepository: () => repository,
      getObligationService: () => ({
        safeEvaluateOperation: () => ({ decision: "allow" }),
      }),
      getReviewerCapsuleService: () =>
        createReviewerCapsuleService(repository, {
          now: () => "2026-07-13T12:00:00.000Z",
        }),
    });

    const invalid = await app.request(
      "/api/projects/project-a/reviewer-capsule/preview",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          claimIds: ["claim-reproducible"],
          projectPath: "/tmp/nope",
        }),
      },
    );
    expect(invalid.status).toBe(400);

    const exported = await app.request(
      "/api/projects/project-a/reviewer-capsule/export",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ claimIds: ["claim-reproducible"] }),
      },
    );
    expect(exported.status).toBe(200);
    const body = await exported.json();
    expect(body).toMatchObject({
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(repository.listProvenance("project-a")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "reviewer-capsule.exported",
          metadata: expect.objectContaining({ sha256: body.sha256 }),
        }),
      ]),
    );
  });
});
