import { describe, expect, it } from "vitest";
import {
  canTransmitExternally,
  createOnboardingDraft,
  generateStarterPlan,
  restartOnboarding,
  restoreOnboardingDraft,
  skipOnboardingStep,
  updateOnboardingDraft,
} from "./onboarding";

describe("onboarding", () => {
  it("defaults to guest, local-only use without transmission approval", () => {
    const draft = createOnboardingDraft();
    expect(draft.accountMode).toBe("guest");
    expect(draft.privacyMode).toBe("local-only");
    expect(canTransmitExternally(draft)).toBe(false);
  });

  it("requires visible privacy review and explicit transmission approval", () => {
    let draft = updateOnboardingDraft(createOnboardingDraft(), {
      privacyMode: "sync-eligible",
      externalTransmissionApproved: true,
    });
    expect(canTransmitExternally(draft)).toBe(false);
    draft = updateOnboardingDraft(draft, { privacyReviewed: true });
    expect(canTransmitExternally(draft)).toBe(true);
  });

  it("does not generate objectives, hypotheses, or tasks before review", () => {
    const draft = updateOnboardingDraft(createOnboardingDraft(), {
      topic: "Protein folding",
      primaryQuestion: "Which calibration method is most reliable?",
    });
    expect(() => generateStarterPlan(draft)).toThrow(/review/i);
    const accepted = updateOnboardingDraft(draft, { reviewAccepted: true });
    expect(generateStarterPlan(accepted, "2026-07-21T12:00:00.000Z")).toEqual(
      expect.objectContaining({
        objective: expect.stringContaining("Which calibration method"),
        tasks: expect.arrayContaining(["Add or scan the first source"]),
      }),
    );
  });

  it("supports skip and restart while preserving entered data", () => {
    let draft = updateOnboardingDraft(createOnboardingDraft(), {
      currentStep: "research",
      topic: "Durable topic",
    });
    draft = skipOnboardingStep(draft);
    expect(draft.currentStep).toBe("resources");
    expect(draft.skippedSteps).toContain("research");
    const restarted = restartOnboarding(draft);
    expect(restarted.currentStep).toBe("welcome");
    expect(restarted.topic).toBe("Durable topic");
  });

  it("restores a project-scoped draft and rejects invalid enum values", () => {
    const restored = restoreOnboardingDraft(
      {
        version: 1,
        projectId: "wrong-project",
        currentStep: "not-a-step",
        privacyMode: "public",
        topic: "Persisted topic",
      },
      "project-a",
    );
    expect(restored.projectId).toBe("project-a");
    expect(restored.currentStep).toBe("research");
    expect(restored.privacyMode).toBe("local-only");
    expect(restored.topic).toBe("Persisted topic");
  });
});
