import {
  AlertTriangle,
  Bot,
  Check,
  CircleDot,
  Clock3,
  FileText,
  GitBranch,
  Laptop,
  RefreshCw,
  ShieldAlert,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  AgentSession,
  AgentSessionStatus,
  ClyDevSessionOverview,
  ClyDevSessionState,
} from "../agent-sessions/types";
import { StatusIndicator } from "../components/design-system";
import {
  Button,
  EmptyState,
  PageHeader,
  SearchInput,
} from "../components/primitives";
import { capabilityUnavailableMessage } from "../services/capabilities";
import { isClyTestFixtureRuntime } from "../services/runtime";
import { useClyStore } from "../store/cly-store";

export type DevBoardLaneId = "active" | "attention" | "finished";

export interface DevBoardCard {
  id: string;
  title: string;
  objective: string;
  repository: string;
  machine: string;
  provider: string;
  model: string;
  branch: string;
  usage: string;
  progress?: number;
  agents: number;
  artifacts: number;
  updatedAt: string;
  activity: string;
  lane: DevBoardLaneId;
  status: AgentSessionStatus | ClyDevSessionState;
  attention?: string;
  fixtureSession: boolean;
}

const laneForFixtureStatus = (status: AgentSessionStatus): DevBoardLaneId => {
  if (status === "completed" || status === "archived") return "finished";
  if (
    status === "waiting_approval" ||
    status === "failed" ||
    status === "paused" ||
    status === "stopped"
  )
    return "attention";
  return "active";
};

const laneForDurableState = (state: ClyDevSessionState): DevBoardLaneId => {
  if (state === "completed" || state === "canceled") return "finished";
  if (
    state === "awaiting_approval" ||
    state === "failed" ||
    state === "interrupted" ||
    state === "resumable"
  )
    return "attention";
  return "active";
};

export const boardCardsFromFixtureSessions = (
  sessions: AgentSession[],
): DevBoardCard[] =>
  sessions.map((session) => {
    const pendingApprovals = session.approvals.filter(
      (approval) => approval.state === "pending",
    ).length;
    const attention = pendingApprovals
      ? `${pendingApprovals} approval${pendingApprovals === 1 ? "" : "s"} needed`
      : session.status === "failed"
        ? session.risk || "Session failed"
        : session.status === "paused"
          ? "Session paused"
          : session.status === "stopped"
            ? "Session stopped"
            : undefined;
    return {
      id: session.id,
      title: session.title,
      objective: session.objective,
      repository: session.identity.repository.name,
      machine: session.identity.machine.name,
      provider: session.orchestrator.provider,
      model: session.orchestrator.model,
      branch: session.branch,
      usage: session.usageEstimate,
      progress: session.progress,
      agents: 1 + session.delegatedAgents.length,
      artifacts: session.artifacts.length,
      updatedAt: session.updatedAt,
      activity:
        session.status === "completed"
          ? `Completed ${session.updatedAt.toLowerCase()}`
          : session.orchestrator.lastAction,
      lane: laneForFixtureStatus(session.status),
      status: session.status,
      attention,
      fixtureSession: true,
    };
  });

export const boardCardsFromDurableSessions = (
  sessions: ClyDevSessionOverview[],
): DevBoardCard[] =>
  sessions.map((session) => ({
    id: session.id,
    title: session.title || session.id,
    objective: `${session.lastSequence} durable events`,
    repository:
      typeof session.repositoryName === "string"
        ? session.repositoryName
        : "Local repository",
    machine: "Local machine",
    provider: session.providerId,
    model: session.model,
    branch:
      typeof session.branch === "string" ? session.branch : session.commit.sha,
    usage: `${session.lastSequence} events`,
    agents: 1,
    artifacts: 0,
    updatedAt: session.updatedAt,
    activity:
      session.state === "completed"
        ? "Session completed"
        : `Durable session ${session.state.replace("_", " ")}`,
    lane: laneForDurableState(session.state),
    status: session.state,
    attention:
      session.pendingApprovalCount > 0
        ? `${session.pendingApprovalCount} approval${session.pendingApprovalCount === 1 ? "" : "s"} needed`
        : ["failed", "interrupted", "resumable"].includes(session.state)
          ? session.state === "resumable"
            ? "Ready to resume"
            : `Session ${session.state}`
          : undefined,
    fixtureSession: false,
  }));

export const groupBoardCards = (cards: DevBoardCard[]) => ({
  active: cards.filter((card) => card.lane === "active"),
  attention: cards.filter((card) => card.lane === "attention"),
  finished: cards.filter((card) => card.lane === "finished"),
});

const lanes: Array<{
  id: DevBoardLaneId;
  label: string;
  tone: "success" | "warning" | "neutral";
}> = [
  { id: "active", label: "Active", tone: "success" },
  { id: "attention", label: "Attention", tone: "warning" },
  { id: "finished", label: "Finished", tone: "neutral" },
];

function DevBoardSessionCard({
  card,
  onOpen,
}: {
  card: DevBoardCard;
  onOpen: () => void;
}) {
  const ActivityIcon =
    card.lane === "attention"
      ? card.status === "failed"
        ? AlertTriangle
        : ShieldAlert
      : card.lane === "finished"
        ? Check
        : CircleDot;
  return (
    <li>
      <button
        type="button"
        className="cly-dev-board-card"
        onClick={onOpen}
        aria-label={`Open ${card.title} session`}
      >
        <span className="cly-dev-board-card-heading">
          <span className="cly-dev-board-avatar" aria-hidden="true">
            <Bot />
          </span>
          <strong>{card.title}</strong>
          <span className="cly-dev-board-provider" title={card.provider}>
            {card.provider.slice(0, 1).toUpperCase()}
          </span>
        </span>
        <span className="cly-dev-board-card-meta">
          <span>
            <Bot aria-hidden="true" /> {card.model}
          </span>
          <span>
            <GitBranch aria-hidden="true" /> {card.branch}
          </span>
        </span>
        <span className="cly-dev-board-card-meta">
          <span>{card.usage}</span>
          {card.progress !== undefined ? <span>{card.progress}%</span> : null}
          <span>
            <Users aria-hidden="true" /> {card.agents}
          </span>
          <span>
            <FileText aria-hidden="true" /> {card.artifacts}
          </span>
        </span>
        <span className="cly-dev-board-card-context">
          <Laptop aria-hidden="true" /> {card.repository} · {card.machine}
        </span>
        <span className="cly-dev-board-card-activity" data-lane={card.lane}>
          <span>
            <ActivityIcon aria-hidden="true" />
            {card.attention ?? card.activity}
          </span>
          <time>{card.updatedAt}</time>
        </span>
      </button>
    </li>
  );
}

export function ClyDevBoardScreen() {
  const projectId = useClyStore((state) => state.activeProjectId);
  const fixtureSessions = useClyStore((state) => state.data.agentSessions);
  const durableSessions = useClyStore((state) => state.clyDevSessions);
  const loading = useClyStore((state) => state.clyDevSessionsLoading);
  const error = useClyStore((state) => state.clyDevSessionsError);
  const load = useClyStore((state) => state.loadClyDevSessions);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!isClyTestFixtureRuntime) void load(projectId);
  }, [load, projectId]);

  const cards = useMemo(
    () =>
      isClyTestFixtureRuntime
        ? boardCardsFromFixtureSessions(fixtureSessions)
        : boardCardsFromDurableSessions(durableSessions),
    [fixtureSessions, durableSessions],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const visibleCards = normalizedQuery
    ? cards.filter((card) =>
        `${card.title} ${card.objective} ${card.repository} ${card.model} ${card.branch} ${card.activity}`
          .toLowerCase()
          .includes(normalizedQuery),
      )
    : cards;
  const grouped = groupBoardCards(visibleCards);
  const attentionCount = grouped.attention.length;

  const openNewSession = () => {
    if (!isClyTestFixtureRuntime) return;
    const store = useClyStore.getState();
    store.setAgentSessionsMode("overview");
    store.setNewAgentSessionOpen(true);
  };

  const openSession = (card: DevBoardCard) => {
    const store = useClyStore.getState();
    if (card.fixtureSession) store.openAgentSession(card.id);
    else
      useClyStore.setState({
        activeProduct: "dev",
        activeScreen: "agents",
        agentSessionsMode: "overview",
        selectedAgentSessionId: card.id,
      });
  };

  return (
    <div className="cly-page cly-page-wide cly-route-dev cly-route-dev-board">
      <PageHeader
        kicker="Cly Dev"
        title="Board"
        description="Live agent work grouped by execution state."
        actions={
          <>
            <StatusIndicator tone="success">
              <Laptop /> Local Mac connected
            </StatusIndicator>
            <Button
              variant="primary"
              disabled={!isClyTestFixtureRuntime}
              title={
                isClyTestFixtureRuntime
                  ? "Create a new agent session"
                  : capabilityUnavailableMessage("agents.execute")
              }
              onClick={openNewSession}
            >
              <Bot /> New session
            </Button>
          </>
        }
      />
      <div
        className="cly-dev-board-toolbar"
        role="toolbar"
        aria-label="Board controls"
      >
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search sessions…"
          label="Search board sessions"
        />
        <span>{visibleCards.length} sessions</span>
        <span>
          <CircleDot aria-hidden="true" /> {grouped.active.length} active
        </span>
        <span data-tone={attentionCount ? "warning" : "neutral"}>
          <ShieldAlert aria-hidden="true" /> {attentionCount} need attention
        </span>
        {!isClyTestFixtureRuntime ? (
          <Button
            iconOnly
            variant="ghost"
            aria-label="Refresh board"
            onClick={() => void load(projectId)}
          >
            <RefreshCw aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      {loading && cards.length === 0 ? (
        <EmptyState
          icon={<RefreshCw />}
          title="Loading the agent board"
          description="Recovering durable session state from this project."
        />
      ) : error ? (
        <EmptyState
          icon={<AlertTriangle />}
          title="The agent board is unavailable"
          description={error}
          action={<Button onClick={() => void load(projectId)}>Retry</Button>}
        />
      ) : cards.length === 0 ? (
        <EmptyState
          icon={<Bot />}
          title="No sessions on the board"
          description="Start an agent session and its live state will appear here."
        />
      ) : (
        <section
          className="cly-dev-board-lanes"
          aria-label="Agent session board"
        >
          {lanes.map((lane) => {
            const laneCards = grouped[lane.id];
            return (
              <section
                className="cly-dev-board-lane"
                data-lane={lane.id}
                key={lane.id}
                aria-labelledby={`cly-board-${lane.id}`}
              >
                <header>
                  <h2 id={`cly-board-${lane.id}`}>
                    <StatusIndicator tone={lane.tone}>
                      {lane.label}
                    </StatusIndicator>
                  </h2>
                  <span>{laneCards.length}</span>
                </header>
                {laneCards.length ? (
                  <ul>
                    {laneCards.map((card) => (
                      <DevBoardSessionCard
                        key={card.id}
                        card={card}
                        onOpen={() => openSession(card)}
                      />
                    ))}
                  </ul>
                ) : (
                  <p>No matching sessions</p>
                )}
              </section>
            );
          })}
        </section>
      )}
      <p className="cly-dev-board-footnote">
        <Clock3 aria-hidden="true" /> Session status is managed by the running
        agent and updates automatically.
      </p>
    </div>
  );
}
