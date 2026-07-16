import {
  AppWindow,
  Archive,
  ArrowDown,
  ArrowRight,
  AtSign,
  Bot,
  ChevronDown,
  Circle,
  Clock3,
  Code2,
  ExternalLink,
  FilePlus2,
  GitBranch,
  History,
  Maximize2,
  MessageSquareText,
  MoreHorizontal,
  Paperclip,
  Pause,
  Pin,
  Plus,
  Search,
  Send,
  Settings2,
  ShieldAlert,
  Sparkles,
  Square,
  StopCircle,
  TerminalSquare,
  Users,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Badge, Button } from "../components/primitives";
import { ClySplitPane } from "../components/toolkit";
import { useClyStore } from "../store/cly-store";
import { demoAgentSessionServices } from "./demo-services";
import { AgentSessionsModeSwitcher, ClyDevTaskIdentitySurface } from "./shared";
import type {
  AgentMessage as AgentMessageType,
  AgentSession,
  ClyDevWorkspaceMode,
  DiffTabState,
  TerminalTabState,
} from "./types";
import { sessionStatusLabel, toneForAgentStatus } from "./utils";
import { AgentWorkbench } from "./workbench";

export function AgentSessionsChat() {
  const sessions = useClyStore((state) => state.data.agentSessions);
  const selectedId = useClyStore((state) => state.selectedAgentSessionId);
  const session = sessions.find((item) => item.id === selectedId);
  if (!session) return <EmptyChatMode sessions={sessions} />;
  return <ActiveChatMode session={session} />;
}

function EmptyChatMode({ sessions }: { sessions: AgentSession[] }) {
  const openSession = useClyStore((state) => state.openAgentSession);
  const setNewOpen = useClyStore((state) => state.setNewAgentSessionOpen);
  return (
    <div className="agent-chat-empty" data-testid="agent-chat-empty">
      <header>
        <AgentSessionsModeSwitcher />
        <Button variant="primary" onClick={() => setNewOpen(true)}>
          <Plus size={13} /> New session
        </Button>
      </header>
      <main>
        <div className="agent-chat-empty-mark">
          <Sparkles size={22} />
        </div>
        <h1>What should the Orchestrator work on?</h1>
        <p>
          Start a research-aware session with explicit context, a full agent
          team, permissions, and an approval policy.
        </p>
        <button
          type="button"
          className="agent-empty-composer"
          onClick={() => setNewOpen(true)}
        >
          <span>Describe a research task…</span>
          <kbd>⌘ Enter</kbd>
          <Send size={14} />
        </button>
        <div className="agent-suggested-workflows">
          {[
            "Audit a research claim",
            "Review current implementation",
            "Plan the next experiment",
            "Analyze a notebook",
            "Reproduce a result",
            "Review literature gaps",
            "Prepare a submission package",
            "Run a reproducibility audit",
          ].map((workflow) => (
            <button
              type="button"
              key={workflow}
              onClick={() => setNewOpen(true)}
            >
              <ArrowRight size={12} /> {workflow}
            </button>
          ))}
        </div>
        {sessions.length ? (
          <section className="agent-recent-sessions">
            <h2>Recent sessions</h2>
            {sessions.slice(0, 3).map((session) => (
              <button
                type="button"
                key={session.id}
                onClick={() => openSession(session.id)}
              >
                <span className="agent-avatar">
                  <Bot size={12} />
                </span>
                <span>
                  <strong>{session.title}</strong>
                  <small>
                    {sessionStatusLabel[session.status]} · {session.updatedAt}
                  </small>
                </span>
                <ArrowRight size={13} />
              </button>
            ))}
          </section>
        ) : null}
      </main>
    </div>
  );
}

function ActiveChatMode({ session }: { session: AgentSession }) {
  const [inspection, setInspection] = useState<"tests" | "diff" | null>(null);
  const chat = (
    <section className="agent-chat-pane" aria-label="Orchestrator conversation">
      <Conversation session={session} />
      {inspection ? (
        <TaskInspection
          session={session}
          kind={inspection}
          onClose={() => setInspection(null)}
        />
      ) : null}
      <ChatComposer session={session} />
    </section>
  );
  const workbench = <AgentWorkbench session={session} />;
  const inlineWorkspace = session.workspaceMode === "inline-workspace";
  return (
    <div className="agent-chat-mode" data-testid="agent-sessions-chat">
      <SessionHeader session={session} />
      <div className="cly-dev-task-bar">
        <ClyDevTaskIdentitySurface session={session} />
        <TaskWorkspaceControls session={session} onInspect={setInspection} />
        <TaskStateBanner session={session} />
      </div>
      {!inlineWorkspace ? (
        <div className="agent-chat-split" data-agent-only="true">
          {chat}
        </div>
      ) : session.workbenchMaximized ? (
        <div className="agent-chat-split" data-maximized="true">
          {workbench}
        </div>
      ) : session.workbenchCollapsed ? (
        <div className="agent-chat-split" data-collapsed="true">
          {chat}
          <CollapsedWorkbench session={session} />
        </div>
      ) : (
        <ClySplitPane
          id={`agent-chat-${session.id}`}
          className="agent-chat-split"
          primary={chat}
          secondary={workbench}
          secondarySize={session.workbenchWidth}
          primaryMin="330px"
          secondaryMin="300px"
          secondaryMax="58%"
          label="Resize chat and workbench"
        />
      )}
    </div>
  );
}

function TaskWorkspaceControls({
  session,
  onInspect,
}: {
  session: AgentSession;
  onInspect: (kind: "tests" | "diff") => void;
}) {
  const update = useClyStore((state) => state.updateAgentSession);
  const notify = useClyStore((state) => state.notify);
  const setMode = (workspaceMode: ClyDevWorkspaceMode) =>
    update(session.id, (current) => ({ ...current, workspaceMode }));
  const modes: Array<[ClyDevWorkspaceMode, string]> = [
    ["agent-only", "Agent only"],
    ["inline-workspace", "Inline workspace"],
    ["detached-workspace", "Detached workspace"],
    ["external-editor", "External editor"],
  ];
  return (
    <div className="cly-dev-task-controls">
      <div
        className="cly-dev-workspace-modes"
        role="radiogroup"
        aria-label="Task workspace mode"
      >
        {modes.map(([mode, label]) => (
          <label key={mode}>
            <input
              type="radio"
              name={`task-workspace-mode-${session.id}`}
              value={mode}
              checked={session.workspaceMode === mode}
              onChange={() => setMode(mode)}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <div
        className="cly-dev-task-actions"
        role="toolbar"
        aria-label="Task tools"
      >
        <Button variant="ghost" onClick={() => onInspect("tests")}>
          Inspect tests
        </Button>
        <Button variant="ghost" onClick={() => onInspect("diff")}>
          Inspect diff
        </Button>
        {session.workspaceMode === "inline-workspace" ? (
          <Button onClick={() => setMode("detached-workspace")}>
            <AppWindow size={12} /> Detach workspace (prototype)
          </Button>
        ) : null}
        {session.workspaceMode === "detached-workspace" ? (
          <Button onClick={() => setMode("inline-workspace")}>
            Reattach workspace (prototype)
          </Button>
        ) : null}
        {session.workspaceMode === "external-editor" ? (
          <Button
            onClick={() =>
              notify(
                "External editor intent recorded",
                `Prototype deep link for ${session.identity.workspace.branch}.`,
              )
            }
          >
            <ExternalLink size={12} /> Open editor (prototype)
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function TaskStateBanner({ session }: { session: AgentSession }) {
  const update = useClyStore((state) => state.updateAgentSession);
  const failedAgent = session.delegatedAgents.find(
    (agent) => agent.status === "failed",
  );
  const messages: string[] = [];
  if (session.connectionState === "offline") {
    messages.push(
      "Offline — saved conversation and inspection evidence remain available",
    );
  } else if (session.connectionState === "reconnecting") {
    messages.push("Reconnecting — new direction will wait for Core");
  }
  if (session.taskState === "interrupted-resumable") {
    messages.push(
      "Task was interrupted and can be resumed from its saved checkpoint",
    );
  } else if (session.taskState === "awaiting-approval") {
    messages.push(
      "Awaiting approval — review the inline approval event to continue",
    );
  } else if (session.taskState === "loading") {
    messages.push("Loading task state from Core");
  } else if (session.taskState === "failed") {
    messages.push("Task failed — inspect retained evidence before retrying");
  } else if (session.taskState === "canceled") {
    messages.push("Task canceled — conversation and evidence are retained");
  } else if (session.taskState === "unsupported") {
    messages.push("Task configuration is unsupported on this machine");
  }
  if (failedAgent) {
    messages.push(`Delegated agent failed — ${failedAgent.lastAction}`);
  }
  if (session.workspaceMode === "detached-workspace") {
    messages.push(
      "Detached workspace intent recorded — inline workspace remains the fallback",
    );
  } else if (session.workspaceMode === "external-editor") {
    messages.push(
      "External-editor deep-link mode selected — no editor has been opened yet",
    );
  }
  if (!messages.length) return null;
  const isAlert = session.taskState === "failed" || Boolean(failedAgent);
  return (
    <div
      className="cly-dev-task-state"
      role={isAlert ? "alert" : "status"}
      aria-live={isAlert ? "assertive" : "polite"}
    >
      <span>{messages.join(" · ")}</span>
      {session.taskState === "interrupted-resumable" ? (
        <Button
          onClick={() =>
            update(session.id, (current) => ({
              ...current,
              connectionState: "connected",
              status: "running",
              taskState: "streaming",
            }))
          }
        >
          Resume task
        </Button>
      ) : null}
    </div>
  );
}

function TaskInspection({
  session,
  kind,
  onClose,
}: {
  session: AgentSession;
  kind: "tests" | "diff";
  onClose: () => void;
}) {
  const terminal = session.workbenchTabs.find((tab) => tab.type === "terminal")
    ?.state as TerminalTabState | undefined;
  const diff = session.workbenchTabs.find((tab) => tab.type === "diff")
    ?.state as DiffTabState | undefined;
  return (
    <section
      className="cly-dev-inline-inspection"
      aria-label={kind === "tests" ? "Test inspection" : "Diff inspection"}
    >
      <header>
        <strong>{kind === "tests" ? "Tests" : "Diff"}</strong>
        <Button
          iconOnly
          variant="ghost"
          aria-label="Close inspection"
          onClick={onClose}
        >
          <X size={12} />
        </Button>
      </header>
      {kind === "tests" ? (
        <pre>
          {terminal?.lines.join("\n") ??
            "No retained test output for this task."}
        </pre>
      ) : diff?.files.length ? (
        <div>
          {diff.files.map((file) => (
            <article key={file.path}>
              <strong>{file.path}</strong>
              <span>
                +{file.additions} −{file.deletions} · {file.risk}
              </span>
            </article>
          ))}
        </div>
      ) : (
        <p>No retained diff for this task.</p>
      )}
    </section>
  );
}

export function SessionHeader({ session }: { session: AgentSession }) {
  const sessions = useClyStore((state) => state.data.agentSessions);
  const openSession = useClyStore((state) => state.openAgentSession);
  const setNewOpen = useClyStore((state) => state.setNewAgentSessionOpen);
  const setConfig = useClyStore((state) => state.setAgentConfigurationId);
  const pause = useClyStore((state) => state.pauseAgentSession);
  const stop = useClyStore((state) => state.stopAgentSession);
  const archive = useClyStore((state) => state.archiveAgentSession);
  const notify = useClyStore((state) => state.notify);
  return (
    <header className="agent-session-header">
      <AgentSessionsModeSwitcher compact />
      <div className="agent-session-switcher">
        <span className="agent-avatar">
          <Bot size={12} />
        </span>
        <select
          aria-label="Switch agent session"
          value={session.id}
          onChange={(event) => openSession(event.target.value)}
        >
          {sessions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
        <ChevronDown size={11} />
      </div>
      <div className="agent-session-header-status">
        <i data-state={session.connectionState} />
        <span>{session.orchestrator.name}</span>
        <Badge tone={toneForAgentStatus(session.status)}>
          {sessionStatusLabel[session.status]}
        </Badge>
      </div>
      <div className="agent-session-header-meta">
        <span>
          {session.orchestrator.model} · {session.orchestrator.reasoningLevel}
        </span>
        <button
          type="button"
          onClick={() =>
            notify("Context Composer opened", session.contextSummary)
          }
        >
          {session.activeContextPackName}
        </button>
        <span>
          <Users size={11} /> {session.delegatedAgents.length}
        </span>
        <span>
          <GitBranch size={11} /> {session.branch}
        </span>
        <span>
          <Clock3 size={11} /> {session.elapsed}
        </span>
        <span>{session.usageEstimate}</span>
      </div>
      <div className="agent-session-header-actions">
        {session.approvals.some((approval) => approval.state === "pending") ? (
          <Button
            className="agent-approval-inbox"
            onClick={() =>
              notify(
                "Approvals inbox",
                "Pending approvals are shown inline in this conversation.",
              )
            }
          >
            <ShieldAlert size={13} />
            <span>
              {session.approvals.filter((a) => a.state === "pending").length}
            </span>
          </Button>
        ) : null}
        <Button
          iconOnly
          variant="ghost"
          aria-label="Configure agent team"
          onClick={() => setConfig(session.orchestrator.id)}
        >
          <Settings2 size={14} />
        </Button>
        <Button
          iconOnly
          variant="ghost"
          aria-label="New session"
          onClick={() => setNewOpen(true)}
        >
          <Plus size={14} />
        </Button>
        <Button
          iconOnly
          variant="ghost"
          aria-label={
            session.status === "paused" ? "Resume session" : "Pause session"
          }
          onClick={() => pause(session.id)}
        >
          {session.status === "paused" ? (
            <Sparkles size={14} />
          ) : (
            <Pause size={14} />
          )}
        </Button>
        <details className="agent-session-menu">
          <summary aria-label="Session menu" aria-haspopup="menu">
            <MoreHorizontal size={14} />
          </summary>
          <div role="menu">
            <div className="agent-session-menu-meta">
              <span>
                <GitBranch size={11} /> {session.branch}
              </span>
              <span>
                <Clock3 size={11} /> {session.elapsed}
              </span>
              <span>{session.usageEstimate}</span>
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() =>
                notify("Rename session", "Fixture rename control opened.")
              }
            >
              <MessageSquareText size={12} /> Rename
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => stop(session.id)}
            >
              <StopCircle size={12} /> Stop session
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => archive(session.id)}
            >
              <Archive size={12} /> Archive
            </button>
          </div>
        </details>
      </div>
    </header>
  );
}

function Conversation({ session }: { session: AgentSession }) {
  const endRef = useRef<HTMLDivElement | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const visible = useMemo(
    () =>
      search.trim()
        ? session.messages.filter((message) =>
            `${message.title ?? ""} ${message.body}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
        : session.messages,
    [search, session.messages],
  );
  return (
    <div className="agent-conversation">
      <div className="agent-conversation-toolbar">
        <div>
          <strong>Orchestrator</strong>
          <span>{session.objective}</span>
        </div>
        {searchOpen ? (
          <label className="agent-conversation-search">
            <Search size={12} />
            <input
              aria-label="Search conversation"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button
              type="button"
              aria-label="Close conversation search"
              onClick={() => {
                setSearchOpen(false);
                setSearch("");
              }}
            >
              <X size={11} />
            </button>
          </label>
        ) : (
          <Button
            iconOnly
            variant="ghost"
            aria-label="Search conversation"
            onClick={() => setSearchOpen(true)}
          >
            <Search size={13} />
          </Button>
        )}
        <Button iconOnly variant="ghost" aria-label="Conversation history">
          <History size={13} />
        </Button>
      </div>
      <div className="agent-transcript" role="log" aria-live="polite">
        <div className="agent-transcript-date">
          <span>Today</span>
        </div>
        {visible.map((message) => (
          <AgentMessage key={message.id} session={session} message={message} />
        ))}
        <div ref={endRef} />
      </div>
      <button
        type="button"
        className="agent-jump-latest"
        onClick={() => endRef.current?.scrollIntoView({ behavior: "smooth" })}
      >
        <ArrowDown size={11} /> Jump to latest
      </button>
    </div>
  );
}

export function AgentMessage({
  session,
  message,
}: {
  session: AgentSession;
  message: AgentMessageType;
}) {
  const [expanded, setExpanded] = useState(!message.collapsed);
  const resolveApproval = useClyStore((state) => state.resolveAgentApproval);
  const openTab = useClyStore((state) => state.openWorkbenchTab);
  const notify = useClyStore((state) => state.notify);
  if (message.type === "system") {
    return (
      <div className="agent-message-system">
        <Circle size={7} /> <strong>{message.title}</strong>
        <span>{message.body}</span>
        <time>{message.timestamp}</time>
      </div>
    );
  }
  if (message.type === "user") {
    return (
      <article className="agent-message-user">
        <div className="agent-message-meta">
          <strong>You</strong>
          <time>{message.timestamp}</time>
        </div>
        <p>{message.body}</p>
        <MessageActions />
      </article>
    );
  }
  if (message.type === "delegation" || message.type === "agent_update") {
    return (
      <article className="agent-message-delegation" data-type={message.type}>
        <span className="agent-avatar">
          <Bot size={13} />
        </span>
        <div>
          <div className="agent-message-meta">
            <strong>{message.author}</strong>
            <Badge tone={message.type === "agent_update" ? "warning" : "info"}>
              {message.type === "agent_update"
                ? "Agent update"
                : "Delegated Agent"}
            </Badge>
            <time>{message.timestamp}</time>
          </div>
          <h3>{message.title}</h3>
          <p>{message.body}</p>
          <div className="agent-message-tags">
            {message.metadata?.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
          <div className="agent-inline-actions">
            <Button onClick={() => openTab(session.id, "agents")}>
              Open agent
            </Button>
            <Button onClick={() => notify("Task focused", message.title)}>
              View task
            </Button>
            <Button onClick={() => openTab(session.id, "agents")}>Steer</Button>
            {message.actions?.includes("Open diff") ? (
              <Button onClick={() => openTab(session.id, "diff")}>
                Open diff
              </Button>
            ) : null}
          </div>
        </div>
      </article>
    );
  }
  if (message.type === "approval") {
    const approval =
      session.approvals.find((item) => item.state === "pending") ??
      session.approvals[0];
    return (
      <article className="agent-message-approval" data-state={message.status}>
        <ShieldAlert size={16} />
        <div>
          <div className="agent-message-meta">
            <strong>Approval request</strong>
            <time>{message.timestamp}</time>
          </div>
          <h3>{message.title}</h3>
          <p>{message.body}</p>
          {approval ? (
            <dl>
              <div>
                <dt>Estimated compute</dt>
                <dd>{approval.estimate}</dd>
              </div>
              <div>
                <dt>Expected output</dt>
                <dd>{approval.expectedOutput}</dd>
              </div>
              <div>
                <dt>Affected claim</dt>
                <dd>{approval.affectedObject}</dd>
              </div>
            </dl>
          ) : null}
          {message.status === "pending" && approval ? (
            <div className="agent-inline-actions">
              <Button
                variant="primary"
                onClick={() =>
                  resolveApproval(session.id, approval.id, "approved")
                }
              >
                <ShieldAlert size={12} /> Approve
              </Button>
              <Button
                onClick={() =>
                  notify(
                    "Edit constraints",
                    "Fixture constraint editor opened.",
                  )
                }
              >
                Edit constraints
              </Button>
              <Button
                variant="danger"
                onClick={() =>
                  resolveApproval(session.id, approval.id, "rejected")
                }
              >
                Reject
              </Button>
            </div>
          ) : (
            <Badge tone={message.status === "approved" ? "success" : "danger"}>
              {message.status}
            </Badge>
          )}
        </div>
      </article>
    );
  }
  if (
    message.type === "tool_result" ||
    message.type === "tool_call" ||
    message.type === "reasoning"
  ) {
    return (
      <article className="agent-message-tool">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronDown size={12} />
          <Code2 size={13} />
          <strong>{message.title ?? "Tool activity"}</strong>
          <span>{message.author}</span>
          <time>{message.timestamp}</time>
        </button>
        {expanded ? <pre>{message.body}</pre> : null}
      </article>
    );
  }
  if (message.type === "artifact") {
    return (
      <article className="agent-message-artifact">
        <FilePlus2 size={16} />
        <div>
          <div className="agent-message-meta">
            <strong>Generated artifact</strong>
            <time>{message.timestamp}</time>
          </div>
          <h3>{message.title}</h3>
          <p>{message.body}</p>
          <div className="agent-inline-actions">
            <Button onClick={() => notify("Artifact opened", message.title)}>
              Open artifact
            </Button>
            <Button onClick={() => notify("Added to context", message.title)}>
              Add to context
            </Button>
          </div>
        </div>
      </article>
    );
  }
  if (message.type === "error" || message.type === "warning") {
    return (
      <article className="agent-message-alert" data-type={message.type}>
        <ShieldAlert size={16} />
        <div>
          <div className="agent-message-meta">
            <strong>{message.author}</strong>
            <Badge tone={message.type === "error" ? "danger" : "warning"}>
              {message.type}
            </Badge>
            <time>{message.timestamp}</time>
          </div>
          <h3>{message.title}</h3>
          <p>{message.body}</p>
          <div className="agent-inline-actions">
            {message.actions?.map((action) => (
              <Button
                key={action}
                onClick={() => {
                  if (action === "Inspect logs")
                    openTab(session.id, "terminal");
                  else if (action === "Reassign") openTab(session.id, "agents");
                  else notify(action, "Fixture agent recovery action queued.");
                }}
              >
                {action}
              </Button>
            ))}
          </div>
        </div>
      </article>
    );
  }
  return (
    <article className="agent-message-orchestrator" data-type={message.type}>
      <div className="agent-message-author">
        <span className="agent-avatar">
          <Sparkles size={12} />
        </span>
        <strong>{message.author}</strong>
        <time>{message.timestamp}</time>
      </div>
      {message.title ? <h3>{message.title}</h3> : null}
      <p>{message.body}</p>
      {message.metadata?.length ? (
        <div className="agent-message-tags">
          {message.metadata.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      ) : null}
      <MessageActions />
    </article>
  );
}

function MessageActions() {
  const notify = useClyStore((state) => state.notify);
  return (
    <div className="agent-message-actions">
      <button
        type="button"
        onClick={() =>
          notify("Copied", "Message copied to the clipboard fixture.")
        }
      >
        Copy
      </button>
      <button
        type="button"
        onClick={() =>
          notify("Response pinned", "Added to project memory fixture.")
        }
      >
        <Pin size={10} /> Pin
      </button>
      <button
        type="button"
        onClick={() =>
          notify(
            "Branch preview",
            "A branch-from-message flow would start here.",
          )
        }
      >
        Branch
      </button>
      <button
        type="button"
        onClick={() =>
          notify(
            "Research object preview",
            "Create a claim, source, decision, or note from this response.",
          )
        }
      >
        Create object
      </button>
    </div>
  );
}

export function ChatComposer({ session }: { session: AgentSession }) {
  const setDraft = useClyStore((state) => state.setAgentSessionDraft);
  const append = useClyStore((state) => state.appendAgentMessage);
  const update = useClyStore((state) => state.updateAgentSession);
  const notify = useClyStore((state) => state.notify);
  const [streaming, setStreaming] = useState(false);
  const [enterSends, setEnterSends] = useState(false);
  const send = async () => {
    const body = session.draft.trim();
    if (!body || streaming) return;
    append(session.id, {
      id: `user-${Date.now()}`,
      type: "user",
      author: "You",
      body,
      timestamp: "Just now",
    });
    setDraft(session.id, "");
    setStreaming(true);
    for await (const message of demoAgentSessionServices.transcript.send(
      session.id,
      body,
    )) {
      append(session.id, message);
    }
    update(session.id, (current) => ({
      ...current,
      progress: Math.min(96, current.progress + 3),
      updatedAt: "Just now",
    }));
    setStreaming(false);
  };
  return (
    <div className="agent-composer-shell">
      <div className="agent-context-strip">
        <button
          type="button"
          onClick={() =>
            notify(
              "Context Composer opened",
              `${session.contextSummary} · ${session.activeContextPackName}`,
            )
          }
        >
          <Sparkles size={11} />
          <strong>{session.activeContextPackName}</strong>
          <span>{session.contextSummary}</span>
        </button>
        <span>
          <Pin size={10} /> 3 pinned
        </span>
        <Badge tone="success">Within budget</Badge>
      </div>
      <div className="agent-composer" data-streaming={streaming}>
        <textarea
          aria-label="Message the Orchestrator"
          value={session.draft}
          onChange={(event) => setDraft(session.id, event.target.value)}
          onKeyDown={(event) => {
            const metaSend =
              (event.metaKey || event.ctrlKey) && event.key === "Enter";
            const plainSend =
              enterSends && event.key === "Enter" && !event.shiftKey;
            if (metaSend || plainSend) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder="Message the Orchestrator… Use @ to mention a claim, source, experiment, file, or notebook."
          rows={3}
        />
        <div className="agent-composer-toolbar">
          <div>
            <Button
              iconOnly
              variant="ghost"
              aria-label="Attach file"
              onClick={() =>
                notify(
                  "Attachment picker",
                  "Choose a source, notebook, file, run, or claim.",
                )
              }
            >
              <Paperclip size={14} />
            </Button>
            <Button
              iconOnly
              variant="ghost"
              aria-label="Mention research object"
              onClick={() => setDraft(session.id, `${session.draft}@`)}
            >
              <AtSign size={14} />
            </Button>
            <Button
              iconOnly
              variant="ghost"
              aria-label="Slash commands"
              onClick={() => setDraft(session.id, `${session.draft}/`)}
            >
              <Code2 size={14} />
            </Button>
            <details className="agent-composer-options">
              <summary aria-label="Composer options" aria-haspopup="menu">
                <MoreHorizontal size={14} />
              </summary>
              <div role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() =>
                    notify("Model selector", session.orchestrator.model)
                  }
                >
                  Model <span>{session.orchestrator.model}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() =>
                    notify(
                      "Reasoning selector",
                      session.orchestrator.reasoningLevel,
                    )
                  }
                >
                  Reasoning <span>{session.orchestrator.reasoningLevel}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => notify("Agent plan", session.preset)}
                >
                  Plan <span>{session.preset}</span>
                </button>
              </div>
            </details>
          </div>
          <div>
            <label className="agent-enter-setting">
              <input
                type="checkbox"
                checked={enterSends}
                onChange={(event) => setEnterSends(event.target.checked)}
              />{" "}
              Enter sends
            </label>
            <span className="agent-send-hint">⌘ Enter</span>
            <Button
              iconOnly
              variant="primary"
              aria-label={streaming ? "Stop generation" : "Send message"}
              disabled={!session.draft.trim() && !streaming}
              onClick={() => (streaming ? setStreaming(false) : void send())}
            >
              {streaming ? <Square size={12} /> : <Send size={13} />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CollapsedWorkbench({ session }: { session: AgentSession }) {
  const toggle = useClyStore((state) => state.toggleWorkbench);
  const openTab = useClyStore((state) => state.openWorkbenchTab);
  return (
    <nav className="agent-workbench-rail" aria-label="Collapsed workbench">
      <Button
        iconOnly
        variant="ghost"
        aria-label="Expand workbench"
        onClick={() => toggle(session.id)}
      >
        <Maximize2 size={14} />
      </Button>
      {session.workbenchTabs.map((tab) => (
        <Button
          key={tab.id}
          iconOnly
          variant="ghost"
          aria-label={`Open ${tab.title}`}
          onClick={() => {
            openTab(session.id, tab.type);
            toggle(session.id);
          }}
        >
          {tab.type === "terminal" ? (
            <TerminalSquare size={14} />
          ) : tab.type === "agents" ? (
            <Users size={14} />
          ) : (
            <Code2 size={14} />
          )}
        </Button>
      ))}
    </nav>
  );
}
