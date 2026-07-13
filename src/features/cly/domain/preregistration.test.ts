import { describe, expect, it } from "vitest";
import {
  comparePreregistration,
  createPreregistrationTemplate,
} from "./preregistration";
import type { Experiment } from "./types";

const experiment: Experiment = {
  id: "experiment-1",
  name: "Calibration ablation",
  goal: "Test whether calibration reduces worst-group error",
  hypothesis: "Calibration reduces worst-group error.",
  type: "Ablation",
  status: "Planned",
  command: "Not configured",
  environment: "Not captured",
  claimIds: [],
  dataset: "Shift benchmark v2",
  limitations: [],
  nextStep: "Complete configuration",
  runIds: [],
  updatedAt: "2026-07-13T12:00:00.000Z",
};

describe("preregistration domain", () => {
  it("builds a complete concise template from the experiment", () => {
    expect(createPreregistrationTemplate(experiment)).toEqual({
      hypothesis: "Calibration reduces worst-group error.",
      primaryMetrics: ["Primary outcome"],
      exclusionRules:
        "Exclude only records that fail documented data-quality checks.",
      analysisPlan:
        "Estimate the primary effect with the intended design and report uncertainty.",
      successCriteria: "The primary metric meets the prespecified target.",
      dataset: "Shift benchmark v2",
      intendedDesign: "Ablation",
    });
  });

  it("compares fields in deterministic template order", () => {
    const snapshot = createPreregistrationTemplate(experiment);
    const current = {
      ...snapshot,
      hypothesis: "Calibration reduces average error.",
      dataset: "Shift benchmark v3",
      intendedDesign: "Benchmark",
    };

    expect(comparePreregistration(snapshot, current)).toEqual([
      {
        fieldPath: "/hypothesis",
        beforeValue: snapshot.hypothesis,
        afterValue: current.hypothesis,
      },
      {
        fieldPath: "/dataset",
        beforeValue: snapshot.dataset,
        afterValue: current.dataset,
      },
      {
        fieldPath: "/intendedDesign",
        beforeValue: snapshot.intendedDesign,
        afterValue: current.intendedDesign,
      },
    ]);
  });
});
