import { AppWindow, ArrowLeft } from "lucide-react";
import { getDesktopApi } from "../../../lib/electron";
import { Button, EmptyState } from "../components/primitives";
import { isClyDemoRuntime } from "../services/runtime";
import { useClyStore } from "../store/cly-store";
import { useClyDataBootstrap } from "../store/use-cly-data-bootstrap";
import { LiveClyDevWorkbench } from "./live-workbench";
import { ClyDevTaskIdentitySurface } from "./shared";
import { useWorkspaceSnapshotSync } from "./use-window-sync";
import { AgentWorkbench } from "./workbench";

export function WorkspaceWindow({ sessionId }: { sessionId: string }) {
  if (isClyDemoRuntime) return <DemoWorkspaceWindow sessionId={sessionId} />;
  return <ProductionWorkspaceWindow sessionId={sessionId} />;
}

function ProductionWorkspaceWindow({ sessionId }: { sessionId: string }) {
  useClyDataBootstrap();
  const projectId = useClyStore((state) => state.activeProjectId);

  return (
    <main
      className="cly-workspace-window"
      aria-label="Detached developer workspace"
    >
      <header className="cly-workspace-window-header">
        <div>
          <AppWindow size={14} aria-hidden="true" />
          <span>
            <strong>Developer workspace</strong>
            <small>Live project files, changes, tests, logs, and impact</small>
          </span>
        </div>
        <Button
          onClick={() => void getDesktopApi()?.reattachWorkspace({ sessionId })}
        >
          <ArrowLeft size={12} aria-hidden="true" /> Reattach
        </Button>
      </header>
      <LiveClyDevWorkbench
        projectId={projectId}
        sessionId={sessionId}
        windowRole="workspace"
      />
    </main>
  );
}

function DemoWorkspaceWindow({ sessionId }: { sessionId: string }) {
  useClyDataBootstrap();
  const session = useClyStore((state) =>
    state.data.agentSessions.find((item) => item.id === sessionId),
  );
  useWorkspaceSnapshotSync(sessionId);

  if (!session) {
    return (
      <main className="cly-workspace-window">
        <EmptyState
          icon={<AppWindow size={24} />}
          title="Workspace session unavailable"
          description="Return to the agent window and detach the workspace again."
          action={
            <Button onClick={() => void getDesktopApi()?.focusAgentWindow()}>
              Focus agent window
            </Button>
          }
        />
      </main>
    );
  }

  return (
    <main
      className="cly-workspace-window"
      aria-label="Detached developer workspace"
    >
      <header className="cly-workspace-window-header">
        <div>
          <AppWindow size={14} aria-hidden="true" />
          <span>
            <strong>{session.title}</strong>
            <small>Developer workspace · {session.branch}</small>
          </span>
        </div>
        <Button
          onClick={() =>
            void getDesktopApi()?.reattachWorkspace({ sessionId: session.id })
          }
        >
          <ArrowLeft size={12} aria-hidden="true" /> Reattach
        </Button>
      </header>
      <ClyDevTaskIdentitySurface session={session} />
      <AgentWorkbench session={session} windowOwnership="workspace" />
    </main>
  );
}
