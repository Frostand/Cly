import type {
  AgentConfiguration,
  AgentConfigurationEstimate,
  AgentConfigurationInput,
} from "../agent-sessions/types";
import type { LiteratureSearchResult } from "../domain/literature-search";
import type {
  AgentPreset,
  Claim,
  ClaimStatus,
  ContextItem,
  Experiment,
  GraphEdge,
  Integration,
  NotebookArtifact,
  ReproducibilityAudit,
  ResearchDecision,
  ResearchProject,
  Source,
} from "../domain/types";

export interface ProjectService {
  switchProject(projectId: string): Promise<void>;
}

export interface ContextService {
  setIncluded(itemId: string, included: boolean): Promise<void>;
  setPinned(itemId: string, pinned: boolean): Promise<void>;
  setRepresentation(
    itemId: string,
    representation: ContextItem["representation"],
  ): Promise<void>;
}

export interface AgentService {
  savePreset(preset: AgentPreset): Promise<void>;
  startPreview(presetId: string): Promise<void>;
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
}

export interface SourceService {
  create(input: Pick<Source, "title" | "type">): Promise<Source>;
  createFromSearch(result: LiteratureSearchResult): Promise<Source>;
  addToNotebookBundle(id: string): Promise<void>;
  linkClaim(sourceId: string, claimId: string): Promise<void>;
  enrich(sourceId: string): Promise<Source>;
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
}

export interface IntegrationService {
  updateStatus(id: string, status: Integration["status"]): Promise<void>;
}

export interface PlannerService {
  setStatus(
    id: string,
    status: "Accepted" | "Deferred" | "Dismissed" | "In progress",
  ): Promise<void>;
}

export interface DecisionService {
  create(
    input: Pick<ResearchDecision, "title" | "decision" | "reason">,
  ): Promise<ResearchDecision>;
  supersede(id: string, replacementId: string): Promise<void>;
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
  integrations: IntegrationService;
  planner: PlannerService;
  decisions: DecisionService;
}
