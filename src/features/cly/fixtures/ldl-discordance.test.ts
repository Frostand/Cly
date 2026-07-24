import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createFixtureRepository } from "./repository";

const summary = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      "demo-data/nhanes-2005-2006/derived/ldl_discordance_summary.json",
    ),
    "utf8",
  ),
) as {
  cohort: { complete_adult_records: number };
  model: { full_model_weighted_auc: number };
  signals: {
    highest_triglyceride_to_hdl_quintile_weighted_prevalence: number;
  };
};

describe("LDL-C discordance professor demo", () => {
  it("keeps the rendered fixture synchronized with the reproduced analysis", () => {
    const data = createFixtureRepository("active");
    const canonicalRun = data.runs.find((run) => run.id === "run-04");
    const cohortRun = data.runs.find((run) => run.id === "run-01");

    expect(data.projects[0].question).toBe(
      "Can basic health data predict when LDL cholesterol gives a misleading picture of heart-disease risk?",
    );
    expect(cohortRun?.metrics.records).toBe(
      summary.cohort.complete_adult_records,
    );
    expect(canonicalRun?.metrics.auc).toBe(
      summary.model.full_model_weighted_auc,
    );
    expect(
      data.claims.find((claim) => claim.id === "claim-02")?.text,
    ).toContain(
      `${(
        summary.signals
          .highest_triglyceride_to_hdl_quintile_weighted_prevalence * 100
      ).toFixed(1)}%`,
    );
  });

  it("provides a connected source-to-claim-to-follow-up evidence path", () => {
    const data = createFixtureRepository("active");
    const sourceIds = new Set(data.sources.map((source) => source.id));
    const experimentIds = new Set(
      data.experiments.map((experiment) => experiment.id),
    );
    const notebookIds = new Set(data.notebooks.map((notebook) => notebook.id));
    const artifactIds = new Set(data.artifacts.map((artifact) => artifact.id));

    for (const claim of data.claims) {
      expect(claim.supportingSourceIds.every((id) => sourceIds.has(id))).toBe(
        true,
      );
      expect(claim.experimentIds.every((id) => experimentIds.has(id))).toBe(
        true,
      );
      expect(claim.notebookIds.every((id) => notebookIds.has(id))).toBe(true);
      expect(claim.artifactIds.every((id) => artifactIds.has(id))).toBe(true);
    }

    expect(data.nextSteps.some((step) => step.experimentId === "exp-04")).toBe(
      true,
    );
    expect(data.graphEdges.some((edge) => edge.target === "exp-04")).toBe(true);
  });

  it("keeps the clinical limitation explicit across the workflow", () => {
    const data = createFixtureRepository("active");
    const limitation = data.claims.find((claim) => claim.id === "claim-04");
    const auditFinding = data.findings.find(
      (finding) => finding.id === "finding-01",
    );
    const decision = data.decisions.find((item) => item.id === "decision-04");

    expect(limitation?.text).toMatch(/not heart attacks/i);
    expect(auditFinding?.detail).toMatch(/must not be described/i);
    expect(decision?.decision).toMatch(/not heart attacks/i);
  });
});
