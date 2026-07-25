import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useIdeStore } from "../../../components/ide/ide-store";
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
      agentDestructiveConfirmation: null,
      agentSessionLayouts: {},
      toasts: [],
    });
    useIdeStore.setState({
      providerModels: {
        fetchedAt: new Date().toISOString(),
        openai: {
          installed: true,
          loading: false,
          error: null,
          source: "cli",
          version: "1.0.0",
          models: [
            {
              id: "gpt-5.6-sol",
              label: "GPT-5.6 Sol",
              reasoningEfforts: ["low", "medium", "high", "xhigh"],
            },
            {
              id: "gpt-5.6-terra",
              label: "GPT-5.6 Terra",
              reasoningEfforts: ["low", "medium", "high", "xhigh"],
            },
          ],
        },
        anthropic: {
          installed: true,
          loading: false,
          error: null,
          source: "cli",
          version: "1.0.0",
          models: [
            {
              id: "opus",
              label: "Claude Opus",
              reasoningEfforts: ["low", "medium", "high", "xhigh", "max"],
            },
          ],
        },
        opencode: {
          installed: false,
          loading: false,
          error: null,
          source: "unavailable",
          version: null,
          models: [],
        },
        cursor: {
          installed: false,
          loading: false,
          error: null,
          source: "unavailable",
          version: null,
          models: [],
        },
      },
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
      screen.getAllByText("Audit LDL-C discordance evidence")[0],
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
      within(dialog).getByLabelText("Model"),
      "openai:gpt-5.6-terra",
    );
    await user.selectOptions(
      within(dialog).getByLabelText("Reasoning level"),
      "Extra High",
    );
    await user.click(
      within(dialog).getByRole("button", { name: /Start session/ }),
    );

    expect(screen.getByTestId("agent-sessions-chat")).toBeVisible();
    expect(screen.getAllByText("Audit submission evidence")[0]).toBeVisible();
    expect(screen.getByText("Preparing a research-aware plan")).toBeVisible();
    expect(
      useClyStore.getState().data.agentSessions[0]?.orchestrator.reasoningLevel,
    ).toBe("Extra High");
    expect(
      useClyStore.getState().data.agentSessions[0]?.orchestrator.model,
    ).toBe("gpt-5.6-terra");
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
    expect(screen.getByText(/test_discordance.py/)).toBeVisible();

    await user.click(screen.getByRole("tab", { name: /ApoB paper/ }));
    expect(screen.getByLabelText("Research browser fixture")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Add page as source" }),
    );
    expect(screen.getByRole("button", { name: "Source added" })).toBeDisabled();

    await user.click(screen.getByRole("tab", { name: /Code Diff/ }));
    expect(
      screen.getByLabelText(/Diff for analysis\/discordance.py/),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Approve/ }));
    expect(screen.getByText("approved")).toBeVisible();

    await user.click(screen.getByRole("tab", { name: /Live Files/ }));
    expect(screen.getByLabelText("Live file observation")).toBeVisible();
    expect(screen.getByText(/Editing analysis\/discordance.py/)).toBeVisible();
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
        screen.getByText("Approval required · download later cycles"),
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
    expect(within(menu).getByText("agent/discordance-audit")).toBeVisible();
    expect(within(menu).getByText("$2.84 · 58.2k tokens")).toBeVisible();
  });

  it("opens real context and rename actions from the working session", async () => {
    const user = userEvent.setup();
    useClyStore.setState({
      agentSessionsMode: "chat",
      selectedAgentSessionId: "session-01",
    });
    render(<AgentSessionsScreen />);

    const header = document.querySelector(".agent-session-header");
    expect(header).not.toBeNull();
    await user.click(
      within(header as HTMLElement).getByRole("button", {
        name: "Claim Audit Pack",
      }),
    );
    expect(screen.getByLabelText("Live file observation")).toBeVisible();

    const trigger = within(header as HTMLElement).getByLabelText(
      "Session menu",
    );
    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));
    const dialog = screen.getByRole("dialog", { name: "Rename session" });
    const name = within(dialog).getByLabelText("Session name");
    await user.clear(name);
    await user.type(name, "Calibration evidence audit");
    await user.click(within(dialog).getByRole("button", { name: "Save name" }));

    expect(
      useClyStore
        .getState()
        .data.agentSessions.find((session) => session.id === "session-01")
        ?.title,
    ).toBe("Calibration evidence audit");
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
    expect(within(identity).getByText("When LDL-C misleads")).toBeVisible();
    expect(within(identity).getByText("agent/discordance-audit")).toBeVisible();
    expect(within(identity).getByText(/GPT-5\.6 Sol · high/)).toBeVisible();
  });

  it("reveals complete compact identity values from the keyboard", async () => {
    const user = userEvent.setup();
    useClyStore.setState({
      agentSessionsMode: "chat",
      selectedAgentSessionId: "session-01",
    });
    render(<AgentSessionsScreen />);

    const impactGroup = screen.getByRole("group", { name: "Research impact" });
    const disclosure = within(impactGroup).getByRole("button", {
      name: "Show full Research impact identity",
    });
    disclosure.focus();
    await user.keyboard("{Enter}");
    expect(disclosure).toHaveFocus();
    expect(impactGroup.querySelector(".cly-dev-identity-detail")).toBeVisible();
    expect(
      within(impactGroup).getAllByText(
        "Changes the discordance definition linked to the primary claim.",
      ),
    ).toHaveLength(2);
  });

  it("supports agent-only, inline, detached, and external-editor modes", async () => {
    const user = userEvent.setup();
    useClyStore.setState({
      agentSessionsMode: "chat",
      selectedAgentSessionId: "session-01",
    });
    render(<AgentSessionsScreen />);

    expect(
      screen.getByRole("radio", { name: "Detached workspace" }),
    ).toBeVisible();
    expect(
      screen.getByRole("radio", { name: "External editor" }),
    ).toBeVisible();

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
    await user.click(screen.getByRole("button", { name: "Detach workspace" }));
    expect(
      screen.getByRole("radio", { name: "Detached workspace" }),
    ).toBeChecked();
    expect(
      screen.queryByLabelText("Session workbench"),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Reattach workspace" }),
    );
    expect(screen.getByLabelText("Session workbench")).toBeVisible();

    await user.click(screen.getByRole("radio", { name: "External editor" }));
    expect(
      screen.queryByLabelText("Session workbench"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open in VS Code" }),
    ).toBeVisible();
  });

  it("restores focus after inspection close and approval resolution", async () => {
    const user = userEvent.setup();
    useClyStore.setState({
      agentSessionsMode: "chat",
      selectedAgentSessionId: "session-01",
    });
    const { rerender } = render(<AgentSessionsScreen />);

    const inspectTests = screen.getByRole("button", { name: "Inspect tests" });
    await user.click(inspectTests);
    await user.click(screen.getByRole("button", { name: "Close inspection" }));
    await waitFor(() => expect(inspectTests).toHaveFocus());

    useClyStore.getState().openAgentSession("session-02");
    rerender(<AgentSessionsScreen />);
    const approve = await screen.findByRole("button", { name: "Approve" });
    await user.click(approve);
    await waitFor(() =>
      expect(
        screen.getByRole("status", { name: "Approval approved" }),
      ).toHaveFocus(),
    );

    useClyStore.getState().updateAgentSession("session-02", (item) => ({
      ...item,
      approvals: item.approvals.map((approval) => ({
        ...approval,
        state: "pending",
      })),
      messages: item.messages.map((message) =>
        message.type === "approval"
          ? { ...message, status: "pending" }
          : message,
      ),
    }));
    rerender(<AgentSessionsScreen />);
    await user.click(await screen.findByRole("button", { name: "Reject" }));
    await waitFor(() =>
      expect(
        screen.getByRole("status", { name: "Approval rejected" }),
      ).toHaveFocus(),
    );
  });

  it("confirms destructive session actions in the canonical agent window", async () => {
    const user = userEvent.setup();
    useClyStore.setState({
      agentSessionsMode: "chat",
      selectedAgentSessionId: "session-01",
    });
    render(<AgentSessionsScreen />);

    const menuButton = document.querySelector(
      ".agent-session-menu summary",
    ) as HTMLElement;
    await user.click(menuButton);
    const stopItem = screen.getByRole("menuitem", { name: "Stop session" });
    await user.click(stopItem);
    expect(screen.getByRole("dialog", { name: "Stop session?" })).toBeVisible();
    expect(useClyStore.getState().data.agentSessions[0]?.status).not.toBe(
      "stopped",
    );
    await user.click(screen.getByRole("button", { name: "Stop session" }));
    expect(useClyStore.getState().data.agentSessions[0]?.status).toBe(
      "stopped",
    );
    await waitFor(() => expect(stopItem).toHaveFocus());
  });

  it("renders every declared task and connection fallback state truthfully", async () => {
    const session = useClyStore.getState().data.agentSessions[0];
    expect(session).toBeDefined();
    useClyStore.setState({
      agentSessionsMode: "chat",
      selectedAgentSessionId: session?.id,
    });
    render(<AgentSessionsScreen />);
    const updateState = (
      taskState: NonNullable<typeof session>["taskState"],
      connectionState: NonNullable<
        typeof session
      >["connectionState"] = "connected",
    ) =>
      useClyStore.getState().updateAgentSession(session?.id ?? "", (item) => ({
        ...item,
        connectionState,
        taskState,
      }));

    for (const [state, copy] of [
      ["first-run", "Task has not started"],
      ["empty", "No task activity yet"],
      ["loading", "Loading task state from Core"],
      ["awaiting-approval", "Awaiting approval"],
      ["canceled", "Task canceled"],
      ["unsupported", "unsupported on this machine"],
      ["interrupted-resumable", "can be resumed"],
    ] as const) {
      updateState(state);
      await waitFor(() =>
        expect(screen.getByRole("status")).toHaveTextContent(copy),
      );
    }
    expect(screen.getByRole("button", { name: "Resume task" })).toBeVisible();

    updateState("streaming", "offline");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Offline"),
    );
    updateState("streaming", "reconnecting");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Reconnecting"),
    );
    updateState("failed");
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Task failed"),
    );
    updateState("streaming");
    await waitFor(() =>
      expect(
        document.querySelector(".cly-dev-task-state"),
      ).not.toBeInTheDocument(),
    );
  });
});
