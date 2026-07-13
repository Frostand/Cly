import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPreregistrationTemplate } from "../domain/preregistration";
import type {
  AnalysisDeviation,
  PreregistrationSnapshot,
} from "../domain/types";
import { createFixtureRepository } from "../fixtures/repository";
import { useClyStore } from "../store/cly-store";
import { PreregistrationWorkspace } from "./preregistration-workspace";

const originalCreate = useClyStore.getState().createPreregistration;
const originalEvaluate = useClyStore.getState().markPreregistrationEvaluated;
const originalDeclare = useClyStore.getState().declareAnalysisDeviation;
const originalAcknowledge = useClyStore.getState().acknowledgeAnalysisDeviation;

const content = {
  hypothesis: "Calibration reduces worst-group error.",
  primaryMetrics: ["Worst-group error"],
  exclusionRules: "Exclude corrupt records only.",
  analysisPlan: "Use paired estimates with uncertainty intervals.",
  successCriteria: "Worst-group error improves by two points.",
  dataset: "Shift benchmark v2",
  intendedDesign: "Paired ablation",
};

function snapshot(
  experimentId: string,
  deviations: AnalysisDeviation[] = [],
): PreregistrationSnapshot {
  return {
    id: "snapshot-1",
    projectId: "project-cly",
    experimentId,
    version: 1,
    amendsSnapshotId: null,
    content,
    contentHash: "a".repeat(64),
    actorType: "human",
    actorId: "local-user",
    origin: "human",
    provenanceEventId: "event-1",
    createdAt: "2026-07-13T12:00:00.000Z",
    finalEvaluation: null,
    deviations,
  };
}

describe("preregistration workspace", () => {
  beforeEach(() => {
    useClyStore.setState({
      data: createFixtureRepository("active"),
      activeProjectId: "project-cly",
      preregistrations: [],
      preregistrationsLoading: false,
      preregistrationsError: null,
      createPreregistration: originalCreate,
      markPreregistrationEvaluated: originalEvaluate,
      declareAnalysisDeviation: originalDeclare,
      acknowledgeAnalysisDeviation: originalAcknowledge,
      toasts: [],
    });
  });

  it("prefills a complete snapshot and saves it in one concise dialog", async () => {
    const user = userEvent.setup();
    const experiment = useClyStore.getState().data.experiments[0];
    const template = createPreregistrationTemplate(experiment);
    const save = vi.fn().mockResolvedValue(snapshot(experiment.id));
    useClyStore.setState({ createPreregistration: save });
    render(<PreregistrationWorkspace experiment={experiment} />);

    await user.click(screen.getByRole("button", { name: "Create snapshot" }));
    const dialog = screen.getByRole("dialog", { name: "Preregister analysis" });
    expect(within(dialog).getByLabelText("Hypothesis")).toHaveValue(
      template.hypothesis,
    );
    expect(within(dialog).getByLabelText("Primary metrics")).toHaveValue(
      "Primary outcome",
    );
    expect(within(dialog).getByLabelText("Dataset")).toHaveValue(
      template.dataset,
    );
    expect(within(dialog).getByLabelText("Intended design")).toHaveValue(
      template.intendedDesign,
    );

    await user.clear(within(dialog).getByLabelText("Primary metrics"));
    await user.type(
      within(dialog).getByLabelText("Primary metrics"),
      "Worst-group error, ECE",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Lock snapshot" }),
    );

    expect(save).toHaveBeenCalledWith(
      experiment.id,
      expect.objectContaining({
        hypothesis: template.hypothesis,
        primaryMetrics: ["Worst-group error", "ECE"],
        dataset: template.dataset,
        intendedDesign: template.intendedDesign,
      }),
      null,
    );
    expect(
      screen.queryByRole("dialog", { name: "Preregister analysis" }),
    ).not.toBeInTheDocument();
  });

  it("distinguishes retrospective deviations and exposes acknowledgement", async () => {
    const user = userEvent.setup();
    const experiment = useClyStore.getState().data.experiments[0];
    const deviation: AnalysisDeviation = {
      id: "deviation-1",
      projectId: "project-cly",
      snapshotId: "snapshot-1",
      fieldPath: "/analysisPlan",
      beforeValue: content.analysisPlan,
      afterValue: "Use a stratified paired analysis.",
      rationale: "The planned strata were omitted.",
      declarationTiming: "retrospective",
      actorId: "local-user",
      provenanceEventId: "event-2",
      declaredAt: "2026-07-13T14:00:00.000Z",
      acknowledgement: null,
    };
    const acknowledge = vi.fn().mockResolvedValue({
      ...deviation,
      acknowledgement: {
        id: "ack-1",
        state: "acknowledged",
        actorId: "local-user",
        provenanceEventId: "event-3",
        acknowledgedAt: "2026-07-13T14:01:00.000Z",
      },
    });
    useClyStore.setState({
      preregistrations: [snapshot(experiment.id, [deviation])],
      acknowledgeAnalysisDeviation: acknowledge,
    });
    render(<PreregistrationWorkspace experiment={experiment} />);

    expect(screen.getByText("Retrospective")).toBeVisible();
    expect(screen.getByText("The planned strata were omitted.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Acknowledge" }));
    expect(acknowledge).toHaveBeenCalledWith("deviation-1");
  });
});
