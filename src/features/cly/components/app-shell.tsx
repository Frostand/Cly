import { useEffect, useRef, useState } from "react";
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
import { ObjectivesScreen } from "../screens/objectives";
import { ClyOnboardingScreen } from "../screens/onboarding-route";
import { OverviewScreen } from "../screens/overview";
import {
  DevWorkspaceScreen,
  ReviewerCapsulesScreen,
} from "../screens/platform-workspaces";
import {
  ClaimsScreen,
  CodeLinkerScreen,
  LiteratureScreen,
  NotebooksScreen,
  SourcesScreen,
} from "../screens/research-workspaces";
import { SetupHelpScreen } from "../screens/setup-help";
import {
  IntegrationsScreen,
  ModelsAgentsScreen,
  SettingsScreen,
} from "../screens/system";
import { loadOnboardingDraft } from "../services/onboarding-storage";
import { isClyDemoRuntime } from "../services/runtime";
import { useClyStore } from "../store/cly-store";
import { useClyDataBootstrap } from "../store/use-cly-data-bootstrap";
import { ActivityDrawer, CommandPalette, Titlebar, Toasts } from "./chrome";
import { Inspector } from "./inspector";
import { Sidebar, WorkspaceNavigationBar } from "./navigation";
import { PrImpactReviewScreen } from "./pr-impact-review/pr-impact-review";
import { LoadingState } from "./primitives";
import { ClyMotionProvider, RouteTransition } from "./visuals";

const screens: Record<ScreenId, () => React.JSX.Element> = {
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
  dev: DevWorkspaceScreen,
  integrations: IntegrationsScreen,
  models: ModelsAgentsScreen,
  help: SetupHelpScreen,
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

function runMenuCommand(command: string) {
  const store = useClyStore.getState();
  const screenCommands: Record<string, ScreenId> = {
    "new-claim": "claims",
    "new-experiment": "experiments",
    "new-decision": "decisions",
    "import-sources": "sources",
    "import-notebook": "notebooks",
    "context-composer": "context",
    "configure-agents": "models",
    "claim-audit": "claims",
    "data-obligations": "obligations",
    "code-review": "code",
    "run-audit": "reproducibility",
    "generate-next-steps": "next-steps",
    "manage-integrations": "integrations",
    "notebooklm-bundle": "literature",
    "new-agent-session": "agents",
    settings: "settings",
  };
  if (screenCommands[command]) store.setScreen(screenCommands[command]);
  if (command === "new-agent-session") store.setNewAgentSessionOpen(true);
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
  if (command === "reset-layout")
    useClyStore.setState({
      sidebarCollapsed: false,
      inspectorOpen: true,
      activityOpen: false,
    });
  if (
    ["documentation", "shortcuts", "diagnostics", "about"].includes(command)
  ) {
    if (command === "documentation") store.setScreen("help");
    if (command === "shortcuts" || command === "diagnostics")
      store.setScreen("settings");
    if (command === "about") store.notify("Cly 0.5.0");
  }
}

export function ClyAppShell() {
  const bootstrapStatus = useClyDataBootstrap();
  const activeScreen = useClyStore((s) => s.activeScreen);
  const activeProduct = useClyStore((s) => s.activeProduct);
  const sidebarCollapsed = useClyStore((s) => s.sidebarCollapsed);
  const inspectorOpen = useClyStore((s) => s.inspectorOpen);
  const selectedId = useClyStore((s) => s.selectedId);
  const agentSessionsMode = useClyStore((s) => s.agentSessionsMode);
  const fixtureMode = useClyStore((s) => s.fixtureMode);
  const projects = useClyStore((s) => s.data.projects);
  const onboardingRequested = useClyStore((s) => s.onboardingRequested);
  const activeProjectId = useClyStore((s) => s.activeProjectId);
  const activeDevSection = useClyStore((s) => s.activeDevSection);
  const selectedAgentSessionId = useClyStore((s) => s.selectedAgentSessionId);
  const setScreen = useClyStore((s) => s.setScreen);
  const ActiveScreen = screens[activeScreen];
  const applyingDeepLink = useRef(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState<
    boolean | null
  >(null);
  const activeProject = projects.find(
    (project) => project.id === activeProjectId,
  );
  const onboardingRequired =
    !isClyDemoRuntime &&
    bootstrapStatus === "ready" &&
    (onboardingRequested !== null ||
      !activeProject ||
      onboardingCompleted !== true);

  useEffect(() => {
    if (
      isClyDemoRuntime ||
      bootstrapStatus !== "ready" ||
      onboardingRequested !== null ||
      !activeProject
    ) {
      setOnboardingCompleted(null);
      return;
    }

    let cancelled = false;
    setOnboardingCompleted(null);
    void loadOnboardingDraft(activeProjectId || null)
      .then((draft) => {
        if (!cancelled) setOnboardingCompleted(draft.completed);
      })
      .catch(() => {
        // The onboarding screen owns the actionable retry UI. Treat a failed
        // gate read as incomplete so a durable-load failure cannot unlock Cly.
        if (!cancelled) setOnboardingCompleted(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProject, activeProjectId, bootstrapStatus, onboardingRequested]);

  useEffect(() => {
    if (navigator.userAgent.includes("jsdom")) return;
    const applyDeepLink = () => {
      if (!window.location.hash.startsWith("#/cly/")) return;
      const [path, query = ""] = window.location.hash.slice(2).split("?");
      const [, product, destination] = path.split("/");
      const params = new URLSearchParams(query);
      const state = useClyStore.getState();
      applyingDeepLink.current = true;
      const projectId = params.get("project");
      if (
        projectId &&
        projectId !== state.activeProjectId &&
        state.data.projects.some((project) => project.id === projectId)
      ) {
        state.setActiveProject(projectId);
      }
      if (product === "dev") {
        const devSections = [
          "board",
          "projects",
          "repositories",
          "features",
          "issues",
          "sessions",
          "agents",
          "machines",
          "pull-requests",
          "tests",
          "context",
          "settings",
        ] as const;
        if (devSections.includes(destination as (typeof devSections)[number]))
          state.setDevSection(destination as (typeof devSections)[number]);
      } else if (product === "research" && destination in screens) {
        state.setScreen(destination as ScreenId);
        const selected = params.get("selected");
        if (selected) state.setSelected(selected);
      }
      const session = params.get("session");
      if (
        session &&
        state.data.agentSessions.some((item) => item.id === session)
      )
        state.openAgentSession(session);
      requestAnimationFrame(() => {
        applyingDeepLink.current = false;
      });
    };
    applyDeepLink();
    window.addEventListener("hashchange", applyDeepLink);
    return () => window.removeEventListener("hashchange", applyDeepLink);
  }, []);

  useEffect(() => {
    if (applyingDeepLink.current) return;
    const destination =
      activeProduct === "dev" ? activeDevSection : activeScreen;
    const params = new URLSearchParams({ project: activeProjectId });
    if (activeProduct === "research" && selectedId)
      params.set("selected", selectedId);
    if (selectedAgentSessionId) params.set("session", selectedAgentSessionId);
    const nextHash = `#/cly/${activeProduct}/${destination}?${params.toString()}`;
    if (window.location.hash !== nextHash)
      window.history.replaceState(null, "", nextHash);
  }, [
    activeDevSection,
    activeProduct,
    activeProjectId,
    activeScreen,
    selectedAgentSessionId,
    selectedId,
  ]);

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

  if (!isClyDemoRuntime && bootstrapStatus === "loading") {
    return (
      <ClyMotionProvider>
        <main className="cly-app">
          <Titlebar />
          <div className="cly-onboarding-boot">
            <LoadingState label="Loading local projects" />
          </div>
        </main>
      </ClyMotionProvider>
    );
  }

  if (
    !isClyDemoRuntime &&
    bootstrapStatus === "ready" &&
    onboardingRequested === null &&
    activeProject &&
    onboardingCompleted === null
  ) {
    return (
      <ClyMotionProvider>
        <main className="cly-app">
          <Titlebar />
          <div className="cly-onboarding-boot">
            <LoadingState label="Loading saved setup" />
          </div>
        </main>
      </ClyMotionProvider>
    );
  }

  if (onboardingRequired) {
    return (
      <ClyMotionProvider>
        <main className="cly-app">
          <Titlebar />
          <ClyOnboardingScreen
            onCompleted={() => setOnboardingCompleted(true)}
          />
          <Toasts />
        </main>
      </ClyMotionProvider>
    );
  }

  return (
    <ClyMotionProvider>
      <main className="cly-app">
        <Titlebar />
        {fixtureMode !== "empty" && fixtureMode !== "loading" ? (
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
            Demo data · These are simulated records, not project research.
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
            <WorkspaceNavigationBar />
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
