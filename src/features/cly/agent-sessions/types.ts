export type AgentSessionsMode = "overview" | "chat";

export interface ClyDevTaskIdentity {
  project: { id: string; name: string };
  repository: { name: string; remote?: string };
  workspace: { branch: string; worktree?: string; commit?: string };
  machine: { id: string; name: string };
  provider: {
    id: string;
    model: string;
    reasoningLevel: ReasoningLevel;
  };
  budget: {
    usedTokens: number;
    maxTokens: number;
    usedCostMinorUnits: number;
    maxCostMinorUnits: number;
  };
  objective: { title: string; issueId?: string };
  researchImpact: {
    summary: string;
    objectIds: string[];
    risk: "low" | "medium" | "high";
  };
}

export type ClyDevWorkspaceMode =
  | "agent-only"
  | "inline-workspace"
  | "detached-workspace"
  | "external-editor";

export type ClyDevTaskState =
  | "first-run"
  | "empty"
  | "loading"
  | "streaming"
  | "awaiting-approval"
  | "failed"
  | "canceled"
  | "interrupted-resumable"
  | "unsupported";

export type ClyDevConnectionState = "connected" | "offline" | "reconnecting";

export type ClyDevSessionState =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "canceled"
  | "failed"
  | "interrupted"
  | "resumable";

export interface ClyDevActor {
  kind: "user" | "agent" | "tool" | "system";
  id: string;
}

export interface ClyDevEventInput {
  schemaVersion: 1;
  payloadVersion: 1;
  idempotencyKey: string;
  type: string;
  transferability: "local-only" | "transferable";
  occurredAt: string;
  actor: ClyDevActor;
  payload: Record<string, unknown>;
}

export interface ClyDevSessionEvent extends ClyDevEventInput {
  id: string;
  projectId: string;
  sessionId: string;
  sequence: number;
  recordedAt: string;
  provenance: ClyDevProvenance;
  outboundEnvelope: Record<string, unknown> | null;
  outboundSha256: string | null;
}

export interface ClyDevProvenance {
  repository: { id: string; remoteUrl?: string };
  worktree: { id: string; branch: string; baseRef?: string };
  commit: { sha: string };
  machine: { id: string; platform: "darwin" | "linux" | "win32" };
  provider: {
    id: string;
    model: string;
    reasoningEffort?: ReasoningLevel;
  };
  research: { objectIds: string[] };
}

export interface ClyDevWorkspace {
  id: string;
  projectId: string;
  name: string;
  schemaVersion: 1;
  idempotencyKey: string;
  repository: ClyDevProvenance["repository"];
  worktree: ClyDevProvenance["worktree"];
  machine: ClyDevProvenance["machine"];
  localOnly: { repositoryPath: string; worktreePath: string };
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface ClyDevTask {
  id: string;
  projectId: string;
  workspaceId: string;
  title: string;
  objective: string;
  researchObjectIds: string[];
  schemaVersion: 1;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface ClyDevSessionRecord {
  id: string;
  projectId: string;
  taskId: string;
  title: string;
  contextManifestId: string;
  schemaVersion: 1;
  idempotencyKey: string;
  provider: ClyDevProvenance["provider"];
  providerId: string;
  model: string;
  commit: ClyDevProvenance["commit"];
  state: ClyDevSessionState;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface ClyDevApproval {
  id: string;
  projectId: string;
  sessionId: string;
  state: "pending" | "approved" | "rejected" | "canceled";
  requestSequence: number;
  resolutionSequence: number | null;
  requestedAt: string;
  resolvedAt: string | null;
  [key: string]: unknown;
}

export interface ClyDevSessionSnapshot extends ClyDevSessionRecord {
  lastSequence: number;
  approvals: ClyDevApproval[];
  process: null;
}

export interface ClyDevSessionOverview extends ClyDevSessionRecord {
  lastSequence: number;
  pendingApprovalCount: number;
  process: null;
}

export interface ClyDevSessionOverviewPage {
  items: ClyDevSessionOverview[];
  nextOffset: number | null;
}

export type ClyDevExecutionMode = "read_only" | "workspace_write";

export interface ClyDevRuntimeProvider {
  family: "openai" | "anthropic";
  id: "openai-codex" | "anthropic-claude";
  label: string;
  authentication: "authenticated" | "absent" | "expired" | "unavailable";
  capabilities: {
    streaming: boolean;
    reasoning: boolean;
    toolCalls: boolean;
    interceptBeforeEffect: boolean;
  };
  supportedModes: ClyDevExecutionMode[];
  models: Array<{
    id: string;
    label: string;
    reasoningEfforts: ReasoningLevel[];
  }>;
  error?: { code: string; message: string; retryable: boolean };
}

export interface ClyDevExecutionInput {
  schemaVersion: 1;
  payloadVersion: 1;
  requestId: string;
  prompt: string;
  mode: "execute" | "plan" | "read_only";
  tools: Array<{ name: string }>;
  approvals?: Record<string, { approvalId: string }>;
  actorId?: string;
  budget?: {
    maxInputTokens?: number;
    maxOutputTokens?: number;
    maxTotalTokens?: number;
    maxCostMinor?: number;
  };
}

export interface ClyDevExecutionResult {
  status: "completed" | "canceled" | "failed" | "awaiting_approval";
  error?: { code: string; message: string; retryable: boolean };
  approval?: Record<string, unknown> & { approvalId: string };
}

export interface ClyDevSessionLaunchInput {
  schemaVersion: 1;
  payloadVersion: 1;
  idempotencyKey: string;
  title: string;
  objective: string;
  mode: ClyDevExecutionMode;
  provider: {
    id: ClyDevRuntimeProvider["id"];
    model: string;
    reasoningEffort?: ReasoningLevel;
  };
}

export interface ClyDevSessionLaunchResult {
  workspace: ClyDevWorkspace;
  contextManifest: ClyDevContextManifest;
  task: ClyDevTask;
  session: ClyDevSessionRecord;
  execution: {
    mode: ClyDevExecutionMode;
    tools: string[];
  };
}

export interface ClyDevContextManifest {
  id: string;
  projectId: string;
  workspaceId: string;
  schemaVersion: 1;
  idempotencyKey: string;
  localOnly: {
    absolutePaths: string[];
    environmentVariableNames: string[];
    notes: string[];
    uncommittedFilePaths: string[];
  };
  transferable: {
    summary: string;
    entries: Array<Record<string, string>>;
  };
  createdAt: string;
}

export interface ClyDevOutboundContext {
  preview: Record<string, unknown>;
  egress: Record<string, unknown>;
  previewBytes: string;
  egressBytes: string;
  previewSha256: string;
  egressSha256: string;
}

export interface ClyDevDevicePublicBundle {
  deviceId: string;
  keyVersion: number;
  encryptionKey: string;
  signingKey: string;
}

export interface ClyDevDevice {
  id: string;
  name: string;
  kind: "local" | "peer";
  trustState: "pending" | "trusted" | "revoked";
  fingerprint: string;
  keyVersion: number;
  publicBundle: ClyDevDevicePublicBundle;
  registeredAt: string;
  verifiedAt: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
  lastSeenAt: string | null;
}

export interface ClyDevSyncConflict {
  id: string;
  projectId: string;
  recordKind: string;
  recordId: string;
  localRevision: number;
  incomingRevision: number;
  localEnvelopeId: string;
  incomingEnvelopeId: string;
  state: "pending" | "keep_local" | "use_incoming";
  createdAt: string;
  resolvedAt: string | null;
}

export interface ClyDevSyncStatus {
  localDevice: ClyDevDevice;
  devices: ClyDevDevice[];
  keyStoreState: "available" | "locked" | "unavailable";
  approvedChanges: number;
  localOnlyItems: number;
  trustedDeviceCount: number;
  pendingChanges: number;
  failedChanges: number;
  policyBlocked: number;
  conflictCount: number;
  conflicts: ClyDevSyncConflict[];
  lastSyncAt: string | null;
}

export type ClyDevResumeAction =
  | "fetch"
  | "clone"
  | "create-branch"
  | "create-worktree"
  | "inspect-changes"
  | "defer"
  | "return-to-source";

export interface ClyDevResumeReadiness {
  status: string;
  blocking: boolean;
  checks: Array<{
    id: string;
    status: "pass" | "fail" | "warning";
    summary: string;
  }>;
  actions: ClyDevResumeAction[];
  missingTools?: string[];
}

export interface ClyDevHandoffEnvelope {
  handoffId: string;
  projectId: string;
  sessionId: string;
  revision: number;
  sourceMachine: { id: string; platform: "darwin" | "linux" | "win32" };
  repository: { id: string; remoteUrl?: string };
  worktree: { id: string; branch: string; baseRef?: string };
  commit: { sha: string };
  task: {
    id: string;
    title: string;
    objective: string;
    researchObjectIds: string[];
  };
  session: { id: string; title: string; state: ClyDevSessionState };
}

export interface ClyDevHandoffInspection {
  envelope: ClyDevHandoffEnvelope;
  readiness: ClyDevResumeReadiness;
  snapshot?: ClyDevSessionSnapshot;
}

export interface ClyDevResumeDestination {
  name?: string;
  path: string;
  repositoryPath: string;
  worktreePath: string;
  requiredTools: string[];
  machine: {
    id: string;
    platform: "darwin" | "linux" | "win32";
    architecture?: string;
  };
}

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

export type ReasoningLevel =
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max"
  | "ultra";
export type AgentReasoningLabel =
  | "Low"
  | "Medium"
  | "High"
  | "Extra High"
  | "Max"
  | "Ultra";

export interface AgentResourceBudget {
  maxInputTokens: number;
  maxOutputTokens: number;
  maxCostMinorUnits: number;
  maxRuntimeMs: number;
}

export interface AgentUsageTotals {
  inputTokens: number;
  outputTokens: number;
  costMinorUnits: number;
  runtimeMs: number;
}

export interface AgentSchedulerUsageTotals {
  /** Usage accepted against the configured role and aggregate caps. */
  accepted: AgentUsageTotals;
  /** Raw provider-reported usage, including amounts rejected above a cap. */
  providerReported: AgentUsageTotals;
  /** Peak simultaneous reservation held by active workers. */
  reserved: AgentUsageTotals;
}

export interface AgentRoleConfiguration {
  id: string;
  role: AgentRole;
  instanceCount: number;
  maxParallel: number;
  provider: string;
  model: string;
  reasoningLevel: ReasoningLevel;
  budget: AgentResourceBudget;
  allowedTools: string[];
  allowedContextSources: string[];
  allowedFileGlobs: string[];
  permissions: AgentPermissions;
  approvalCheckpoints: string[];
  fallbackModel?: string;
}

export interface AgentConfigurationInput {
  name: string;
  maxParallel: number;
  maxTotalBudget: AgentResourceBudget;
  partialFailurePolicy: "continue" | "cancel_remaining";
  roles: AgentRoleConfiguration[];
}

export interface AgentConfiguration extends AgentConfigurationInput {
  id: string;
  projectId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentConfigurationEstimate {
  inputTokens: number;
  outputTokens: number;
  costMinorUnits: number;
  runtimeMs: number;
  inaccessibleContext: string[];
  inaccessibleTools: string[];
  reasons: string[];
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
  reasoningLevel: AgentReasoningLabel;
  instanceCount?: number;
  maxParallel?: number;
  budget?: AgentResourceBudget;
  contextPackId?: string;
  contextPackName: string;
  contextMode: AgentContextMode;
  permissions: AgentPermissions;
  tools: string[];
  allowedContextSources?: string[];
  allowedFileGlobs?: string[];
  approvalCheckpoints?: string[];
  partialFailurePolicy?: "continue" | "cancel_remaining";
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
  identity: ClyDevTaskIdentity;
  workspaceMode: ClyDevWorkspaceMode;
  taskState: ClyDevTaskState;
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
  connectionState: ClyDevConnectionState;
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
  reasoningLevel: AgentReasoningLabel;
  preset: string;
  contextPackName: string;
  approvalPolicy: string;
  branchPreference: string;
  usageBudget: string;
}
