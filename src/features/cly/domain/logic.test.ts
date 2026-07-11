import { describe, expect, it } from "vitest";
import { createFixtureRepository } from "../fixtures/repository";
import {
  calculateContextBudget,
  filterAndSortClaims,
  prioritizeNextSteps,
} from "./logic";

describe("Cly research UI logic", () => {
  it("calculates selected context budget by category", () => {
    const items = createFixtureRepository("active").contextItems;
    const result = calculateContextBudget(items, 128_000);

    expect(result.tokens).toBe(16_900);
    expect(result.byCategory.Claims).toBe(3_840);
    expect(result.ratio).toBeCloseTo(0.132, 2);
    expect(result.staleCount).toBe(0);
  });

  it("filters and sorts claims by confidence", () => {
    const claims = createFixtureRepository("active").claims;
    const result = filterAndSortClaims(claims, "coverage", "All", "confidence");

    expect(result.map((claim) => claim.id)).toEqual(["claim-02"]);
  });

  it("prioritizes high-impact urgent work ahead of low-impact deferred work", () => {
    const steps = createFixtureRepository("active").nextSteps;
    const result = prioritizeNextSteps(steps);

    expect(result[0].impact).toBe("High");
    expect(result[0].urgency).toBe("Now");
    expect(result.at(-1)?.impact).toBe("Low");
  });

  it("generates bounded performance fixtures at the acceptance sizes", () => {
    const data = createFixtureRepository("large");

    expect(data.sources).toHaveLength(1_000);
    expect(data.claims).toHaveLength(500);
    expect(data.runs).toHaveLength(1_000);
    expect(data.notebooks).toHaveLength(100);
    expect(data.graphNodes).toHaveLength(2_000);
    expect(data.graphEdges).toHaveLength(5_000);
    expect(data.artifacts).toHaveLength(500);
    expect(data.decisions).toHaveLength(500);
  });
});
