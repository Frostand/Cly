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

function setup() {
  const directory = mkdtempSync(path.join(tmpdir(), "cly-experiment-lineage-"));
  directories.push(directory);
  const database = getStateDatabase(path.join(directory, "cly.db"));
  let id = 0;
  let now = Date.parse("2026-07-14T12:00:00.000Z");
  const repository = createResearchRepository(database, {
    createId: () => `generated-${++id}`,
    clock: () => new Date(now++).toISOString(),
  });
  repository.upsertProject({
    id: "project-1",
    name: "Calibration study",
    path: "/tmp/calibration-study",
  });
  repository.upsertProject({
    id: "project-2",
    name: "Other study",
    path: "/tmp/other-study",
  });
  return { database, repository };
}

afterEach(() => {
  closePersistedStateDatabase();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("experiment and artifact provenance", () => {
  it("captures a reproducible chain and explains why an output became stale", () => {
    const { database, repository } = setup();
    const experiment = repository.createExperiment({
      id: "experiment-1",
      projectId: "project-1",
      title: "Calibration ablation",
      definition: {
        hypothesis: "Temperature scaling improves calibration.",
        objective: "Compare held-out calibration error.",
        configuration: { seed: 42, folds: 5 },
        datasets: [
          {
            id: "calibration-benchmark",
            version: "v2",
            contentHash: "a".repeat(64),
          },
        ],
        declaredMetrics: ["ece", "accuracy"],
      },
      actorId: "researcher-1",
    });
    expect(experiment.definition).toMatchObject({
      version: 1,
      definitionHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });

    const createdRun = repository.createExperimentRun({
      id: "run-1",
      projectId: "project-1",
      experimentId: experiment.id,
      title: "Seed 42",
      status: "running",
      commitSha: "abcdef1234567890",
      codeRefs: [{ path: "src/calibrate.py", contentHash: "b".repeat(64) }],
      actorType: "agent",
      actorId: "runner-1",
    });
    expect(createdRun).toMatchObject({
      experimentId: "experiment-1",
      definition: { version: 1 },
      configuration: { seed: 42, folds: 5 },
      datasets: [{ id: "calibration-benchmark", version: "v2" }],
    });

    repository.logRunMetrics({
      projectId: "project-1",
      runId: "run-1",
      actorType: "agent",
      actorId: "runner-1",
      metrics: [
        { name: "ece", value: 0.031, step: 0 },
        { name: "accuracy", value: 0.92, unit: "ratio" },
      ],
    });
    repository.updateExperimentRunStatus({
      projectId: "project-1",
      runId: "run-1",
      status: "completed",
      finishedAt: "2026-07-14T12:30:00.000Z",
      exitCode: 0,
      actorType: "agent",
      actorId: "runner-1",
    });
    const artifact = repository.registerRunArtifact({
      id: "artifact-1",
      projectId: "project-1",
      runId: "run-1",
      title: "Calibration curve",
      kind: "figure",
      path: "outputs/calibration.png",
      mediaType: "image/png",
      contentHash: "c".repeat(64),
      generatorPath: "src/calibrate.py",
      generatorHash: "b".repeat(64),
      actorType: "agent",
      actorId: "runner-1",
    });
    expect(artifact).toMatchObject({ state: "current", staleReasons: [] });

    const lineage = repository.getArtifactLineage("project-1", artifact.id);
    expect(lineage).toMatchObject({
      experiment: { id: "experiment-1" },
      definition: { version: 1 },
      run: {
        id: "run-1",
        commitSha: "abcdef1234567890",
        status: "completed",
        metrics: expect.arrayContaining([
          expect.objectContaining({ name: "ece", value: 0.031 }),
        ]),
      },
      artifact: { id: "artifact-1", kind: "figure" },
    });
    expect(repository.listExperimentLineages("project-1")).toHaveLength(1);

    repository.reviseExperimentDefinition({
      projectId: "project-1",
      experimentId: "experiment-1",
      definition: {
        hypothesis: "Temperature scaling improves calibration.",
        objective: "Compare held-out calibration error.",
        configuration: { seed: 42, folds: 10 },
        datasets: [
          {
            id: "calibration-benchmark",
            version: "v3",
            contentHash: "d".repeat(64),
          },
        ],
        declaredMetrics: ["ece", "accuracy"],
      },
      actorId: "researcher-1",
    });
    expect(
      repository.getArtifactLineage("project-1", artifact.id).artifact,
    ).toMatchObject({
      state: "stale",
      staleReasons: [
        expect.objectContaining({ kind: "experiment-definition" }),
      ],
    });
    const stale = repository.assessArtifactStaleness({
      projectId: "project-1",
      artifactId: "artifact-1",
      commitSha: "fedcba9876543210",
      configuration: { seed: 42, folds: 10 },
      datasets: [
        {
          id: "calibration-benchmark",
          version: "v3",
          contentHash: "d".repeat(64),
        },
      ],
      codeRefs: [{ path: "src/calibrate.py", contentHash: "e".repeat(64) }],
      actorId: "researcher-1",
    });
    expect(stale.state).toBe("stale");
    expect(
      stale.staleReasons.map((reason: { kind: string }) => reason.kind),
    ).toEqual([
      "experiment-definition",
      "git-commit",
      "configuration",
      "datasets",
      "generating-code",
    ]);
    expect(
      repository
        .listProvenance("project-1")
        .map((event: { action: string }) => event.action),
    ).toEqual(
      expect.arrayContaining([
        "experiment.definition.created",
        "run.metric.logged",
        "artifact.registered",
        "artifact.marked-stale",
      ]),
    );
    expect(() =>
      database
        .prepare("UPDATE run_metrics SET value = 1 WHERE name = 'ece'")
        .run(),
    ).toThrow("Run metrics are immutable");
  });

  it("enforces project boundaries and legal run transitions", () => {
    const { repository } = setup();
    repository.createExperiment({
      id: "experiment-1",
      projectId: "project-1",
      title: "Calibration ablation",
      definition: { hypothesis: "Calibration improves." },
    });
    repository.createExperimentRun({
      id: "run-1",
      projectId: "project-1",
      experimentId: "experiment-1",
      title: "Planned run",
      status: "planned",
      commitSha: "abcdef1",
    });

    expect(() =>
      repository.listExperimentLineage("project-2", "experiment-1"),
    ).toThrow("Experiment does not belong to the project.");
    expect(() =>
      repository.updateExperimentRunStatus({
        projectId: "project-1",
        runId: "run-1",
        status: "completed",
        finishedAt: "2026-07-14T12:30:00.000Z",
      }),
    ).toThrow("Run cannot transition from planned to completed.");
  });
});
