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

const directories: string[] = [];
const oldCodeHash = "a".repeat(64);
const newCodeHash = "b".repeat(64);
const datasetHash = "c".repeat(64);
const figureHash = "d".repeat(64);
const editedFigureHash = "e".repeat(64);
const tableHash = "f".repeat(64);

function setup() {
  const directory = mkdtempSync(path.join(tmpdir(), "cly-staleness-"));
  directories.push(directory);
  const databasePath = path.join(directory, "cly.db");
  const database = getStateDatabase(databasePath);
  let id = 0;
  let now = Date.parse("2026-07-19T12:00:00.000Z");
  const options = {
    createId: () => `generated-${++id}`,
    clock: () => new Date(now++).toISOString(),
  };
  const repository = createResearchRepository(database, options);
  repository.upsertProject({
    id: "project-1",
    name: "Deterministic calibration study",
    path: directory,
  });
  return { database, databasePath, options, repository };
}

function createCompleteLineage(
  repository: ReturnType<typeof createResearchRepository>,
) {
  repository.createExperiment({
    id: "experiment-1",
    projectId: "project-1",
    title: "Calibration experiment",
    definition: {
      hypothesis: "Normalization improves calibration.",
      configuration: { seed: 42, folds: 5 },
      datasets: [{ id: "benchmark", version: "v1", contentHash: datasetHash }],
    },
  });
  repository.createExperimentRun({
    id: "run-1",
    projectId: "project-1",
    experimentId: "experiment-1",
    title: "Seed 42 run",
    status: "completed",
    commitSha: "abcdef1234567890",
    finishedAt: "2026-07-19T12:30:00.000Z",
    exitCode: 0,
    codeRefs: [
      {
        path: "src/calibrate.py",
        symbol: "normalizeData",
        kind: "function",
        contentHash: oldCodeHash,
      },
    ],
    environment: {
      runtime: "python",
      runtimeVersion: "3.13.5",
      platform: "linux",
      architecture: "x64",
    },
    dependencies: [
      { name: "numpy", version: "2.3.1", integrity: "sha256:numpy" },
    ],
  });
  repository.registerRunArtifact({
    id: "figure-1",
    projectId: "project-1",
    runId: "run-1",
    title: "Calibration curve",
    kind: "figure",
    path: "outputs/calibration.png",
    mediaType: "image/png",
    contentHash: figureHash,
    generatorPath: "src/calibrate.py",
    generatorHash: oldCodeHash,
  });
  repository.registerRunArtifact({
    id: "table-1",
    projectId: "project-1",
    runId: "run-1",
    title: "Calibration metrics",
    kind: "table",
    path: "outputs/metrics.csv",
    mediaType: "text/csv",
    contentHash: tableHash,
    generatorPath: "src/calibrate.py",
    generatorHash: oldCodeHash,
  });
  repository.createObject({
    id: "claim-1",
    projectId: "project-1",
    type: "claim",
    title: "Normalization improves calibration",
    payload: { kind: "claim", status: "supported", reviewStatus: "Strong" },
  });
  repository.createRelationship({
    id: "figure-supports-claim",
    projectId: "project-1",
    fromObjectId: "figure-1",
    toObjectId: "claim-1",
    type: "supports",
  });
  repository.createRelationship({
    id: "table-supports-claim",
    projectId: "project-1",
    fromObjectId: "claim-1",
    toObjectId: "table-1",
    type: "uses",
  });
}

const completeCurrentState = {
  configuration: { seed: 42, folds: 5 },
  datasets: [{ id: "benchmark", version: "v1", contentHash: datasetHash }],
  environment: {
    runtime: "python",
    runtimeVersion: "3.13.5",
    platform: "linux",
    architecture: "x64",
  },
  dependencies: [
    { name: "numpy", version: "2.3.1", integrity: "sha256:numpy" },
  ],
};

afterEach(() => {
  closePersistedStateDatabase();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("research staleness detection", () => {
  it("propagates a changed function through runs, figures, tables, and claims", () => {
    const { databasePath, options, repository } = setup();
    createCompleteLineage(repository);

    const report = repository.assessProjectStaleness({
      projectId: "project-1",
      code: [
        {
          path: "src/calibrate.py",
          symbol: "normalizeData",
          kind: "function",
          contentHash: newCodeHash,
        },
      ],
      artifacts: [
        { path: "outputs/calibration.png", contentHash: editedFigureHash },
        { path: "outputs/metrics.csv", contentHash: tableHash },
      ],
      ...completeCurrentState,
    });

    expect(
      report.impacted.map((item: { object: { id: string }; state: string }) => [
        item.object.id,
        item.state,
      ]),
    ).toEqual([
      ["figure-1", "stale"],
      ["table-1", "stale"],
      ["run-1", "stale"],
      ["claim-1", "needs-review"],
    ]);
    const claim = report.impacted.find(
      (item: { object: { id: string } }) => item.object.id === "claim-1",
    );
    expect(claim).toMatchObject({
      explanation: expect.stringContaining("Function normalizeData"),
      dependencyPath: [
        expect.objectContaining({ type: "code" }),
        expect.objectContaining({ id: "run-1" }),
        expect.objectContaining({ id: "figure-1" }),
        expect.objectContaining({ id: "claim-1" }),
      ],
      recommendations: [expect.stringContaining("Review the claim")],
    });
    const figure = report.impacted.find(
      (item: { object: { id: string } }) => item.object.id === "figure-1",
    );
    expect(
      figure.reasons.map((reason: { kind: string }) => reason.kind),
    ).toEqual(expect.arrayContaining(["manual-artifact-edit", "upstream-run"]));
    expect(
      repository
        .listProject("project-1")
        .objects.find((object: { id: string }) => object.id === "claim-1")
        ?.payload,
    ).toMatchObject({ status: "needs-evidence", reviewStatus: "Needs review" });

    const transitionCount = repository.listStalenessTransitions(
      "project-1",
      "claim-1",
    ).length;
    const partialReport = repository.assessProjectStaleness({
      projectId: "project-1",
      datasets: completeCurrentState.datasets,
    });
    expect(partialReport.impacted).toHaveLength(4);
    expect(
      partialReport.impacted.find(
        (item: { object: { id: string } }) => item.object.id === "claim-1",
      )?.explanation,
    ).toContain("Function normalizeData");
    expect(
      repository.listStalenessTransitions("project-1", "claim-1"),
    ).toHaveLength(transitionCount);

    repository.assessProjectStaleness({
      projectId: "project-1",
      code: [
        {
          path: "src/calibrate.py",
          symbol: "normalizeData",
          kind: "function",
          contentHash: newCodeHash,
        },
      ],
      artifacts: [
        { path: "outputs/calibration.png", contentHash: editedFigureHash },
        { path: "outputs/metrics.csv", contentHash: tableHash },
      ],
      ...completeCurrentState,
    });
    expect(
      repository.listStalenessTransitions("project-1", "claim-1"),
    ).toHaveLength(transitionCount);

    closePersistedStateDatabase();
    const reopened = createResearchRepository(
      getStateDatabase(databasePath),
      options,
    );
    expect(reopened.listStaleness("project-1")).toHaveLength(4);

    const resolved = reopened.assessProjectStaleness({
      projectId: "project-1",
      code: [
        {
          path: "src/calibrate.py",
          symbol: "normalizeData",
          kind: "function",
          contentHash: oldCodeHash,
        },
      ],
      artifacts: [
        { path: "outputs/calibration.png", contentHash: figureHash },
        { path: "outputs/metrics.csv", contentHash: tableHash },
      ],
      ...completeCurrentState,
    });
    expect(resolved.impacted).toEqual([]);
    expect(
      reopened
        .listStalenessTransitions("project-1", "claim-1")
        .map((transition: { fromState: string; toState: string }) => [
          transition.fromState,
          transition.toState,
        ]),
    ).toEqual([
      ["current", "needs-review"],
      ["needs-review", "current"],
    ]);
  });

  it("flags incomplete run and artifact provenance for review", () => {
    const { repository } = setup();
    repository.createExperiment({
      id: "experiment-1",
      projectId: "project-1",
      title: "Legacy experiment",
      definition: { hypothesis: "Legacy result is reproducible." },
    });
    repository.createExperimentRun({
      id: "run-1",
      projectId: "project-1",
      experimentId: "experiment-1",
      title: "Legacy run",
      commitSha: "abcdef1",
    });
    repository.registerRunArtifact({
      id: "artifact-1",
      projectId: "project-1",
      runId: "run-1",
      title: "Legacy figure",
      kind: "figure",
      path: "legacy.png",
      mediaType: "image/png",
      contentHash: figureHash,
    });

    const report = repository.assessProjectStaleness({
      projectId: "project-1",
    });
    expect(report.impacted).toEqual([
      expect.objectContaining({
        object: expect.objectContaining({ id: "artifact-1" }),
        state: "needs-review",
        explanation: expect.stringContaining("generator"),
      }),
      expect.objectContaining({
        object: expect.objectContaining({ id: "run-1" }),
        state: "needs-review",
        explanation: expect.stringContaining("code references"),
      }),
    ]);
  });

  it("compares Git, datasets, configuration, environment, and dependencies", () => {
    const { repository } = setup();
    createCompleteLineage(repository);
    repository.reviseExperimentDefinition({
      projectId: "project-1",
      experimentId: "experiment-1",
      definition: {
        hypothesis: "Normalization improves calibration.",
        configuration: { seed: 42, folds: 10 },
        datasets: [
          { id: "benchmark", version: "v2", contentHash: newCodeHash },
        ],
      },
    });

    const report = repository.assessProjectStaleness({
      projectId: "project-1",
      commitSha: "fedcba9876543210",
      code: [
        {
          path: "src/calibrate.py",
          symbol: "normalizeData",
          kind: "function",
          contentHash: oldCodeHash,
        },
      ],
      datasets: [{ id: "benchmark", version: "v2", contentHash: newCodeHash }],
      configuration: { seed: 42, folds: 10 },
      environment: {
        runtime: "python",
        runtimeVersion: "3.14.0",
        platform: "linux",
        architecture: "x64",
      },
      dependencies: [
        { name: "numpy", version: "3.0.0", integrity: "sha256:numpy-3" },
      ],
      artifacts: [
        { path: "outputs/calibration.png", contentHash: figureHash },
        { path: "outputs/metrics.csv", contentHash: tableHash },
      ],
    });

    const run = report.impacted.find(
      (item: { object: { id: string } }) => item.object.id === "run-1",
    );
    expect(run?.state).toBe("stale");
    expect(run?.reasons.map((reason: { kind: string }) => reason.kind)).toEqual(
      expect.arrayContaining([
        "git-commit",
        "experiment-definition",
        "dataset",
        "configuration",
        "environment",
        "dependencies",
      ]),
    );
    expect(
      report.impacted.find(
        (item: { object: { id: string } }) => item.object.id === "claim-1",
      ),
    ).toMatchObject({ state: "needs-review" });
  });
});
