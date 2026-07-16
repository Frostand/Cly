import { useEffect } from "react";
import { getDesktopApi } from "../../../lib/electron";
import { useClyStore } from "../store/cly-store";
import {
  applyWorkspaceSnapshot,
  rememberWorkspaceSnapshot,
} from "./window-sync";

export function useWorkspaceSnapshotSync(sessionId: string) {
  const update = useClyStore((state) => state.updateAgentSession);
  useEffect(() => {
    const api = getDesktopApi();
    if (!api) return;
    const apply = (
      snapshot: Awaited<ReturnType<typeof api.getWorkspaceSnapshot>>,
    ) => {
      if (snapshot.sessionId !== sessionId) return;
      rememberWorkspaceSnapshot(snapshot);
      update(sessionId, (session) => applyWorkspaceSnapshot(session, snapshot));
    };
    void api.getWorkspaceSnapshot(sessionId).then(apply);
    return api.onWorkspaceSnapshot(apply);
  }, [sessionId, update]);
}
