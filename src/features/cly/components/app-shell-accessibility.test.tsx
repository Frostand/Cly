import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFixtureRepository } from "../fixtures/repository";
import { useClyStore } from "../store/cly-store";
import { ClyAppShell } from "./app-shell";

describe("Cly shell modal and inspector focus", () => {
  beforeEach(() => {
    localStorage.clear();
    const data = createFixtureRepository("active");
    useClyStore.setState({
      data,
      activeProjectId: "project-cly",
      activeProduct: "research",
      activeScreen: "claims",
      fixtureMode: "active",
      selectedId: data.claims[0].id,
      inspectorOpen: true,
      commandPaletteOpen: false,
      projectSwitcherOpen: false,
      fixtureSwitcherOpen: false,
      agentDestructiveConfirmation: null,
      toasts: [],
      loadFromApi: vi.fn().mockResolvedValue(true),
    });
  });

  it("lets a dialog own Escape, preserving selection and restoring trigger focus", async () => {
    const user = userEvent.setup();
    const selectedId = useClyStore.getState().selectedId;
    render(<ClyAppShell />);

    const trigger = screen.getByRole("button", { name: "New claim" });
    await user.click(trigger);
    expect(
      screen.getByRole("dialog", { name: "New research claim" }),
    ).toBeVisible();

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "New research claim" }),
      ).not.toBeInTheDocument(),
    );
    expect(useClyStore.getState().selectedId).toBe(selectedId);
    expect(trigger).toHaveFocus();
  });

  it("unmounts a closed inspector and moves focus to the workspace", async () => {
    const user = userEvent.setup();
    const selectedId = useClyStore.getState().selectedId;
    render(<ClyAppShell />);

    await user.click(screen.getByRole("button", { name: "Close inspector" }));

    expect(screen.queryByTestId("inspector")).not.toBeInTheDocument();
    expect(useClyStore.getState().selectedId).toBe(selectedId);
    expect(document.getElementById("main-workspace")).toHaveFocus();
  });

  it("keeps Cly Dev lifecycle controls universally reachable by command", async () => {
    const user = userEvent.setup();
    useClyStore.setState({
      activeScreen: "agents",
      agentSessionsMode: "chat",
      selectedAgentSessionId: "session-01",
    });
    render(<ClyAppShell />);

    await user.keyboard("{Control>}k{/Control}");
    const palette = screen.getByRole("dialog", { name: "Command palette" });
    for (const label of [
      "Open Pending Agent Approval",
      "Inspect Current Session Tests",
      "Inspect Current Session Diff",
      "Use Agent-only Mode",
      "Use Inline Workspace",
      "Detach Workspace (Prototype Intent)",
      "Reattach Workspace (Prototype Intent)",
      "Open Interrupted Task to Resume",
      "Review Stop Current Agent Session",
    ]) {
      expect(within(palette).getByText(label, { exact: true })).toBeVisible();
    }
  });
});
