import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleStop,
  Laptop,
  LoaderCircle,
  Play,
  RefreshCw,
  RotateCw,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
} from "../components/primitives";
import { isClyDemoRuntime } from "../services/runtime";
import { useClyStore } from "../store/cly-store";
import { DeviceSyncPanel } from "./device-sync-panel";
import {
  getClyDevRequestId,
  getClyDevResumeInput,
  productionAgentSessionServices,
} from "./production-services";
import { ResumeTaskDialog } from "./resume-task-dialog";
import type {
  ClyDevExecutionMode,
  ClyDevRuntimeProvider,
  ClyDevSessionEvent,
  ClyDevSessionOverview,
  ClyDevSessionSnapshot,
  ReasoningLevel,
} from "./types";

const DemoAgentSessionsScreen =
  __CLY_INCLUDE_DEMOS__ && isClyDemoRuntime
    ? (await import("./demo-screen")).DemoAgentSessionsScreen
    : null;

type ProductionAgentSessionServices = typeof productionAgentSessionServices;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "The agent operation failed.";

const stateTone = (state: ClyDevSessionOverview["state"]) => {
  if (state === "completed") return "success" as const;
  if (state === "failed" || state === "canceled") return "danger" as const;
  if (state === "awaiting_approval" || state === "resumable") {
    return "warning" as const;
  }
  return "info" as const;
};

const displayState = (state: ClyDevSessionOverview["state"]) =>
  state.replaceAll("_", " ");

const eventBody = (event: ClyDevSessionEvent) => {
  if (event.type === "message.recorded") {
    const body = String(event.payload.body ?? "");
    try {
      const parsed = JSON.parse(body);
      if (parsed.kind === "tool_call") {
        return `Requested ${parsed.tool}`;
      }
      if (parsed.kind === "tool_result") {
        return `Finished tool operation`;
      }
    } catch {
      // Plain agent/user text is expected.
    }
    return body;
  }
  if (event.type === "failure.recorded") {
    return String(event.payload.message ?? "Agent execution failed.");
  }
  if (event.type === "approval.requested") {
    return String(event.payload.title ?? "Approval required");
  }
  if (event.type === "approval.resolved") {
    return `Approval ${String(event.payload.state ?? "resolved")}`;
  }
  if (event.type === "session.state.changed") {
    return `Session ${displayState(
      String(
        event.payload.state ?? "updated",
      ) as ClyDevSessionOverview["state"],
    )}`;
  }
  if (event.type === "tool.recorded") {
    return `${String(event.payload.tool ?? "Tool")} · ${String(event.payload.status ?? "updated")}`;
  }
  if (event.type === "summary.recorded") {
    return String(event.payload.title ?? "Session settings recorded");
  }
  if (event.type === "context.manifest.recorded") {
    return "Verified project context attached";
  }
  if (event.type === "cost.recorded") {
    return "Provider usage recorded";
  }
  return event.type.replaceAll(".", " ");
};

const modelKey = (providerId: string, modelId: string) =>
  `${providerId}\u0000${modelId}`;

export function AgentSessionsScreen() {
  if (isClyDemoRuntime && DemoAgentSessionsScreen) {
    return <DemoAgentSessionsScreen />;
  }

  return <ProductionAgentSessionsScreen />;
}

export function ProductionAgentSessionsScreen({
  services = productionAgentSessionServices,
}: {
  services?: ProductionAgentSessionServices;
}) {
  const projectId = useClyStore((state) => state.activeProjectId);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [sessions, setSessions] = useState<ClyDevSessionOverview[]>([]);
  const [providers, setProviders] = useState<ClyDevRuntimeProvider[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ClyDevSessionSnapshot | null>(null);
  const [events, setEvents] = useState<ClyDevSessionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [providerLoading, setProviderLoading] = useState(true);
  const [operation, setOperation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [selectedModelKey, setSelectedModelKey] = useState("");
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningLevel | null>(
    null,
  );
  const [executionMode, setExecutionMode] =
    useState<ClyDevExecutionMode>("read_only");

  const refreshSessions = useCallback(async () => {
    if (!projectId.trim()) {
      setSessions([]);
      setSelectedId(null);
      return [];
    }
    const next = await services.hydrate(projectId);
    setSessions(next);
    setSelectedId((current) =>
      current && next.some((session) => session.id === current)
        ? current
        : (next[0]?.id ?? null),
    );
    return next;
  }, [projectId, services]);

  const refreshProviders = useCallback(async () => {
    setProviderLoading(true);
    try {
      const next = await services.providers();
      setProviders(next);
      setError(null);
    } catch (providerError) {
      setProviders([]);
      setError(errorMessage(providerError));
    } finally {
      setProviderLoading(false);
    }
  }, [services]);

  const refreshDetail = useCallback(
    async (sessionId: string) => {
      const [nextSnapshot, nextEvents] = await Promise.all([
        services.snapshot(projectId, sessionId),
        services.allEvents(projectId, sessionId),
      ]);
      setSnapshot(nextSnapshot);
      setEvents(nextEvents);
      return { snapshot: nextSnapshot, events: nextEvents };
    },
    [projectId, services],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([refreshSessions(), refreshProviders()])
      .catch((loadError) => {
        if (active) setError(errorMessage(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshProviders, refreshSessions]);

  useEffect(() => {
    if (!selectedId) {
      setSnapshot(null);
      setEvents([]);
      return;
    }
    let active = true;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        await refreshDetail(selectedId);
        await refreshSessions();
      } catch (detailError) {
        if (active) setError(errorMessage(detailError));
      } finally {
        refreshing = false;
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 900);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [refreshDetail, refreshSessions, selectedId]);

  const liveModels = useMemo(
    () =>
      providers.flatMap((provider) =>
        provider.authentication === "authenticated"
          ? provider.models.map((model) => ({ provider, model }))
          : [],
      ),
    [providers],
  );

  useEffect(() => {
    if (
      selectedModelKey &&
      liveModels.some(
        ({ provider, model }) =>
          modelKey(provider.id, model.id) === selectedModelKey,
      )
    ) {
      return;
    }
    const first = liveModels[0];
    setSelectedModelKey(
      first ? modelKey(first.provider.id, first.model.id) : "",
    );
  }, [liveModels, selectedModelKey]);

  const selection = liveModels.find(
    ({ provider, model }) =>
      modelKey(provider.id, model.id) === selectedModelKey,
  );

  useEffect(() => {
    const efforts = selection?.model.reasoningEfforts ?? [];
    setReasoningEffort((current) =>
      current && efforts.includes(current)
        ? current
        : efforts.includes("medium")
          ? "medium"
          : (efforts[0] ?? null),
    );
    const modes = selection?.provider.supportedModes ?? [];
    setExecutionMode((current) =>
      modes.includes(current) ? current : (modes[0] ?? "read_only"),
    );
  }, [selection]);

  const runExecution = useCallback(
    async (
      operationName: "execute" | "resume",
      sessionId: string,
      input: Parameters<ProductionAgentSessionServices["execute"]>[2],
    ) => {
      try {
        await services[operationName](projectId, sessionId, input);
      } catch (executionError) {
        setError(errorMessage(executionError));
      } finally {
        await Promise.all([
          refreshDetail(sessionId).catch(() => undefined),
          refreshSessions().catch(() => undefined),
        ]);
      }
    },
    [projectId, refreshDetail, refreshSessions, services],
  );

  const startSession = async () => {
    if (!selection || !title.trim() || !objective.trim()) return;
    setOperation("starting");
    setError(null);
    try {
      const launch = await services.launch(projectId, {
        schemaVersion: 1,
        payloadVersion: 1,
        idempotencyKey: crypto.randomUUID(),
        title: title.trim(),
        objective: objective.trim(),
        mode: executionMode,
        provider: {
          id: selection.provider.id,
          model: selection.model.id,
          ...(reasoningEffort ? { reasoningEffort } : {}),
        },
      });
      const requestId = crypto.randomUUID();
      const sessionId = launch.session.id;
      setSelectedId(sessionId);
      setTitle("");
      setObjective("");
      await refreshSessions();
      void runExecution("execute", sessionId, {
        schemaVersion: 1,
        payloadVersion: 1,
        requestId,
        prompt: launch.task.objective,
        mode:
          launch.execution.mode === "workspace_write" ? "execute" : "read_only",
        tools: launch.execution.tools.map((name) => ({ name })),
        actorId: "cly-user",
      });
    } catch (startError) {
      setError(errorMessage(startError));
    } finally {
      setOperation(null);
    }
  };

  const resumeSession = async () => {
    if (!snapshot) return;
    const input = getClyDevResumeInput(projectId, snapshot.id, events);
    if (!input) {
      setError("This session has no recoverable execution request.");
      return;
    }
    setOperation("resuming");
    setError(null);
    void runExecution("resume", snapshot.id, input).finally(() =>
      setOperation(null),
    );
  };

  const cancelSession = async () => {
    if (!snapshot) return;
    const requestId = getClyDevRequestId(projectId, snapshot.id, events);
    if (!requestId) {
      setError("The active execution request could not be identified.");
      return;
    }
    setOperation("canceling");
    try {
      await services.cancel(projectId, snapshot.id, requestId);
      await refreshDetail(snapshot.id);
    } catch (cancelError) {
      setError(errorMessage(cancelError));
    } finally {
      setOperation(null);
    }
  };

  const resolveApproval = async (
    approvalId: string,
    state: "approved" | "rejected",
  ) => {
    if (!snapshot) return;
    setOperation(`approval:${approvalId}`);
    try {
      const broker = await services.resolveApproval(
        projectId,
        snapshot.id,
        approvalId,
        state,
      );
      if (!broker.handled) {
        const nextEvents = await services.allEvents(projectId, snapshot.id);
        const input = getClyDevResumeInput(projectId, snapshot.id, nextEvents);
        if (!input)
          throw new Error("The approved session could not be resumed.");
        void runExecution("resume", snapshot.id, input);
      }
      await refreshDetail(snapshot.id);
    } catch (approvalError) {
      setError(errorMessage(approvalError));
    } finally {
      setOperation(null);
    }
  };

  const pendingApprovals = snapshot?.approvals.filter(
    (approval) => approval.state === "pending",
  );
  const canStop =
    snapshot && ["running", "awaiting_approval"].includes(snapshot.state);
  const canResume =
    snapshot && ["resumable", "interrupted"].includes(snapshot.state);

  if (!projectId.trim()) {
    return (
      <div className="cly-page agent-sessions-root" data-mode="production">
        <PageHeader
          kicker="Workspace"
          title="Agent Sessions"
          description="Run Codex or Claude Code against the active repository with durable events, explicit approvals, cancellation, and restart recovery."
        />
        <EmptyState
          icon={<Bot size={24} />}
          title="Choose a research project first"
          description="Select a local project folder before starting or restoring an agent session."
        />
      </div>
    );
  }

  return (
    <div className="cly-page agent-sessions-root" data-mode="production">
      <PageHeader
        kicker="Workspace"
        title="Agent Sessions"
        description="Run Codex or Claude Code against the active repository with durable events, explicit approvals, cancellation, and restart recovery."
        actions={
          <>
            <DeviceSyncPanel projectId={projectId} />
            <Button onClick={() => setResumeOpen(true)}>
              <Laptop size={13} aria-hidden="true" /> Resume on this machine
            </Button>
          </>
        }
      />

      {error ? (
        <div className="agent-production-error" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{error}</span>
          <Button variant="ghost" onClick={() => setError(null)}>
            Dismiss
          </Button>
        </div>
      ) : null}

      <div className="agent-production-layout">
        <aside className="agent-production-sidebar" aria-label="Agent sessions">
          <section
            className="agent-production-launch"
            aria-labelledby="new-agent-session"
          >
            <div className="agent-production-section-heading">
              <div>
                <span className="cly-eyebrow">New run</span>
                <h2 id="new-agent-session">Start an agent</h2>
              </div>
              <Button
                iconOnly
                variant="ghost"
                aria-label="Refresh provider status"
                onClick={() => void refreshProviders()}
              >
                <RefreshCw size={14} aria-hidden="true" />
              </Button>
            </div>

            <label className="agent-production-field">
              <span>Session title</span>
              <input
                value={title}
                maxLength={500}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Review the analysis pipeline"
              />
            </label>
            <label className="agent-production-field">
              <span>Objective and instructions</span>
              <textarea
                value={objective}
                maxLength={20_000}
                rows={5}
                onChange={(event) => setObjective(event.target.value)}
                placeholder="Describe the outcome, constraints, and files the agent should inspect."
              />
            </label>
            <label className="agent-production-field">
              <span>Live model</span>
              <select
                value={selectedModelKey}
                disabled={providerLoading || liveModels.length === 0}
                onChange={(event) => setSelectedModelKey(event.target.value)}
              >
                {liveModels.length === 0 ? (
                  <option value="">No authenticated runtime model</option>
                ) : null}
                {providers.map((provider) =>
                  provider.authentication === "authenticated" &&
                  provider.models.length ? (
                    <optgroup key={provider.id} label={provider.label}>
                      {provider.models.map((model) => (
                        <option
                          key={modelKey(provider.id, model.id)}
                          value={modelKey(provider.id, model.id)}
                        >
                          {model.label}
                        </option>
                      ))}
                    </optgroup>
                  ) : null,
                )}
              </select>
            </label>
            {selection?.model.reasoningEfforts.length ? (
              <label className="agent-production-field">
                <span>Reasoning level</span>
                <select
                  value={reasoningEffort ?? ""}
                  onChange={(event) =>
                    setReasoningEffort(event.target.value as ReasoningLevel)
                  }
                >
                  {selection.model.reasoningEfforts.map((effort) => (
                    <option key={effort} value={effort}>
                      {effort === "xhigh" ? "Extra high" : effort}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <fieldset className="agent-production-mode">
              <legend>Access</legend>
              {selection?.provider.supportedModes.map((mode) => (
                <label key={mode}>
                  <input
                    type="radio"
                    name="agent-access-mode"
                    value={mode}
                    checked={executionMode === mode}
                    onChange={() => setExecutionMode(mode)}
                  />
                  <span>
                    <strong>
                      {mode === "read_only" ? "Read only" : "Workspace write"}
                    </strong>
                    <small>
                      {mode === "read_only"
                        ? "Inspect without changing files."
                        : "Writes and commands require project policy or approval."}
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>
            <Button
              variant="primary"
              disabled={
                operation !== null ||
                !selection ||
                !title.trim() ||
                !objective.trim()
              }
              onClick={() => void startSession()}
            >
              {operation === "starting" ? (
                <LoaderCircle
                  className="cly-spin"
                  size={14}
                  aria-hidden="true"
                />
              ) : (
                <Play size={14} aria-hidden="true" />
              )}
              Start session
            </Button>

            {!providerLoading && liveModels.length === 0 ? (
              <div className="agent-provider-status" role="status">
                <ShieldCheck size={16} aria-hidden="true" />
                <div>
                  <strong>Connect a supported provider</strong>
                  {providers.map((provider) => (
                    <span key={provider.id}>
                      {provider.label}: {provider.authentication}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <section
            className="agent-production-history"
            aria-labelledby="agent-history"
          >
            <h2 id="agent-history">History</h2>
            {loading && sessions.length === 0 ? (
              <div className="agent-production-loading">
                <RotateCw className="cly-spin" size={16} /> Loading sessions
              </div>
            ) : sessions.length === 0 ? (
              <p>No sessions yet.</p>
            ) : (
              sessions.map((session) => (
                <button
                  className="agent-production-session"
                  data-selected={selectedId === session.id}
                  key={session.id}
                  type="button"
                  onClick={() => setSelectedId(session.id)}
                >
                  <span>
                    <strong>{session.title}</strong>
                    <small>{session.model}</small>
                  </span>
                  <Badge tone={stateTone(session.state)}>
                    {displayState(session.state)}
                  </Badge>
                </button>
              ))
            )}
          </section>
        </aside>

        <main className="agent-production-detail" aria-label="Selected session">
          {!snapshot ? (
            <EmptyState
              icon={<Bot size={24} />}
              title="Choose or start a session"
              description="Cly will show ordered provider output, tool activity, approvals, and the durable result here."
            />
          ) : (
            <>
              <header className="agent-production-detail-header">
                <div>
                  <span className="cly-eyebrow">{snapshot.providerId}</span>
                  <h2>{snapshot.title}</h2>
                  <p>
                    {snapshot.model}
                    {snapshot.provider.reasoningEffort
                      ? ` · ${snapshot.provider.reasoningEffort} reasoning`
                      : ""}
                    {` · ${snapshot.lastSequence} durable events`}
                  </p>
                </div>
                <div className="agent-production-actions">
                  <Badge tone={stateTone(snapshot.state)}>
                    {displayState(snapshot.state)}
                  </Badge>
                  {canResume ? (
                    <Button
                      variant="primary"
                      disabled={operation !== null}
                      onClick={() => void resumeSession()}
                    >
                      <RotateCw size={14} aria-hidden="true" /> Resume
                    </Button>
                  ) : null}
                  {canStop ? (
                    <Button
                      variant="danger"
                      disabled={operation !== null}
                      onClick={() => void cancelSession()}
                    >
                      <CircleStop size={14} aria-hidden="true" /> Stop
                    </Button>
                  ) : null}
                </div>
              </header>

              {pendingApprovals?.map((approval) => {
                const requestEvent = events.find(
                  (event) =>
                    event.type === "approval.requested" &&
                    event.payload.approvalId === approval.id,
                );
                return (
                  <section
                    className="agent-production-approval"
                    key={approval.id}
                    aria-label="Approval required"
                  >
                    <ShieldCheck size={20} aria-hidden="true" />
                    <div>
                      <strong>
                        {String(
                          requestEvent?.payload.title ?? "Approval required",
                        )}
                      </strong>
                      <p>
                        Review this workspace effect before allowing the agent
                        to continue.
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      disabled={operation !== null}
                      onClick={() =>
                        void resolveApproval(approval.id, "rejected")
                      }
                    >
                      Reject
                    </Button>
                    <Button
                      variant="primary"
                      disabled={operation !== null}
                      onClick={() =>
                        void resolveApproval(approval.id, "approved")
                      }
                    >
                      Approve once
                    </Button>
                  </section>
                );
              })}

              <section className="agent-production-events" aria-live="polite">
                {events.length === 0 ? (
                  <div className="agent-production-loading">
                    <LoaderCircle className="cly-spin" size={16} /> Waiting for
                    the first event
                  </div>
                ) : (
                  events.map((event) => (
                    <article className="agent-production-event" key={event.id}>
                      <span className="agent-production-sequence">
                        {event.sequence.toString().padStart(2, "0")}
                      </span>
                      <div>
                        <span>{event.type.replaceAll(".", " ")}</span>
                        <p>{eventBody(event)}</p>
                      </div>
                      {event.type === "failure.recorded" ? (
                        <AlertTriangle size={15} aria-label="Failure" />
                      ) : event.type === "session.state.changed" &&
                        event.payload.state === "completed" ? (
                        <CheckCircle2 size={15} aria-label="Completed" />
                      ) : null}
                    </article>
                  ))
                )}
              </section>
            </>
          )}
        </main>
      </div>

      <ResumeTaskDialog
        open={resumeOpen}
        onClose={() => setResumeOpen(false)}
        onResumed={() => void refreshSessions()}
      />
    </div>
  );
}
