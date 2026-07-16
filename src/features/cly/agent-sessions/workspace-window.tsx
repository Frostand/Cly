import { AppWindow, ArrowLeft } from "lucide-react";
import { getDesktopApi } from "../../../lib/electron";
import { Button, EmptyState } from "../components/primitives";
import { useClyStore } from "../store/cly-store";
import { useClyDataBootstrap } from "../store/use-cly-data-bootstrap";
import { ClyDevTaskIdentitySurface } from "./shared";
import { useWorkspaceSnapshotSync } from "./use-window-sync";
import { AgentWorkbench } from "./workbench";

export function WorkspaceWindow({ sessionId }: { sessionId: string }) {
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
