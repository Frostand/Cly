import { useEffect } from "react";
import type { ScreenId } from "../domain/types";
import { ContextScreen } from "../screens/context";
import { ExperimentsScreen, GraphScreen } from "../screens/experiments-graph";
import {
  DecisionsScreen,
  NextStepsScreen,
  ProvenanceScreen,
  ReproducibilityScreen,
} from "../screens/integrity";
import { OverviewScreen } from "../screens/overview";
import {
  ClaimsScreen,
  CodeLinkerScreen,
  LiteratureScreen,
  NotebooksScreen,
  SourcesScreen,
} from "../screens/research-workspaces";
import {
  AgentSessionsScreen,
  IntegrationsScreen,
  ModelsAgentsScreen,
  SettingsScreen,
} from "../screens/system";
import { useClyStore } from "../store/cly-store";
import { ActivityDrawer, CommandPalette, Titlebar, Toasts } from "./chrome";
import { Inspector } from "./inspector";
import { Sidebar } from "./navigation";
import { LoadingState } from "./primitives";

const screens: Record<ScreenId, () => React.JSX.Element> = {
  overview: OverviewScreen,
  agents: AgentSessionsScreen,
  context: ContextScreen,
  graph: GraphScreen,
  experiments: ExperimentsScreen,
  sources: SourcesScreen,
  literature: LiteratureScreen,
  notebooks: NotebooksScreen,
  code: CodeLinkerScreen,
  claims: ClaimsScreen,
  provenance: ProvenanceScreen,
  reproducibility: ReproducibilityScreen,
  decisions: DecisionsScreen,
  "next-steps": NextStepsScreen,
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
    "code-review": "code",
    "run-audit": "reproducibility",
    "generate-next-steps": "next-steps",
    "manage-integrations": "integrations",
    "notebooklm-bundle": "literature",
    settings: "settings",
  };
  if (screenCommands[command]) store.setScreen(screenCommands[command]);
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
    if (command === "shortcuts" || command === "diagnostics")
      store.setScreen("settings");
    store.notify(
      command === "about" ? "Cly 0.5.0" : `Open ${command}`,
      command === "documentation"
        ? "Documentation is available in the repository docs directory."
        : undefined,
    );
  }
}

export function ClyAppShell() {
  const activeScreen = useClyStore((s) => s.activeScreen);
  const sidebarCollapsed = useClyStore((s) => s.sidebarCollapsed);
  const inspectorOpen = useClyStore((s) => s.inspectorOpen);
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
        const state = useClyStore.getState();
        if (state.commandPaletteOpen) state.setCommandPaletteOpen(false);
        else if (state.projectSwitcherOpen) state.setProjectSwitcherOpen(false);
        else if (state.fixtureSwitcherOpen) state.setFixtureSwitcherOpen(false);
        else state.setSelected(null);
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
    <main className="cly-app">
      <Titlebar />
      <div
        className="cly-shell"
        data-sidebar={sidebarCollapsed ? "collapsed" : "expanded"}
        data-inspector={inspectorOpen ? "open" : "closed"}
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
              <ActiveScreen />
            )}
          </div>
          <ActivityDrawer />
        </section>
        <Inspector />
      </div>
      <CommandPalette />
      <Toasts />
    </main>
  );
}
