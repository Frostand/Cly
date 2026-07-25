import { useEffect } from "react";
import { CLY_MENU_COMMANDS } from "../../../../electron/menu-commands.js";
import { AgentSessionsScreen } from "../agent-sessions";
import type { ScreenId } from "../domain/types";
import { ContextScreen } from "../screens/context";
import { CostLedgerScreen } from "../screens/cost-ledger";
import { DataObligationsScreen } from "../screens/data-obligations";
import { ExperimentsScreen, GraphScreen } from "../screens/experiments-graph";
import {
  DecisionsScreen,
  NextStepsScreen,
  ProvenanceScreen,
  ReproducibilityScreen,
} from "../screens/integrity";
import { LiveDevWorkspaceScreen } from "../screens/live-dev-workspace";
import { OverviewScreen } from "../screens/overview";
import {
  ObjectivesScreen,
  ReviewerCapsulesScreen,
} from "../screens/platform-workspaces";
import {
  ClaimsScreen,
  CodeLinkerScreen,
  LiteratureScreen,
  NotebooksScreen,
  SourcesScreen,
} from "../screens/research-workspaces";
import {
  IntegrationsScreen,
  ModelsAgentsScreen,
  SettingsScreen,
} from "../screens/system";
import { isClyDemoRuntime } from "../services/runtime";
import { useClyStore } from "../store/cly-store";
import { useClyDataBootstrap } from "../store/use-cly-data-bootstrap";
import { ActivityDrawer, CommandPalette, Titlebar, Toasts } from "./chrome";
import { Inspector } from "./inspector";
import { Sidebar } from "./navigation";
import { PrImpactReviewScreen } from "./pr-impact-review/pr-impact-review";
import { LoadingState } from "./primitives";
import { ClyMotionProvider, RouteTransition } from "./visuals";

export const screens: Record<ScreenId, () => React.JSX.Element> = {
  overview: OverviewScreen,
  objectives: ObjectivesScreen,
  agents: AgentSessionsScreen,
  context: ContextScreen,
  graph: GraphScreen,
  experiments: ExperimentsScreen,
  costs: CostLedgerScreen,
  sources: SourcesScreen,
  literature: LiteratureScreen,
  notebooks: NotebooksScreen,
  code: CodeLinkerScreen,
  claims: ClaimsScreen,
  obligations: DataObligationsScreen,
  provenance: ProvenanceScreen,
  reproducibility: ReproducibilityScreen,
  "impact-review": PrImpactReviewScreen,
  decisions: DecisionsScreen,
  "next-steps": NextStepsScreen,
  "reviewer-capsules": ReviewerCapsulesScreen,
  dev: LiveDevWorkspaceScreen,
  integrations: IntegrationsScreen,
  models: ModelsAgentsScreen,
  settings: SettingsScreen,
};

const shortcutScreens: Record<string, ScreenId> = {
  "1": "overview",
  "2": "agents",
  "3": "context",
  "4": "graph",
  "5": "experiments",
  "6": "claims",
};

export function runMenuCommand(command: string) {
  if (!CLY_MENU_COMMANDS.includes(command)) return false;
  const store = useClyStore.getState();
  const screenCommands: Record<string, ScreenId> = {
    "open-research-brief": "overview",
    "open-claims": "claims",
    "open-experiments": "experiments",
    "open-decisions": "decisions",
    "open-sources": "sources",
    "context-composer": "context",
    "configure-agents": "models",
    "open-reproducibility": "reproducibility",
    "open-next-steps": "next-steps",
    "open-integrations": "integrations",
    "open-literature": "literature",
    settings: "settings",
  };
  if (screenCommands[command]) store.setScreen(screenCommands[command]);
  if (command === "agent-sessions-overview")
    store.setAgentSessionsMode("overview");
  if (command === "agent-sessions-chat") store.setAgentSessionsMode("chat");
  if (command === "agent-approvals") {
    store.setAgentSessionFilter("approvals");
    store.setAgentSessionsMode("overview");
  }
  if (command.startsWith("agent-tab-") && store.selectedAgentSessionId) {
    const type = command.slice("agent-tab-".length) as
      | "browser"
      | "terminal"
      | "diff"
      | "agents"
      | "live-files";
    store.openWorkbenchTab(store.selectedAgentSessionId, type);
    store.setAgentSessionsMode("chat", store.selectedAgentSessionId);
  }
  if (command === "agent-toggle-workbench" && store.selectedAgentSessionId)
    store.toggleWorkbench(store.selectedAgentSessionId);
  if (command === "toggle-sidebar") store.toggleSidebar();
  if (command === "toggle-inspector") store.toggleInspector();
  if (command === "toggle-activity") store.toggleActivity();
  if (command === "command-palette") store.setCommandPaletteOpen(true);
  if (command === "project-switcher") store.setProjectSwitcherOpen(true);
  if (command === "focus-search") {
    document.querySelector<HTMLElement>("[data-search-input]")?.focus();
  }
  if (command === "reset-layout")
    useClyStore.setState({
      sidebarCollapsed: false,
      inspectorOpen: true,
      activityOpen: false,
    });
  if (["shortcuts", "diagnostics"].includes(command)) {
    store.setScreen("settings");
  }
  return true;
}

export function ClyAppShell() {
  useClyDataBootstrap();
  const activeScreen = useClyStore((s) => s.activeScreen);
  const activeProduct = useClyStore((s) => s.activeProduct);
  const sidebarCollapsed = useClyStore((s) => s.sidebarCollapsed);
  const inspectorOpen = useClyStore((s) => s.inspectorOpen);
  const selectedId = useClyStore((s) => s.selectedId);
  const agentSessionsMode = useClyStore((s) => s.agentSessionsMode);
  const fixtureMode = useClyStore((s) => s.fixtureMode);
  const setScreen = useClyStore((s) => s.setScreen);
  const ActiveScreen = screens[activeScreen];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        useClyStore.getState().setCommandPaletteOpen(true);
        return;
      }
      if (meta && event.shiftKey && event.key.toLowerCase() === "o") {
        event.preventDefault();
        useClyStore.getState().setProjectSwitcherOpen(true);
        return;
      }
      if (meta && event.shiftKey && event.key.toLowerCase() === "c") {
        event.preventDefault();
        useClyStore.getState().setAgentSessionsMode("chat");
        return;
      }
      if (meta && event.altKey && event.key.toLowerCase() === "i") {
        event.preventDefault();
        useClyStore.getState().toggleInspector();
        return;
      }
      if (meta && event.key.toLowerCase() === "j") {
        event.preventDefault();
        useClyStore.getState().toggleActivity();
        return;
      }
      if (meta && event.key === "\\") {
        event.preventDefault();
        useClyStore.getState().toggleSidebar();
        return;
      }
      if (meta && event.key === ",") {
        event.preventDefault();
        setScreen("settings");
        return;
      }
      if (meta && shortcutScreens[event.key]) {
        event.preventDefault();
        setScreen(shortcutScreens[event.key]);
        return;
      }
      if (meta && event.key.toLowerCase() === "f") {
        const search = document.querySelector<HTMLElement>(
          "[data-search-input]",
        );
        if (search) {
          event.preventDefault();
          search.focus();
        }
        return;
      }
      if (event.key === "Escape") {
        // Radix dialogs own Escape while they are open. Letting the shell also
        // handle the same key clears the underlying route selection and steals
        // focus before Radix can restore it to the dialog trigger.
        if (
          event.defaultPrevented ||
          document.querySelector('[role="dialog"][data-state="open"]')
        ) {
          return;
        }
        const openDetails =
          document.querySelector<HTMLDetailsElement>("details[open]");
        if (openDetails) {
          openDetails.open = false;
          return;
        }
        const state = useClyStore.getState();
        if (state.commandPaletteOpen) state.setCommandPaletteOpen(false);
        else if (state.projectSwitcherOpen) state.setProjectSwitcherOpen(false);
        else if (state.fixtureSwitcherOpen) state.setFixtureSwitcherOpen(false);
        else {
          if (state.selectedId) {
            document.getElementById("main-workspace")?.focus();
          }
          state.setSelected(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setScreen]);

  useEffect(() => {
    const desktop = (
      window as Window & {
        dream?: {
          onClyCommand?: (listener: (command: string) => void) => () => void;
        };
      }
    ).dream;
    return desktop?.onClyCommand?.(runMenuCommand);
  }, []);

  return (
    <ClyMotionProvider>
      <main className="cly-app">
        <Titlebar />
        {isClyDemoRuntime &&
        fixtureMode !== "empty" &&
        fixtureMode !== "loading" ? (
          <div
            role="status"
            style={{
              background: "var(--cly-danger-soft)",
              borderBottom: "1px solid var(--cly-danger)",
              color: "var(--cly-text)",
              fontSize: 12,
              fontWeight: 700,
              padding: "6px 12px",
              textAlign: "center",
            }}
          >
            {fixtureMode === "guided"
              ? "Guided demo · No results are loaded; enter the research inputs to begin."
              : "Demo project · Results reproduce official CDC data; workflow records are fixtures."}
          </div>
        ) : !isClyDemoRuntime ? (
          <div className="cly-beta-banner" role="status">
            Cly Open Beta · Local research data only · Do not use sensitive or
            regulated data
          </div>
        ) : null}
        <div
          className="cly-shell"
          data-product={activeProduct}
          data-sidebar={sidebarCollapsed ? "collapsed" : "expanded"}
          data-inspector={
            inspectorOpen && selectedId && activeScreen !== "agents"
              ? "open"
              : "closed"
          }
          data-agent-mode={
            activeScreen === "agents" ? agentSessionsMode : undefined
          }
        >
          <Sidebar />
          <section className="cly-workspace">
            <div className="cly-screen" id="main-workspace" tabIndex={-1}>
              {fixtureMode === "loading" ? (
                <div className="cly-page">
                  <LoadingState
                    label={`Loading ${activeScreen.replace("-", " ")}`}
                  />
                </div>
              ) : (
                <RouteTransition route={activeScreen}>
                  <ActiveScreen />
                </RouteTransition>
              )}
            </div>
            <ActivityDrawer />
          </section>
          {activeScreen !== "agents" && inspectorOpen && selectedId ? (
            <Inspector />
          ) : null}
        </div>
        <CommandPalette />
        <Toasts />
      </main>
    </ClyMotionProvider>
  );
}
