import {
  Activity,
  Bell,
  Check,
  CircleDot,
  Command,
  FilePlus2,
  HardDrive,
  Info,
  MoreHorizontal,
  PanelRight,
  Plus,
  Search,
  Settings,
  Sparkles,
  WifiOff,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FixtureMode, ScreenId } from "../domain/types";
import { mockServices } from "../services/mock-services";
import { useClyStore } from "../store/cly-store";
import {
  ProjectSwitcherButton,
  ProjectSwitcherPopover,
  screenLabels,
} from "./navigation";
import { Badge, Button, toneForStatus } from "./primitives";

const fixtureModes: { id: FixtureMode; label: string; description: string }[] =
  [
    { id: "empty", label: "Empty", description: "No research objects yet" },
    {
      id: "new",
      label: "New Project",
      description: "Early setup with one source",
    },
    {
      id: "active",
      label: "Active Project",
      description: "Coherent linked research fixtures",
    },
    {
      id: "large",
      label: "Large Project",
      description: "Performance-sized datasets",
    },
    {
      id: "loading",
      label: "Loading",
      description: "Simulated service hydration",
    },
    {
      id: "risks",
      label: "Integrity Risks",
      description: "Weak claims and blocking findings",
    },
    {
      id: "offline",
      label: "Offline",
      description: "Local-only, integrations unavailable",
    },
    {
      id: "errors",
      label: "Integration Errors",
      description: "Partial data and permission failures",
    },
  ];

export function Titlebar() {
  const project = useClyStore(
    (s) =>
      s.data.projects.find((item) => item.id === s.activeProjectId) ??
      s.data.projects[0],
  );
  const search = useClyStore((s) => s.globalSearch);
  const setCommandOpen = useClyStore((s) => s.setCommandPaletteOpen);
  const setFixtureOpen = useClyStore((s) => s.setFixtureSwitcherOpen);
  const setScreen = useClyStore((s) => s.setScreen);
  const toggleInspector = useClyStore((s) => s.toggleInspector);
  const selectedId = useClyStore((s) => s.selectedId);
  const notify = useClyStore((s) => s.notify);
  const activeSessions = useClyStore(
    (s) =>
      s.data.agentSessions.filter((item) => item.status === "running").length,
  );

  const createObject = async () => {
    const screen = useClyStore.getState().activeScreen;
    if (screen === "claims") {
      const claim = await mockServices.claims.create(
        "New research claim — edit evidence and scope",
      );
      useClyStore.getState().setSelected(claim.id);
      notify(
        "Claim created",
        "The new claim is unsupported until evidence is linked.",
      );
      return;
    }
    if (screen === "experiments") {
      const experiment = await mockServices.experiments.create({
        name: "Untitled experiment",
        goal: "Define the research goal",
        type: "Custom",
      });
      useClyStore.getState().setSelected(experiment.id);
      notify(
        "Experiment created",
        "Complete configuration before scheduling a run.",
      );
      return;
    }
    if (screen === "sources") {
      const source = await mockServices.sources.create({
        title: "Untitled source",
        type: "Paper",
      });
      useClyStore.getState().setSelected(source.id);
      notify(
        "Source created",
        "Metadata extraction is simulated in this prototype.",
      );
      return;
    }
    notify(
      "Create new research object",
      "Choose New Claim, New Experiment, New Source, or New Decision from the command palette.",
    );
    setCommandOpen(true);
  };

  return (
    <header className="cly-titlebar">
      <ProjectSwitcherButton />
      <button
        className="cly-global-search cly-no-drag"
        type="button"
        onClick={() => setCommandOpen(true)}
        aria-label="Open global search and command palette"
        data-testid="global-search"
      >
        <Search size={13} />
        <span style={{ flex: 1, textAlign: "left" }}>
          {search || "Search project or run a command"}
        </span>
        <kbd>⌘K</kbd>
      </button>
      <div className="cly-title-actions cly-no-drag">
        {project ? (
          <span className="cly-topbar-context">{project.phase}</span>
        ) : null}
        <Button
          variant="ghost"
          iconOnly
          title="Agent activity"
          aria-label={`${activeSessions} active agent sessions`}
          onClick={() => setScreen("agents")}
        >
          <Activity size={14} />
          {activeSessions ? (
            <span className="cly-sr-only">{activeSessions} active</span>
          ) : null}
        </Button>
        <Button
          variant="ghost"
          iconOnly
          title="Fixture mode"
          aria-label="Open fixture mode selector"
          onClick={() => setFixtureOpen(true)}
          data-testid="fixture-selector"
        >
          <CircleDot size={14} />
        </Button>
        <Button
          variant="primary"
          title="Create new object"
          aria-label="Create new object"
          onClick={createObject}
        >
          <Plus size={14} /> New
        </Button>
        <Button
          variant="ghost"
          iconOnly
          title="Toggle inspector"
          aria-label="Toggle inspector"
          onClick={() => {
            if (selectedId) toggleInspector();
            else
              notify(
                "Nothing selected",
                "Select a source, claim, run, notebook, finding, or other research object to open its inspector.",
              );
          }}
        >
          <PanelRight size={14} />
        </Button>
        <details className="cly-title-overflow">
          <summary aria-label="More application actions">
            <MoreHorizontal size={14} />
          </summary>
          <div role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() =>
                notify(
                  "Local-first status",
                  "Research metadata and fixtures remain on this device. No external requests are made in UI prototype mode.",
                )
              }
            >
              <HardDrive size={13} /> Local status
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() =>
                notify(
                  "No unread notifications",
                  "Agent and audit events remain available in the activity drawer.",
                )
              }
            >
              <Bell size={13} /> Notifications
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => setScreen("settings")}
            >
              <Settings size={13} /> Settings
            </button>
          </div>
        </details>
      </div>
      <ProjectSwitcherPopover />
      <FixtureSwitcherPopover />
    </header>
  );
}

function FixtureSwitcherPopover() {
  const open = useClyStore((s) => s.fixtureSwitcherOpen);
  const mode = useClyStore((s) => s.fixtureMode);
  const setMode = useClyStore((s) => s.setFixtureMode);
  const setOpen = useClyStore((s) => s.setFixtureSwitcherOpen);
  const notify = useClyStore((s) => s.notify);
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
        aria-label="Close fixture selector"
        onClick={() => setOpen(false)}
      />
      <div
        className="cly-popover cly-fixture-popover"
        role="dialog"
        aria-label="Cly fixture mode"
      >
        <div className="cly-command-group-label">
          Cly fixture mode · development only
        </div>
        {fixtureModes.map((fixture) => (
          <button
            type="button"
            className="cly-popover-item"
            key={fixture.id}
            data-active={fixture.id === mode}
            onClick={() => {
              setMode(fixture.id);
              notify("Fixture state changed", fixture.label);
            }}
          >
            <span style={{ width: 16 }}>
              {fixture.id === mode ? <Check size={14} /> : null}
            </span>
            <span className="cly-project-meta">
              <span className="cly-project-name">{fixture.label}</span>
              <span className="cly-project-path">{fixture.description}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

interface CommandAction {
  id: string;
  label: string;
  group: "Navigate" | "Create" | "View" | "Research";
  icon: typeof Command;
  shortcut?: string;
  run: () => void | Promise<void>;
}

export function CommandPalette() {
  const open = useClyStore((s) => s.commandPaletteOpen);
  const setOpen = useClyStore((s) => s.setCommandPaletteOpen);
  const setScreen = useClyStore((s) => s.setScreen);
  const toggleInspector = useClyStore((s) => s.toggleInspector);
  const toggleActivity = useClyStore((s) => s.toggleActivity);
  const toggleSidebar = useClyStore((s) => s.toggleSidebar);
  const notify = useClyStore((s) => s.notify);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const actions = useMemo<CommandAction[]>(() => {
    const navigation: CommandAction[] = (
      Object.entries(screenLabels) as [ScreenId, string][]
    ).map(([id, label]) => ({
      id: `nav-${id}`,
      label: `Go to ${label}`,
      group: "Navigate",
      icon: Command,
      run: () => setScreen(id),
    }));
    return [
      ...navigation,
      {
        id: "agent-overview",
        label: "Show Agent Sessions Overview",
        group: "Navigate",
        icon: Command,
        shortcut: "⌘⇧O",
        run: () => useClyStore.getState().setAgentSessionsMode("overview"),
      },
      {
        id: "agent-chat",
        label: "Show Agent Sessions Chat",
        group: "Navigate",
        icon: Command,
        shortcut: "⌘⇧C",
        run: () => useClyStore.getState().setAgentSessionsMode("chat"),
      },
      {
        id: "open-current-agent-session",
        label: "Open Current Session Chat",
        group: "Navigate",
        icon: Command,
        run: () => {
          const state = useClyStore.getState();
          const sessionId =
            state.selectedAgentSessionId ??
            state.selectedOverviewSessionId ??
            state.data.agentSessions[0]?.id;
          if (sessionId) state.openAgentSession(sessionId);
          else state.setAgentSessionsMode("chat");
        },
      },
      {
        id: "new-agent-session",
        label: "New Agent Session",
        group: "Create",
        icon: FilePlus2,
        shortcut: "⌘N",
        run: () => {
          useClyStore.getState().setScreen("agents");
          useClyStore.getState().setNewAgentSessionOpen(true);
        },
      },
      {
        id: "configure-agent-team",
        label: "Configure Agent Team",
        group: "Research",
        icon: Sparkles,
        run: () => {
          const state = useClyStore.getState();
          const session = state.data.agentSessions.find(
            (item) => item.id === state.selectedAgentSessionId,
          );
          if (session) state.setAgentConfigurationId(session.orchestrator.id);
          else
            state.notify(
              "Select a session",
              "Open a session before configuring its agent team.",
            );
        },
      },
      ...(
        [
          ["terminal", "Open Terminal Tab"],
          ["browser", "Open Browser Tab"],
          ["diff", "Open Code Diff Tab"],
          ["agents", "Open Agents Tab"],
          ["live-files", "Open Live Files Tab"],
        ] as const
      ).map(([type, label]) => ({
        id: `agent-tab-${type}`,
        label,
        group: "View" as const,
        icon: Command,
        run: () => {
          const state = useClyStore.getState();
          if (state.selectedAgentSessionId) {
            state.openWorkbenchTab(state.selectedAgentSessionId, type);
            state.setAgentSessionsMode("chat", state.selectedAgentSessionId);
          } else {
            state.notify(
              "Select a session",
              "Open an agent session before adding workbench tabs.",
            );
          }
        },
      })),
      {
        id: "view-agent-approvals",
        label: "View Agent Approvals",
        group: "Research",
        icon: Sparkles,
        run: () => {
          const state = useClyStore.getState();
          state.setAgentSessionFilter("approvals");
          state.setAgentSessionsMode("overview");
        },
      },
      {
        id: "pause-current-agent-session",
        label: "Pause Current Agent Session",
        group: "Research",
        icon: Command,
        run: () => {
          const state = useClyStore.getState();
          if (state.selectedAgentSessionId)
            state.pauseAgentSession(state.selectedAgentSessionId);
        },
      },
      {
        id: "stop-current-agent-session",
        label: "Stop Current Agent Session",
        group: "Research",
        icon: Command,
        run: () => {
          const state = useClyStore.getState();
          if (state.selectedAgentSessionId)
            state.stopAgentSession(state.selectedAgentSessionId);
        },
      },
      {
        id: "new-claim",
        label: "New Claim",
        group: "Create",
        icon: FilePlus2,
        shortcut: "⌘N",
        run: async () => {
          const item = await mockServices.claims.create(
            "New research claim — define scope and evidence",
          );
          setScreen("claims");
          useClyStore.getState().setSelected(item.id);
          notify("Claim created");
        },
      },
      {
        id: "new-exp",
        label: "New Experiment",
        group: "Create",
        icon: FilePlus2,
        run: async () => {
          const item = await mockServices.experiments.create({
            name: "Untitled experiment",
            goal: "Define the research goal",
            type: "Custom",
          });
          setScreen("experiments");
          useClyStore.getState().setSelected(item.id);
          notify("Experiment created");
        },
      },
      {
        id: "new-source",
        label: "Import Source",
        group: "Create",
        icon: FilePlus2,
        run: async () => {
          await mockServices.sources.create({
            title: "Imported source",
            type: "Paper",
          });
          setScreen("sources");
          notify("Mock source imported");
        },
      },
      {
        id: "new-decision",
        label: "New Decision",
        group: "Create",
        icon: FilePlus2,
        run: async () => {
          await mockServices.decisions.create({
            title: "Untitled decision",
            decision: "Describe the selected direction",
            reason: "Record the evidence and tradeoff",
          });
          setScreen("decisions");
          notify("Decision added");
        },
      },
      {
        id: "audit",
        label: "Run Reproducibility Audit",
        group: "Research",
        icon: Sparkles,
        run: async () => {
          await mockServices.reproducibility.runAudit();
          setScreen("reproducibility");
        },
      },
      {
        id: "claim-audit",
        label: "Run Claim Audit",
        group: "Research",
        icon: Sparkles,
        run: () => {
          setScreen("agents");
          notify(
            "Claim Audit preview",
            "A fixture-backed agent session preview is ready.",
          );
        },
      },
      {
        id: "notebooklm",
        label: "Create NotebookLM Bundle",
        group: "Research",
        icon: FilePlus2,
        run: () => {
          setScreen("literature");
          notify(
            "NotebookLM bundle ready",
            "4 fixture sources and a manifest are ready to preview.",
          );
        },
      },
      {
        id: "toggle-sidebar",
        label: "Toggle Sidebar",
        group: "View",
        icon: Command,
        shortcut: "⌘\\",
        run: toggleSidebar,
      },
      {
        id: "toggle-inspector",
        label: "Toggle Inspector",
        group: "View",
        icon: Command,
        shortcut: "⌘⌥I",
        run: toggleInspector,
      },
      {
        id: "toggle-activity",
        label: "Toggle Activity Drawer",
        group: "View",
        icon: Command,
        shortcut: "⌘J",
        run: toggleActivity,
      },
      {
        id: "reset-layout",
        label: "Reset Layout",
        group: "View",
        icon: Command,
        run: () => {
          useClyStore.setState({
            sidebarCollapsed: false,
            inspectorOpen: true,
            activityOpen: false,
          });
          notify("Layout reset");
        },
      },
    ];
  }, [notify, setScreen, toggleActivity, toggleInspector, toggleSidebar]);

  const filtered = actions.filter((action) =>
    action.label.toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  if (!open) return null;
  const run = async (action?: CommandAction) => {
    if (!action) return;
    setOpen(false);
    await action.run();
  };
  return (
    <div className="cly-overlay" role="presentation">
      <div
        className="cly-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        data-testid="command-palette"
      >
        <input
          ref={inputRef}
          className="cly-input cly-command-input"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          placeholder="Search Cly or run a command…"
          aria-label="Search commands"
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((value) =>
                Math.min(filtered.length - 1, value + 1),
              );
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((value) => Math.max(0, value - 1));
            }
            if (event.key === "Enter") {
              event.preventDefault();
              void run(filtered[activeIndex]);
            }
            if (event.key === "Escape") setOpen(false);
          }}
        />
        <div className="cly-dialog-body" style={{ padding: 6 }}>
          {filtered.length ? (
            (["Navigate", "Create", "Research", "View"] as const).map(
              (group) => {
                const items = filtered.filter(
                  (action) => action.group === group,
                );
                if (!items.length) return null;
                return (
                  <div className="cly-command-group" key={group}>
                    <div className="cly-command-group-label">{group}</div>
                    {items.map((action) => {
                      const index = filtered.indexOf(action);
                      const Icon = action.icon;
                      return (
                        <button
                          type="button"
                          className="cly-command-item"
                          data-active={index === activeIndex}
                          key={action.id}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => void run(action)}
                        >
                          <Icon size={14} />
                          <span>{action.label}</span>
                          {action.shortcut ? (
                            <kbd className="cly-kbd">{action.shortcut}</kbd>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                );
              },
            )
          ) : (
            <div className="cly-empty" style={{ minHeight: 140 }}>
              <div>
                <Info size={18} />
                <p>No commands match “{query}”.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ActivityDrawer() {
  const open = useClyStore((s) => s.activityOpen);
  const activity = useClyStore((s) => s.data.activity);
  const toggle = useClyStore((s) => s.toggleActivity);
  return (
    <section
      className="cly-activity-drawer"
      data-open={open}
      aria-label="Activity drawer"
      aria-hidden={!open}
      data-testid="activity-drawer"
    >
      <div className="cly-activity-inner">
        {open ? (
          <>
            <div className="cly-activity-header">
              <div className="cly-row">
                <Activity size={14} />
                <strong>Activity</strong>
                <span className="cly-muted cly-small">
                  Background tasks, agents, imports, and diagnostics
                </span>
              </div>
              <Button
                variant="ghost"
                iconOnly
                aria-label="Close activity drawer"
                onClick={toggle}
              >
                <X size={14} />
              </Button>
            </div>
            <div className="cly-activity-list">
              {activity.length ? (
                activity.map((event) => (
                  <div className="cly-activity-row" key={event.id}>
                    <span className="cly-faint">{event.time}</span>
                    <CircleDot size={12} />
                    <strong>{event.title}</strong>
                    <span className="cly-muted">{event.detail}</span>
                    <Badge tone={toneForStatus(event.status)}>
                      {event.status}
                    </Badge>
                  </div>
                ))
              ) : (
                <div
                  className="cly-empty"
                  style={{ minHeight: 110, border: 0 }}
                >
                  <p>No recent activity in this fixture.</p>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

export function Toasts() {
  const toasts = useClyStore((s) => s.toasts);
  const dismiss = useClyStore((s) => s.dismissToast);
  return (
    <div className="cly-toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <div className="cly-toast" role="status" key={toast.id}>
          <Check size={15} />
          <div>
            <strong className="cly-small">{toast.title}</strong>
            {toast.detail ? (
              <div className="cly-muted cly-small" style={{ marginTop: 2 }}>
                {toast.detail}
              </div>
            ) : null}
          </div>
          <Button
            variant="ghost"
            iconOnly
            aria-label="Dismiss notification"
            onClick={() => dismiss(toast.id)}
          >
            <X size={13} />
          </Button>
        </div>
      ))}
    </div>
  );
}

export function LocalStatusBanner() {
  const mode = useClyStore((s) => s.fixtureMode);
  if (mode !== "offline" && mode !== "errors") return null;
  return (
    <div
      className="cly-callout"
      data-tone={mode === "errors" ? "danger" : "warning"}
      style={{ marginBottom: 16 }}
    >
      <div className="cly-row">
        <WifiOff size={14} />
        <strong>
          {mode === "offline"
            ? "Offline local-only mode"
            : "Integration errors simulated"}
        </strong>
      </div>
      <div className="cly-muted cly-small" style={{ marginTop: 4 }}>
        {mode === "offline"
          ? "All research objects remain available locally. Cloud-connected actions explain their unavailable state."
          : "This fixture demonstrates permission, synchronization, and partial-data states across the UI."}
      </div>
    </div>
  );
}
