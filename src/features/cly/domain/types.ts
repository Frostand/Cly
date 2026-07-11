import type { AgentSession } from "../agent-sessions/types";

export type ScreenId =
  | "overview"
  | "agents"
  | "context"
  | "graph"
  | "experiments"
  | "sources"
  | "literature"
  | "notebooks"
  | "code"
  | "claims"
  | "provenance"
  | "reproducibility"
  | "decisions"
  | "next-steps"
  | "integrations"
  | "models"
  | "settings";

export type FixtureMode =
  | "empty"
  | "new"
  | "active"
  | "large"
  | "loading"
  | "risks"
  | "offline"
  | "errors";

export type EntityType =
  | "question"
  | "hypothesis"
  | "source"
  | "dataset"
  | "method"
  | "code"
  | "notebook"
  | "experiment"
  | "run"
  | "metric"
  | "figure"
  | "table"
  | "claim"
  | "decision"
  | "report"
  | "agent-session";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export interface ResearchProject {
  id: string;
  name: string;
  path: string;
  question: string;
  hypothesis: string;
  phase: string;
  description: string;
  localOnly: boolean;
  updatedAt: string;
}

export interface Source {
  id: string;
  title: string;
  authors: string;
  year: number;
  type:
    | "Paper"
    | "Dataset"
    | "Documentation"
    | "Lab note"
    | "Webpage"
    | "NotebookLM result";
  status: "Reviewed" | "Reading" | "Queued" | "Needs metadata";
  relevance: "Core" | "High" | "Medium" | "Low";
  confidence: number;
  summary: string;
  methods: string[];
  findings: string[];
  limitations: string[];
  tags: string[];
  linkedClaimIds: string[];
  linkedExperimentIds: string[];
  inNotebookBundle: boolean;
  path: string;
  updatedAt: string;
}

export type ClaimStatus =
  | "Unsupported"
  | "Weak"
  | "Medium"
  | "Strong"
  | "Paper-ready"
  | "Invalidated"
  | "Needs review";

export interface Claim {
  id: string;
  text: string;
  type: "Primary" | "Methodological" | "Result" | "Limitation";
  status: ClaimStatus;
  confidence: number;
  supportingSourceIds: string[];
  contradictingSourceIds: string[];
  experimentIds: string[];
  notebookIds: string[];
  artifactIds: string[];
  assumptions: string[];
  weaknesses: string[];
  reviewerRisks: string[];
  nextExperiment: string;
  updatedAt: string;
}

export type ExperimentType =
  | "Training run"
  | "Simulation"
  | "Statistical analysis"
  | "Parameter sweep"
  | "Benchmark"
  | "Reproduction attempt"
  | "Notebook analysis"
  | "Data pipeline"
  | "Ablation"
  | "Custom";

export interface ExperimentRun {
  id: string;
  experimentId: string;
  name: string;
  status: "Complete" | "Running" | "Failed" | "Queued";
  startedAt: string;
  duration: string;
  codeVersion: string;
  environment: string;
  metrics: Record<string, number>;
  config: Record<string, string | number | boolean>;
  reproducibility: "Verified" | "Partial" | "Blocked";
  canonical: boolean;
}

export interface Experiment {
  id: string;
  name: string;
  goal: string;
  hypothesis: string;
  type: ExperimentType;
  status: "Complete" | "Running" | "Failed" | "Planned";
  command: string;
  environment: string;
  claimIds: string[];
  notebookId?: string;
  dataset: string;
  limitations: string[];
  nextStep: string;
  runIds: string[];
  updatedAt: string;
}

export interface NotebookArtifact {
  id: string;
  name: string;
  path: string;
  title: string;
  status: "Canonical" | "Draft" | "Stale" | "Needs review";
  executionConsistency: number;
  reproducibility: "Verified" | "Partial" | "At risk";
  experimentId?: string;
  claimIds: string[];
  codeCells: number;
  outputs: number;
  figures: number;
  issues: string[];
  imports: string[];
  outline: string[];
  updatedAt: string;
}

export interface CodeArtifact {
  id: string;
  path: string;
  purpose: string;
  objective: string;
  method: string;
  claimIds: string[];
  experimentIds: string[];
  notebookIds: string[];
  tests: string;
  risks: string[];
  confidence: number;
  status: "Linked" | "Inferred" | "Unlinked" | "Obsolete";
  updatedAt: string;
}

export interface Artifact {
  id: string;
  name: string;
  kind: "Figure" | "Table" | "Output" | "Report";
  path: string;
  preview: string;
  sourceData: string;
  generator: string;
  experimentId: string;
  runId: string;
  commit: string;
  claimIds: string[];
  regeneration: "Ready" | "Stale" | "Broken" | "Manual";
  hash: string;
  updatedAt: string;
}

export interface AuditFinding {
  id: string;
  category: string;
  title: string;
  detail: string;
  severity: "Blocking" | "High" | "Warning" | "Passed";
  status: "Open" | "Assigned" | "Resolved" | "Ignored";
  objectIds: string[];
  assignee?: string;
}

export interface ReproducibilityAudit {
  id: string;
  score: number;
  status:
    | "Not reproducible"
    | "Partially reproducible"
    | "Mostly reproducible"
    | "Artifact-ready"
    | "Publication-ready";
  createdAt: string;
  findingIds: string[];
}

export interface Integration {
  id: string;
  name: string;
  category: "Research" | "Code" | "Data" | "Writing" | "Runtime" | "Local";
  status:
    | "Connected"
    | "Not connected"
    | "Unavailable"
    | "Setup required"
    | "Permission required"
    | "Sync error"
    | "Planned"
    | "Manual import";
  purpose: string;
  capabilities: string[];
  privacy: string;
  lastSync?: string;
}

export interface NextStep {
  id: string;
  title: string;
  category:
    | "Claim"
    | "Experiment"
    | "Source"
    | "Integrity"
    | "Notebook"
    | "Code";
  rationale: string;
  impact: "High" | "Medium" | "Low";
  effort: "Small" | "Medium" | "Large";
  urgency: "Now" | "Soon" | "Later";
  evidenceIds: string[];
  claimId?: string;
  experimentId?: string;
  agentPreset: string;
  contextPack: string;
  status: "Recommended" | "Accepted" | "Deferred" | "Dismissed" | "In progress";
}

export interface ResearchDecision {
  id: string;
  title: string;
  date: string;
  decision: string;
  reason: string;
  alternatives: string[];
  evidenceIds: string[];
  affectedIds: string[];
  status: "Active" | "Superseded" | "Unresolved";
  outcome?: string;
  supersededBy?: string;
  origin: "Researcher" | "Team" | "Agent-assisted";
}

export interface ContextItem {
  id: string;
  name: string;
  category: string;
  type: string;
  tokens: number;
  freshness: "Fresh" | "Aging" | "Stale";
  representation: "Raw" | "Summary";
  included: boolean;
  pinned: boolean;
  confidence: number;
  source: string;
  linkedIds: string[];
  priority: number;
}

export interface ContextPack {
  id: string;
  name: string;
  description: string;
  itemIds: string[];
}

export interface AgentNode {
  id: string;
  role: string;
  model: string;
  reasoning: "Low" | "Medium" | "High";
  contextPack: string;
  mode: "Sequential" | "Parallel" | "Reviewer" | "Synthesis";
  canModifyFiles: boolean;
  approvalRequired: boolean;
}

export interface AgentPreset {
  id: string;
  name: string;
  description: string;
  usage: "Low" | "Medium" | "High" | "Very High";
  nodes: AgentNode[];
}

export interface GraphNode {
  id: string;
  type: EntityType;
  label: string;
  status: "Confirmed" | "Suggested" | "Uncertain" | "Stale" | "Broken";
  x: number;
  y: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relation:
    | "supports"
    | "contradicts"
    | "implements"
    | "uses"
    | "generated by"
    | "depends on"
    | "produces"
    | "validates"
    | "weakens"
    | "cites"
    | "supersedes"
    | "requires follow-up"
    | "linked manually"
    | "inferred";
  confidence: number;
  approved: boolean;
}

export interface Report {
  id: string;
  title: string;
  type: string;
  status: "Draft" | "Ready" | "Exported";
  updatedAt: string;
}

export interface ActivityEvent {
  id: string;
  time: string;
  type: "agent" | "import" | "audit" | "system";
  title: string;
  detail: string;
  status: "running" | "complete" | "warning";
}

export interface ClyRepositoryData {
  projects: ResearchProject[];
  sources: Source[];
  claims: Claim[];
  experiments: Experiment[];
  runs: ExperimentRun[];
  notebooks: NotebookArtifact[];
  code: CodeArtifact[];
  artifacts: Artifact[];
  findings: AuditFinding[];
  audits: ReproducibilityAudit[];
  integrations: Integration[];
  nextSteps: NextStep[];
  decisions: ResearchDecision[];
  contextItems: ContextItem[];
  contextPacks: ContextPack[];
  agentPresets: AgentPreset[];
  agentSessions: AgentSession[];
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  reports: Report[];
  activity: ActivityEvent[];
}
