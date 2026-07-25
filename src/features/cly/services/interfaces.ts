import type {
  AgentConfiguration,
  AgentConfigurationEstimate,
  AgentConfigurationInput,
} from "../agent-sessions/types";
import type {
  AgentContextActor,
  AgentContextItem,
  AgentContextPack,
  AgentContextRevision,
  AgentContextSnapshot,
  ContextManifestPreview,
  ContextManifestRequest,
  ContextRepresentation,
  ContextSensitivity,
  ContextTransmissionApproval,
  PersistedContextManifest,
} from "../domain/agent-context";
import type { LiteratureSearchResult } from "../domain/literature-search";
import type { LocalAnalysisResult } from "../domain/local-analysis";
import type {
  AgentPreset,
  AuditFinding,
  Claim,
  ClaimStatus,
  ContextItem,
  Experiment,
  GraphEdge,
  NextStep,
  NotebookArtifact,
  ReproducibilityAudit,
  ResearchDecision,
  ResearchProject,
  Source,
} from "../domain/types";

export interface ProjectService {
  switchProject(projectId: string): Promise<void>;
  update(
    patch: Pick<
      ResearchProject,
      "name" | "question" | "hypothesis" | "description"
    >,
  ): Promise<ResearchProject>;
}

export interface ContextService {
  setIncluded(itemId: string, included: boolean): Promise<void>;
  setPinned(itemId: string, pinned: boolean): Promise<void>;
  setRepresentation(
    itemId: string,
    representation: ContextItem["representation"],
  ): Promise<void>;
  hydrate(projectId: string): Promise<AgentContextSnapshot>;
  proposeRevision(
    projectId: string,
    itemId: string,
    expectedVersion: number,
    revision: Omit<
      AgentContextRevision,
      "id" | "projectId" | "itemId" | "revision" | "createdAt"
    >,
    actor: AgentContextActor,
  ): Promise<AgentContextItem>;
  approveRevision(
    projectId: string,
    itemId: string,
    revisionId: string,
    expectedVersion: number,
    actor: AgentContextActor,
  ): Promise<AgentContextItem>;
  setLifecycle(
    projectId: string,
    itemId: string,
    action: "pin" | "unpin" | "lock" | "unlock" | "delete" | "restore",
    expectedVersion: number,
    actor: AgentContextActor,
  ): Promise<AgentContextItem>;
  savePack(
    projectId: string,
    input: {
      id?: string;
      name: string;
      configurationId: string;
      roleId: string;
      expectedRevision?: number;
      entries: Array<{
        itemId: string;
        revisionId: string;
        representation: ContextRepresentation;
        selectionReason: string;
        sensitivity: ContextSensitivity;
      }>;
      actor: AgentContextActor;
    },
  ): Promise<AgentContextPack>;
  preview(
    projectId: string,
    input: ContextManifestRequest,
  ): Promise<ContextManifestPreview>;
  persist(
    projectId: string,
    input: ContextManifestRequest & {
      idempotencyKey: string;
      expectedSha256: string;
      transmissionApprovalId: string | null;
    },
  ): Promise<PersistedContextManifest>;
  createTransmissionApproval(
    projectId: string,
    input: {
      manifestSha256: string;
      provider: string;
      model: string;
      restrictedReferenceIds: string[];
      actorId: string;
      rationale: string;
      expiresAt: string | null;
    },
  ): Promise<ContextTransmissionApproval>;
  revokeTransmissionApproval(
    projectId: string,
    approvalId: string,
    input: { actorId: string; rationale: string },
  ): Promise<{ id: string; state: "revoked" }>;
}

export interface AgentService {
  savePreset(preset: AgentPreset): Promise<void>;
  listConfigurations(projectId: string): Promise<AgentConfiguration[]>;
  saveConfiguration(
    projectId: string,
    configuration: AgentConfiguration | AgentConfigurationInput,
  ): Promise<AgentConfiguration>;
  removeConfiguration(
    projectId: string,
    configurationId: string,
    expectedRevision: number,
  ): Promise<void>;
  estimateConfiguration(
    projectId: string,
    configurationId: string,
    configuration?: AgentConfigurationInput,
  ): Promise<AgentConfigurationEstimate>;
}

export interface ExperimentService {
  create(
    input: Pick<Experiment, "name" | "goal" | "type"> & {
      hypothesis?: string;
    },
  ): Promise<Experiment>;
  duplicate(id: string): Promise<Experiment>;
  recordLocalAnalysis(input: {
    experimentId: string;
    datasetSourceId: string;
    datasetFileName: string;
    datasetHash: string;
    result: LocalAnalysisResult;
  }): Promise<{ runId: string; claimId: string }>;
}

export interface SourceService {
  create(
    input: Pick<Source, "title" | "type"> &
      Partial<Pick<Source, "authors" | "year" | "url" | "summary">>,
  ): Promise<Source>;
  createFromSearch(result: LiteratureSearchResult): Promise<Source>;
  addToNotebookBundle(id: string): Promise<void>;
  linkClaim(sourceId: string, claimId: string): Promise<void>;
  enrich(sourceId: string): Promise<Source>;
  setArchived(sourceId: string, archived: boolean): Promise<Source>;
}

export interface LiteratureService {
  search(
    project: ResearchProject,
    query: string,
  ): Promise<LiteratureSearchResult[]>;
}

export interface NotebookService {
  importMock(name: string): Promise<NotebookArtifact>;
}

export interface ClaimService {
  create(text: string): Promise<Claim>;
  setStatus(id: string, status: ClaimStatus): Promise<void>;
  linkExperiment(claimId: string, experimentId: string): Promise<void>;
  linkEvidence(
    claimId: string,
    sourceId: string,
    relationship: "supports" | "contradicts",
  ): Promise<void>;
}

export interface ResearchGraphService {
  createRelationship(edge: Omit<GraphEdge, "id">): Promise<GraphEdge>;
  approveRelationship(id: string): Promise<void>;
}

export interface ReproducibilityService {
  runAudit(): Promise<ReproducibilityAudit>;
  resolveFinding(id: string): Promise<void>;
  setFindingDisposition(
    id: string,
    input: {
      status: AuditFinding["status"];
      assignee?: string;
      reason?: string;
    },
  ): Promise<AuditFinding>;
}

export interface PlannerService {
  setStatus(id: string, status: NextStep["status"]): Promise<void>;
  generate(steps: NextStep[]): Promise<NextStep[]>;
}

export interface DecisionService {
  create(
    input: Pick<ResearchDecision, "title" | "decision" | "reason">,
  ): Promise<ResearchDecision>;
  update(
    id: string,
    input: Partial<
      Pick<
        ResearchDecision,
        | "title"
        | "decision"
        | "reason"
        | "alternatives"
        | "evidenceIds"
        | "affectedIds"
        | "status"
        | "outcome"
        | "origin"
      >
    >,
  ): Promise<ResearchDecision>;
  supersede(
    id: string,
    replacement: Pick<ResearchDecision, "title" | "decision" | "reason"> &
      Partial<
        Pick<
          ResearchDecision,
          "alternatives" | "evidenceIds" | "affectedIds" | "outcome" | "origin"
        >
      >,
  ): Promise<ResearchDecision>;
}

export interface ClyServices {
  projects: ProjectService;
  context: ContextService;
  agents: AgentService;
  experiments: ExperimentService;
  sources: SourceService;
  literature: LiteratureService;
  notebooks: NotebookService;
  claims: ClaimService;
  graph: ResearchGraphService;
  reproducibility: ReproducibilityService;
  planner: PlannerService;
  decisions: DecisionService;
}
