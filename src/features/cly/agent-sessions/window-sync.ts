import { getDesktopApi } from "../../../lib/electron";
import type { WorkspaceIntent, WorkspaceSnapshot } from "../../../types/ide";
import type { AgentSession, DiffTabState, LiveFilesTabState } from "./types";

const modeToCore = (mode: AgentSession["workspaceMode"]) =>
  mode === "detached-workspace" ? "detached" : "inline";

const modeFromCore = (
  mode: WorkspaceSnapshot["workspaceMode"],
  currentMode: AgentSession["workspaceMode"],
): AgentSession["workspaceMode"] =>
  currentMode === "agent-only" || currentMode === "external-editor"
    ? currentMode
    : mode === "detached"
      ? "detached-workspace"
      : currentMode === "detached-workspace" ||
          currentMode === "inline-workspace"
        ? "inline-workspace"
        : currentMode;

export function deriveWorkspaceSnapshotFields(session: AgentSession) {
  const diff = session.workbenchTabs.find((tab) => tab.type === "diff")
    ?.state as DiffTabState | undefined;
  const liveFiles = session.workbenchTabs.find(
    (tab) => tab.type === "live-files",
  )?.state as LiveFilesTabState | undefined;
  return {
    selectedFileId: liveFiles?.selectedPath ?? null,
    selectedDiffId: diff?.selectedPath ?? null,
    pendingApprovalIds: session.approvals
      .filter((approval) => approval.state === "pending")
      .map((approval) => approval.id),
    workspaceMode: modeToCore(session.workspaceMode),
    activeWorkbenchTabId: session.activeWorkbenchTabId ?? null,
  } satisfies Omit<WorkspaceSnapshot, "sessionId" | "revision">;
}

export function applyWorkspaceSnapshot(
  session: AgentSession,
  snapshot: WorkspaceSnapshot,
): AgentSession {
  if (snapshot.sessionId !== session.id) return session;
  return {
    ...session,
    workspaceMode: modeFromCore(snapshot.workspaceMode, session.workspaceMode),
    activeWorkbenchTabId:
      snapshot.activeWorkbenchTabId ?? session.activeWorkbenchTabId,
    workbenchTabs: session.workbenchTabs.map((tab) => {
      if (tab.type === "diff" && snapshot.selectedDiffId) {
        return {
          ...tab,
          state: {
            ...(tab.state as DiffTabState),
            selectedPath: snapshot.selectedDiffId,
          },
        };
      }
      if (tab.type === "live-files" && snapshot.selectedFileId) {
        return {
          ...tab,
          state: {
            ...(tab.state as LiveFilesTabState),
            selectedPath: snapshot.selectedFileId,
          },
        };
      }
      return tab;
    }),
  };
}

const revisions = new Map<string, number>();

export function rememberWorkspaceSnapshot(snapshot: WorkspaceSnapshot) {
  revisions.set(snapshot.sessionId, snapshot.revision);
}

export async function dispatchWorkspaceMutation(
  sessionId: string,
  type: WorkspaceIntent["type"],
  payload: Record<string, unknown>,
) {
  const api = getDesktopApi();
  if (!api) return null;
  let revision = revisions.get(sessionId);
  if (revision === undefined) {
    const snapshot = await api.getWorkspaceSnapshot(sessionId);
    rememberWorkspaceSnapshot(snapshot);
    revision = snapshot.revision;
  }
  const result = await api.dispatchWorkspaceIntent({
    mutationId: crypto.randomUUID(),
    sessionId,
    baseRevision: revision,
    type,
    payload,
  });
  rememberWorkspaceSnapshot(result.snapshot);
  return result;
}

export async function seedWorkspaceSnapshot(session: AgentSession) {
  const fields = deriveWorkspaceSnapshotFields(session);
  const intents: Array<[WorkspaceIntent["type"], Record<string, unknown>]> = [
    [
      "activate_workbench_tab",
      { activeWorkbenchTabId: fields.activeWorkbenchTabId },
    ],
    ["select_file", { selectedFileId: fields.selectedFileId }],
    ["select_diff", { selectedDiffId: fields.selectedDiffId }],
  ];
  for (const [type, payload] of intents) {
    await dispatchWorkspaceMutation(session.id, type, payload);
  }
}
