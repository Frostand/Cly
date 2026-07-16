import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { createFixtureRepository } from "../fixtures/repository";
import { useClyStore } from "../store/cly-store";
import { AgentSessionsScreen } from ".";

describe("Agent Sessions workspace", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", "/");
    useClyStore.setState({
      data: createFixtureRepository("active"),
      activeScreen: "agents",
      agentSessionsMode: "overview",
      selectedAgentSessionId: null,
      selectedOverviewSessionId: "session-01",
      agentSessionFilter: "active",
      agentSessionSort: "recent",
      agentSessionSearch: "",
      newAgentSessionOpen: false,
      agentConfigurationId: null,
      agentSessionLayouts: {},
      toasts: [],
    });
  });

  it("renders polished Overview rows and explicitly opens Chat", async () => {
    const user = userEvent.setup();
    render(<AgentSessionsScreen />);

    expect(
      screen.getByRole("heading", { name: "Agent Sessions", level: 1 }),
    ).toBeVisible();
    expect(screen.getByText("1 running")).toBeVisible();
    expect(
      screen.getAllByText("Audit primary claim evidence")[0],
    ).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: /Open chat/ }),
    ).not.toHaveLength(0);

    const openChatButtons = screen.getAllByRole("button", {
      name: /Open chat/,
    });
    expect(openChatButtons[0]).toBeDefined();
    await user.click(openChatButtons[0] as HTMLButtonElement);
    expect(screen.getByTestId("agent-sessions-chat")).toBeVisible();
    expect(screen.getByLabelText("Message the Orchestrator")).toBeVisible();
    expect(window.location.search).toContain("mode=chat");
  });

  it("creates a configured session and starts in Chat Mode", async () => {
    const user = userEvent.setup();
    render(<AgentSessionsScreen />);

    await user.click(screen.getByRole("button", { name: "New session" }));
    const dialog = screen.getByRole("dialog", { name: "New agent session" });
    await user.type(
      within(dialog).getByLabelText("Session title"),
      "Audit submission evidence",
    );
    await user.type(
      within(dialog).getByLabelText("Session goal"),
      "Trace every claim to its source, run, and generated artifact.",
    );
    await user.selectOptions(
      within(dialog).getByLabelText("Reasoning level"),
      "Medium",
    );
    await user.click(
      within(dialog).getByRole("button", { name: /Start session/ }),
    );

    expect(screen.getByTestId("agent-sessions-chat")).toBeVisible();
    expect(screen.getAllByText("Audit submission evidence")[0]).toBeVisible();
    expect(screen.getByText("Preparing a research-aware plan")).toBeVisible();
    expect(
      useClyStore.getState().data.agentSessions[0]?.orchestrator.reasoningLevel,
    ).toBe("Medium");
  });

  it("keeps composer text visible and sends streamed fixture responses", async () => {
    const user = userEvent.setup();
    useClyStore.setState({
      agentSessionsMode: "chat",
      selectedAgentSessionId: "session-01",
    });
    render(<AgentSessionsScreen />);

    const composer = screen.getByLabelText("Message the Orchestrator");
    await user.type(
      composer,
      "Keep the correction scoped to interval semantics",
    );
    expect(composer).toHaveValue(
      "Keep the correction scoped to interval semantics",
    );
    fireEvent.keyDown(composer, { key: "Enter", metaKey: true });

    expect(
      await screen.findByText(
        "Keep the correction scoped to interval semantics",
      ),
    ).toBeVisible();
    expect(
      await screen.findByText(/I’ve added this direction to the active plan/),
    ).toBeVisible();
    expect(composer).toHaveValue("");
  });

  it("switches among full workbench surfaces and preserves tab state", async () => {
    const user = userEvent.setup();
    useClyStore.setState({
      agentSessionsMode: "chat",
      selectedAgentSessionId: "session-01",
    });
    render(<AgentSessionsScreen />);

    await user.click(screen.getByRole("tab", { name: /Tests/ }));
    expect(screen.getByLabelText("Fixture terminal output")).toBeVisible();
    expect(screen.getByText(/calibration.test.ts/)).toBeVisible();

    await user.click(screen.getByRole("tab", { name: /Calibration paper/ }));
    expect(screen.getByLabelText("Research browser fixture")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Add page as source" }),
    );
    expect(screen.getByRole("button", { name: "Source added" })).toBeDisabled();

    await user.click(screen.getByRole("tab", { name: /Code Diff/ }));
    expect(
      screen.getByLabelText(/Diff for src\/evaluation\/calibration.py/),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Approve/ }));
    expect(screen.getByText("approved")).toBeVisible();

    await user.click(screen.getByRole("tab", { name: /Live Files/ }));
    expect(screen.getByLabelText("Live file observation")).toBeVisible();
    expect(
      screen.getByText(/Editing src\/evaluation\/calibration.py/),
    ).toBeVisible();
  });

  it("shows full delegated-agent configuration, steering, and approval actions", async () => {
    const user = userEvent.setup();
    useClyStore.setState({
      agentSessionsMode: "chat",
      selectedAgentSessionId: "session-01",
    });
    render(<AgentSessionsScreen />);

    expect(screen.getAllByText("Codex Implementation Agent")[0]).toBeVisible();
    const steer = screen.getByLabelText("Steer Codex Implementation Agent");
    await user.type(steer, "Add an asymmetric sample regression");
    await user.click(
      screen.getByRole("button", {
        name: "Send steer to Codex Implementation Agent",
      }),
    );
    expect(
      useClyStore
        .getState()
        .data.agentSessions[0]?.delegatedAgents.find(
          (agent) => agent.id === "agent-implementation",
        )?.lastAction,
    ).toContain("asymmetric sample");

    await user.click(
      screen.getAllByRole("button", {
        name: "Configure agent team",
      })[0] as HTMLButtonElement,
    );
    expect(
      screen.getByRole("dialog", { name: /Configure Cly Orchestrator/ }),
    ).toBeVisible();

    useClyStore.getState().setAgentConfigurationId(null);
    useClyStore.getState().openAgentSession("session-02");
    await waitFor(() =>
      expect(
        screen.getByText("Approval required · high-cost experiment"),
      ).toBeVisible(),
    );
    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(
      useClyStore
        .getState()
        .data.agentSessions.find((session) => session.id === "session-02")
        ?.approvals[0]?.state,
    ).toBe("approved");
  });

  it("keeps secondary session metadata in the session menu", async () => {
    const user = userEvent.setup();
    useClyStore.setState({
      agentSessionsMode: "chat",
      selectedAgentSessionId: "session-01",
    });
    render(<AgentSessionsScreen />);

    const trigger = document.querySelector(
      ".agent-session-menu summary",
    ) as HTMLElement;
    await user.click(trigger);
    const menu = within(trigger.closest("details") as HTMLElement).getByRole(
      "menu",
    );
    expect(within(menu).getByText("agent/calibration-audit")).toBeVisible();
    expect(within(menu).getByText("$2.84 · 58.2k tokens")).toBeVisible();
  });

  it("keeps the complete Cly Dev task identity discoverable in Chat", () => {
    useClyStore.setState({
      agentSessionsMode: "chat",
      selectedAgentSessionId: "session-01",
    });
    render(<AgentSessionsScreen />);

    const identity = screen.getByRole("region", { name: "Task identity" });
    for (const label of [
      "Project",
      "Repository",
      "Workspace",
      "Machine",
      "Provider",
      "Budget",
      "Objective",
      "Research impact",
    ]) {
      expect(
        within(identity).getByRole("group", { name: label }),
      ).toBeVisible();
    }
    expect(
      within(identity).getByText("Neural Surrogate Reliability"),
    ).toBeVisible();
    expect(within(identity).getByText("agent/calibration-audit")).toBeVisible();
    expect(within(identity).getByText(/GPT-5 · high/)).toBeVisible();
  });

  it("supports agent-only, inline, detach, and reattach prototype intents", async () => {
    const user = userEvent.setup();
    useClyStore.setState({
      agentSessionsMode: "chat",
      selectedAgentSessionId: "session-01",
    });
    render(<AgentSessionsScreen />);

    await user.click(screen.getByRole("radio", { name: "Agent only" }));
    expect(
      screen.queryByLabelText("Session workbench"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Message the Orchestrator")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Inspect tests" }));
    expect(
      screen.getByRole("region", { name: "Test inspection" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Inspect diff" }));
    expect(
      screen.getByRole("region", { name: "Diff inspection" }),
    ).toBeVisible();

    await user.click(screen.getByRole("radio", { name: "Inline workspace" }));
    expect(screen.getByLabelText("Session workbench")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Detach workspace (prototype)" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Detached workspace intent recorded",
    );
    await user.click(
      screen.getByRole("button", { name: "Reattach workspace (prototype)" }),
    );
    expect(screen.getByLabelText("Session workbench")).toBeVisible();

    await user.click(screen.getByRole("radio", { name: "External editor" }));
    expect(
      screen.queryByLabelText("Session workbench"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "External-editor deep-link mode selected",
    );
    expect(
      screen.getByRole("button", { name: "Open editor (prototype)" }),
    ).toBeVisible();
  });

  it("announces offline, failed, and interrupted resumable task states truthfully", () => {
    const session = useClyStore.getState().data.agentSessions[0];
    expect(session).toBeDefined();
    useClyStore.setState((state) => ({
      data: {
        ...state.data,
        agentSessions: state.data.agentSessions.map((item, index) =>
          index === 0
            ? {
                ...item,
                connectionState: "offline",
                taskState: "interrupted-resumable",
              }
            : item,
        ),
      },
      agentSessionsMode: "chat",
      selectedAgentSessionId: session?.id,
    }));
    const { rerender } = render(<AgentSessionsScreen />);
    expect(screen.getByRole("status")).toHaveTextContent(/Offline/);
    expect(screen.getByRole("status")).toHaveTextContent(/can be resumed/);

    useClyStore.getState().updateAgentSession(session?.id ?? "", (item) => ({
      ...item,
      connectionState: "connected",
      taskState: "failed",
    }));
    rerender(<AgentSessionsScreen />);
    expect(screen.getByRole("alert")).toHaveTextContent(/Task failed/);
  });
});
