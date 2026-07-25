// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  closePersistedStateDatabase,
  getStateDatabase,
} from "../../persisted-state.js";
import { createResearchRepository } from "./repository.js";
import { createReproducibilityAuditService } from "./reproducibility-audit.js";

const directories: string[] = [];

function setup(projectId: string) {
  const directory = mkdtempSync(path.join(tmpdir(), "cly-repro-audit-"));
  directories.push(directory);
  const databasePath = path.join(directory, "cly.db");
  const database = getStateDatabase(databasePath);
  let nextId = 0;
  let timestamp = Date.parse("2026-07-19T12:00:00.000Z");
  const repository = createResearchRepository(database, {
    createId: () => `generated-${++nextId}`,
    clock: () => new Date(timestamp++).toISOString(),
  });
  repository.upsertProject({
    id: projectId,
    name: `Fixture ${projectId}`,
    path: `/tmp/${projectId}`,
  });
  return {
    database,
    databasePath,
    repository,
    service: createReproducibilityAuditService(database, repository, {
      createId: () => `audit-${++nextId}`,
      clock: () => new Date(timestamp++).toISOString(),
    }),
  };
}

function createReproducibleFixture() {
  const fixture = setup("reproducible");
  const { repository } = fixture;
  repository.createObject({
    id: "dataset-1",
    projectId: "reproducible",
    type: "source",
    title: "Calibration benchmark",
    description: "Versioned benchmark licensed under CC-BY-4.0.",
    payload: {
      kind: "source",
      sourceType: "dataset",
      status: "resolved",
      citation: "Calibration Benchmark v2",
    },
  });
  repository.createExperiment({
    id: "experiment-1",
    projectId: "reproducible",
    title: "Calibration analysis",
    definition: {
      hypothesis: "Calibration improves reliability.",
      objective: "Measure expected calibration error.",
      configuration: {
        command: "python -m study.calibrate --seed 42",
        testCommand: "pytest tests/test_calibrate.py",
        testStatus: "passed",
        dependencies: { python: "3.13", numpy: "2.3.1" },
        lockfile: "uv.lock@sha256:abc123",
        os: "Linux 6.12",
        hardware: "x86_64 CPU, 16 GB RAM",
        seed: 42,
        preprocessing: "python scripts/preprocess.py",
        datasetLicense: "CC-BY-4.0",
        logs: "logs/run-1.jsonl",
      },
      datasets: [
        {
          id: "dataset-1",
          version: "v2",
          contentHash: "a".repeat(64),
        },
      ],
      declaredMetrics: ["ece"],
    },
  });
  repository.createExperimentRun({
    id: "run-1",
    projectId: "reproducible",
    experimentId: "experiment-1",
    title: "Seed 42",
    status: "running",
    commitSha: "abcdef1234567890",
    codeRefs: [{ path: "study/calibrate.py", contentHash: "b".repeat(64) }],
  });
  repository.logRunMetrics({
    projectId: "reproducible",
    runId: "run-1",
    metrics: [{ name: "ece", value: 0.03, unit: "ratio" }],
  });
  repository.updateExperimentRunStatus({
    projectId: "reproducible",
    runId: "run-1",
    status: "completed",
    finishedAt: "2026-07-19T12:30:00.000Z",
    exitCode: 0,
  });
  repository.registerRunArtifact({
    id: "artifact-1",
    projectId: "reproducible",
    runId: "run-1",
    title: "Calibration curve",
    kind: "figure",
    path: "outputs/calibration.png",
    mediaType: "image/png",
    contentHash: "c".repeat(64),
    generatorPath: "study/calibrate.py",
    generatorHash: "b".repeat(64),
  });
  repository.createObject({
    id: "claim-1",
    projectId: "reproducible",
    type: "claim",
    title: "Calibration improves reliability",
    payload: {
      kind: "claim",
      status: "supported",
      reproducibilityStatus: "passed",
      openRiskCount: 0,
    },
  });
  const support = repository.createRelationship({
    id: "artifact-supports-claim",
    projectId: "reproducible",
    fromObjectId: "artifact-1",
    toObjectId: "claim-1",
    type: "supports",
  });
  repository.reviewRelationship({
    id: support.id,
    projectId: "reproducible",
    reviewState: "approved",
    reviewerId: "reviewer-1",
    confidence: 1,
  });
  return fixture;
}

function createNonReproducibleFixture() {
  const fixture = setup("non-reproducible");
  const { repository } = fixture;
  repository.createExperiment({
    id: "experiment-broken",
    projectId: "non-reproducible",
    title: "Unspecified analysis",
    definition: {
      hypothesis: "An unspecified effect exists.",
      configuration: {},
      datasets: [{ id: "dataset-1", version: "unknown" }],
      declaredMetrics: ["effect"],
    },
  });
  repository.createExperimentRun({
    id: "run-failed",
    projectId: "non-reproducible",
    experimentId: "experiment-broken",
    title: "Failed run",
    status: "failed",
    commitSha: "abcdef1",
    codeRefs: [],
    finishedAt: "2026-07-19T12:05:00.000Z",
    exitCode: 2,
  });
  repository.createObject({
    id: "claim-broken",
    projectId: "non-reproducible",
    type: "claim",
    title: "Unsupported result",
    payload: {
      kind: "claim",
      status: "supported",
      reproducibilityStatus: "failed",
    },
  });
  repository.createRelationship({
    id: "experiment-tests-claim",
    projectId: "non-reproducible",
    fromObjectId: "experiment-broken",
    toObjectId: "claim-broken",
    type: "tests",
  });
  return fixture;
}

afterEach(() => {
  closePersistedStateDatabase();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("reproducibility audit service", () => {
  it("persists a publication-ready report for a reproducible project", () => {
    const { database, databasePath, service } = createReproducibleFixture();

    const report = service.run("reproducible");

    expect(report.audit).toMatchObject({
      status: "Publication-ready",
      score: 100,
      summary: {
        blockingIssueIds: [],
        warningIds: [],
        missingArtifactIds: [],
        affectedClaimIds: [],
        missingRequirementCount: 0,
        failedCheckCount: 0,
      },
    });
    expect(report.findings).toHaveLength(6);
    expect(
      report.findings.every((finding) => finding.severity === "Passed"),
    ).toBe(true);
    expect(service.latest("reproducible")).toEqual(report);
    expect(
      database
        .prepare("SELECT COUNT(*) AS count FROM reproducibility_audits")
        .get(),
    ).toEqual({ count: 1 });
    expect(() =>
      database.prepare("UPDATE reproducibility_audits SET score = 0").run(),
    ).toThrow(/immutable/i);

    closePersistedStateDatabase();
    const reopenedDatabase = getStateDatabase(databasePath);
    const reopenedRepository = createResearchRepository(reopenedDatabase);
    const reopenedService = createReproducibilityAuditService(
      reopenedDatabase,
      reopenedRepository,
    );
    expect(reopenedService.latest("reproducible")).toEqual(report);
  });

  it("separates missing requirements from failed checks and traces impacts", () => {
    const { service } = createNonReproducibleFixture();

    const report = service.run("non-reproducible");

    expect(report.audit.status).toBe("Not reproducible");
    expect(report.audit.summary).toMatchObject({
      blockingIssueIds: expect.any(Array),
      warningIds: expect.any(Array),
      missingArtifactIds: expect.arrayContaining(["dataset-source:dataset-1"]),
      affectedClaimIds: ["claim-broken"],
      missingRequirementCount: expect.any(Number),
      failedCheckCount: expect.any(Number),
    });
    expect(report.audit.summary.missingRequirementCount).toBeGreaterThan(0);
    expect(report.audit.summary.failedCheckCount).toBeGreaterThan(0);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          checkId: "execution-command",
          requirementStatus: "missing",
        }),
        expect.objectContaining({
          checkId: "run-result",
          requirementStatus: "failed",
          severity: "Blocking",
          affectedClaimIds: ["claim-broken"],
          evidenceRefs: expect.arrayContaining([
            expect.objectContaining({
              kind: "research-object",
              id: "run-failed",
            }),
            expect.objectContaining({
              kind: "provenance-event",
              objectId: "run-failed",
            }),
          ]),
        }),
      ]),
    );
    const missingOutput = report.findings.find(
      (finding) => finding.checkId === "run-output",
    );
    expect(missingOutput).toMatchObject({
      requirementStatus: "missing",
      missingArtifactIds: ["output:run-failed"],
      recommendedFix: expect.any(String),
    });
  });

  it("records finding dispositions separately from the immutable report", () => {
    const { service } = createNonReproducibleFixture();
    const report = service.run("non-reproducible");
    const finding = report.findings.find(
      (candidate) => candidate.severity !== "Passed",
    );
    if (!finding) throw new Error("Expected an actionable finding.");

    expect(
      service.resolve(
        "non-reproducible",
        report.audit.id,
        finding.id,
        "reviewer-1",
      ),
    ).toMatchObject({ id: finding.id, status: "Resolved" });
    expect(service.latest("non-reproducible")?.findings).toContainEqual(
      expect.objectContaining({ id: finding.id, status: "Resolved" }),
    );
  });
});
