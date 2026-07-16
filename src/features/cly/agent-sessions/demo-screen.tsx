import { useEffect, useRef } from "react";
import { RouteTransition } from "../components/visuals";
import { useClyStore } from "../store/cly-store";
import { AgentSessionsChat } from "./chat";
import { AgentSessionsOverview } from "./overview";
import { AgentConfigurationSheet, NewSessionFlow } from "./shared";

export function DemoAgentSessionsScreen() {
  const routeInitialized = useRef(false);
  const mode = useClyStore((state) => state.agentSessionsMode);
  const selectedSessionId = useClyStore(
    (state) => state.selectedAgentSessionId,
  );
  const sessions = useClyStore((state) => state.data.agentSessions);
  const setMode = useClyStore((state) => state.setAgentSessionsMode);
  const setNewOpen = useClyStore((state) => state.setNewAgentSessionOpen);
  const openTab = useClyStore((state) => state.openWorkbenchTab);
  const toggleWorkbench = useClyStore((state) => state.toggleWorkbench);

  useEffect(() => {
    if (routeInitialized.current) return;
    routeInitialized.current = true;
    const params = new URLSearchParams(window.location.search);
    const routeMode = params.get("mode");
    const routeSession = params.get("session");
    if (routeMode === "chat") {
      const valid = routeSession
        ? sessions.some((session) => session.id === routeSession)
        : false;
      setMode(valid ? "chat" : "overview", valid ? routeSession : null);
    } else if (routeMode === "overview") {
      setMode("overview");
    }
  }, [sessions, setMode]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("mode", mode);
    if (mode === "chat" && selectedSessionId) {
      params.set("session", selectedSessionId);
    }
    window.history.replaceState(null, "", `/agent-sessions?${params}`);
  }, [mode, selectedSessionId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;
      if (event.shiftKey && event.key.toLowerCase() === "c") {
        event.preventDefault();
        setMode("chat");
        return;
      }
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        setNewOpen(true);
        return;
      }
      if (!selectedSessionId) return;
      if (event.altKey) {
        const types = {
          b: "browser",
          t: "terminal",
          d: "diff",
          a: "agents",
          f: "live-files",
        } as const;
        const type = types[event.key.toLowerCase() as keyof typeof types];
        if (type) {
          event.preventDefault();
          openTab(selectedSessionId, type);
        }
        if (event.key.toLowerCase() === "w") {
          event.preventDefault();
          toggleWorkbench(selectedSessionId);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openTab, selectedSessionId, setMode, setNewOpen, toggleWorkbench]);

  return (
    <div className="agent-sessions-root" data-mode={mode}>
      <RouteTransition route={`agent-${mode}`}>
        {mode === "overview" ? (
          <AgentSessionsOverview />
        ) : (
          <AgentSessionsChat />
        )}
      </RouteTransition>
      <NewSessionFlow />
      <AgentConfigurationSheet />
    </div>
  );
}
