import { describe, expect, it } from "vitest";
import {
  deriveResearchLoop,
  hasSubstantiveResearchText,
} from "./research-loop";

const emptyInput = {
  hasQuestion: false,
  hasHypothesis: false,
  reviewedSourceCount: 0,
  preregistrationCount: 0,
  completedRunCount: 0,
  reproducibleRunCount: 0,
  evidenceLinkCount: 0,
  claimCount: 0,
  supportedClaimCount: 0,
  auditScore: null,
  openIntegrityFindingCount: 0,
};

describe("research loop", () => {
  it("starts at the question and blocks later empty stages", () => {
    const result = deriveResearchLoop(emptyInput);

    expect(result.currentStage?.id).toBe("question");
    expect(result.stages.map((stage) => stage.state)).toEqual([
      "current",
      "blocked",
      "blocked",
      "blocked",
      "blocked",
      "blocked",
      "blocked",
    ]);
  });

  it("flags downstream records created before the study contract", () => {
    const result = deriveResearchLoop({
      ...emptyInput,
      reviewedSourceCount: 3,
      completedRunCount: 1,
      claimCount: 1,
      supportedClaimCount: 1,
    });

    expect(result.currentStage?.id).toBe("question");
    expect(result.stages.find((stage) => stage.id === "sources")?.state).toBe(
      "out-of-order",
    );
    expect(
      result.stages.find((stage) => stage.id === "experiment")?.state,
    ).toBe("out-of-order");
    expect(result.outOfOrderCount).toBe(3);
  });

  it("completes only when every scientific release gate passes", () => {
    const result = deriveResearchLoop({
      ...emptyInput,
      hasQuestion: true,
      hasHypothesis: true,
      reviewedSourceCount: 2,
      preregistrationCount: 1,
      completedRunCount: 2,
      reproducibleRunCount: 2,
      evidenceLinkCount: 5,
      claimCount: 2,
      supportedClaimCount: 1,
      auditScore: 92,
    });

    expect(result.currentStage).toBeNull();
    expect(result.completeCount).toBe(7);
    expect(result.stages.every((stage) => stage.state === "complete")).toBe(
      true,
    );
  });

  it("rejects placeholder project copy as substantive research text", () => {
    expect(
      hasSubstantiveResearchText(
        "Define the research question for this project.",
      ),
    ).toBe(false);
    expect(
      hasSubstantiveResearchText(
        "Can calibrated ensembles preserve decisions under distribution shift?",
      ),
    ).toBe(true);
  });
});
