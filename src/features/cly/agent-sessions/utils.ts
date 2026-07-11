import type {
  AgentContextMode,
  AgentRole,
  AgentSessionStatus,
  AgentStatus,
  WorkbenchTabType,
} from "./types";

export const sessionStatusLabel: Record<AgentSessionStatus, string> = {
  running: "Running",
  waiting_approval: "Waiting approval",
  completed: "Completed",
  failed: "Failed",
  paused: "Paused",
  stopped: "Stopped",
  archived: "Archived",
};

export const agentStatusLabel: Record<AgentStatus, string> = {
  queued: "Queued",
  starting: "Starting",
  working: "Working",
  waiting_input: "Waiting for input",
  waiting_approval: "Waiting for approval",
  reviewing: "Reviewing",
  completed: "Completed",
  failed: "Failed",
  paused: "Paused",
  stopped: "Stopped",
};

export const contextModeLabel: Record<AgentContextMode, string> = {
  full_project: "Full project context available",
  explicit_pack: "Explicit context pack",
  inherited: "Inherited Orchestrator context",
  task_scoped: "Task-scoped context",
  isolated: "Isolated context",
  additional_pinned: "Additional pinned context",
};

export const roleLabel: Record<AgentRole, string> = {
  orchestrator: "Orchestrator",
  implementation: "Worker Agent",
  review: "Reviewer Agent",
  literature: "Literature Agent",
  analysis: "Analysis Agent",
  experiment: "Worker Agent",
  custom: "Delegated Agent",
};

export const workbenchLabel: Record<WorkbenchTabType, string> = {
  browser: "Browser",
  terminal: "Terminal",
  diff: "Code Diff",
  agents: "Agents",
  "live-files": "Live Files",
};

export const toneForAgentStatus = (
  status: AgentStatus | AgentSessionStatus,
) => {
  if (status === "completed") return "success" as const;
  if (status === "failed" || status === "stopped") return "danger" as const;
  if (status === "waiting_approval") return "warning" as const;
  if (status === "running" || status === "working" || status === "reviewing")
    return "info" as const;
  return "neutral" as const;
};
