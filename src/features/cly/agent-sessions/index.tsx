import { Bot, RotateCw } from "lucide-react";
import { useEffect } from "react";
import { EmptyState, PageHeader } from "../components/primitives";
import { isClyDemoRuntime } from "../services/runtime";
import { useClyStore } from "../store/cly-store";
import { DeviceSyncPanel } from "./device-sync-panel";
import { productionAgentSessionServices } from "./production-services";

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
  const projectId = useClyStore((state) => state.activeProjectId);
  const sessions = useClyStore((state) => state.clyDevSessions);
  const loading = useClyStore((state) => state.clyDevSessionsLoading);
  const error = useClyStore((state) => state.clyDevSessionsError);
  const load = useClyStore((state) => state.loadClyDevSessions);

  useEffect(() => {
    void load(projectId);
  }, [load, projectId]);

  const resume = async (sessionId: string) => {
    await productionAgentSessionServices.transition(
      projectId,
      sessionId,
      "queued",
    );
    await load(projectId);
  };

  return (
    <div className="cly-page agent-sessions-root" data-mode="production">
      <PageHeader
        kicker="Workspace"
        title="Agent Sessions"
        description="Durable local sessions, ordered events, and explicit restart recovery."
        actions={<DeviceSyncPanel projectId={projectId} />}
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
          title="Agent sessions could not load"
          description={error}
        />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<Bot size={24} />}
          title="No durable sessions yet"
          description="Sessions created through the local runtime API will appear here."
        />
      ) : (
        <section
          aria-label="Durable agent sessions"
          className="agent-overview-list"
        >
          {sessions.map((session) => (
            <article className="agent-session-row" key={session.id}>
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
              {session.state === "resumable" ? (
                <button type="button" onClick={() => void resume(session.id)}>
                  Queue resume
                </button>
              ) : null}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
