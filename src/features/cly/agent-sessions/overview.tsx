import {
  Archive,
  Bot,
  ChevronRight,
  Clock3,
  ExternalLink,
  Filter,
  GitBranch,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
import { useMemo } from "react";
import { Badge, Button } from "../components/primitives";
import { useClyStore } from "../store/cly-store";
import { AgentSessionsModeSwitcher } from "./shared";
import type { AgentSession, AgentSessionOverviewSort } from "./types";
import { sessionStatusLabel, toneForAgentStatus } from "./utils";

const isActive = (session: AgentSession) =>
  ["running", "waiting_approval", "paused"].includes(session.status);

export function AgentSessionsOverview() {
  const sessions = useClyStore((state) => state.data.agentSessions);
  const presets = useClyStore((state) => state.data.agentPresets);
  const filter = useClyStore((state) => state.agentSessionFilter);
  const sort = useClyStore((state) => state.agentSessionSort);
  const search = useClyStore((state) => state.agentSessionSearch);
  const selectedId = useClyStore((state) => state.selectedOverviewSessionId);
  const setFilter = useClyStore((state) => state.setAgentSessionFilter);
  const setSort = useClyStore((state) => state.setAgentSessionSort);
  const setSearch = useClyStore((state) => state.setAgentSessionSearch);
  const setSelected = useClyStore((state) => state.setSelectedOverviewSession);
  const setNewOpen = useClyStore((state) => state.setNewAgentSessionOpen);
  const openSession = useClyStore((state) => state.openAgentSession);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sessions
      .filter((session) => {
        if (filter === "active" && !isActive(session)) return false;
        if (filter === "history" && isActive(session)) return false;
        if (
          filter === "approvals" &&
          !session.approvals.some((approval) => approval.state === "pending")
        )
          return false;
        if (!query) return true;
        return [
          session.title,
          session.objective,
          session.preset,
          session.orchestrator.name,
          session.relatedResearchObject,
        ].some((value) => value.toLowerCase().includes(query));
      })
      .sort((a, b) => {
        if (sort === "progress") return b.progress - a.progress;
        if (sort === "status") return a.status.localeCompare(b.status);
        if (sort === "title") return a.title.localeCompare(b.title);
        return sessions.indexOf(a) - sessions.indexOf(b);
      });
  }, [filter, search, sessions, sort]);

  const selected = sessions.find((session) => session.id === selectedId);
  const pendingApprovals = sessions.reduce(
    (count, session) =>
      count +
      session.approvals.filter((approval) => approval.state === "pending")
        .length,
    0,
  );

  return (
    <div className="agent-overview" data-testid="agent-sessions-overview">
      <header className="agent-overview-header">
        <div className="agent-overview-title-row">
          <div>
            <span className="agent-eyebrow">Workspace</span>
            <h1>Agent Sessions</h1>
          </div>
          <AgentSessionsModeSwitcher />
        </div>
        <div className="agent-overview-actions">
          <label className="agent-search">
            <Search size={14} />
            <span className="cly-sr-only">Search sessions</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search sessions"
            />
          </label>
          <Button onClick={() => setNewOpen(true)} variant="primary">
            <Plus size={13} /> New session
          </Button>
        </div>
      </header>

      <div className="agent-overview-toolbar">
        <div
          className="agent-filter-tabs"
          role="tablist"
          aria-label="Session groups"
        >
          {(
            [
              ["active", "Active", sessions.filter(isActive).length],
              [
                "history",
                "History",
                sessions.filter((session) => !isActive(session)).length,
              ],
              ["approvals", "Approvals", pendingApprovals],
            ] as const
          ).map(([value, label, count]) => (
            <button
              type="button"
              role="tab"
              aria-selected={filter === value}
              key={value}
              onClick={() => setFilter(value)}
            >
              {label} <span>{count}</span>
            </button>
          ))}
        </div>
        <fieldset className="agent-compact-stats">
          <legend className="cly-sr-only">Session summary</legend>
          <span>
            <i data-tone="info" />{" "}
            {sessions.filter((s) => s.status === "running").length} running
          </span>
          <span>
            <i data-tone="warning" /> {pendingApprovals} waiting
          </span>
          <span>
            <i data-tone="success" />{" "}
            {sessions.filter((s) => s.status === "completed").length} completed
          </span>
          <span>
            <Sparkles size={11} /> {presets.length} presets
          </span>
        </fieldset>
        <label className="agent-sort">
          <Filter size={12} />
          <span className="cly-sr-only">Sort sessions</span>
          <select
            value={sort}
            onChange={(event) =>
              setSort(event.target.value as AgentSessionOverviewSort)
            }
          >
            <option value="recent">Most recent</option>
            <option value="progress">Progress</option>
            <option value="status">Status</option>
            <option value="title">Title</option>
          </select>
        </label>
      </div>

      <div
        className="agent-overview-layout"
        data-inspector={selected ? "open" : "summary"}
      >
        <section className="agent-session-list" aria-label="Agent sessions">
          <div className="agent-session-list-heading">
            <span>{visible.length} sessions</span>
            <span>Demo runtime · local only</span>
          </div>
          {visible.length ? (
            visible.map((session) => (
              <OverviewSessionRow
                key={session.id}
                session={session}
                selected={selectedId === session.id}
                onSelect={() => setSelected(session.id)}
                onOpen={() => openSession(session.id)}
              />
            ))
          ) : (
            <div className="agent-overview-empty">
              <Bot size={22} />
              <h2>No sessions in this view</h2>
              <p>
                Start a session with an Orchestrator, explicit context, and an
                agent-team preset.
              </p>
              <Button variant="primary" onClick={() => setNewOpen(true)}>
                <Plus size={13} /> New session
              </Button>
            </div>
          )}
        </section>
        <OverviewInspector session={selected} onOpen={openSession} />
      </div>
    </div>
  );
}

export function OverviewSessionRow({
  session,
  selected,
  onSelect,
  onOpen,
}: {
  session: AgentSession;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const pause = useClyStore((state) => state.pauseAgentSession);
  const archive = useClyStore((state) => state.archiveAgentSession);
  const setConfigurationId = useClyStore(
    (state) => state.setAgentConfigurationId,
  );
  const pending = session.approvals.filter(
    (approval) => approval.state === "pending",
  ).length;
  return (
    <article
      className="agent-session-row"
      data-selected={selected}
      data-status={session.status}
      aria-label={`${session.title}, ${sessionStatusLabel[session.status]}`}
    >
      <div className="agent-session-status-rail" />
      <div className="agent-session-main">
        <div className="agent-session-primary">
          <div className="agent-session-title-line">
            <h2>
              <button
                type="button"
                className="agent-session-select"
                onClick={onSelect}
              >
                {session.title}
              </button>
            </h2>
            <Badge tone={toneForAgentStatus(session.status)}>
              {sessionStatusLabel[session.status]}
            </Badge>
            {pending ? (
              <span className="agent-approval-count">
                <ShieldAlert size={11} /> {pending} approval
              </span>
            ) : null}
          </div>
          <p>{session.objective}</p>
          <div className="agent-session-progress-line">
            <div
              className="agent-progress"
              aria-label={`${session.progress}% complete`}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={session.progress}
            >
              <span style={{ width: `${session.progress}%` }} />
            </div>
            <strong>{session.progress}%</strong>
            <span>{session.orchestrator.lastAction}</span>
          </div>
        </div>
        <div className="agent-session-team">
          <div className="agent-avatar-stack">
            <span className="cly-sr-only">
              {session.delegatedAgents.length} delegated agents
            </span>
            <span className="agent-avatar">
              <Bot size={12} />
            </span>
            {session.delegatedAgents.slice(0, 3).map((agent) => (
              <span className="agent-avatar" key={agent.id} title={agent.name}>
                {agent.name.charAt(0)}
              </span>
            ))}
          </div>
          <div>
            <strong>{session.orchestrator.name}</strong>
            <span>
              {session.delegatedAgents.length} delegated · {session.preset}
            </span>
          </div>
        </div>
      </div>
      <div className="agent-session-meta">
        <span>
          {session.identity.repository.name} · {session.identity.machine.name}
        </span>
        <span>
          <GitBranch size={11} /> {session.branch}
        </span>
        <span>
          {session.orchestrator.model} · {session.orchestrator.reasoningLevel}
        </span>
        <span>
          {session.activeContextPackName} · {session.contextSummary}
        </span>
        <span>
          <Clock3 size={11} /> {session.elapsed} · {session.updatedAt}
        </span>
        <span>
          {session.artifacts.length} outputs · {session.relatedResearchObject}
        </span>
      </div>
      <div className="agent-session-actions">
        {isActive(session) ? (
          <Button
            iconOnly
            variant="ghost"
            aria-label={
              session.status === "paused" ? "Resume session" : "Pause session"
            }
            onClick={(event) => {
              event.stopPropagation();
              pause(session.id);
            }}
          >
            {session.status === "paused" ? (
              <Play size={13} />
            ) : (
              <Pause size={13} />
            )}
          </Button>
        ) : (
          <Button
            iconOnly
            variant="ghost"
            aria-label="Archive session"
            onClick={(event) => {
              event.stopPropagation();
              archive(session.id);
            }}
          >
            <Archive size={13} />
          </Button>
        )}
        <Button
          iconOnly
          variant="ghost"
          aria-label="Configure agent team"
          onClick={(event) => {
            event.stopPropagation();
            setConfigurationId(session.orchestrator.id);
          }}
        >
          <Settings2 size={13} />
        </Button>
        <Button
          variant="primary"
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
        >
          Open chat <ChevronRight size={13} />
        </Button>
      </div>
    </article>
  );
}

function OverviewInspector({
  session,
  onOpen,
}: {
  session?: AgentSession;
  onOpen: (id: string) => void;
}) {
  const notify = useClyStore((state) => state.notify);
  if (!session) {
    return (
      <aside
        className="agent-overview-inspector compact"
        aria-label="Project agent summary"
      >
        <div className="agent-inspector-empty">
          <Users size={18} />
          <h2>Research agents</h2>
          <p>
            Select a session to inspect its objective, team, context, outputs,
            and approvals.
          </p>
          <span>Sessions continue running when you leave Chat Mode.</span>
        </div>
      </aside>
    );
  }
  return (
    <aside
      className="agent-overview-inspector"
      aria-label={`${session.title} details`}
    >
      <div className="agent-inspector-header">
        <div>
          <span>{sessionStatusLabel[session.status]}</span>
          <h2>{session.title}</h2>
        </div>
        <Button iconOnly variant="ghost" aria-label="Session menu">
          <MoreHorizontal size={14} />
        </Button>
      </div>
      <p className="agent-inspector-objective">{session.objective}</p>
      <div className="agent-inspector-section">
        <h3>Agent team</h3>
        {[session.orchestrator, ...session.delegatedAgents].map((agent) => (
          <div className="agent-inspector-agent" key={agent.id}>
            <span className="agent-avatar">{agent.name.charAt(0)}</span>
            <div>
              <strong>{agent.name}</strong>
              <span>
                {agent.roleLabel} · {agent.model}
              </span>
            </div>
            <i data-status={agent.status} title={agent.status} />
          </div>
        ))}
      </div>
      <dl className="agent-inspector-details">
        <div>
          <dt>Context</dt>
          <dd>
            {session.activeContextPackName}
            <small>{session.contextSummary}</small>
          </dd>
        </div>
        <div>
          <dt>Branch</dt>
          <dd>
            {session.branch}
            <small>{session.worktree ?? "Project working tree"}</small>
          </dd>
        </div>
        <div>
          <dt>Usage</dt>
          <dd>
            {session.usageEstimate}
            <small>{session.elapsed} elapsed</small>
          </dd>
        </div>
        <div>
          <dt>Related</dt>
          <dd>{session.relatedResearchObject}</dd>
        </div>
      </dl>
      {session.risk ? (
        <div className="agent-inspector-risk">
          <ShieldAlert size={13} />
          <span>
            <strong>Current risk</strong>
            {session.risk}
          </span>
        </div>
      ) : null}
      <div className="agent-inspector-section">
        <h3>Recent outputs</h3>
        {session.artifacts.map((artifact) => (
          <button
            type="button"
            className="agent-output-link"
            key={artifact}
            onClick={() => notify("Output opened", artifact)}
          >
            <ExternalLink size={12} /> {artifact}
          </button>
        ))}
      </div>
      <Button
        variant="primary"
        className="agent-inspector-open"
        onClick={() => onOpen(session.id)}
      >
        Open chat <ChevronRight size={13} />
      </Button>
    </aside>
  );
}
