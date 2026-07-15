import { Bot } from "lucide-react";
import { EmptyState, PageHeader } from "../components/primitives";
import { capabilityUnavailableMessage } from "../services/capabilities";
import { isClyDemoRuntime } from "../services/runtime";

const DemoAgentSessionsScreen =
  __CLY_INCLUDE_DEMOS__ && isClyDemoRuntime
    ? (await import("./demo-screen")).DemoAgentSessionsScreen
    : null;

export function AgentSessionsScreen() {
  if (!isClyDemoRuntime || !DemoAgentSessionsScreen) {
    return (
      <div className="cly-page agent-sessions-root" data-mode="preview">
        <PageHeader
          kicker="Workspace"
          title="Agent Sessions"
          description="Inspect the agent-session capability available in this build."
        />
        <EmptyState
          icon={<Bot size={24} />}
          title="Agent Sessions is a read-only preview"
          description={capabilityUnavailableMessage("agents.execute")}
        />
      </div>
    );
  }

  return <DemoAgentSessionsScreen />;
}
