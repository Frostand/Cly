import { ThemeProvider } from "@/components/theme-provider";
import { WorkspaceWindow } from "@/features/cly/agent-sessions/workspace-window";
import { ClyAppShell } from "@/features/cly/components/app-shell";
import "@/features/cly/cly.css";

export const App = () => {
  const parameters = new URLSearchParams(window.location.search);
  const workspaceSessionId =
    parameters.get("clyWindowRole") === "workspace"
      ? parameters.get("sessionId")
      : null;

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      disableTransitionOnChange
      enableSystem
      storageKey="cly-theme"
    >
      {workspaceSessionId ? (
        <WorkspaceWindow sessionId={workspaceSessionId} />
      ) : (
        <ClyAppShell />
      )}
    </ThemeProvider>
  );
};
