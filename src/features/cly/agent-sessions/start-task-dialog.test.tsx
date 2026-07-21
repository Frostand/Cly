import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StartTaskDialog } from "./start-task-dialog";

describe("production task start dialog", () => {
  it("starts a selected local provider from an objective or Linear issue with durable research links", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <StartTaskDialog
        open
        projectName="Reliability study"
        onClose={onClose}
        onStart={onStart}
        references={[
          { id: "claim-1", title: "Primary reliability claim", kind: "Claim" },
          {
            id: "experiment-1",
            title: "Calibration benchmark",
            kind: "Experiment",
          },
        ]}
      />,
    );

    await user.type(
      screen.getByLabelText("Objective"),
      "Correct the interval calculation and prove it with the focused test suite.",
    );
    await user.type(screen.getByLabelText("Linear issue (optional)"), "CLY-71");
    await user.click(screen.getByLabelText(/Primary reliability claim/));
    await user.type(
      screen.getByLabelText("Additional research object IDs"),
      "artifact-1",
    );
    await user.selectOptions(
      screen.getByLabelText("Local provider"),
      "anthropic-claude",
    );
    expect(screen.getByLabelText("Installed model ID")).toHaveValue(
      "claude-sonnet-4-6",
    );
    await user.click(
      screen.getByRole("button", { name: "Start provider run" }),
    );

    expect(onStart).toHaveBeenCalledWith({
      title:
        "Correct the interval calculation and prove it with the focused test suite.",
      objective:
        "Correct the interval calculation and prove it with the focused test suite.",
      linearIssue: "CLY-71",
      provider: { id: "anthropic-claude", model: "claude-sonnet-4-6" },
      researchObjectIds: ["claim-1", "artifact-1"],
    });
    expect(onClose).toHaveBeenCalledOnce();
    expect(
      within(screen.getByRole("dialog")).getByText(
        /authentication, model availability, capabilities, approvals, and budget/i,
      ),
    ).toBeVisible();
  });

  it("accepts a Linear issue as the task source when no separate objective is supplied", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn().mockResolvedValue(undefined);
    render(
      <StartTaskDialog
        open
        projectName="Reliability study"
        onClose={vi.fn()}
        onStart={onStart}
        references={[]}
      />,
    );

    await user.type(screen.getByLabelText("Linear issue (optional)"), "CLY-71");
    await user.click(
      screen.getByRole("button", { name: "Start provider run" }),
    );

    expect(onStart).toHaveBeenCalledWith({
      title: "CLY-71",
      linearIssue: "CLY-71",
      provider: {
        id: "anthropic-claude",
        model: "claude-sonnet-4-6",
      },
      researchObjectIds: [],
    });
  });
});
