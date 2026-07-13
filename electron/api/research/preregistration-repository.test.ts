// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  closePersistedStateDatabase,
  getStateDatabase,
} from "../../persisted-state.js";
import { createResearchRepository } from "./repository.js";

const directories: string[] = [];
let now = "2026-07-13T12:00:00.000Z";
let nextId = 0;

const content = {
  hypothesis: "Calibration reduces worst-group error.",
  primaryMetrics: ["Worst-group error", "ECE"],
  exclusionRules: "Exclude corrupt records only.",
  analysisPlan: "Compare calibrated and uncalibrated estimates with intervals.",
  successCriteria: "Worst-group error improves by at least 2 points.",
  dataset: "Shift benchmark v2",
  intendedDesign: "Paired ablation",
};

function databasePath() {
  const directory = mkdtempSync(path.join(tmpdir(), "cly-prereg-"));
  directories.push(directory);
  return path.join(directory, "cly.db");
}

beforeEach(() => {
  now = "2026-07-13T12:00:00.000Z";
  nextId = 0;
});

afterEach(() => {
  closePersistedStateDatabase();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function setup() {
  const database = getStateDatabase(databasePath());
  const repository = createResearchRepository(database, {
    clock: () => now,
    createId: () => `generated-${++nextId}`,
  });
  repository.upsertProject({
    id: "project-1",
    name: "Project 1",
    path: "/tmp/project-1",
  });
  repository.upsertProject({
    id: "project-2",
    name: "Project 2",
    path: "/tmp/project-2",
  });
  repository.createObject({
    id: "experiment-1",
    projectId: "project-1",
    type: "experiment",
    title: "Calibration ablation",
    payload: { kind: "experiment", hypothesis: content.hypothesis },
  });
  repository.createObject({
    id: "experiment-2",
    projectId: "project-2",
    type: "experiment",
    title: "Other project experiment",
    payload: { kind: "experiment", hypothesis: "Other hypothesis" },
  });
  return { database, repository };
}

describe("preregistration repository", () => {
  it("creates deterministic immutable versions with project-scoped provenance", () => {
    const { database, repository } = setup();
    const first = repository.createPreregistration({
      projectId: "project-1",
      experimentId: "experiment-1",
      content,
      actorId: "researcher-1",
    });
    const reordered = {
      intendedDesign: content.intendedDesign,
      dataset: content.dataset,
      successCriteria: content.successCriteria,
      analysisPlan: content.analysisPlan,
      exclusionRules: content.exclusionRules,
      primaryMetrics: content.primaryMetrics,
      hypothesis: content.hypothesis,
    };
    expect(first).toMatchObject({
      version: 1,
      amendsSnapshotId: null,
      actorId: "researcher-1",
      content,
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      finalEvaluation: null,
      deviations: [],
    });
    expect(() =>
      repository.createPreregistration({
        projectId: "project-1",
        experimentId: "experiment-1",
        amendsSnapshotId: first.id,
        content: reordered,
      }),
    ).toThrow("An amendment must change preregistration content.");

    const second = repository.createPreregistration({
      projectId: "project-1",
      experimentId: "experiment-1",
      amendsSnapshotId: first.id,
      content: {
        ...content,
        analysisPlan: "Use a stratified paired analysis.",
      },
    });
    expect(second).toMatchObject({ version: 2, amendsSnapshotId: first.id });
    expect(
      repository.listPreregistrations("project-1", "experiment-1"),
    ).toHaveLength(2);
    expect(() =>
      database
        .prepare(
          "UPDATE preregistration_snapshots SET content_json = '{}' WHERE id = ?",
        )
        .run(first.id),
    ).toThrow("Preregistration snapshots are immutable");
    expect(() =>
      repository.createPreregistration({
        projectId: "project-1",
        experimentId: "experiment-2",
        content,
      }),
    ).toThrow("Experiment does not belong to the project.");
    expect(
      database
        .prepare(
          "SELECT action, object_id, project_id FROM provenance_events WHERE id = ?",
        )
        .get(first.provenanceEventId),
    ).toEqual({
      action: "preregistration.snapshot.created",
      object_id: "experiment-1",
      project_id: "project-1",
    });
  });

  it("classifies deviations by final evaluation and records append-only acknowledgement", () => {
    const { database, repository } = setup();
    const snapshot = repository.createPreregistration({
      projectId: "project-1",
      experimentId: "experiment-1",
      content,
    });
    const beforeEvaluation = repository.declareAnalysisDeviation({
      projectId: "project-1",
      snapshotId: snapshot.id,
      fieldPath: "/analysisPlan",
      afterValue: "Use a stratified paired analysis.",
      rationale: "The strata were prespecified but omitted from the template.",
      actorId: "researcher-1",
    });
    expect(beforeEvaluation).toMatchObject({
      beforeValue: content.analysisPlan,
      afterValue: "Use a stratified paired analysis.",
      declarationTiming: "pre-evaluation",
      acknowledgement: null,
    });

    now = "2026-07-13T13:00:00.000Z";
    const evaluated = repository.markPreregistrationEvaluated({
      projectId: "project-1",
      snapshotId: snapshot.id,
      actorId: "researcher-1",
    });
    expect(evaluated.finalEvaluation).toMatchObject({
      actorId: "researcher-1",
      evaluatedAt: now,
    });
    expect(() =>
      repository.markPreregistrationEvaluated({
        projectId: "project-1",
        snapshotId: snapshot.id,
      }),
    ).toThrow("Final evaluation is already recorded.");

    now = "2026-07-13T14:00:00.000Z";
    const retrospective = repository.declareAnalysisDeviation({
      projectId: "project-1",
      snapshotId: snapshot.id,
      fieldPath: "/primaryMetrics",
      afterValue: ["Worst-group error", "Brier score"],
      rationale: "ECE was unstable for empty bins.",
    });
    expect(retrospective.declarationTiming).toBe("retrospective");
    const acknowledged = repository.acknowledgeAnalysisDeviation({
      projectId: "project-1",
      deviationId: retrospective.id,
      actorId: "reviewer-1",
    });
    expect(acknowledged.acknowledgement).toMatchObject({
      state: "acknowledged",
      actorId: "reviewer-1",
      acknowledgedAt: now,
    });
    expect(() =>
      database
        .prepare(
          "UPDATE analysis_deviations SET rationale = 'changed' WHERE id = ?",
        )
        .run(retrospective.id),
    ).toThrow("Analysis deviations are immutable");
  });

  it("compares later experiment state in deterministic field order", () => {
    const { repository } = setup();
    const snapshot = repository.createPreregistration({
      projectId: "project-1",
      experimentId: "experiment-1",
      content,
    });
    expect(
      repository.comparePreregistration("project-1", snapshot.id, {
        ...content,
        hypothesis: "Calibration improves average error.",
        dataset: "Shift benchmark v3",
      }),
    ).toEqual([
      {
        fieldPath: "/hypothesis",
        beforeValue: content.hypothesis,
        afterValue: "Calibration improves average error.",
      },
      {
        fieldPath: "/dataset",
        beforeValue: content.dataset,
        afterValue: "Shift benchmark v3",
      },
    ]);
  });
});
