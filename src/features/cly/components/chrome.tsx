import * as RadixDialog from "@radix-ui/react-dialog";
import { Command as CommandPrimitive } from "cmdk";
import {
  Activity,
  Check,
  CircleDot,
  Command as CommandIcon,
  FilePlus2,
  HardDrive,
  Info,
  PanelRight,
  Search,
  Sparkles,
  WifiOff,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { getDesktopApi } from "../../../lib/electron";
import type { ClyDevWorkspaceMode } from "../agent-sessions/types";
import { seedWorkspaceSnapshot } from "../agent-sessions/window-sync";
import { clyFadeSlide, clyMotion } from "../design-system/motion";
import type { FixtureMode, ScreenId } from "../domain/types";
import { capabilityUnavailableMessage } from "../services/capabilities";
import { projectServices } from "../services/project-services";
import { isClyDemoRuntime } from "../services/runtime";
import { useClyStore } from "../store/cly-store";
import {
  ProjectSwitcherButton,
  ProjectSwitcherPopover,
  screenLabels,
} from "./navigation";
import { Badge, Button, toneForStatus } from "./primitives";
import { ClyTooltip } from "./toolkit";

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

async function setSelectedWorkspaceMode(workspaceMode: ClyDevWorkspaceMode) {
  const state = useClyStore.getState();
  const sessionId = state.selectedAgentSessionId;
  const session = state.data.agentSessions.find(
    (item) => item.id === sessionId,
  );
  if (!sessionId || !session) return;
  const api = getDesktopApi();
  try {
    if (workspaceMode === "detached-workspace" && api) {
      await seedWorkspaceSnapshot(session);
      await api.detachWorkspace({ sessionId });
    } else if (
      session.workspaceMode === "detached-workspace" &&
      workspaceMode !== "detached-workspace" &&
      api
    ) {
      await api.reattachWorkspace({ sessionId });
    }
    useClyStore.getState().updateAgentSession(sessionId, (current) => ({
      ...current,
      workspaceMode,
    }));
  } catch (error) {
    useClyStore
      .getState()
      .notify(
        "Workspace mode could not change",
        error instanceof Error ? error.message : "Try again.",
      );
  }
}

export function Titlebar() {
  const search = useClyStore((s) => s.globalSearch);
  const activeProduct = useClyStore((s) => s.activeProduct);
  const setCommandOpen = useClyStore((s) => s.setCommandPaletteOpen);
  const setFixtureOpen = useClyStore((s) => s.setFixtureSwitcherOpen);
  const toggleInspector = useClyStore((s) => s.toggleInspector);
  const toggleActivity = useClyStore((s) => s.toggleActivity);
  const selectedId = useClyStore((s) => s.selectedId);
  const notify = useClyStore((s) => s.notify);
  const activeSessions = useClyStore(
    (s) =>
      s.data.agentSessions.filter((item) => item.status === "running").length,
  );

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
        <span className="cly-global-search-label">
          {search ||
            (activeProduct === "dev"
              ? "Search code, sessions, issues, or run a command"
              : "Search research objects or run a command")}
        </span>
        <kbd>⌘K</kbd>
      </button>
      <div className="cly-title-actions cly-no-drag">
        <ClyTooltip label="Activity">
          <Button
            variant="ghost"
            iconOnly
            className="cly-title-activity"
            aria-label={`Open activity, ${activeSessions} active agent sessions`}
            onClick={toggleActivity}
          >
            <Activity size={14} />
            {activeSessions ? (
              <span className="cly-title-activity-count" aria-hidden="true">
                {activeSessions > 9 ? "9+" : activeSessions}
              </span>
            ) : null}
          </Button>
        </ClyTooltip>
        <ClyTooltip label="Local-first status">
          <Button
            variant="ghost"
            className="cly-title-local-status"
            aria-label="Local and cloud status"
            onClick={() =>
              notify(
                "Local-first status",
                "Research records are stored by the project-scoped local service. External effects remain unavailable until their approval flows are implemented.",
              )
            }
          >
            <HardDrive size={14} />
            <span>Local</span>
          </Button>
        </ClyTooltip>
        {__CLY_INCLUDE_DEMOS__ && isClyDemoRuntime ? (
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
        ) : null}
        {selectedId ? (
          <ClyTooltip label="Toggle inspector">
            <Button
              variant="ghost"
              iconOnly
              aria-label="Toggle inspector"
              onClick={toggleInspector}
            >
              <PanelRight size={14} />
            </Button>
          </ClyTooltip>
        ) : null}
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
  if (!__CLY_INCLUDE_DEMOS__ || !isClyDemoRuntime || !open) return null;
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
  icon: typeof CommandIcon;
  shortcut?: string;
  disabled?: boolean;
  reason?: string;
  run: () => void | Promise<void>;
}

function focusAgentAction(action: string, activate = false) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLButtonElement>(
        `[data-cly-agent-action="${action}"]`,
      );
      target?.focus();
      if (activate) target?.click();
    });
  });
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

  const actions = useMemo<CommandAction[]>(() => {
    const navigation: CommandAction[] = (
      Object.entries(screenLabels) as [ScreenId, string][]
    ).map(([id, label]) => ({
      id: `nav-${id}`,
      label: `Go to ${label}`,
      group: "Navigate",
      icon: CommandIcon,
      run: () => setScreen(id),
    }));
    return [
      ...navigation,
      {
        id: "project-switcher",
        label: "Switch project",
        group: "Navigate",
        icon: CommandIcon,
        shortcut: "⌘⇧O",
        run: () => useClyStore.getState().setProjectSwitcherOpen(true),
      },
      {
        id: "agent-overview",
        label: "Show Agent Sessions Overview",
        group: "Navigate",
        icon: CommandIcon,
        run: () => useClyStore.getState().setAgentSessionsMode("overview"),
      },
      {
        id: "agent-chat",
        label: "Show Agent Sessions Chat",
        group: "Navigate",
        icon: CommandIcon,
        shortcut: "⌘⇧C",
        run: () => useClyStore.getState().setAgentSessionsMode("chat"),
      },
      {
        id: "open-current-agent-session",
        label: "Open Current Session Chat",
        group: "Navigate",
        icon: CommandIcon,
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
        id: "open-pending-agent-approval",
        label: "Open Pending Agent Approval",
        group: "Research",
        icon: Sparkles,
        run: () => {
          const state = useClyStore.getState();
          const session = state.data.agentSessions.find((item) =>
            item.approvals.some((approval) => approval.state === "pending"),
          );
          if (!session) {
            state.notify("No pending approvals");
            return;
          }
          state.openAgentSession(session.id);
          focusAgentAction("approve");
        },
      },
      {
        id: "inspect-current-agent-tests",
        label: "Inspect Current Session Tests",
        group: "View",
        icon: CommandIcon,
        run: () => focusAgentAction("inspect-tests", true),
      },
      {
        id: "inspect-current-agent-diff",
        label: "Inspect Current Session Diff",
        group: "View",
        icon: CommandIcon,
        run: () => focusAgentAction("inspect-diff", true),
      },
      {
        id: "use-agent-only-mode",
        label: "Use Agent-only Mode",
        group: "View",
        icon: CommandIcon,
        run: () => void setSelectedWorkspaceMode("agent-only"),
      },
      {
        id: "use-inline-workspace",
        label: "Use Inline Workspace",
        group: "View",
        icon: CommandIcon,
        run: () => void setSelectedWorkspaceMode("inline-workspace"),
      },
      {
        id: "detach-workspace-intent",
        label: "Detach Workspace (Prototype Intent)",
        group: "View",
        icon: CommandIcon,
        run: () => void setSelectedWorkspaceMode("detached-workspace"),
      },
      {
        id: "reattach-workspace-intent",
        label: "Reattach Workspace (Prototype Intent)",
        group: "View",
        icon: CommandIcon,
        run: () => void setSelectedWorkspaceMode("inline-workspace"),
      },
      {
        id: "open-interrupted-agent-task",
        label: "Open Interrupted Task to Resume",
        group: "Research",
        icon: Sparkles,
        run: () => {
          const state = useClyStore.getState();
          const session = state.data.agentSessions.find(
            (item) => item.taskState === "interrupted-resumable",
          );
          if (!session) {
            state.notify("No interrupted task");
            return;
          }
          state.openAgentSession(session.id);
          focusAgentAction("resume-task");
        },
      },
      {
        id: "new-agent-session",
        label: "New Agent Session",
        group: "Create",
        icon: FilePlus2,
        shortcut: "⌘N",
        disabled: !isClyDemoRuntime,
        reason: capabilityUnavailableMessage("agents.execute"),
        run: () => {
          const state = useClyStore.getState();
          state.setDevSection("sessions");
          state.setAgentSessionsMode("overview");
          state.setNewAgentSessionOpen(true);
        },
      },
      {
        id: "configure-agent-team",
        label: "Configure Agent Team",
        group: "Research",
        icon: Sparkles,
        disabled: !isClyDemoRuntime,
        reason: capabilityUnavailableMessage("agents.configure"),
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
        icon: CommandIcon,
        disabled: !isClyDemoRuntime,
        reason: capabilityUnavailableMessage("agents.workbench"),
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
        icon: CommandIcon,
        disabled: !isClyDemoRuntime,
        reason: capabilityUnavailableMessage("agents.execute"),
        run: () => {
          const state = useClyStore.getState();
          if (state.selectedAgentSessionId)
            state.pauseAgentSession(state.selectedAgentSessionId);
        },
      },
      {
        id: "stop-current-agent-session",
        label: "Review Stop Current Agent Session",
        group: "Research",
        icon: CommandIcon,
        disabled: !isClyDemoRuntime,
        reason: capabilityUnavailableMessage("agents.execute"),
        run: () => {
          const state = useClyStore.getState();
          if (state.selectedAgentSessionId)
            state.setAgentDestructiveConfirmation({
              sessionId: state.selectedAgentSessionId,
              action: "stop",
            });
        },
      },
      {
        id: "new-claim",
        label: "New Claim",
        group: "Create",
        icon: FilePlus2,
        shortcut: "⌘N",
        run: async () => {
          const item = await projectServices.claims.create(
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
          const item = await projectServices.experiments.create({
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
          await projectServices.sources.create({
            title: "Imported source",
            type: "Paper",
          });
          setScreen("sources");
          notify("Source imported");
        },
      },
      {
        id: "new-decision",
        label: "New Decision",
        group: "Create",
        icon: FilePlus2,
        disabled: !isClyDemoRuntime,
        reason: capabilityUnavailableMessage("decisions.create"),
        run: async () => {
          await projectServices.decisions.create({
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
        disabled: !isClyDemoRuntime,
        reason: capabilityUnavailableMessage("reproducibility.audit"),
        run: async () => {
          await projectServices.reproducibility.runAudit();
          setScreen("reproducibility");
        },
      },
      {
        id: "claim-audit",
        label: "Run Claim Audit",
        group: "Research",
        icon: Sparkles,
        disabled: !isClyDemoRuntime,
        reason: capabilityUnavailableMessage("agents.execute"),
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
        disabled: !isClyDemoRuntime,
        reason: capabilityUnavailableMessage("exports.notebook-bundle"),
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
        icon: CommandIcon,
        shortcut: "⌘\\",
        run: toggleSidebar,
      },
      {
        id: "toggle-inspector",
        label: "Toggle Inspector",
        group: "View",
        icon: CommandIcon,
        shortcut: "⌘⌥I",
        run: toggleInspector,
      },
      {
        id: "toggle-activity",
        label: "Toggle Activity Drawer",
        group: "View",
        icon: CommandIcon,
        shortcut: "⌘J",
        run: toggleActivity,
      },
      {
        id: "reset-layout",
        label: "Reset Layout",
        group: "View",
        icon: CommandIcon,
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

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const run = async (action?: CommandAction) => {
    if (!action || action.disabled) return;
    setOpen(false);
    try {
      await action.run();
    } catch (error) {
      notify(
        "Action failed",
        error instanceof Error ? error.message : "The action did not complete.",
      );
    }
  };
  return (
    <CommandPrimitive.Dialog
      open={open}
      onOpenChange={setOpen}
      className="cly-dialog cly-command-dialog"
      label="Command palette"
      loop
      data-testid="command-palette"
    >
      <RadixDialog.Title className="cly-sr-only">
        Command palette
      </RadixDialog.Title>
      <RadixDialog.Description className="cly-sr-only">
        Search routes, research objects, and application actions.
      </RadixDialog.Description>
      <CommandPrimitive.Input
        className="cly-input cly-command-input"
        value={query}
        onValueChange={setQuery}
        placeholder="Search Cly or run a command…"
        aria-label="Search commands"
      />
      <CommandPrimitive.List
        className="cly-dialog-body cly-command-list"
        aria-label="Cly commands"
      >
        <CommandPrimitive.Empty className="cly-command-empty">
          <Info size={18} /> No commands match “{query}”.
        </CommandPrimitive.Empty>
        {(["Navigate", "Create", "Research", "View"] as const).map((group) => (
          <CommandPrimitive.Group
            className="cly-command-group"
            heading={group}
            key={group}
          >
            {actions
              .filter((action) => action.group === group)
              .map((action) => {
                const Icon = action.icon;
                return (
                  <CommandPrimitive.Item
                    className="cly-command-item"
                    value={action.label}
                    keywords={[action.group, action.id]}
                    key={action.id}
                    disabled={action.disabled}
                    title={action.reason}
                    onSelect={() => void run(action)}
                  >
                    <Icon size={14} />
                    <span>{action.label}</span>
                    {action.disabled ? (
                      <span className="cly-faint">Unavailable</span>
                    ) : null}
                    {action.shortcut ? (
                      <kbd className="cly-kbd">{action.shortcut}</kbd>
                    ) : null}
                  </CommandPrimitive.Item>
                );
              })}
          </CommandPrimitive.Group>
        ))}
      </CommandPrimitive.List>
    </CommandPrimitive.Dialog>
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
                  <p>No recent activity.</p>
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
  const reducedMotion = useReducedMotion();
  return (
    <div className="cly-toast-stack" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            className="cly-toast"
            role="status"
            key={toast.id}
            {...(reducedMotion ? {} : clyFadeSlide)}
            transition={clyMotion.fast}
          >
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
          </motion.div>
        ))}
      </AnimatePresence>
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
