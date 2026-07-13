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
  Library,
  Lightbulb,
  ListChecks,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Settings,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import type { ComponentType } from "react";
import type { ScreenId } from "../domain/types";
import { useClyStore } from "../store/cly-store";
import { ClyLogo, ThemeSwitcher } from "./brand";

interface NavigationItem {
  id: ScreenId;
  label: string;
  icon: ComponentType<{ size?: number }>;
  count?: (
    state: ReturnType<typeof useClyStore.getState>,
  ) => number | undefined;
}

const groups: { label: string; items: NavigationItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { id: "overview", label: "Overview", icon: CircleGauge },
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
      {
        id: "notebooks",
        label: "Notebooks",
        icon: Braces,
        count: (s) => s.data.notebooks.length,
      },
      { id: "code", label: "Code Linker", icon: Code2 },
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

export const screenLabels = Object.fromEntries(
  groups.flatMap((group) => group.items.map((item) => [item.id, item.label])),
) as Record<ScreenId, string>;

export function Sidebar() {
  const activeScreen = useClyStore((s) => s.activeScreen);
  const sidebarCollapsed = useClyStore((s) => s.sidebarCollapsed);
  const setScreen = useClyStore((s) => s.setScreen);
  const toggleSidebar = useClyStore((s) => s.toggleSidebar);
  const state = useClyStore();

  return (
    <aside className="cly-sidebar" aria-label="Main navigation">
      <div className="cly-sidebar-brand">
        <ClyLogo compact={sidebarCollapsed} />
      </div>
      <div className="cly-sidebar-scroll">
        {groups.map((group) => (
          <nav
            className="cly-sidebar-group"
            key={group.label}
            aria-label={group.label}
          >
            <div className="cly-sidebar-group-label">{group.label}</div>
            {group.items.map((item) => {
              const Icon = item.icon;
              const count = item.count?.(state);
              return (
                <button
                  type="button"
                  className="cly-sidebar-item"
                  aria-current={activeScreen === item.id ? "page" : undefined}
                  aria-label={sidebarCollapsed ? item.label : undefined}
                  title={sidebarCollapsed ? item.label : undefined}
                  onClick={() => setScreen(item.id)}
                  key={item.id}
                  data-testid={`nav-${item.id}`}
                >
                  <Icon size={15} />
                  <span className="cly-sidebar-item-label">{item.label}</span>
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
