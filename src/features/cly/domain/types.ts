import type { AgentSession } from "../agent-sessions/types";

export type ScreenId =
  | "overview"
  | "objectives"
  | "agents"
  | "context"
  | "graph"
  | "experiments"
  | "costs"
  | "sources"
  | "literature"
  | "notebooks"
  | "code"
  | "claims"
  | "obligations"
  | "provenance"
  | "reproducibility"
  | "impact-review"
  | "decisions"
  | "next-steps"
  | "reviewer-capsules"
  | "dev"
  | "integrations"
  | "models"
  | "settings";

export type ProductArea = "research" | "dev";

export type DevSection =
  | "projects"
  | "repositories"
  | "features"
  | "issues"
  | "sessions"
  | "agents"
  | "machines"
  | "pull-requests"
  | "tests"
  | "context"
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
  externalTransmissionApprovals?: Array<"arxiv" | "semantic-scholar">;
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
  url?: string;
  doi?: string;
  providerId?: string;
  provider?: string;
  methods: string[];
  findings: string[];
  limitations: string[];
  tags: string[];
  linkedClaimIds: string[];
  linkedExperimentIds: string[];
  inNotebookBundle: boolean;
  path: string;
  updatedAt: string;
  provenance?: {
    provider: string;
    query: string;
    score: number;
    method: string;
    model?: string;
    components?: Record<string, number>;
    explanation: string;
    retrievedAt: string;
  };
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
  status: "Complete" | "Running" | "Failed" | "Queued" | "Cancelled";
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

export interface PreregistrationContent {
  hypothesis: string;
  primaryMetrics: string[];
  exclusionRules: string;
  analysisPlan: string;
  successCriteria: string;
  dataset: string;
  intendedDesign: string;
}

export interface AnalysisDeviationAcknowledgement {
  id: string;
  state: "acknowledged";
  actorId: string;
  provenanceEventId: string;
  acknowledgedAt: string;
}

export interface AnalysisDeviation {
  id: string;
  projectId: string;
  snapshotId: string;
  fieldPath: `/${keyof PreregistrationContent}`;
  beforeValue: string | string[];
  afterValue: string | string[];
  rationale: string;
  declarationTiming: "pre-evaluation" | "retrospective";
  actorId: string;
  provenanceEventId: string;
  declaredAt: string;
  acknowledgement: AnalysisDeviationAcknowledgement | null;
}

export interface PreregistrationSnapshot {
  id: string;
  projectId: string;
  experimentId: string;
  version: number;
  amendsSnapshotId: string | null;
  content: PreregistrationContent;
  contentHash: string;
  actorType: "human" | "agent" | "system" | "integration";
  actorId: string;
  origin: "human" | "imported" | "inferred" | "system";
  provenanceEventId: string;
  createdAt: string;
  finalEvaluation: {
    id: string;
    actorId: string;
    provenanceEventId: string;
    evaluatedAt: string;
  } | null;
  deviations: AnalysisDeviation[];
}

export interface PreregistrationComparison {
  fieldPath: AnalysisDeviation["fieldPath"];
  beforeValue: string | string[];
  afterValue: string | string[];
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
  staleReasons?: string[];
  hash: string;
  updatedAt: string;
}

export type CostCategory =
  | "gpu"
  | "cloud"
  | "storage"
  | "model-api"
  | "agent"
  | "rerun"
  | "other";

export type CostWasteClassification =
  | "failed"
  | "duplicated"
  | "abandoned"
  | "unused"
  | "repeated"
  | "stale-rerun";

export interface MoneyTotal {
  amountMinor: number;
  currency: string;
}

export interface CostEntry {
  id: string;
  projectId: string;
  runId: string;
  runTitle: string;
  source: "manual" | "aws-cur";
  providerEntryId: string | null;
  amountMinor: number;
  currency: string;
  category: CostCategory;
  startedAt: string;
  endedAt: string;
  confidenceBps: number;
  description: string;
  raw: Record<string, unknown>;
  createdAt: string;
  waste: CostWasteClassification[];
}

export interface CostAggregate {
  totals: MoneyTotal[];
  categorizedTotals: Array<{
    category: CostCategory;
    totals: MoneyTotal[];
  }>;
  conversionState: "empty" | "single-currency" | "unsupported-mixed-currency";
}

export interface CostLedger extends CostAggregate {
  entries: CostEntry[];
  waste: CostAggregate & { entryCount: number };
}

export interface ClaimCostSummary extends CostAggregate {
  claimId: string;
  entries: CostEntry[];
  runIds: string[];
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
    | "tests"
    | "validates"
    | "weakens"
    | "cites"
    | "supersedes"
    | "requires follow-up"
    | "linked manually"
    | "inferred";
  confidence: number | null;
  approved: boolean;
}

export type LineageStepKind =
  | "objective"
  | "notebook"
  | "commit"
  | "experiment"
  | "artifact"
  | "claim";

export interface LineageStep {
  kind: LineageStepKind;
  id: string;
  label: string;
  coordinates: Record<string, unknown>;
}

export interface LineageEvidence {
  id: string;
  projectId: string;
  suggestionId: string;
  evidenceType: string;
  path: string | null;
  coordinates: Record<string, unknown>;
  excerpt: string | null;
  contentHash: string;
  createdAt: string;
}

export interface LineageSuggestion {
  id: string;
  projectId: string;
  logicalKey: string;
  fingerprint: string;
  revision: number;
  lifecycleState: "current" | "stale" | "superseded";
  supersedesSuggestionId: string | null;
  chain: LineageStep[];
  confidence: number;
  rationale: string;
  origin: "inferred";
  reviewState: "unreviewed" | "approved" | "rejected";
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  evidence: LineageEvidence[];
}

export type LineageReviewDecision =
  | { id: string; action: "approve" }
  | { id: string; action: "reject" }
  | {
      id: string;
      action: "edit";
      edit:
        | Pick<LineageSuggestion, "rationale">
        | Pick<LineageSuggestion, "confidence">
        | Pick<LineageSuggestion, "rationale" | "confidence">;
    };

export interface LineageScanMeasurement {
  id: string;
  projectId: string;
  scanDurationMs: number;
  timeToFirstChainMs: number | null;
  suggestionCount: number;
  acceptedCount: number;
  rejectedCount: number;
  correctionCount: number;
  manualConfig: Record<string, unknown>;
  createdAt: string;
}

export type DecisionBriefFindingCategory =
  | "failed-run"
  | "stale-artifact-or-claim"
  | "contradictory-evidence"
  | "missing-provenance"
  | "unresolved-decision"
  | "recommended-next-action";

export type DecisionBriefFindingStatus =
  | "open"
  | "assigned"
  | "resolved"
  | "deferred";

export interface DecisionBriefEvidence {
  objectId: string;
  objectTitle: string;
  objectType: string;
  provenanceEventId: string;
  provenanceSequence: number;
  provenanceAction: string;
}

export interface DecisionBriefFinding {
  id: string;
  projectId: string;
  briefId: string;
  category: DecisionBriefFindingCategory;
  sortOrder: number;
  title: string;
  detail: string;
  recommendedAction: string;
  status: DecisionBriefFindingStatus;
  owner: string | null;
  deferredReason: string | null;
  createdAt: string;
  updatedAt: string;
  evidence: DecisionBriefEvidence[];
}

export interface DecisionBrief {
  id: string;
  projectId: string;
  startSequence: number;
  cutoffSequence: number;
  generatedBy: string;
  createdAt: string;
  findings: DecisionBriefFinding[];
  pilot: {
    meetingNumber: number;
    targetMeetings: number;
    surfacedDecisionCount: number;
    assignedOrResolvedCount: number;
    assignmentOrResolutionRate: number;
    recordedAt: string;
  } | null;
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
