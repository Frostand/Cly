import { describe, expect, it } from "vitest";
import { parseDelimitedDataset, runLocalAnalysis } from "./local-analysis";

const classificationCsv = [
  "age,bmi,biomarker,outcome",
  ...Array.from({ length: 120 }, (_, index) => {
    const outcome = index % 2;
    return `${20 + (index % 50)},${21 + outcome * 8 + (index % 5)},${65 - outcome * 20},${outcome}`;
  }),
].join("\n");

describe("local tabular analysis", () => {
  it("parses quoted CSV values and profiles numeric columns", () => {
    const parsed = parseDelimitedDataset(
      'age,label,outcome\n42,"group, one",1\n51,"group two",0',
      "sample.csv",
    );

    expect(parsed.rowCount).toBe(2);
    expect(parsed.rows[0].label).toBe("group, one");
    expect(parsed.columns.find((column) => column.name === "age")?.kind).toBe(
      "numeric",
    );
    expect(parsed.columns.find((column) => column.name === "label")?.kind).toBe(
      "categorical",
    );
  });

  it("runs deterministic binary cross-validation against a baseline", () => {
    const dataset = parseDelimitedDataset(classificationCsv, "risk.csv");
    const input = {
      dataset,
      outcome: "outcome",
      predictors: ["age", "bmi", "biomarker"],
      task: "classification" as const,
      folds: 5,
      seed: 42,
    };
    const first = runLocalAnalysis(input);
    const second = runLocalAnalysis(input);

    expect(second).toEqual(first);
    expect(first.metrics.auc).toBeGreaterThan(0.95);
    expect(first.metrics.accuracy).toBeGreaterThan(
      first.metrics.baselineAccuracy,
    );
    expect(first.coefficients[0]?.feature).toMatch(/bmi|biomarker/);
    expect(first.warnings).toContain(
      "This is predictive association, not evidence of causation or clinical utility.",
    );
  });

  it("runs numeric regression and reports performance against a mean baseline", () => {
    const csv = [
      "x1,x2,y",
      ...Array.from(
        { length: 100 },
        (_, index) => `${index},${index % 7},${index * 2 + (index % 7) * 0.5}`,
      ),
    ].join("\n");
    const result = runLocalAnalysis({
      dataset: parseDelimitedDataset(csv, "regression.tsv"),
      outcome: "y",
      predictors: ["x1", "x2"],
      task: "regression",
      folds: 5,
      seed: 7,
    });

    expect(result.metrics.rmse).toBeLessThan(result.metrics.baselineRmse);
    expect(result.metrics.r2).toBeGreaterThan(0.9);
  });

  it("rejects non-numeric predictors in the local beta", () => {
    const dataset = parseDelimitedDataset(
      Array.from({ length: 30 }, (_, index) =>
        index === 0
          ? "category,value,outcome"
          : `${index % 2 ? "a" : "b"},${index},${index % 2}`,
      ).join("\n"),
    );

    expect(() =>
      runLocalAnalysis({
        dataset,
        outcome: "outcome",
        predictors: ["category"],
        task: "classification",
        folds: 3,
        seed: 1,
      }),
    ).toThrow(/numeric predictors/i);
  });
});
