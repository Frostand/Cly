import {
  Activity,
  Archive,
  Beaker,
  BookOpen,
  Bot,
  Boxes,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  CircleGauge,
  ClipboardCheck,
  Code2,
  FileStack,
  GitBranch,
  GitPullRequest,
  Goal,
  HardDrive,
  Library,
  ListChecks,
  PackageCheck,
  PanelLeftClose,
  PanelLeftOpen,
  PanelsTopLeft,
  Plug,
  Plus,
  ScrollText,
  Settings,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import type { ComponentType } from "react";
import { useIdeStore } from "../../../components/ide/ide-store";
import { getDesktopApi } from "../../../lib/electron";
import type { DevSection, ScreenId } from "../domain/types";
import routeManifest from "../route-manifest.json";
import { isClyDemoRuntime } from "../services/runtime";
import { useClyStore } from "../store/cly-store";
import { ClyLogo, ThemeSwitcher } from "./brand";

interface NavigationItem {
  id: ScreenId;
  label: string;
  ariaLabel?: string;
  icon: ComponentType<{ size?: number }>;
  count?: (
    state: ReturnType<typeof useClyStore.getState>,
  ) => number | undefined;
}

const researchGroups: { label: string; items: NavigationItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { id: "overview", label: "Research Loop", icon: CircleGauge },
      { id: "objectives", label: "Objectives", icon: Goal },
      {
        id: "agents",
        label: "Agent Sessions",
        icon: Bot,
        count: (s) =>
          s.data.agentSessions.filter(
            (x) => x.status === "running" || x.status === "waiting_approval",
          ).length,
      },
      {
        id: "context",
        label: "Context",
        icon: BrainCircuit,
        count: (s) => s.data.contextItems.filter((x) => x.included).length,
      },
    ],
  },
  {
    label: "Research",
    items: [
      { id: "graph", label: "Research Graph", icon: GitBranch },
      {
        id: "experiments",
        label: "Experiments",
        icon: Beaker,
        count: (s) => s.data.experiments.length,
      },
      {
        id: "costs",
        label: "Costs",
        icon: WalletCards,
        count: (s) => s.costLedger.waste.entryCount,
      },
      {
        id: "sources",
        label: "Sources",
        icon: Library,
        count: (s) => s.data.sources.length,
      },
      { id: "literature", label: "Literature", icon: BookOpen },
      ...(__CLY_INCLUDE_DEMOS__ && isClyDemoRuntime
        ? [
            {
              id: "notebooks" as const,
              label: "Notebooks",
              icon: Code2,
              count: (s: ReturnType<typeof useClyStore.getState>) =>
                s.data.notebooks.length,
            },
            { id: "code" as const, label: "Code Linker", icon: Code2 },
          ]
        : []),
      {
        id: "claims",
        label: "Claims",
        icon: ScrollText,
        count: (s) =>
          s.data.claims.filter((x) =>
            ["Weak", "Unsupported", "Needs review"].includes(x.status),
          ).length,
      },
    ],
  },
  {
    label: "Integrity",
    items: [
      {
        id: "obligations",
        label: "Data Obligations",
        icon: ShieldCheck,
        count: (s) =>
          s.obligationAlerts.filter((alert) => alert.state === "open").length,
      },
      { id: "provenance", label: "Provenance", icon: FileStack },
      {
        id: "reproducibility",
        label: "Reproducibility",
        icon: ClipboardCheck,
        count: (s) => s.data.findings.filter((x) => x.status === "Open").length,
      },
      { id: "impact-review", label: "Impact Review", icon: GitPullRequest },
      { id: "decisions", label: "Decisions", icon: Archive },
      {
        id: "next-steps",
        label: "Next Steps",
        icon: ListChecks,
        count: (s) =>
          s.data.nextSteps.filter((x) => x.status === "Recommended").length,
      },
      {
        id: "reviewer-capsules",
        label: "Reviewer Capsules",
        ariaLabel: "Reviewer evidence packages",
        icon: PackageCheck,
      },
    ],
  },
  {
    label: "System",
    items: [
      { id: "integrations", label: "Integrations", icon: Boxes },
      { id: "models", label: "Models & Agents", icon: Activity },
      { id: "settings", label: "Settings", icon: Settings },
    ],
  },
];

interface DevNavigationItem {
  id: DevSection;
  label: string;
  icon: ComponentType<{ size?: number }>;
  count?: (
    state: ReturnType<typeof useClyStore.getState>,
  ) => number | undefined;
}

const devGroups: { label: string; items: DevNavigationItem[] }[] = [
  {
    label: "Workspace",
    items: [{ id: "projects", label: "AI Workspace", icon: PanelsTopLeft }],
  },
  {
    label: "Configure",
    items: [
      { id: "agents", label: "AI Providers", icon: Plug },
      { id: "settings", label: "Workspace Settings", icon: Settings },
    ],
  },
];

export const screenLabels = Object.fromEntries(
  routeManifest.map((route) => [route.id, route.label]),
) as Record<ScreenId, string>;

export function Sidebar() {
  const activeScreen = useClyStore((s) => s.activeScreen);
  const activeProduct = useClyStore((s) => s.activeProduct);
  const activeDevSection = useClyStore((s) => s.activeDevSection);
  const sidebarCollapsed = useClyStore((s) => s.sidebarCollapsed);
  const setScreen = useClyStore((s) => s.setScreen);
  const setProductArea = useClyStore((s) => s.setProductArea);
  const setDevSection = useClyStore((s) => s.setDevSection);
  const toggleSidebar = useClyStore((s) => s.toggleSidebar);
  const state = useClyStore();
  const openDevDestination = (section: DevSection) => {
    setDevSection(section);
    const ide = useIdeStore.getState();
    if (section === "agents") {
      ide.setSettingsSection("providers");
      ide.setSettingsOpen(true);
    } else if (section === "settings") {
      ide.setSettingsSection("appearance");
      ide.setSettingsOpen(true);
    } else {
      ide.setSettingsOpen(false);
    }
  };

  return (
    <aside className="cly-sidebar" aria-label="Main navigation">
      <div className="cly-sidebar-brand">
        <ClyLogo compact={sidebarCollapsed} />
      </div>
      <fieldset className="cly-product-switcher">
        <legend className="cly-sr-only">Cly product area</legend>
        <button
          type="button"
          aria-pressed={activeProduct === "research"}
          aria-label="Cly Research"
          title={sidebarCollapsed ? "Cly Research" : undefined}
          onClick={() => {
            useIdeStore.getState().setSettingsOpen(false);
            setProductArea("research");
          }}
          data-testid="product-research"
        >
          <Library size={14} />
          <span>Research</span>
        </button>
        <button
          type="button"
          aria-pressed={activeProduct === "dev"}
          aria-label="Cly Dev"
          title={sidebarCollapsed ? "Cly Dev" : undefined}
          onClick={() => setProductArea("dev")}
          data-testid="product-dev"
        >
          <Code2 size={14} />
          <span>Dev</span>
        </button>
      </fieldset>
      <div className="cly-sidebar-scroll">
        {activeProduct === "research"
          ? researchGroups.map((group) => (
              <nav
                className="cly-sidebar-group"
                key={group.label}
                aria-label={group.label}
              >
                {!sidebarCollapsed ? (
                  <div className="cly-sidebar-group-label">{group.label}</div>
                ) : null}
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const count = item.count?.(state);
                  return (
                    <button
                      type="button"
                      className="cly-sidebar-item"
                      aria-current={
                        activeScreen === item.id ? "page" : undefined
                      }
                      aria-label={item.ariaLabel ?? item.label}
                      title={sidebarCollapsed ? item.label : undefined}
                      onClick={() => setScreen(item.id)}
                      key={item.id}
                      data-testid={`nav-${item.id}`}
                    >
                      <Icon size={15} />
                      <span className="cly-sidebar-item-label">
                        {item.label}
                      </span>
                      {count ? (
                        <span className="cly-nav-count">
                          {count > 999 ? "999+" : count}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </nav>
            ))
          : devGroups.map((group) => (
              <nav
                className="cly-sidebar-group"
                key={group.label}
                aria-label={group.label}
              >
                {!sidebarCollapsed ? (
                  <div className="cly-sidebar-group-label">{group.label}</div>
                ) : null}
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const count = item.count?.(state);
                  const active =
                    (activeScreen === "dev" && activeDevSection === item.id) ||
                    (activeScreen === "agents" && item.id === "sessions");
                  return (
                    <button
                      type="button"
                      className="cly-sidebar-item"
                      aria-current={active ? "page" : undefined}
                      aria-label={item.label}
                      title={sidebarCollapsed ? item.label : undefined}
                      onClick={() => openDevDestination(item.id)}
                      key={item.id}
                      data-testid={`nav-dev-${item.id}`}
                    >
                      <Icon size={15} />
                      <span className="cly-sidebar-item-label">
                        {item.label}
                      </span>
                      {count ? (
                        <span className="cly-nav-count">
                          {count > 999 ? "999+" : count}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </nav>
            ))}
      </div>
      <div className="cly-sidebar-footer">
        <ThemeSwitcher compact={sidebarCollapsed} />
        {activeProduct === "dev" ? (
          <button
            className="cly-sidebar-item"
            type="button"
            onClick={() =>
              useClyStore
                .getState()
                .notify(
                  "Local workspace",
                  "Folder access stays unavailable until you choose a local project directory.",
                )
            }
            aria-label="Local workspace status"
          >
            <HardDrive size={15} />
            <span className="cly-sidebar-item-label">This device</span>
          </button>
        ) : null}
        <button
          className="cly-sidebar-item"
          type="button"
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          data-testid="toggle-sidebar"
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen size={15} />
          ) : (
            <PanelLeftClose size={15} />
          )}
          <span className="cly-sidebar-item-label">
            {sidebarCollapsed ? "Expand" : "Collapse sidebar"}
          </span>
          {!sidebarCollapsed ? <span className="cly-kbd">⌘\</span> : null}
        </button>
      </div>
    </aside>
  );
}

export function ProjectSwitcherButton() {
  const project = useClyStore(
    (s) =>
      s.data.projects.find((item) => item.id === s.activeProjectId) ??
      s.data.projects[0],
  );
  const setOpen = useClyStore((s) => s.setProjectSwitcherOpen);
  if (!project) return null;
  return (
    <button
      className="cly-project-button cly-no-drag"
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Switch project"
      data-testid="project-switcher"
    >
      <span className="cly-project-mark">
        <ClyLogo compact />
      </span>
      <span className="cly-project-meta">
        <span className="cly-project-name">{project.name}</span>
        <span className="cly-project-path">{project.path}</span>
      </span>
      <ChevronDown size={13} className="cly-faint" />
    </button>
  );
}

export function ProjectSwitcherPopover() {
  const open = useClyStore((s) => s.projectSwitcherOpen);
  const projects = useClyStore((s) => s.data.projects);
  const activeProjectId = useClyStore((s) => s.activeProjectId);
  const setProject = useClyStore((s) => s.setActiveProject);
  const setOpen = useClyStore((s) => s.setProjectSwitcherOpen);
  const createProject = useClyStore((s) => s.createResearchProject);
  if (!open) return null;
  return (
    <>
      <button
        className="cly-overlay"
        type="button"
        style={{
          background: "transparent",
          backdropFilter: "none",
          padding: 0,
        }}
        aria-label="Close project switcher"
        onClick={() => setOpen(false)}
      />
      <div
        className="cly-popover cly-project-popover"
        role="dialog"
        aria-label="Project switcher"
      >
        <div className="cly-command-group-label">Recent projects</div>
        {projects.map((project) => (
          <button
            key={project.id}
            className="cly-popover-item"
            data-active={project.id === activeProjectId}
            type="button"
            onClick={() => setProject(project.id)}
          >
            <span className="cly-project-mark">{project.name.slice(0, 1)}</span>
            <span className="cly-project-meta">
              <span className="cly-project-name">{project.name}</span>
              <span className="cly-project-path">{project.path}</span>
            </span>
            {project.id === activeProjectId ? (
              <CheckCircle2 size={14} className="cly-faint" />
            ) : null}
          </button>
        ))}
        <div className="cly-divider" style={{ margin: "5px 4px" }} />
        <button
          className="cly-popover-item"
          type="button"
          data-testid="new-local-project"
          onClick={() => {
            const desktopApi = getDesktopApi();
            if (!desktopApi) {
              useClyStore
                .getState()
                .notify(
                  "Desktop app required",
                  "Open Cly in the desktop app to select a local project folder.",
                );
              return;
            }
            void desktopApi
              .pickProjectDirectory()
              .then((selectedPath) => {
                if (!selectedPath) return null;
                return createProject(selectedPath);
              })
              .then((project) => {
                if (!project) return;
                useClyStore
                  .getState()
                  .notify(
                    "Local project opened",
                    "Define the research question and hypothesis to begin.",
                  );
              })
              .catch((error) => {
                useClyStore
                  .getState()
                  .notify(
                    "Project was not created",
                    error instanceof Error ? error.message : "Try again.",
                  );
              });
          }}
        >
          <Plus size={15} /> New local project
        </button>
      </div>
    </>
  );
}
