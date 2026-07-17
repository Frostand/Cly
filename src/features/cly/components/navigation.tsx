import {
  Activity,
  Archive,
  Beaker,
  BookOpen,
  Bot,
  Boxes,
  Braces,
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
  Lightbulb,
  ListChecks,
  ListTodo,
  Monitor,
  PackageCheck,
  PanelLeftClose,
  PanelLeftOpen,
  PanelsTopLeft,
  ScrollText,
  Settings,
  ShieldCheck,
  TestTube2,
  Tickets,
  WalletCards,
} from "lucide-react";
import type { ComponentType } from "react";
import type { DevSection, ScreenId } from "../domain/types";
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
    label: "Project",
    items: [
      { id: "overview", label: "Overview", icon: CircleGauge },
      { id: "objectives", label: "Objectives", icon: Goal },
    ],
  },
  {
    label: "Work",
    items: [
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
    ],
  },
  {
    label: "Evidence",
    items: [
      {
        id: "sources",
        label: "Sources",
        icon: Library,
        count: (s) => s.data.sources.length,
      },
      { id: "literature", label: "Literature", icon: BookOpen },
      {
        id: "notebooks",
        label: "Notebooks",
        icon: Braces,
        count: (s) => s.data.notebooks.length,
      },
      { id: "code", label: "Code Linker", icon: Code2 },
      { id: "graph", label: "Research Graph", icon: GitBranch },
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
    label: "Review",
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
    label: "Configuration",
    items: [
      { id: "integrations", label: "Integrations", icon: Boxes },
      { id: "models", label: "Models & Agents", icon: Activity },
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
    label: "Development",
    items: [
      { id: "projects", label: "Projects", icon: PanelsTopLeft },
      { id: "repositories", label: "Repositories", icon: GitBranch },
      { id: "features", label: "Features", icon: ListTodo },
      { id: "issues", label: "Issues", icon: Tickets },
    ],
  },
  {
    label: "Execution",
    items: [
      {
        id: "sessions",
        label: "Sessions",
        icon: Bot,
        count: (s) =>
          s.data.agentSessions.filter((session) =>
            ["running", "waiting_approval"].includes(session.status),
          ).length,
      },
      { id: "agents", label: "Agents", icon: Activity },
      { id: "machines", label: "Machines", icon: Monitor },
    ],
  },
  {
    label: "Delivery",
    items: [
      { id: "pull-requests", label: "Pull Requests", icon: GitPullRequest },
      { id: "tests", label: "Tests", icon: TestTube2 },
      {
        id: "context",
        label: "Context",
        icon: BrainCircuit,
        count: (s) =>
          s.data.contextItems.filter((item) => item.included).length,
      },
    ],
  },
];

export const screenLabels = Object.fromEntries([
  ...researchGroups.flatMap((group) =>
    group.items.map((item) => [item.id, item.label]),
  ),
  ["settings", "Settings"],
  ["dev", "Cly Dev"],
]) as Record<ScreenId, string>;

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

  return (
    <aside className="cly-sidebar" aria-label="Main navigation">
      <div className="cly-sidebar-brand">
        <ClyLogo compact={sidebarCollapsed} />
      </div>
      <div
        className="cly-product-switcher"
        role="tablist"
        aria-label="Cly application"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeProduct === "research"}
          aria-label="Cly Research"
          title={sidebarCollapsed ? "Cly Research" : undefined}
          onClick={() => setProductArea("research")}
          data-testid="product-research"
        >
          <Library size={14} />
          <span>Research</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeProduct === "dev"}
          aria-label="Cly Dev"
          title={sidebarCollapsed ? "Cly Dev" : undefined}
          onClick={() => setProductArea("dev")}
          data-testid="product-dev"
        >
          <Code2 size={14} />
          <span>Dev</span>
        </button>
      </div>
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
                      onClick={() => setDevSection(item.id)}
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
        <button
          className="cly-sidebar-item"
          type="button"
          aria-current={activeScreen === "settings" ? "page" : undefined}
          aria-label="Settings"
          title={sidebarCollapsed ? "Settings" : undefined}
          onClick={() => setScreen("settings")}
          data-testid="nav-settings"
        >
          <Settings size={15} />
          <span className="cly-sidebar-item-label">Settings</span>
          {!sidebarCollapsed ? <span className="cly-kbd">⌘,</span> : null}
        </button>
        <ThemeSwitcher compact={sidebarCollapsed} />
        {activeProduct === "dev" ? (
          <button
            className="cly-sidebar-item"
            type="button"
            onClick={() =>
              useClyStore
                .getState()
                .notify("Execution machine", "Local Mac · connected · private")
            }
            aria-label="Local execution machine"
          >
            <HardDrive size={15} />
            <span className="cly-sidebar-item-label">Local machine</span>
            {!sidebarCollapsed ? <span className="cly-device-dot" /> : null}
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
          onClick={() => {
            setOpen(false);
            useClyStore
              .getState()
              .notify(
                "Open Project",
                "The native folder picker is retained from Dream and will be connected to Cly project creation in Phase 2.",
              );
          }}
        >
          <Lightbulb size={15} /> Open another project…
        </button>
      </div>
    </>
  );
}
