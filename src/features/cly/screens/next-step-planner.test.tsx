import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { createFixtureRepository } from "../fixtures/repository";
import { useClyStore } from "../store/cly-store";
import { NextStepsScreen } from "./integrity";

describe("next-step planner review workflow", () => {
  beforeEach(() => {
    localStorage.clear();
    useClyStore.setState({
      data: createFixtureRepository("active"),
      fixtureMode: "active",
      activeProjectId: "project-cly",
      selectedId: null,
      toasts: [],
    });
  });

  it("edits a recommendation in an accessible review-only dialog", async () => {
    const user = userEvent.setup();
    render(<NextStepsScreen />);

    const original = useClyStore.getState().data.nextSteps[0];
    await user.click(
      screen.getByRole("button", { name: `Edit ${original.title}` }),
    );
    expect(
      screen.getByRole("dialog", { name: "Edit recommendation" }),
    ).toHaveTextContent("never creates a task, branch, or command");

    const title = screen.getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Run a corrected baseline comparison");
    await user.click(
      screen.getByRole("button", { name: "Save review decision" }),
    );

    await waitFor(() =>
      expect(useClyStore.getState().data.nextSteps[0].title).toBe(
        "Run a corrected baseline comparison",
      ),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("requires a reason before deferring or dismissing", async () => {
    const user = userEvent.setup();
    render(<NextStepsScreen />);

    const step = useClyStore.getState().data.nextSteps[0];
    await user.click(
      screen.getByRole("button", { name: `Defer ${step.title}` }),
    );
    const save = screen.getByRole("button", { name: "Save review decision" });
    expect(save).toBeDisabled();
    await user.type(
      screen.getByLabelText("Reason"),
      "Waiting for source access.",
    );
    expect(save).toBeEnabled();
    await user.click(save);

    await waitFor(() =>
      expect(useClyStore.getState().data.nextSteps[0].status).toBe("Deferred"),
    );
  });
});
