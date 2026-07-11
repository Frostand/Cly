export type AgentSessionsMode = "overview" | "chat";

export type AgentRole =
  | "orchestrator"
  | "implementation"
  | "review"
  | "literature"
  | "analysis"
  | "experiment"
  | "custom";

export type AgentStatus =
  | "queued"
  | "starting"
  | "working"
  | "waiting_input"
  | "waiting_approval"
  | "reviewing"
  | "completed"
  | "failed"
  | "paused"
  | "stopped";

export type AgentSessionStatus =
  | "running"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "paused"
  | "stopped"
  | "archived";

export interface AgentPermissions {
  canReadFiles: boolean;
  canWriteFiles: boolean;
  canRunCommands: boolean;
  canAccessNetwork: boolean;
  requiresApprovalForWrite: boolean;
  requiresApprovalForNetwork: boolean;
}

export type AgentContextMode =
  | "full_project"
  | "explicit_pack"
  | "inherited"
  | "task_scoped"
  | "isolated"
  | "additional_pinned";

export interface AgentIdentity {
  id: string;
  name: string;
  role: AgentRole;
  roleLabel: string;
  provider: string;
  model: string;
  reasoningLevel: "Low" | "Medium" | "High";
  contextPackId?: string;
  contextPackName: string;
  contextMode: AgentContextMode;
  permissions: AgentPermissions;
  tools: string[];
  worktree?: string;
  status: AgentStatus;
  task: string;
  progress: number;
  lastAction: string;
  currentResource?: string;
  usage: string;
  elapsed: string;
  approvalPolicy: string;
  maximumRuntime: string;
  fallbackModel?: string;
  reportingDestination: string;
  transcript: string[];
}

export type AgentMessageType =
  | "user"
  | "orchestrator"
  | "reasoning"
  | "tool_call"
  | "tool_result"
  | "delegation"
  | "agent_update"
  | "approval"
  | "warning"
  | "error"
  | "artifact"
  | "research_link"
  | "system";

export interface AgentMessage {
  id: string;
  type: AgentMessageType;
  author: string;
  body: string;
  timestamp: string;
  agentId?: string;
  title?: string;
  metadata?: string[];
  collapsed?: boolean;
  status?: "pending" | "approved" | "rejected" | "complete";
  actions?: string[];
}

export interface AgentTask {
  id: string;
  parentSessionId: string;
  assignedAgentId: string;
  title: string;
  objective: string;
  status: AgentStatus;
  progress?: number;
  dependencies: string[];
  artifacts: string[];
}

export type WorkbenchTabType =
  | "browser"
  | "terminal"
  | "diff"
  | "agents"
  | "live-files";

export interface BrowserTabState {
  url: string;
  pageTitle: string;
  pageType: "article" | "documentation" | "paper" | "loading" | "failed";
  sourceAdded: boolean;
}

export interface TerminalTabState {
  process: string;
  cwd: string;
  status: "running" | "complete" | "failed";
  lines: string[];
}

export interface DiffFile {
  path: string;
  status: "modified" | "added" | "deleted";
  additions: number;
  deletions: number;
  staged: boolean;
  agentId: string;
  risk: string;
  diff: string[];
}

export interface DiffTabState {
  files: DiffFile[];
  selectedPath: string;
  layout: "unified" | "split";
  reviewState: "pending" | "approved" | "revision_requested";
}

export interface AgentsTabState {
  view: "tiled" | "topology";
}

export interface LiveFileEdit {
  id: string;
  filePath: string;
  agentId: string;
  startedAt: string;
  changedRanges: Array<{ startLine: number; endLine: number }>;
  summary: string;
}

export interface LiveFilesTabState {
  edits: LiveFileEdit[];
  selectedPath: string;
  followAgent: boolean;
  autoScroll: boolean;
  diffOverlay: boolean;
}

export type WorkbenchTabState =
  | BrowserTabState
  | TerminalTabState
  | DiffTabState
  | AgentsTabState
  | LiveFilesTabState;

export interface WorkbenchTab {
  id: string;
  type: WorkbenchTabType;
  title: string;
  pinned: boolean;
  state: WorkbenchTabState;
}

export interface AgentApproval {
  id: string;
  title: string;
  detail: string;
  estimate: string;
  expectedOutput: string;
  affectedObject: string;
  state: "pending" | "approved" | "rejected";
}

export interface AgentSession {
  id: string;
  projectId: string;
  title: string;
  objective: string;
  orchestrator: AgentIdentity;
  delegatedAgents: AgentIdentity[];
  tasks: AgentTask[];
  status: AgentSessionStatus;
  progress: number;
  startedAt: string;
  updatedAt: string;
  elapsed: string;
  activeContextPackId?: string;
  activeContextPackName: string;
  contextSummary: string;
  preset: string;
  branch: string;
  worktree?: string;
  messages: AgentMessage[];
  workbenchTabs: WorkbenchTab[];
  activeWorkbenchTabId?: string;
  workbenchCollapsed: boolean;
  workbenchMaximized: boolean;
  workbenchWidth: number;
  draft: string;
  usageEstimate: string;
  connectionState: "connected" | "offline" | "reconnecting";
  approvals: AgentApproval[];
  artifacts: string[];
  relatedResearchObject: string;
  risk?: string;
  archived: boolean;
}

export type AgentSessionOverviewFilter = "active" | "history" | "approvals";
export type AgentSessionOverviewSort =
  | "recent"
  | "progress"
  | "status"
  | "title";

export interface AgentSessionsViewState {
  mode: AgentSessionsMode;
  selectedSessionId?: string;
  selectedOverviewSessionId?: string;
  overviewFilter: AgentSessionOverviewFilter;
  overviewSort: AgentSessionOverviewSort;
  overviewSearch: string;
}

export interface NewAgentSessionInput {
  title: string;
  objective: string;
  provider: string;
  model: string;
  reasoningLevel: "Low" | "Medium" | "High";
  preset: string;
  contextPackName: string;
  approvalPolicy: string;
  branchPreference: string;
  usageBudget: string;
}
