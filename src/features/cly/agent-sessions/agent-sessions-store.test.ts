import { beforeEach, describe, expect, it } from "vitest";
import { createFixtureRepository } from "../fixtures/repository";
import { useClyStore } from "../store/cly-store";
import type { NewAgentSessionInput } from "./types";

const newSession: NewAgentSessionInput = {
  title: "Trace the new result",
  objective: "Audit the result from claim through implementation and output.",
  provider: "openai",
  model: "gpt-5.6-sol",
  reasoningLevel: "Extra High",
  preset: "Claim Audit",
  contextPackName: "Claim Audit Pack",
  approvalPolicy: "Approve consequential actions",
  branchPreference: "agent/new-audit",
  usageBudget: "$10",
};

describe("Agent Sessions store", () => {
  beforeEach(() => {
    localStorage.clear();
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
    });
  });

  it("opens in Overview and rejects an invalid Chat session", () => {
    expect(useClyStore.getState().agentSessionsMode).toBe("overview");
    useClyStore.getState().setAgentSessionsMode("chat", "missing-session");
    expect(useClyStore.getState().agentSessionsMode).toBe("overview");
    expect(useClyStore.getState().selectedAgentSessionId).toBeNull();
  });

  it("persists mode, selection, filters, and sorting", () => {
    const store = useClyStore.getState();
    store.openAgentSession("session-01");
    store.setAgentSessionFilter("approvals");
    store.setAgentSessionSort("progress");

    const saved = JSON.parse(localStorage.getItem("cly-ui") ?? "{}");
    expect(saved).toMatchObject({
      agentSessionsMode: "chat",
      selectedAgentSessionId: "session-01",
      agentSessionFilter: "approvals",
      agentSessionSort: "progress",
    });
  });

  it("creates and opens a configured session", () => {
    const id = useClyStore.getState().createAgentSession(newSession, true);
    const state = useClyStore.getState();
    const session = state.data.agentSessions.find((item) => item.id === id);

    expect(state.agentSessionsMode).toBe("chat");
    expect(state.selectedAgentSessionId).toBe(id);
    expect(session?.orchestrator.model).toBe("gpt-5.6-sol");
    expect(session?.orchestrator.reasoningLevel).toBe("Extra High");
    expect(session?.branch).toBe("agent/new-audit");
  });

  it("persists drafts and appends transcript messages", () => {
    const store = useClyStore.getState();
    store.setAgentSessionDraft("session-01", "Keep the claim scope narrow");
    store.appendAgentMessage("session-01", {
      id: "message-test",
      type: "user",
      author: "You",
      body: "Keep the claim scope narrow",
      timestamp: "Now",
    });

    const session = useClyStore
      .getState()
      .data.agentSessions.find((item) => item.id === "session-01");
    expect(session?.draft).toBe("Keep the claim scope narrow");
    expect(session?.messages.at(-1)?.id).toBe("message-test");
    expect(
      JSON.parse(localStorage.getItem("cly-ui") ?? "{}").agentSessionLayouts[
        "session-01"
      ].draft,
    ).toBe("Keep the claim scope narrow");
  });

  it("opens, activates, duplicates, pins, reorders, and closes tabs", () => {
    const store = useClyStore.getState();
    store.openWorkbenchTab("session-01", "browser");
    const browser = useClyStore
      .getState()
      .data.agentSessions[0]?.workbenchTabs.find(
        (tab) => tab.type === "browser",
      );
    expect(browser).toBeDefined();
    if (!browser) return;

    store.activateWorkbenchTab("session-01", browser.id);
    store.duplicateWorkbenchTab("session-01", browser.id);
    let session = useClyStore.getState().data.agentSessions[0];
    const copy = session?.workbenchTabs.find((tab) =>
      tab.title.endsWith("copy"),
    );
    expect(copy).toBeDefined();
    if (!session || !copy) return;

    store.toggleWorkbenchTabPin("session-01", copy.id);
    store.reorderWorkbenchTab(
      "session-01",
      session.workbenchTabs.findIndex((tab) => tab.id === copy.id),
      0,
    );
    session = useClyStore.getState().data.agentSessions[0];
    expect(session?.workbenchTabs[0]?.id).toBe(copy.id);
    store.toggleWorkbenchTabPin("session-01", copy.id);
    store.closeWorkbenchTab("session-01", copy.id);
    expect(
      useClyStore
        .getState()
        .data.agentSessions[0]?.workbenchTabs.some((tab) => tab.id === copy.id),
    ).toBe(false);
  });

  it("persists workbench collapse, maximize, and split width", () => {
    const store = useClyStore.getState();
    store.toggleWorkbench("session-01");
    store.toggleWorkbenchMaximized("session-01");
    store.setWorkbenchWidth("session-01", 52);
    const session = useClyStore.getState().data.agentSessions[0];

    expect(session?.workbenchCollapsed).toBe(false);
    expect(session?.workbenchMaximized).toBe(true);
    expect(session?.workbenchWidth).toBe(52);
  });

  it("updates full delegated-agent configuration and state", () => {
    useClyStore
      .getState()
      .updateDelegatedAgent("session-01", "agent-implementation", {
        provider: "anthropic",
        model: "opus",
        reasoningLevel: "Max",
        status: "paused",
      });
    const agent = useClyStore
      .getState()
      .data.agentSessions[0]?.delegatedAgents.find(
        (item) => item.id === "agent-implementation",
      );
    expect(agent).toMatchObject({
      provider: "anthropic",
      model: "opus",
      reasoningLevel: "Max",
      status: "paused",
    });
  });

  it("resolves approvals and preserves background sessions across modes", () => {
    const store = useClyStore.getState();
    store.openAgentSession("session-02");
    store.setAgentSessionsMode("overview");
    store.resolveAgentApproval("session-02", "approval-compute", "approved");
    const session = useClyStore
      .getState()
      .data.agentSessions.find((item) => item.id === "session-02");
    expect(useClyStore.getState().agentSessionsMode).toBe("overview");
    expect(session?.status).toBe("running");
    expect(session?.approvals[0]?.state).toBe("approved");
  });
});
