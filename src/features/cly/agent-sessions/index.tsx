import { AppWindow, ArrowLeft, Bot, Laptop, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { getDesktopApi } from "../../../lib/electron";
import { Button, EmptyState, PageHeader } from "../components/primitives";
import { apiClient } from "../services/api-client";
import { isClyDemoRuntime } from "../services/runtime";
import { useClyStore } from "../store/cly-store";
import { DeviceSyncPanel } from "./device-sync-panel";
import { LiveClyDevWorkbench } from "./live-workbench";
import { productionAgentSessionServices } from "./production-services";
import { ResumeTaskDialog } from "./resume-task-dialog";

const DemoAgentSessionsScreen =
  __CLY_INCLUDE_DEMOS__ && isClyDemoRuntime
    ? (await import("./demo-screen")).DemoAgentSessionsScreen
    : null;

export function AgentSessionsScreen() {
  if (isClyDemoRuntime && DemoAgentSessionsScreen) {
    return <DemoAgentSessionsScreen />;
  }

  return <ProductionAgentSessionsScreen />;
}

function ProductionAgentSessionsScreen() {
  const [resumeOpen, setResumeOpen] = useState(false);
  const [handoffNotice, setHandoffNotice] = useState<string | null>(null);
  const requestedSessionId = useClyStore(
    (state) => state.selectedAgentSessionId,
  );
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    requestedSessionId,
  );
  const projectId = useClyStore((state) => state.activeProjectId);
  const sessions = useClyStore((state) => state.clyDevSessions);
  const loading = useClyStore((state) => state.clyDevSessionsLoading);
  const error = useClyStore((state) => state.clyDevSessionsError);
  const load = useClyStore((state) => state.loadClyDevSessions);

  useEffect(() => {
    void load(projectId);
  }, [load, projectId]);

  useEffect(() => {
    if (
      requestedSessionId &&
      sessions.some((session) => session.id === requestedSessionId)
    ) {
      setSelectedSessionId(requestedSessionId);
    }
  }, [requestedSessionId, sessions]);

  const resume = async (sessionId: string) => {
    await productionAgentSessionServices.transition(
      projectId,
      sessionId,
      "queued",
    );
    await load(projectId);
  };

  const prepareHandoff = async (sessionId: string) => {
    setHandoffNotice(null);
    try {
      const envelope = await apiClient.exportClyDevHandoff(
        projectId,
        sessionId,
      );
      await navigator.clipboard.writeText(JSON.stringify(envelope, null, 2));
      setHandoffNotice(
        "Structured handoff copied for a same-device provider switch. Open Device sync to prepare an encrypted cross-device transfer.",
      );
    } catch (cause) {
      setHandoffNotice(
        cause instanceof Error ? cause.message : "Handoff export failed.",
      );
    }
  };

  const selectedSession =
    sessions.find((session) => session.id === selectedSessionId) ?? null;

  if (selectedSession) {
    return (
      <div
        className="cly-page agent-sessions-root cly-live-session-page"
        data-mode="production"
      >
        <PageHeader
          kicker="Live session"
          title={selectedSession.title}
          description={`${selectedSession.state} · ${selectedSession.lastSequence} durable events · ${selectedSession.providerId}`}
          actions={
            <>
              <Button
                onClick={() => {
                  setSelectedSessionId(null);
                  useClyStore.setState({ selectedAgentSessionId: null });
                }}
              >
                <ArrowLeft size={13} aria-hidden="true" /> Sessions
              </Button>
              <Button
                variant="primary"
                onClick={() =>
                  void getDesktopApi()?.detachWorkspace({
                    sessionId: selectedSession.id,
                  })
                }
              >
                <AppWindow size={13} aria-hidden="true" /> Detach workspace
              </Button>
            </>
          }
        />
        <LiveClyDevWorkbench
          projectId={projectId}
          sessionId={selectedSession.id}
          windowRole="agent"
        />
      </div>
    );
  }

  return (
    <div className="cly-page agent-sessions-root" data-mode="production">
      <PageHeader
        kicker="Workspace"
        title="Agent Sessions"
        description="Durable local sessions, ordered events, and explicit restart recovery."
        actions={
          <>
            <DeviceSyncPanel projectId={projectId} />
            <Button onClick={() => setResumeOpen(true)}>
              <Laptop size={13} aria-hidden="true" /> Resume on this machine
            </Button>
          </>
        }
      />
      {loading && sessions.length === 0 ? (
        <EmptyState
          icon={<RotateCw size={24} />}
          title="Loading durable sessions"
          description="Recovering interrupted work without reviving orphaned processes."
        />
      ) : error ? (
        <EmptyState
          icon={<Bot size={24} />}
          title="Agent sessions unavailable"
          description={error}
          action={<Button onClick={() => void load(projectId)}>Retry</Button>}
        />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<Bot size={24} />}
          title="No agent sessions"
          description="Durable sessions started for this project will appear here. Resume work from another machine when a session is available."
        />
      ) : (
        <section
          aria-label="Durable agent sessions"
          className="agent-overview-list"
        >
          {handoffNotice ? (
            <p className="cly-dev-task-state" role="status">
              {handoffNotice}
            </p>
          ) : null}
          {sessions.map((session) => (
            <article className="cly-durable-session-row" key={session.id}>
              <div>
                <strong>
                  {typeof session.title === "string"
                    ? session.title
                    : session.id}
                </strong>
                <p>
                  {session.state} · {session.lastSequence} ordered events ·{" "}
                  {session.providerId}
                </p>
              </div>
              <div>
                <Button onClick={() => void prepareHandoff(session.id)}>
                  Prepare handoff
                </Button>
                {session.state === "resumable" ? (
                  <Button onClick={() => void resume(session.id)}>
                    Queue resume
                  </Button>
                ) : null}
                <Button
                  variant="primary"
                  onClick={() => setSelectedSessionId(session.id)}
                >
                  Open workspace
                </Button>
              </div>
            </article>
          ))}
        </section>
      )}
      <ResumeTaskDialog
        projectId={projectId}
        open={resumeOpen}
        onClose={() => setResumeOpen(false)}
        onResumed={() => void load(projectId)}
      />
    </div>
  );
}
