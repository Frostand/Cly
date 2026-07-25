import {
  Activity,
  Archive,
  ArrowLeft,
  ArrowRight,
  Beaker,
  BookOpen,
  Bot,
  Boxes,
  Braces,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleGauge,
  ClipboardCheck,
  Code2,
  Columns3,
  FileStack,
  GitBranch,
  GitPullRequest,
  Goal,
  HardDrive,
  HelpCircle,
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
import {
  type ComponentType,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createOnboardingDraft } from "../domain/onboarding";
import type { DevSection, ProductArea, ScreenId } from "../domain/types";
import { saveOnboardingDraft } from "../services/onboarding-storage";
import { useClyStore } from "../store/cly-store";
import { ClyLogo, ThemeSwitcher } from "./brand";
import { Button } from "./primitives";
import { ClyMenu } from "./toolkit";

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
    label: "Set up",
    items: [
      { id: "overview", label: "Overview", icon: CircleGauge },
      {
        id: "sources",
        label: "Sources",
        icon: Library,
        count: (s) => s.data.sources.length,
      },
    ],
  },
  {
    label: "Understand",
    items: [
      { id: "objectives", label: "Objectives", icon: Goal },
      { id: "literature", label: "Literature", icon: BookOpen },
    ],
  },
  {
    label: "Build / Run",
    items: [
      {
        id: "experiments",
        label: "Experiments",
        icon: Beaker,
        count: (s) => s.data.experiments.length,
      },
      {
        id: "agents",
        label: "Agent Sessions",
        icon: Bot,
        count: (s) =>
          s.data.agentSessions.filter(
            (x) => x.status === "running" || x.status === "waiting_approval",
          ).length,
      },
    ],
  },
  {
    label: "Review",
    items: [
      {
        id: "claims",
        label: "Claims",
        icon: ScrollText,
        count: (s) =>
          s.data.claims.filter((x) =>
            ["Weak", "Unsupported", "Needs review"].includes(x.status),
          ).length,
      },
      {
        id: "reproducibility",
        label: "Reproducibility",
        icon: ClipboardCheck,
        count: (s) => s.data.findings.filter((x) => x.status === "Open").length,
      },
    ],
  },
  {
    label: "Share",
    items: [
      {
        id: "next-steps",
        label: "Next Steps",
        icon: ListChecks,
        count: (s) =>
          s.data.nextSteps.filter((x) => x.status === "Recommended").length,
      },
      {
        id: "reviewer-capsules",
        label: "Reviewer Packages",
        ariaLabel: "Reviewer evidence packages",
        icon: PackageCheck,
      },
    ],
  },
];

const researchAdvancedItems: NavigationItem[] = [
  {
    id: "context",
    label: "Context",
    icon: BrainCircuit,
    count: (s) => s.data.contextItems.filter((x) => x.included).length,
  },
  { id: "graph", label: "Research Graph", icon: GitBranch },
  {
    id: "notebooks",
    label: "Notebooks",
    icon: Braces,
    count: (s) => s.data.notebooks.length,
  },
  { id: "code", label: "Code Linker", icon: Code2 },
  {
    id: "costs",
    label: "Costs",
    icon: WalletCards,
    count: (s) => s.costLedger.waste.entryCount,
  },
  {
    id: "obligations",
    label: "Data Obligations",
    icon: ShieldCheck,
    count: (s) =>
      s.obligationAlerts.filter((alert) => alert.state === "open").length,
  },
  { id: "provenance", label: "Provenance", icon: FileStack },
  { id: "impact-review", label: "Impact Review", icon: GitPullRequest },
  { id: "decisions", label: "Decisions", icon: Archive },
  { id: "integrations", label: "Integrations", icon: Boxes },
  { id: "models", label: "Models & Agents", icon: Activity },
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
    label: "Set up",
    items: [
      { id: "projects", label: "Projects", icon: PanelsTopLeft },
      { id: "repositories", label: "Repositories", icon: GitBranch },
    ],
  },
  {
    label: "Understand",
    items: [
      { id: "features", label: "Features", icon: ListTodo },
      { id: "issues", label: "Issues", icon: Tickets },
    ],
  },
  {
    label: "Build / Run",
    items: [
      {
        id: "board",
        label: "Board",
        icon: Columns3,
        count: (s) =>
          s.data.agentSessions.filter((session) => !session.archived).length ||
          s.clyDevSessions.length,
      },
      {
        id: "sessions",
        label: "Sessions",
        icon: Bot,
        count: (s) =>
          s.data.agentSessions.filter((session) =>
            ["running", "waiting_approval"].includes(session.status),
          ).length,
      },
    ],
  },
  {
    label: "Review",
    items: [
      { id: "pull-requests", label: "Pull Requests", icon: GitPullRequest },
      { id: "tests", label: "Tests", icon: TestTube2 },
    ],
  },
  {
    label: "Share",
    items: [
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

const devAdvancedItems: DevNavigationItem[] = [
  { id: "agents", label: "Agents", icon: Activity },
  { id: "machines", label: "Machines", icon: Monitor },
];

export const screenLabels = Object.fromEntries([
  ...researchGroups.flatMap((group) =>
    group.items.map((item) => [item.id, item.label]),
  ),
  ...researchAdvancedItems.map((item) => [item.id, item.label]),
  ["help", "Setup & Help"],
  ["settings", "Settings"],
  ["dev", "Cly Dev"],
]) as Record<ScreenId, string>;

export const devSectionLabels: Record<DevSection, string> = Object.fromEntries(
  [...devGroups.flatMap((group) => group.items), ...devAdvancedItems].map(
    (item) => [item.id, item.label],
  ),
) as Record<DevSection, string>;

interface NavigationLocation {
  product: ProductArea;
  screen: ScreenId;
  devSection: DevSection;
  label: string;
}

const navigationHistoryKey = "cly:navigation-history";

function readNavigationHistory(): NavigationLocation[] {
  try {
    return JSON.parse(
      window.sessionStorage.getItem(navigationHistoryKey) ?? "[]",
    ) as NavigationLocation[];
  } catch {
    return [];
  }
}

function locationKey(location: NavigationLocation) {
  return location.product === "dev"
    ? `dev:${location.devSection}`
    : `research:${location.screen}`;
}

const researchNext: Partial<Record<ScreenId, [ScreenId, string]>> = {
  objectives: ["sources", "Add evidence"],
  sources: ["claims", "Draft a claim"],
  literature: ["claims", "Connect a claim"],
  notebooks: ["code", "Link code"],
  code: ["experiments", "Record a run"],
  experiments: ["reproducibility", "Review evidence"],
  agents: ["claims", "Review claims"],
  claims: ["reproducibility", "Run audit"],
  reproducibility: ["reviewer-capsules", "Build package"],
  "next-steps": ["overview", "Return to overview"],
  "reviewer-capsules": ["overview", "Return to overview"],
};

function setupNextAction(
  data: ReturnType<typeof useClyStore.getState>["data"],
): [ScreenId, string] {
  if (!data.sources.length) return ["sources", "Add a source"];
  if (!data.claims.length) return ["claims", "Draft a claim"];
  if (!data.experiments.length || !data.runs.length)
    return ["experiments", "Open experiments"];
  if (
    !data.audits.length ||
    data.findings.some((finding) => finding.status === "Open")
  )
    return ["reproducibility", "Open audit"];
  return ["reviewer-capsules", "Build package"];
}

const devNext: Record<DevSection, [DevSection, string]> = {
  projects: ["repositories", "Open repositories"],
  repositories: ["features", "Review features"],
  features: ["issues", "Open issues"],
  issues: ["board", "Open board"],
  board: ["sessions", "Open sessions"],
  sessions: ["pull-requests", "Review changes"],
  agents: ["board", "Open board"],
  machines: ["sessions", "Open sessions"],
  "pull-requests": ["tests", "Review tests"],
  tests: ["context", "Prepare context"],
  context: ["projects", "Return to projects"],
  settings: ["projects", "Return to projects"],
};

export function WorkspaceNavigationBar() {
  const activeProduct = useClyStore((state) => state.activeProduct);
  const activeScreen = useClyStore((state) => state.activeScreen);
  const activeDevSection = useClyStore((state) => state.activeDevSection);
  const project = useClyStore(
    (state) =>
      state.data.projects.find((item) => item.id === state.activeProjectId) ??
      state.data.projects[0],
  );
  const setScreen = useClyStore((state) => state.setScreen);
  const setDevSection = useClyStore((state) => state.setDevSection);
  const setProjectSwitcherOpen = useClyStore(
    (state) => state.setProjectSwitcherOpen,
  );
  const data = useClyStore((state) => state.data);
  const setupAction = setupNextAction(data);
  const [history, setHistory] = useState<NavigationLocation[]>(
    readNavigationHistory,
  );
  const suppressNextRecord = useRef(false);
  const current = useMemo<NavigationLocation>(
    () => ({
      product: activeProduct,
      screen: activeScreen,
      devSection: activeDevSection,
      label:
        activeProduct === "dev"
          ? devSectionLabels[activeDevSection]
          : screenLabels[activeScreen],
    }),
    [activeDevSection, activeProduct, activeScreen],
  );

  useEffect(() => {
    if (suppressNextRecord.current) {
      suppressNextRecord.current = false;
      return;
    }
    setHistory((existing) => {
      if (locationKey(existing.at(-1) ?? current) === locationKey(current))
        return existing.length ? existing : [current];
      const next = [...existing, current].slice(-12);
      window.sessionStorage.setItem(navigationHistoryKey, JSON.stringify(next));
      return next;
    });
  }, [current]);

  const navigate = (location: NavigationLocation) => {
    if (location.product === "dev") setDevSection(location.devSection);
    else setScreen(location.screen);
  };
  const goBack = () => {
    if (history.length < 2) return;
    const target = history.at(-2);
    if (!target) return;
    const nextHistory = history.slice(0, -1);
    suppressNextRecord.current = true;
    setHistory(nextHistory);
    window.sessionStorage.setItem(
      navigationHistoryKey,
      JSON.stringify(nextHistory),
    );
    navigate(target);
  };
  const recent = [...history]
    .reverse()
    .filter(
      (item, index, all) =>
        locationKey(item) !== locationKey(current) &&
        all.findIndex(
          (candidate) => locationKey(candidate) === locationKey(item),
        ) === index,
    )
    .slice(0, 5);
  const researchAction =
    activeScreen === "overview" || activeScreen === "help"
      ? setupAction
      : researchNext[activeScreen];
  const nextAction =
    activeProduct === "dev" ? devNext[activeDevSection] : researchAction;

  return (
    <div className="cly-navigation-bar">
      <Button
        variant="ghost"
        iconOnly
        aria-label="Go back"
        disabled={history.length < 2}
        onClick={goBack}
      >
        <ArrowLeft size={14} />
      </Button>
      <nav className="cly-breadcrumbs" aria-label="Breadcrumb">
        <button type="button" onClick={() => setProjectSwitcherOpen(true)}>
          {project?.name ?? "Project"}
        </button>
        <ChevronRight aria-hidden="true" />
        <span>{activeProduct === "dev" ? "Dev" : "Research"}</span>
        <ChevronRight aria-hidden="true" />
        <strong aria-current="page">{current.label}</strong>
      </nav>
      <ClyMenu
        label="Recent destinations"
        trigger={
          <Button variant="ghost" disabled={!recent.length}>
            Recent <ChevronDown size={13} />
          </Button>
        }
        items={recent.map((item) => ({
          id: locationKey(item),
          label: item.label,
          onSelect: () => navigate(item),
        }))}
      />
      {nextAction ? (
        <Button
          className="cly-next-action"
          onClick={() => {
            if (activeProduct === "dev")
              setDevSection(nextAction[0] as DevSection);
            else setScreen(nextAction[0] as ScreenId);
          }}
        >
          <span>{nextAction[1]}</span>
          <ArrowRight size={13} aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}

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
        {activeProduct === "research" ? (
          <>
            {researchGroups.map((group) => (
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
            ))}
            <details
              className="cly-sidebar-advanced"
              open={researchAdvancedItems.some(
                (item) => item.id === activeScreen,
              )}
            >
              <summary title="Advanced research destinations">
                <Boxes size={15} aria-hidden="true" />
                <span>Advanced</span>
                <ChevronDown size={13} aria-hidden="true" />
              </summary>
              <nav aria-label="Advanced research">
                {researchAdvancedItems.map((item) => {
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
            </details>
          </>
        ) : (
          <>
            {devGroups.map((group) => (
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
            <details
              className="cly-sidebar-advanced"
              open={devAdvancedItems.some(
                (item) =>
                  activeScreen === "dev" && item.id === activeDevSection,
              )}
            >
              <summary title="Advanced developer destinations">
                <Boxes size={15} aria-hidden="true" />
                <span>Advanced</span>
                <ChevronDown size={13} aria-hidden="true" />
              </summary>
              <nav aria-label="Advanced developer tools">
                {devAdvancedItems.map((item) => {
                  const Icon = item.icon;
                  const active =
                    activeScreen === "dev" && activeDevSection === item.id;
                  return (
                    <button
                      type="button"
                      className="cly-sidebar-item"
                      aria-current={active ? "page" : undefined}
                      aria-label={item.label}
                      onClick={() => setDevSection(item.id)}
                      key={item.id}
                      data-testid={`nav-dev-${item.id}`}
                    >
                      <Icon size={15} />
                      <span className="cly-sidebar-item-label">
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </nav>
            </details>
          </>
        )}
      </div>
      <div className="cly-sidebar-footer">
        <button
          className="cly-sidebar-item"
          type="button"
          aria-current={activeScreen === "help" ? "page" : undefined}
          aria-label="Setup and help"
          title={sidebarCollapsed ? "Setup and help" : undefined}
          onClick={() => setScreen("help")}
          data-testid="nav-help"
        >
          <HelpCircle size={15} />
          <span className="cly-sidebar-item-label">Setup & Help</span>
        </button>
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
            void saveOnboardingDraft({
              ...createOnboardingDraft(),
              currentStep: "project",
            }).then(() => {
              useClyStore.getState().setOnboardingRequested("new");
            });
          }}
        >
          <Lightbulb size={15} /> Open another project…
        </button>
      </div>
    </>
  );
}
