import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import type { ScreenId } from "../domain/types";
import { createFixtureRepository } from "../fixtures/repository";
import { useClyStore } from "../store/cly-store";
import { ClyAppShell } from "./app-shell";

describe("Cly application shell", () => {
  beforeEach(() => {
    localStorage.clear();
    useClyStore.setState({
      data: createFixtureRepository("active"),
      fixtureMode: "active",
      activeProjectId: "project-cly",
      activeScreen: "overview",
      selectedId: null,
      sidebarCollapsed: false,
      inspectorOpen: true,
      activityOpen: false,
      commandPaletteOpen: false,
      projectSwitcherOpen: false,
      fixtureSwitcherOpen: false,
      globalSearch: "",
      toasts: [],
    });
  });

  it("navigates every major research component from the grouped sidebar", async () => {
    const user = userEvent.setup();
    render(<ClyAppShell />);

    const destinations = [
      ["agents", "Agent Sessions"],
      ["context", "Context Composer"],
      ["graph", "Research Object Graph"],
      ["experiments", "Experiment Manager"],
      ["sources", "Source Manager"],
      ["literature", "Literature Workspace"],
      ["notebooks", "Notebook Scanner"],
      ["code", "Code-to-Research Linker"],
      ["claims", "Claim Audit Board"],
      ["provenance", "Figure & Table Provenance"],
      ["reproducibility", "Reproducibility Auditor"],
      ["decisions", "Research Decision Log"],
      ["next-steps", "Next-Step Planner"],
      ["integrations", "Integrations & Providers"],
      ["models", "Models & Agents"],
    ] as const;

    for (const [id, heading] of destinations) {
      await user.click(screen.getByTestId(`nav-${id}`));
      expect(
        screen.getByRole("heading", { name: heading, level: 1 }),
      ).toBeVisible();
    }
  });

  it("opens the command palette and executes navigation", async () => {
    const user = userEvent.setup();
    render(<ClyAppShell />);

    await user.keyboard("{Meta>}k{/Meta}");
    const palette = screen.getByTestId("command-palette");
    expect(palette).toBeVisible();
    await user.type(within(palette).getByRole("textbox"), "Go to Context");
    await user.keyboard("{Enter}");

    expect(
      screen.getByRole("heading", { name: "Context Composer", level: 1 }),
    ).toBeVisible();
  });

  it("includes and excludes a context item and recalculates budget", async () => {
    const user = userEvent.setup();
    useClyStore.setState({ activeScreen: "context" });
    render(<ClyAppShell />);

    const toggle = screen.getByRole("switch", {
      name: "Include Raman et al. 2025",
    });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);

    expect(toggle).toBeChecked();
    expect(screen.getByText("28,720 tokens")).toBeVisible();
  });

  it("renders source, notebook, claim, experiment, provenance, finding, integration, and decision components", () => {
    const { rerender } = render(<ClyAppShell />);
    const expectations: [ScreenId, string][] = [
      ["sources", "Reliable neural surrogates for nonlinear dynamical systems"],
      ["notebooks", "Ensemble size and calibration"],
      ["claims", "Calibration-aware ensembles reduce simulation cost"],
      ["experiments", "Calibrated ensemble sweep"],
      ["provenance", "Figure 2 · Cost vs calibration"],
      [
        "reproducibility",
        "Figure 4 includes an undocumented manual annotation",
      ],
      ["integrations", "NotebookLM"],
      ["decisions", "Use ensemble ×5 as the canonical configuration"],
    ];

    for (const [activeScreen, text] of expectations) {
      useClyStore.setState({ activeScreen });
      rerender(<ClyAppShell />);
      expect(screen.getAllByText(new RegExp(text))[0]).toBeVisible();
    }
  });

  it("collapses shell regions and exposes fixture states", async () => {
    const user = userEvent.setup();
    render(<ClyAppShell />);

    await user.click(screen.getByTestId("toggle-sidebar"));
    expect(document.querySelector(".cly-shell")).toHaveAttribute(
      "data-sidebar",
      "collapsed",
    );
    fireEvent.keyDown(window, { key: "i", metaKey: true, altKey: true });
    expect(document.querySelector(".cly-shell")).toHaveAttribute(
      "data-inspector",
      "closed",
    );
    await user.click(screen.getByTestId("fixture-selector"));
    await user.click(
      screen.getByRole("button", { name: /^EmptyNo research objects yet/ }),
    );

    expect(screen.getByText("No claims yet")).toBeVisible();
  });

  it("does not mount a blank inspector and opens it for a real selection", async () => {
    const user = userEvent.setup();
    useClyStore.setState({ activeScreen: "claims" });
    render(<ClyAppShell />);

    expect(document.querySelector(".cly-inspector")).not.toBeInTheDocument();
    expect(document.querySelector(".cly-shell")).toHaveAttribute(
      "data-inspector",
      "closed",
    );

    await user.click(
      screen
        .getAllByText(/Calibration-aware ensembles reduce simulation cost/)
        .at(0) as HTMLElement,
    );
    expect(document.querySelector(".cly-inspector")).toBeInTheDocument();
    expect(document.querySelector(".cly-shell")).toHaveAttribute(
      "data-inspector",
      "open",
    );
  });
});
