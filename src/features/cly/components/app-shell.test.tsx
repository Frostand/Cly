import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentConfiguration } from "../agent-sessions/types";
import type { ScreenId } from "../domain/types";
import { createCostLedgerFixture } from "../fixtures/cost-ledger";
import { createFixtureRepository } from "../fixtures/repository";
import { projectServices } from "../services/project-services";
import { useClyStore } from "../store/cly-store";
import { ClyAppShell } from "./app-shell";

const loadFromApi = useClyStore.getState().loadFromApi;

const agentConfiguration: AgentConfiguration = {
  id: "configuration-1",
  projectId: "project-cly",
  name: "Persisted delivery team",
  maxParallel: 1,
  maxTotalBudget: {
    maxInputTokens: 1_000,
    maxOutputTokens: 500,
    maxCostMinorUnits: 100,
    maxRuntimeMs: 10_000,
  },
  partialFailurePolicy: "continue",
  roles: [
    {
      id: "implementation",
      role: "implementation",
      instanceCount: 1,
      maxParallel: 1,
      provider: "openai",
      model: "gpt-5",
      reasoningLevel: "medium",
      budget: {
        maxInputTokens: 1_000,
        maxOutputTokens: 500,
        maxCostMinorUnits: 100,
        maxRuntimeMs: 10_000,
      },
      allowedTools: ["readFile"],
      allowedContextSources: ["project"],
      allowedFileGlobs: ["**/*"],
      permissions: {
        canReadFiles: true,
        canWriteFiles: false,
        canRunCommands: false,
        canAccessNetwork: false,
        requiresApprovalForWrite: true,
        requiresApprovalForNetwork: true,
      },
      approvalCheckpoints: [],
    },
  ],
  revision: 1,
  createdAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z",
};

describe("Cly application shell", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    localStorage.clear();
    const data = createFixtureRepository("active");
    const costs = createCostLedgerFixture("active", data);
    useClyStore.setState({
      data,
      costLedger: costs.ledger,
      claimCosts: costs.claimCosts,
      selectedCostEntryId: costs.ledger.entries[0]?.id ?? null,
      fixtureMode: "active",
      activeProjectId: "project-cly",
      activeScreen: "overview",
      activeProduct: "research",
      activeDevSection: "projects",
      selectedId: null,
      sidebarCollapsed: false,
      inspectorOpen: true,
      activityOpen: false,
      commandPaletteOpen: false,
      projectSwitcherOpen: false,
      fixtureSwitcherOpen: false,
      globalSearch: "",
      toasts: [],
      loadFromApi,
    });
  });

  it("hydrates persisted research after the authenticated app shell mounts", async () => {
    const hydrate = vi.fn().mockResolvedValue(true);
    useClyStore.setState({ loadFromApi: hydrate });

    render(<ClyAppShell />);

    await waitFor(() => expect(hydrate).toHaveBeenCalledOnce());
  });

  it("keeps source input open and never reports success when persistence fails", async () => {
    const user = userEvent.setup();
    useClyStore.setState({ activeScreen: "sources" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Research API unavailable")),
    );

    render(<ClyAppShell />);
    await user.click(screen.getByRole("button", { name: "Import source" }));
    await user.type(screen.getByLabelText("Source title"), "Unsaved paper");
    await user.click(screen.getByRole("button", { name: "Import and scan" }));

    await waitFor(() =>
      expect(screen.getByText("Source was not saved")).toBeVisible(),
    );
    expect(screen.getByRole("dialog", { name: "Import source" })).toBeVisible();
    expect(screen.getByLabelText("Source title")).toHaveValue("Unsaved paper");
    expect(screen.queryByText("Source imported")).not.toBeInTheDocument();
  });

  it("navigates every major research component from the grouped sidebar", async () => {
    const user = userEvent.setup();
    render(<ClyAppShell />);

    const destinations = [
      ["objectives", "Objectives"],
      ["agents", "Agent Sessions"],
      ["context", "Context Composer"],
      ["graph", "Research Object Graph"],
      ["experiments", "Experiment Manager"],
      ["costs", "Cost ledger"],
      ["sources", "Source Manager"],
      ["literature", "Literature Workspace"],
      ["notebooks", "Notebook Scanner"],
      ["code", "Code-to-Research Linker"],
      ["claims", "Claim Audit Board"],
      ["provenance", "Figure & Table Provenance"],
      ["reproducibility", "Reproducibility Auditor"],
      ["decisions", "Research Decision Log"],
      ["next-steps", "Next-Step Planner"],
      ["reviewer-capsules", "Reviewer Capsules"],
      ["integrations", "Integrations & Providers"],
      ["models", "Models & Agents"],
    ] as const;

    for (const [id, heading] of destinations) {
      await user.click(screen.getByTestId(`nav-${id}`));
      expect(
        screen.getByRole("heading", { name: heading, level: 1 }),
      ).toBeVisible();
    }

    expect(
      screen.getByRole("button", { name: "Review estimate" }),
    ).toBeEnabled();
    await user.click(
      screen.getByRole("switch", { name: "Toggle advanced agent controls" }),
    );
    await user.click(
      document.querySelector(".cly-disclosure-row > summary") as HTMLElement,
    );
    expect(screen.getAllByLabelText("Input tokens")[0]).toBeVisible();
    expect(screen.getAllByLabelText("Allowed tools")[0]).toBeVisible();
  });

  it("reviews an estimate with inaccessible reasons before saving", async () => {
    const user = userEvent.setup();
    useClyStore.setState((state) => ({
      activeScreen: "models",
      data: { ...state.data, agentConfigurations: [], agentPresets: [] },
      loadFromApi: vi.fn().mockResolvedValue(true),
    }));
    const estimate = vi
      .spyOn(projectServices.agents, "estimateConfiguration")
      .mockResolvedValue({
        inputTokens: 900,
        outputTokens: 400,
        costMinorUnits: 75,
        runtimeMs: 8_000,
        inaccessibleContext: ["unknown-context"],
        inaccessibleTools: ["unknownTool"],
        reasons: ["Tool “unknownTool” is not available."],
      });
    const save = vi
      .spyOn(projectServices.agents, "saveConfiguration")
      .mockImplementation(async (projectId, configuration) => ({
        ...configuration,
        id: "configuration-created",
        projectId,
        revision: 1,
        createdAt: "2026-07-15T00:00:00.000Z",
        updatedAt: "2026-07-15T00:00:00.000Z",
      }));

    render(<ClyAppShell />);
    await user.click(screen.getByRole("button", { name: "Review estimate" }));

    await waitFor(() => expect(estimate).toHaveBeenCalledOnce());
    expect(estimate.mock.calls[0][0]).toBe("project-cly");
    expect(estimate.mock.calls[0][1]).toBe("draft");
    expect(screen.getByText(/unknownTool/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Save configuration" }),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Save configuration" }),
    );

    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(useClyStore.getState().toasts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Agent configuration saved" }),
      ]),
    );
  });

  it("surfaces an optimistic conflict without overwriting local configuration", async () => {
    const user = userEvent.setup();
    useClyStore.setState((state) => ({
      activeScreen: "models",
      data: {
        ...state.data,
        agentConfigurations: [agentConfiguration],
        agentPresets: [],
      },
      loadFromApi: vi.fn().mockResolvedValue(true),
    }));
    vi.spyOn(projectServices.agents, "estimateConfiguration").mockResolvedValue(
      {
        inputTokens: 900,
        outputTokens: 400,
        costMinorUnits: 75,
        runtimeMs: 8_000,
        inaccessibleContext: [],
        inaccessibleTools: [],
        reasons: [],
      },
    );
    vi.spyOn(projectServices.agents, "saveConfiguration").mockRejectedValue(
      new Error("Agent configuration revision conflict."),
    );

    render(<ClyAppShell />);
    await user.click(screen.getByRole("button", { name: "Review estimate" }));
    await user.click(
      screen.getByRole("button", { name: "Save configuration" }),
    );

    await waitFor(() =>
      expect(useClyStore.getState().toasts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: "Agent configuration was not saved",
          }),
        ]),
      ),
    );
    expect(useClyStore.getState().data.agentConfigurations).toEqual([
      agentConfiguration,
    ]);
    expect(screen.getByDisplayValue("Persisted delivery team")).toBeVisible();
  });

  it("resets selected configuration across projects and adopts the new hydration", async () => {
    useClyStore.setState((state) => ({
      activeScreen: "models",
      data: {
        ...state.data,
        agentConfigurations: [agentConfiguration],
        agentPresets: [],
      },
      loadFromApi: vi.fn().mockResolvedValue(true),
    }));
    render(<ClyAppShell />);
    expect(screen.getByDisplayValue("Persisted delivery team")).toBeVisible();

    act(() => {
      useClyStore.setState((state) => ({
        activeProjectId: "project-cells",
        data: { ...state.data, agentConfigurations: [], agentPresets: [] },
      }));
    });
    await waitFor(() =>
      expect(
        screen.getByDisplayValue("Project agent configuration"),
      ).toBeVisible(),
    );
    expect(screen.queryByDisplayValue("Persisted delivery team")).toBeNull();

    act(() => {
      useClyStore.getState().setAgentConfigurations([
        {
          ...agentConfiguration,
          id: "configuration-b",
          projectId: "project-cells",
          name: "Project B configuration",
        },
      ]);
    });
    await waitFor(() =>
      expect(screen.getByDisplayValue("Project B configuration")).toBeVisible(),
    );
  });

  it("deletes the selected revision and returns to a new project draft", async () => {
    const user = userEvent.setup();
    useClyStore.setState((state) => ({
      activeScreen: "models",
      data: {
        ...state.data,
        agentConfigurations: [agentConfiguration],
        agentPresets: [],
      },
      loadFromApi: vi.fn().mockResolvedValue(true),
    }));
    const remove = vi
      .spyOn(projectServices.agents, "removeConfiguration")
      .mockImplementation(async () => {
        useClyStore.getState().setAgentConfigurations([]);
      });

    render(<ClyAppShell />);
    await user.click(
      screen.getByRole("button", { name: "Delete configuration" }),
    );

    await waitFor(() =>
      expect(remove).toHaveBeenCalledWith("project-cly", "configuration-1", 1),
    );
    expect(useClyStore.getState().toasts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Agent configuration deleted" }),
      ]),
    );
    expect(
      screen.getByDisplayValue("Project agent configuration"),
    ).toBeVisible();
  });

  it("switches between Cly Research and the Cly Dev command center", async () => {
    const user = userEvent.setup();
    render(<ClyAppShell />);

    await user.click(screen.getByTestId("product-dev"));
    expect(
      screen.getByRole("heading", { name: "Projects", level: 1 }),
    ).toBeVisible();
    expect(document.querySelector(".cly-shell")).toHaveAttribute(
      "data-product",
      "dev",
    );

    await user.click(screen.getByTestId("nav-dev-features"));
    expect(
      screen.getByRole("heading", { name: "Features", level: 1 }),
    ).toBeVisible();

    await user.click(screen.getByTestId("product-research"));
    expect(
      screen.getByRole("heading", {
        name: "Neural surrogate reliability",
        level: 1,
      }),
    ).toBeVisible();
  });

  it("opens the command palette and executes navigation", async () => {
    const user = userEvent.setup();
    render(<ClyAppShell />);

    await user.keyboard("{Meta>}k{/Meta}");
    const palette = screen.getByTestId("command-palette");
    expect(palette).toBeVisible();
    await user.type(within(palette).getByRole("combobox"), "Go to Context");
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
    expect(document.querySelectorAll(".cly-sidebar-group-label")).toHaveLength(
      0,
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

  it("renders all titlebar action buttons directly", () => {
    render(<ClyAppShell />);

    const titlebar = document.querySelector(".cly-titlebar") as HTMLElement;
    expect(
      within(titlebar).getByLabelText(/active agent sessions/),
    ).toBeVisible();
    expect(
      within(titlebar).getByLabelText(/Local and cloud status/),
    ).toBeVisible();
    expect(
      within(titlebar).getByLabelText("Notification center"),
    ).toBeVisible();
    expect(within(titlebar).getByLabelText("Settings")).toBeVisible();
    expect(within(titlebar).getByLabelText("Toggle inspector")).toBeVisible();
  });
});
