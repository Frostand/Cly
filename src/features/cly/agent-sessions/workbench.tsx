import {
  Background,
  Controls,
  Handle,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
} from "@xyflow/react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bot,
  Braces,
  Check,
  CircleStop,
  Copy,
  ExternalLink,
  FileCode2,
  FileDiff,
  Files,
  GitBranch,
  Globe2,
  Link2,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  PanelRightClose,
  Pin,
  PinOff,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  TerminalSquare,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { Badge, Button, Segmented, Toggle } from "../components/primitives";
import { ClyTerminal } from "../components/toolkit";
import { useClyStore } from "../store/cly-store";
import type {
  AgentIdentity,
  AgentSession,
  AgentsTabState,
  BrowserTabState,
  DiffTabState,
  LiveFilesTabState,
  TerminalTabState,
  WorkbenchTab,
  WorkbenchTabType,
} from "./types";
import {
  agentStatusLabel,
  contextModeLabel,
  toneForAgentStatus,
  workbenchLabel,
} from "./utils";
import { dispatchWorkspaceMutation } from "./window-sync";

const tabIcons: Record<WorkbenchTabType, React.ReactNode> = {
  browser: <Globe2 size={13} />,
  terminal: <TerminalSquare size={13} />,
  diff: <FileDiff size={13} />,
  agents: <Users size={13} />,
  "live-files": <Files size={13} />,
};

export function AgentWorkbench({
  session,
  windowOwnership = "inline",
}: {
  session: AgentSession;
  windowOwnership?: "inline" | "workspace";
}) {
  const activate = useClyStore((state) => state.activateWorkbenchTab);
  const reorder = useClyStore((state) => state.reorderWorkbenchTab);
  const open = useClyStore((state) => state.openWorkbenchTab);
  const toggleMaximized = useClyStore(
    (state) => state.toggleWorkbenchMaximized,
  );
  const toggleWorkbench = useClyStore((state) => state.toggleWorkbench);
  const [pickerOpen, setPickerOpen] = useState(false);
  const activeTab = session.workbenchTabs.find(
    (tab) => tab.id === session.activeWorkbenchTabId,
  );

  return (
    <section
      className="agent-workbench"
      aria-label="Session workbench"
      data-maximized={session.workbenchMaximized}
      data-window-ownership={windowOwnership}
    >
      <div className="agent-workbench-tabs">
        <div
          className="agent-workbench-tab-scroll"
          role="tablist"
          aria-label="Workbench tabs"
        >
          {session.workbenchTabs.map((tab, index) => (
            <div
              className="agent-workbench-tab-wrap"
              key={tab.id}
              role="presentation"
            >
              <button
                type="button"
                role="tab"
                id={`workbench-tab-${session.id}-${tab.id}`}
                aria-controls={`workbench-panel-${session.id}`}
                aria-selected={tab.id === session.activeWorkbenchTabId}
                tabIndex={tab.id === session.activeWorkbenchTabId ? 0 : -1}
                className="agent-workbench-tab"
                onClick={() => {
                  activate(session.id, tab.id);
                  void dispatchWorkspaceMutation(
                    session.id,
                    "activate_workbench_tab",
                    { activeWorkbenchTabId: tab.id },
                  );
                }}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
                    return;
                  event.preventDefault();
                  const delta = event.key === "ArrowLeft" ? -1 : 1;
                  const nextIndex =
                    (index + delta + session.workbenchTabs.length) %
                    session.workbenchTabs.length;
                  const next = session.workbenchTabs[nextIndex];
                  if (!next) return;
                  activate(session.id, next.id);
                  void dispatchWorkspaceMutation(
                    session.id,
                    "activate_workbench_tab",
                    { activeWorkbenchTabId: next.id },
                  );
                  requestAnimationFrame(() =>
                    document
                      .getElementById(`workbench-tab-${session.id}-${next.id}`)
                      ?.focus(),
                  );
                }}
                draggable
                onDragStart={(event) =>
                  event.dataTransfer.setData(
                    "text/workbench-index",
                    String(index),
                  )
                }
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const from = Number(
                    event.dataTransfer.getData("text/workbench-index"),
                  );
                  if (Number.isInteger(from)) reorder(session.id, from, index);
                }}
              >
                {tab.pinned ? <Pin size={10} /> : tabIcons[tab.type]}
                <span>{tab.title}</span>
              </button>
            </div>
          ))}
        </div>
        {activeTab ? (
          <WorkbenchTabMenu
            session={session}
            tab={activeTab}
            index={session.workbenchTabs.indexOf(activeTab)}
            active
          />
        ) : null}
        <div className="agent-tab-picker-wrap">
          <Button
            iconOnly
            variant="ghost"
            aria-label="New workbench tab"
            onClick={() => setPickerOpen((value) => !value)}
          >
            <Plus size={13} />
          </Button>
          {pickerOpen ? (
            <div className="agent-tab-picker" role="menu">
              {(Object.keys(workbenchLabel) as WorkbenchTabType[]).map(
                (type) => (
                  <button
                    type="button"
                    role="menuitem"
                    key={type}
                    onClick={() => {
                      open(session.id, type);
                      setPickerOpen(false);
                    }}
                  >
                    {tabIcons[type]} {workbenchLabel[type]}
                  </button>
                ),
              )}
            </div>
          ) : null}
        </div>
        {windowOwnership === "inline" ? (
          <Button
            iconOnly
            variant="ghost"
            aria-label={
              session.workbenchMaximized
                ? "Restore workbench"
                : "Maximize workbench"
            }
            onClick={() => toggleMaximized(session.id)}
          >
            {session.workbenchMaximized ? (
              <Minimize2 size={13} />
            ) : (
              <Maximize2 size={13} />
            )}
          </Button>
        ) : null}
        {windowOwnership === "inline" ? (
          <Button
            iconOnly
            variant="ghost"
            aria-label="Collapse workbench"
            onClick={() => toggleWorkbench(session.id)}
          >
            <PanelRightClose size={13} />
          </Button>
        ) : null}
      </div>
      <div
        className="agent-workbench-content"
        id={`workbench-panel-${session.id}`}
        role="tabpanel"
        aria-labelledby={
          activeTab ? `workbench-tab-${session.id}-${activeTab.id}` : undefined
        }
      >
        {activeTab ? (
          <WorkbenchContent session={session} tab={activeTab} />
        ) : (
          <div className="agent-workbench-empty">
            <Braces size={22} />
            <h2>No workbench tab open</h2>
            <p>
              Open a Browser, Terminal, Code Diff, Agents, or Live Files tab.
            </p>
            <Button onClick={() => setPickerOpen(true)}>
              <Plus size={13} /> Open tab
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function WorkbenchTabMenu({
  session,
  tab,
  index,
  active = false,
}: {
  session: AgentSession;
  tab: WorkbenchTab;
  index: number;
  active?: boolean;
}) {
  const duplicate = useClyStore((state) => state.duplicateWorkbenchTab);
  const pin = useClyStore((state) => state.toggleWorkbenchTabPin);
  const reorder = useClyStore((state) => state.reorderWorkbenchTab);
  const close = useClyStore((state) => state.closeWorkbenchTab);
  return (
    <details
      className={`agent-tab-menu${active ? " agent-active-tab-menu" : ""}`}
    >
      <summary aria-label={`${tab.title} tab menu`} aria-haspopup="menu">
        <MoreHorizontal size={11} />
      </summary>
      <div role="menu">
        <button type="button" onClick={() => pin(session.id, tab.id)}>
          {tab.pinned ? <PinOff size={11} /> : <Pin size={11} />}
          {tab.pinned ? "Unpin" : "Pin"}
        </button>
        <button type="button" onClick={() => duplicate(session.id, tab.id)}>
          <Copy size={11} /> Duplicate
        </button>
        <button
          type="button"
          disabled={index === 0}
          onClick={() => reorder(session.id, index, index - 1)}
        >
          <ArrowLeft size={11} /> Move left
        </button>
        <button
          type="button"
          disabled={index === session.workbenchTabs.length - 1}
          onClick={() => reorder(session.id, index, index + 1)}
        >
          <ArrowRight size={11} /> Move right
        </button>
        <button
          type="button"
          disabled={tab.pinned}
          onClick={() => close(session.id, tab.id)}
        >
          <X size={11} /> Close
        </button>
      </div>
    </details>
  );
}

function WorkbenchContent({
  session,
  tab,
}: {
  session: AgentSession;
  tab: WorkbenchTab;
}) {
  switch (tab.type) {
    case "browser":
      return <BrowserTab session={session} tab={tab} />;
    case "terminal":
      return <TerminalTab session={session} tab={tab} />;
    case "diff":
      return <DiffTab session={session} tab={tab} />;
    case "agents":
      return <AgentsTab session={session} tab={tab} />;
    case "live-files":
      return <LiveFilesTab session={session} tab={tab} />;
  }
}

export function BrowserTab({
  session,
  tab,
}: {
  session: AgentSession;
  tab: WorkbenchTab;
}) {
  const update = useClyStore((state) => state.updateAgentSession);
  const notify = useClyStore((state) => state.notify);
  const browser = tab.state as BrowserTabState;
  const [address, setAddress] = useState(browser.url);
  const patchState = (patch: Partial<BrowserTabState>) =>
    update(session.id, (current) => ({
      ...current,
      workbenchTabs: current.workbenchTabs.map((item) =>
        item.id === tab.id
          ? { ...item, state: { ...(item.state as BrowserTabState), ...patch } }
          : item,
      ),
    }));
  return (
    <section className="agent-browser" aria-label="Research browser fixture">
      <div className="agent-browser-toolbar">
        <Button iconOnly variant="ghost" aria-label="Back">
          <ArrowLeft size={13} />
        </Button>
        <Button iconOnly variant="ghost" aria-label="Forward">
          <ArrowRight size={13} />
        </Button>
        <Button iconOnly variant="ghost" aria-label="Reload">
          <RefreshCw size={13} />
        </Button>
        <form
          className="agent-browser-address"
          onSubmit={(event) => {
            event.preventDefault();
            patchState({
              url: address,
              pageTitle: "Fixture research page",
              pageType: "article",
            });
          }}
        >
          <ShieldCheck size={12} />
          <input
            aria-label="Browser address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
        </form>
        <Button
          iconOnly
          variant="ghost"
          aria-label="Open externally"
          onClick={() => notify("External browser preview", browser.url)}
        >
          <ExternalLink size={13} />
        </Button>
      </div>
      <div className="agent-browser-actionbar">
        <span>
          {browser.pageType === "paper" ? "Research paper" : "Research page"}
        </span>
        <Button
          onClick={() => {
            patchState({ sourceAdded: true });
            notify("Page added as source", browser.pageTitle);
          }}
          disabled={browser.sourceAdded}
        >
          {browser.sourceAdded ? <Check size={12} /> : <Plus size={12} />}
          {browser.sourceAdded ? "Source added" : "Add page as source"}
        </Button>
        <Button
          onClick={() =>
            notify(
              "Citation captured",
              "Fixture citation copied to the active context.",
            )
          }
        >
          <Link2 size={12} /> Capture citation
        </Button>
      </div>
      <article className="agent-browser-page">
        <div className="agent-browser-paper-meta">
          RESEARCH ARTICLE · FIXTURE CONTENT
        </div>
        <h1>{browser.pageTitle}</h1>
        <p className="agent-browser-byline">
          A. Sayed, E. Peterson, S. Virani, A. Sniderman, A. Navar · JAMA
          Cardiology · 2024
        </p>
        <div className="agent-browser-rule" />
        <h2>Abstract</h2>
        <p>
          ApoB varies substantially among people with the same LDL-C. The study
          evaluates whether discordance is limited to identifiable metabolic
          subgroups using NHANES 2005–2016.
        </p>
        <div className="agent-browser-highlight">
          <span>Linked evidence</span>
          Higher triglycerides and BMI are associated with more positive ApoB
          discordance, but important within-group variability remains.
        </div>
        <h2>Evaluation protocol</h2>
        <p>
          Discordance is defined relative to the expected ApoB at a given LDL-C
          level. This biomarker comparison does not itself observe
          cardiovascular events.
        </p>
      </article>
    </section>
  );
}

export function TerminalTab({
  session,
  tab,
}: {
  session: AgentSession;
  tab: WorkbenchTab;
}) {
  const terminal = tab.state as TerminalTabState;
  const update = useClyStore((state) => state.updateAgentSession);
  const patch = (state: TerminalTabState) =>
    update(session.id, (current) => ({
      ...current,
      workbenchTabs: current.workbenchTabs.map((item) =>
        item.id === tab.id ? { ...item, state } : item,
      ),
    }));
  return (
    <section className="agent-terminal" aria-label="Fixture terminal output">
      <div className="agent-terminal-header">
        <div>
          <TerminalSquare size={14} />
          <span>
            <strong>{terminal.process}</strong>
            <small>{terminal.cwd}</small>
          </span>
        </div>
        <Badge tone={terminal.status === "running" ? "info" : "success"}>
          {terminal.status}
        </Badge>
        <Button iconOnly variant="ghost" aria-label="Find terminal output">
          <Search size={13} />
        </Button>
        <Button
          iconOnly
          variant="ghost"
          aria-label="Clear terminal"
          onClick={() => patch({ ...terminal, lines: [] })}
        >
          <CircleStop size={13} />
        </Button>
        <Button
          iconOnly
          variant="ghost"
          aria-label="Restart terminal"
          onClick={() =>
            patch({
              ...terminal,
              status: "running",
              lines: ["$ pnpm test --run", "collecting fixture tests…"],
            })
          }
        >
          <RotateCcw size={13} />
        </Button>
      </div>
      <ClyTerminal
        lines={terminal.lines}
        label={`${terminal.process} console`}
      />
    </section>
  );
}

export function DiffTab({
  session,
  tab,
}: {
  session: AgentSession;
  tab: WorkbenchTab;
}) {
  const diff = tab.state as DiffTabState;
  const update = useClyStore((state) => state.updateAgentSession);
  const notify = useClyStore((state) => state.notify);
  const selected =
    diff.files.find((file) => file.path === diff.selectedPath) ?? diff.files[0];
  const patchState = (patch: Partial<DiffTabState>) =>
    update(session.id, (current) => ({
      ...current,
      workbenchTabs: current.workbenchTabs.map((item) =>
        item.id === tab.id
          ? { ...item, state: { ...(item.state as DiffTabState), ...patch } }
          : item,
      ),
    }));
  return (
    <section className="agent-diff" aria-label="Code diff workspace">
      <aside className="agent-diff-files">
        <div className="agent-diff-files-heading">
          <strong>Changes</strong>
          <span>+60 −6</span>
        </div>
        <div className="agent-diff-group">Unstaged · {diff.files.length}</div>
        {diff.files.map((file) => (
          <button
            type="button"
            key={file.path}
            data-active={file.path === selected?.path}
            onClick={() => {
              patchState({ selectedPath: file.path });
              void dispatchWorkspaceMutation(session.id, "select_diff", {
                selectedDiffId: file.path,
              });
            }}
          >
            <FileCode2 size={13} />
            <span>
              <strong>{file.path.split("/").at(-1)}</strong>
              <small>{file.path}</small>
            </span>
            <i data-status={file.status}>
              {file.status.charAt(0).toUpperCase()}
            </i>
          </button>
        ))}
      </aside>
      {selected ? (
        <section className="agent-diff-main">
          <div className="agent-diff-toolbar">
            <div>
              <strong>{selected.path}</strong>
              <span>
                +{selected.additions} −{selected.deletions} · {selected.risk}
              </span>
            </div>
            <Segmented
              value={diff.layout}
              options={["unified", "split"] as const}
              onChange={(layout) => patchState({ layout })}
              label="Diff layout"
            />
            <Button
              onClick={() => patchState({ reviewState: "revision_requested" })}
            >
              Request revision
            </Button>
            <Button
              variant="primary"
              onClick={() => patchState({ reviewState: "approved" })}
            >
              <Check size={12} /> Approve
            </Button>
          </div>
          <div className="agent-diff-context">
            <span>
              <Bot size={11} /> Codex Implementation Agent
            </span>
            <span>
              <GitBranch size={11} /> {session.branch}
            </span>
            <span>
              <Link2 size={11} /> Primary reliability claim
            </span>
            <Badge
              tone={
                diff.reviewState === "approved"
                  ? "success"
                  : diff.reviewState === "revision_requested"
                    ? "warning"
                    : "neutral"
              }
            >
              {diff.reviewState.replace("_", " ")}
            </Badge>
          </div>
          <section
            className="agent-code-diff"
            aria-label={`Diff for ${selected.path}`}
          >
            {selected.diff.map((line, index) => (
              <div
                key={line}
                data-line={
                  line.startsWith("+")
                    ? "add"
                    : line.startsWith("-")
                      ? "delete"
                      : line.startsWith("@@")
                        ? "hunk"
                        : "context"
                }
              >
                <span>{index + 138}</span>
                <code>{line}</code>
              </div>
            ))}
          </section>
          <div className="agent-diff-footer">
            <Button
              variant="ghost"
              onClick={() => notify("File open preview", selected.path)}
            >
              <ExternalLink size={12} /> Open file
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                notify(
                  "Agent focused",
                  "Opened the responsible agent in Agents.",
                )
              }
            >
              <Bot size={12} /> Open responsible agent
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                notify(
                  "Question sent",
                  "The Orchestrator will explain this change in the transcript.",
                )
              }
            >
              <Link2 size={12} /> Ask Orchestrator
            </Button>
          </div>
        </section>
      ) : null}
    </section>
  );
}

export function AgentsTab({
  session,
  tab,
}: {
  session: AgentSession;
  tab: WorkbenchTab;
}) {
  const state = tab.state as AgentsTabState;
  const update = useClyStore((store) => store.updateAgentSession);
  const setConfig = useClyStore((store) => store.setAgentConfigurationId);
  const patchView = (view: AgentsTabState["view"]) =>
    update(session.id, (current) => ({
      ...current,
      workbenchTabs: current.workbenchTabs.map((item) =>
        item.id === tab.id ? { ...item, state: { view } } : item,
      ),
    }));
  return (
    <section className="agent-agents-tab" aria-label="Delegated agents">
      <div className="agent-surface-toolbar">
        <div>
          <strong>Delegated agents</strong>
          <span>
            {session.delegatedAgents.length} independent agent sessions
            coordinated by {session.orchestrator.name}
          </span>
        </div>
        <Segmented
          value={state.view}
          options={["tiled", "topology"] as const}
          onChange={patchView}
          label="Agents view"
        />
        <Button onClick={() => setConfig(session.orchestrator.id)}>
          <Settings2Icon /> Configure team
        </Button>
      </div>
      {state.view === "tiled" ? (
        <div className="agent-agent-grid">
          {[session.orchestrator, ...session.delegatedAgents].map(
            (identity) => (
              <AgentPane key={identity.id} session={session} agent={identity} />
            ),
          )}
        </div>
      ) : (
        <AgentTopology session={session} />
      )}
    </section>
  );
}

function Settings2Icon() {
  return <Braces size={12} />;
}

function AgentPane({
  session,
  agent,
}: {
  session: AgentSession;
  agent: AgentIdentity;
}) {
  const setConfig = useClyStore((state) => state.setAgentConfigurationId);
  const updateAgent = useClyStore((state) => state.updateDelegatedAgent);
  const notify = useClyStore((state) => state.notify);
  const [steering, setSteering] = useState("");
  const isOrchestrator = agent.role === "orchestrator";
  return (
    <article className="agent-pane" data-status={agent.status}>
      <header>
        <span className="agent-avatar">
          <Bot size={13} />
        </span>
        <div>
          <strong>{agent.name}</strong>
          <span>{agent.roleLabel}</span>
        </div>
        <Badge tone={toneForAgentStatus(agent.status)}>
          {agentStatusLabel[agent.status]}
        </Badge>
        <Button
          iconOnly
          variant="ghost"
          aria-label={`Configure ${agent.name}`}
          onClick={() => setConfig(agent.id)}
        >
          <MoreHorizontal size={13} />
        </Button>
      </header>
      <div className="agent-pane-model">
        <span>
          {agent.provider} · {agent.model}
        </span>
        <span>{agent.reasoningLevel} reasoning</span>
      </div>
      <div className="agent-pane-task">
        <span>Current task</span>
        <strong>{agent.task}</strong>
      </div>
      <div className="agent-pane-progress">
        <div>
          <span style={{ width: `${agent.progress}%` }} />
        </div>
        <strong>{agent.progress}%</strong>
      </div>
      <div className="agent-pane-now">
        <Play size={11} />
        <span>
          <strong>{agent.lastAction}</strong>
          {agent.currentResource}
        </span>
      </div>
      <div className="agent-pane-transcript">
        {agent.transcript.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <dl>
        <div>
          <dt>Context</dt>
          <dd>
            {agent.contextPackName} · {contextModeLabel[agent.contextMode]}
          </dd>
        </div>
        <div>
          <dt>Permissions</dt>
          <dd>
            {agent.permissions.canWriteFiles
              ? "Write with approval"
              : "Read-only"}{" "}
            · {agent.permissions.canAccessNetwork ? "Network" : "No network"}
          </dd>
        </div>
        <div>
          <dt>Worktree</dt>
          <dd>{agent.worktree ?? session.branch}</dd>
        </div>
        <div>
          <dt>Usage</dt>
          <dd>
            {agent.usage} · {agent.elapsed}
          </dd>
        </div>
      </dl>
      {!isOrchestrator ? (
        <form
          className="agent-steer"
          onSubmit={(event) => {
            event.preventDefault();
            if (!steering.trim()) return;
            updateAgent(session.id, agent.id, {
              lastAction: `Steered: ${steering}`,
              status: "working",
            });
            notify(
              "Steer message sent",
              `${agent.name} received the fixture prompt.`,
            );
            setSteering("");
          }}
        >
          <input
            aria-label={`Steer ${agent.name}`}
            value={steering}
            onChange={(event) => setSteering(event.target.value)}
            placeholder="Send a steer message…"
          />
          <Button
            type="submit"
            iconOnly
            variant="primary"
            aria-label={`Send steer to ${agent.name}`}
          >
            <ArrowUp size={12} />
          </Button>
        </form>
      ) : null}
    </article>
  );
}

function AgentTopology({ session }: { session: AgentSession }) {
  const nodes: AgentFlowNode[] = [
    {
      id: session.orchestrator.id,
      type: "clyAgent",
      position: { x: 250, y: 20 },
      data: {
        name: session.orchestrator.name,
        detail: "Orchestrator · coordinating",
        primary: true,
      },
    },
    ...session.delegatedAgents.map((agent, index) => ({
      id: agent.id,
      type: "clyAgent" as const,
      position: { x: 30 + index * 300, y: 210 },
      data: {
        name: agent.name,
        detail: `${agent.roleLabel} · ${agentStatusLabel[agent.status]}`,
        primary: false,
      },
    })),
  ];
  const edges = session.delegatedAgents.map((agent, index) => ({
    id: `${session.orchestrator.id}-${agent.id}`,
    source: session.orchestrator.id,
    target: agent.id,
    type: "smoothstep",
    label: index === 0 ? "active delegation" : "review loop",
    animated: false,
    style: {
      stroke:
        agent.status === "working"
          ? "var(--cly-accent)"
          : "var(--cly-border-strong)",
    },
    labelStyle: { fill: "var(--cly-text-muted)", fontSize: 9 },
    labelBgStyle: {
      fill: "var(--cly-surface-raised)",
      fillOpacity: 0.98,
    },
  }));

  return (
    <section className="agent-topology" aria-label="Agent delegation topology">
      <div className="agent-topology-flow">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={agentNodeTypes}
          fitView
          minZoom={0.5}
          maxZoom={1.5}
          nodesDraggable={false}
          nodesConnectable={false}
          aria-label="Agent delegation graph"
        >
          <Background gap={20} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <div className="agent-topology-legend">
        <span>
          <i data-tone="info" /> Active delegation
        </span>
        <span>
          <i data-tone="warning" /> Waiting dependency
        </span>
        <span>
          <i data-tone="success" /> Result returned
        </span>
      </div>
    </section>
  );
}

type AgentFlowNode = Node<
  { name: string; detail: string; primary: boolean },
  "clyAgent"
>;

function AgentFlowNodeView({ data, selected }: NodeProps<AgentFlowNode>) {
  return (
    <div
      className="agent-flow-node"
      data-primary={data.primary}
      data-selected={selected}
    >
      <Handle type="target" position={Position.Top} />
      {data.primary ? (
        <Bot size={17} aria-hidden="true" />
      ) : (
        <span className="agent-avatar">{data.name.charAt(0)}</span>
      )}
      <span>
        <strong>{data.name}</strong>
        <small>{data.detail}</small>
      </span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const agentNodeTypes = { clyAgent: AgentFlowNodeView };

export function LiveFilesTab({
  session,
  tab,
}: {
  session: AgentSession;
  tab: WorkbenchTab;
}) {
  const live = tab.state as LiveFilesTabState;
  const update = useClyStore((state) => state.updateAgentSession);
  const openTab = useClyStore((state) => state.openWorkbenchTab);
  const patchState = (patch: Partial<LiveFilesTabState>) =>
    update(session.id, (current) => ({
      ...current,
      workbenchTabs: current.workbenchTabs.map((item) =>
        item.id === tab.id
          ? {
              ...item,
              state: { ...(item.state as LiveFilesTabState), ...patch },
            }
          : item,
      ),
    }));
  const selected =
    live.edits.find((edit) => edit.filePath === live.selectedPath) ??
    live.edits[0];
  return (
    <section className="agent-live-files" aria-label="Live file observation">
      <aside className="agent-live-tree">
        <div className="agent-live-tree-heading">
          <strong>Changed files</strong>
          <span>{live.edits.length} live</span>
        </div>
        {live.edits.map((edit) => (
          <button
            type="button"
            key={edit.id}
            data-active={edit.id === selected?.id}
            onClick={() => {
              patchState({ selectedPath: edit.filePath });
              void dispatchWorkspaceMutation(session.id, "select_file", {
                selectedFileId: edit.filePath,
              });
            }}
          >
            <FileCode2 size={13} />
            <span>
              <strong>{edit.filePath.split("/").at(-1)}</strong>
              <small>
                {edit.agentId.replace("agent-", "")} · {edit.startedAt}
              </small>
            </span>
            <i />
          </button>
        ))}
      </aside>
      <section className="agent-live-main">
        <div className="agent-live-toolbar">
          <div>
            <strong>{selected?.filePath}</strong>
            <span>Read-only observation · fixture stream</span>
          </div>
          <span className="agent-live-toggle">
            <Toggle
              pressed={live.followAgent}
              onChange={(followAgent) => patchState({ followAgent })}
              label="Follow active agent"
            />{" "}
            Follow agent
          </span>
          <span className="agent-live-toggle">
            <Toggle
              pressed={live.autoScroll}
              onChange={(autoScroll) => patchState({ autoScroll })}
              label="Auto-scroll live file"
            />{" "}
            Auto-scroll
          </span>
          <span className="agent-live-toggle">
            <Toggle
              pressed={live.diffOverlay}
              onChange={(diffOverlay) => patchState({ diffOverlay })}
              label="Show diff overlay"
            />{" "}
            Diff overlay
          </span>
        </div>
        {selected ? (
          <>
            <div className="agent-live-edit-banner">
              <Bot size={13} />
              <span>
                <strong>Codex Implementation Agent</strong>Editing{" "}
                {selected.filePath} · Lines{" "}
                {selected.changedRanges[0]?.startLine}–
                {selected.changedRanges[0]?.endLine} modified{" "}
                {selected.startedAt}
              </span>
              <Badge tone="info">Live</Badge>
            </div>
            <section
              className="agent-live-code"
              aria-label={`Live view of ${selected.filePath}`}
            >
              {[
                "def discordantly_high_apob(frame):",
                "    ldl = weighted_percentile(frame.ldl_c)",
                "    apob = weighted_percentile(frame.apob)",
                "",
                "    # Keep the preregistered 20-point gap explicit.",
                "    gap = apob - ldl",
                "    outcome = gap >= 0.20",
                "",
                "    assert outcome.notna().all()",
                "    return outcome",
                "",
                "def report_guardrail():",
                "    return 'Biomarker discordance, not cardiovascular events'",
              ].map((line, index) => {
                const number = index + 139;
                const active =
                  number >= (selected.changedRanges[0]?.startLine ?? 0) &&
                  number <= (selected.changedRanges[0]?.endLine ?? 0);
                return (
                  <div
                    key={`${line}-${number}`}
                    data-active={active}
                    data-overlay={live.diffOverlay && active}
                  >
                    <span>{number}</span>
                    <code>{line || " "}</code>
                    {active && index === 5 ? <i>editing</i> : null}
                  </div>
                );
              })}
            </section>
            <div className="agent-live-timeline">
              <span>
                <i /> Now · {selected.summary}
              </span>
              <span>
                <i /> 22s · Reviewer opened regression test
              </span>
              <span>
                <i /> 1m · Orchestrator linked file to Claim 01
              </span>
              <Button onClick={() => openTab(session.id, "diff")}>
                <FileDiff size={12} /> Open corresponding diff
              </Button>
            </div>
          </>
        ) : null}
      </section>
    </section>
  );
}
