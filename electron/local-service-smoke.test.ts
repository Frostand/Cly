// @vitest-environment node
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";

// The local service is also used by Electron, but this smoke suite exercises
// its HTTP contract in a standalone Node process.
vi.mock("electron", () => ({
  app: { getPath: () => tmpdir() },
}));

import { API_SESSION_TOKEN_HEADER, startApiServer } from "./api/app.js";
import {
  closePersistedStateDatabase,
  getStateDatabase,
} from "./persisted-state.js";

const apiToken = "local-service-smoke-token";
const execFileAsync = promisify(execFile);
let temporaryDirectory: string | undefined;
let previousDatabasePath: string | undefined;

async function request(port: number, pathname: string, init: RequestInit = {}) {
  return fetch(`http://127.0.0.1:${port}${pathname}`, {
    ...init,
    headers: {
      [API_SESSION_TOKEN_HEADER]: apiToken,
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

afterEach(async () => {
  closePersistedStateDatabase();
  if (previousDatabasePath === undefined) {
    delete process.env.DREAM_DB_PATH;
  } else {
    process.env.DREAM_DB_PATH = previousDatabasePath;
  }
  previousDatabasePath = undefined;
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { force: true, recursive: true });
    temporaryDirectory = undefined;
  }
});

describe("local service smoke suite", () => {
  it("migrates local storage and preserves a research provenance flow across a restart", async () => {
    temporaryDirectory = await mkdtemp(path.join(tmpdir(), "cly-smoke-"));
    const databasePath = path.join(temporaryDirectory, "cly.db");
    const researchRootPath = path.join(temporaryDirectory, "research-project");
    await mkdir(researchRootPath);
    const researchRoot = await realpath(researchRootPath);
    await execFileAsync("git", ["init", "--quiet", researchRoot]);
    await writeFile(
      path.join(researchRoot, "analysis.py"),
      "print('initial')\n",
    );
    await execFileAsync("git", ["add", "analysis.py"], { cwd: researchRoot });
    await execFileAsync(
      "git",
      [
        "-c",
        "user.name=Cly Test",
        "-c",
        "user.email=cly@example.test",
        "commit",
        "--quiet",
        "-m",
        "initial",
      ],
      { cwd: researchRoot },
    );
    await writeFile(
      path.join(researchRoot, "analysis.py"),
      "print('changed')\n",
    );
    previousDatabasePath = process.env.DREAM_DB_PATH;
    process.env.DREAM_DB_PATH = databasePath;

    // Seed the pre-relational store; opening it must retain the workspace while
    // applying the bundled relational migrations.
    const legacyDatabase = new DatabaseSync(databasePath);
    legacyDatabase.exec(
      "CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
    legacyDatabase
      .prepare("INSERT INTO app_state (key, value) VALUES (?, ?)")
      .run(
        "ide-state",
        JSON.stringify({
          chats: [
            {
              id: "legacy-chat",
              projectId: "research-project",
              title: "Migrated research chat",
            },
          ],
          projects: [
            {
              id: "research-project",
              name: "research-project",
              path: researchRoot,
            },
          ],
        }),
      );
    legacyDatabase.close();

    const database = getStateDatabase();
    expect(
      database
        .prepare("SELECT id FROM projects WHERE id = ?")
        .get("research-project"),
    ).toEqual({ id: "research-project" });
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'provenance_events'",
        )
        .get(),
    ).toEqual({ name: "provenance_events" });

    const service = await startApiServer({ apiToken, port: 0 });
    const source = await request(
      service.port,
      "/api/projects/research-project/research/objects",
      {
        body: JSON.stringify({
          type: "source",
          title: "Local source",
          payload: { kind: "source", url: "https://example.test/source" },
        }),
        method: "POST",
      },
    );
    expect(source.status).toBe(201);
    const sourceObject = await source.json();

    const claim = await request(
      service.port,
      "/api/projects/research-project/research/objects",
      {
        body: JSON.stringify({
          type: "claim",
          title: "The local service persists evidence",
          payload: { kind: "claim", status: "supported" },
        }),
        method: "POST",
      },
    );
    expect(claim.status).toBe(201);
    const claimObject = await claim.json();

    const experiment = await request(
      service.port,
      "/api/projects/research-project/research/objects",
      {
        body: JSON.stringify({
          type: "experiment",
          title: "Persistence experiment",
          description: "Verify research writes survive a restart.",
          payload: { kind: "experiment", hypothesis: "Writes persist." },
        }),
        method: "POST",
      },
    );
    expect(experiment.status).toBe(201);
    const experimentObject = await experiment.json();

    const evidenceLink = await request(
      service.port,
      "/api/projects/research-project/research/evidence-links",
      {
        body: JSON.stringify({
          sourceId: sourceObject.id,
          claimId: claimObject.id,
          quote: "The persisted effect survives a full local-service restart.",
          locator: "Results, paragraph 2",
          type: "supports",
          origin: "inferred",
          actorId: "smoke-agent",
          confidence: 0.8,
        }),
        method: "POST",
      },
    );
    expect(evidenceLink.status).toBe(201);
    const evidenceLinkObject = await evidenceLink.json();
    expect(evidenceLinkObject).toMatchObject({
      duplicate: false,
      evidence: {
        origin: "inferred",
        reviewState: "unreviewed",
        payload: {
          verificationState: "unverified",
          quote: "The persisted effect survives a full local-service restart.",
        },
      },
      claimRelationship: { reviewState: "unreviewed", version: 1 },
    });

    const duplicateEvidenceLink = await request(
      service.port,
      "/api/projects/research-project/research/evidence-links",
      {
        body: JSON.stringify({
          sourceId: sourceObject.id,
          claimId: claimObject.id,
          quote: "The persisted effect survives a full local-service restart.",
          locator: "Results, paragraph 2",
          type: "supports",
          origin: "inferred",
        }),
        method: "POST",
      },
    );
    expect(duplicateEvidenceLink.status).toBe(201);
    await expect(duplicateEvidenceLink.json()).resolves.toMatchObject({
      duplicate: true,
      evidence: { id: evidenceLinkObject.evidence.id },
      claimRelationship: { id: evidenceLinkObject.claimRelationship.id },
    });

    const prematureClaimStatus = await request(
      service.port,
      `/api/projects/research-project/research/claims/${claimObject.id}`,
      {
        body: JSON.stringify({ reviewStatus: "Strong" }),
        method: "PATCH",
      },
    );
    expect(prematureClaimStatus.status).toBe(400);

    const relationshipReview = await request(
      service.port,
      `/api/projects/research-project/research/relationships/${evidenceLinkObject.claimRelationship.id}/review`,
      {
        body: JSON.stringify({
          reviewState: "approved",
          confidence: 0.8,
        }),
        method: "PATCH",
      },
    );
    expect(relationshipReview.status).toBe(200);

    const passageReview = await request(
      service.port,
      `/api/projects/research-project/research/evidence/${evidenceLinkObject.evidence.id}/verification`,
      {
        body: JSON.stringify({ verificationState: "verified" }),
        method: "PATCH",
      },
    );
    expect(passageReview.status).toBe(200);

    const claimStatus = await request(
      service.port,
      `/api/projects/research-project/research/claims/${claimObject.id}`,
      {
        body: JSON.stringify({ reviewStatus: "Strong" }),
        method: "PATCH",
      },
    );
    expect(claimStatus.status).toBe(200);

    const experimentRelationship = await request(
      service.port,
      "/api/projects/research-project/research/relationships",
      {
        body: JSON.stringify({
          fromObjectId: experimentObject.id,
          toObjectId: claimObject.id,
          type: "tests",
        }),
        method: "POST",
      },
    );
    expect(experimentRelationship.status).toBe(201);

    const observationApprovalRequest = await request(
      service.port,
      "/api/projects/research-project/repository-action-approvals",
      {
        body: JSON.stringify({ enabled: true, type: "set-observation" }),
        method: "POST",
      },
    );
    expect(observationApprovalRequest.status).toBe(201);
    const observationApproval = await observationApprovalRequest.json();
    const observationApprovalDecision = await request(
      service.port,
      `/api/projects/research-project/repository-action-approvals/${observationApproval.id}/approve`,
      {
        body: JSON.stringify({ actorId: "local-smoke-reviewer" }),
        method: "POST",
      },
    );
    expect(observationApprovalDecision.status).toBe(200);
    const observationSetting = await request(
      service.port,
      "/api/projects/research-project/repository-observation-setting",
      {
        body: JSON.stringify({
          approvalId: observationApproval.id,
          enabled: true,
        }),
        method: "PUT",
      },
    );
    expect(observationSetting.status).toBe(200);

    const observation = await request(
      service.port,
      "/api/projects/research-project/repository-observations",
      { method: "POST" },
    );
    expect(observation.status).toBe(201);
    await expect(observation.json()).resolves.toMatchObject({
      changes: [
        expect.objectContaining({ path: "analysis.py", worktreeStatus: "M" }),
      ],
      projectId: "research-project",
    });

    const provenance = await request(
      service.port,
      "/api/projects/research-project/provenance?limit=10",
    );
    expect(provenance.status).toBe(200);
    await expect(provenance.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "repository.change.observed",
          projectId: "research-project",
        }),
      ]),
    );
    await service.close();

    const restartedService = await startApiServer({ apiToken, port: 0 });
    const research = await request(
      restartedService.port,
      "/api/projects/research-project/research",
    );
    expect(research.status).toBe(200);
    await expect(research.json()).resolves.toMatchObject({
      objects: expect.arrayContaining([
        expect.objectContaining({ id: sourceObject.id }),
        expect.objectContaining({ id: claimObject.id }),
        expect.objectContaining({ id: experimentObject.id }),
        expect.objectContaining({
          id: evidenceLinkObject.evidence.id,
          version: 2,
          payload: expect.objectContaining({
            quote:
              "The persisted effect survives a full local-service restart.",
            verificationState: "verified",
          }),
        }),
      ]),
      relationships: expect.arrayContaining([
        expect.objectContaining({
          fromObjectId: evidenceLinkObject.evidence.id,
          toObjectId: claimObject.id,
          type: "supports",
          reviewState: "approved",
          version: 2,
        }),
        expect.objectContaining({
          fromObjectId: experimentObject.id,
          toObjectId: claimObject.id,
          type: "tests",
        }),
      ]),
    });
    const integrity = await request(
      restartedService.port,
      "/api/projects/research-project/provenance/integrity",
    );
    expect(integrity.status).toBe(200);
    await expect(integrity.json()).resolves.toMatchObject({
      eventCount: 14,
      valid: true,
    });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM provenance_events").get(),
    ).toEqual({ count: 14 });
    await restartedService.close();
  });
});
