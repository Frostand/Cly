import type {
  ExperimentDefinitionContent,
  ExperimentDefinitionVersion,
  ExperimentLineage,
} from "../../research/contracts/experiment-provenance";
import type {
  AgentConfiguration,
  AgentConfigurationEstimate,
  AgentConfigurationInput,
} from "../agent-sessions/types";
import type { LiteraturePaper } from "../domain/literature-search";
import type {
  DatasetObligation,
  DatasetObligationInput,
  ObligationAlert,
  ObligationEvaluation,
  ObligationOperation,
  ObligationSummary,
} from "../domain/obligations";
import type { Relationship, ResearchObject } from "../domain/research-bridge";
import type {
  AnalysisDeviation,
  ClaimCostSummary,
  ClaimStatus,
  CostCategory,
  CostEntry,
  CostLedger,
  DecisionBrief,
  DecisionBriefFinding,
  DecisionBriefFindingStatus,
  LineageReviewDecision,
  LineageScanMeasurement,
  LineageSuggestion,
  PreregistrationComparison,
  PreregistrationContent,
  PreregistrationSnapshot,
  ResearchProject,
} from "../domain/types";

export interface ResearchData {
  objects: ResearchObject[];
  relationships: Relationship[];
}

export interface CreateObjectInput {
  type: ResearchObject["type"];
  title: string;
  description?: string;
  payload: ResearchObject["payload"];
}

export interface CreateRelationshipInput {
  fromObjectId: string;
  toObjectId: string;
  type: Relationship["type"];
}

export interface ManualCostEntryInput {
  amountMinor: number;
  category: CostCategory;
  confidenceBps: number;
  currency: string;
  description: string;
  endedAt: string;
  runId: string;
  startedAt: string;
}

export interface AwsCurImportResult {
  duplicateCount: number;
  importedCount: number;
  ledger: CostLedger;
  rowCount: number;
}

export interface ProvenanceEvent {
  id: string;
  projectId: string;
  objectId?: string;
  action: string;
  actorType: "human" | "system" | "agent" | "integration";
  actorId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  sequence?: number;
  previousHash?: string | null;
  eventHash?: string;
}

export interface ProvenanceIntegrity {
  valid: boolean;
  eventCount?: number;
  headHash?: string | null;
  reason?: string;
}

export interface CrossEncoderReranking {
  status: "completed" | "not_configured" | "unavailable" | "empty";
  method: string | null;
  model: string;
  signals: Array<{ sourceId: string; score: number }>;
  error?: string;
  errorKind?: string;
}

export interface LiteratureReadingList {
  id: string;
  projectId: string;
  name: string;
  description: string;
  sourceCount: number;
  sourceIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LiteratureImportResult {
  importedCount: number;
  duplicateCount: number;
  results: Array<{
    duplicate: boolean;
    matchedBy: "doi" | "provider-id" | "url" | "title-year" | null;
    source: ResearchObject;
  }>;
}

export interface LineageScanResult {
  projectId: string;
  suggestions: LineageSuggestion[];
  measurement: LineageScanMeasurement;
}

export interface ReviewerCapsuleManifestRecord {
  id: string;
  kind: string;
  currentness?: "current" | "stale";
  verification?: "verified" | "inferred";
  reproducibility?: "reproducible" | "documented-only" | "unverifiable";
  reason?: string;
}

export interface ReviewerCapsule {
  html: string;
  sha256: string;
  manifest: {
    version: number;
    generatedAt: string;
    selectedClaimIds: string[];
    included: ReviewerCapsuleManifestRecord[];
    omitted: ReviewerCapsuleManifestRecord[];
  };
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = (await response.text()).trim();
    let details: unknown;
    try {
      details = text ? JSON.parse(text) : undefined;
    } catch {
      details = undefined;
    }
    throw new ApiRequestError(
      typeof details === "object" &&
        details !== null &&
        "error" in details &&
        typeof details.error === "string"
        ? details.error
        : text || `Request failed (${response.status}).`,
      response.status,
      details,
    );
  }

  return response.json() as Promise<T>;
}

const projectPath = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/research`;

/** Typed client for the SQLite-backed research API. */
export const apiClient = {
  ensureProject(project: ResearchProject) {
    return request<{
      id: string;
      name: string;
      path: string;
      metadata: Record<string, unknown>;
    }>(projectPath(project.id), {
      method: "PUT",
      body: JSON.stringify({
        name: project.name,
        path: project.path,
        metadata: {
          description: project.description,
          externalTransmissionApprovals: project.externalTransmissionApprovals,
          hypothesis: project.hypothesis,
          localOnly: project.localOnly,
          phase: project.phase,
          question: project.question,
        },
      }),
    });
  },

  fetchAgentConfigurations(projectId: string) {
    return request<AgentConfiguration[]>(
      `/api/projects/${encodeURIComponent(projectId)}/agent-configurations`,
    );
  },

  createAgentConfiguration(projectId: string, input: AgentConfigurationInput) {
    return request<AgentConfiguration>(
      `/api/projects/${encodeURIComponent(projectId)}/agent-configurations`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  updateAgentConfiguration(
    projectId: string,
    configurationId: string,
    expectedRevision: number,
    input: AgentConfigurationInput,
  ) {
    return request<AgentConfiguration>(
      `/api/projects/${encodeURIComponent(projectId)}/agent-configurations/${encodeURIComponent(configurationId)}`,
      {
        method: "PUT",
        body: JSON.stringify({ ...input, expectedRevision }),
      },
    );
  },

  removeAgentConfiguration(
    projectId: string,
    configurationId: string,
    expectedRevision: number,
  ) {
    return request<{ id: string; revision: number }>(
      `/api/projects/${encodeURIComponent(projectId)}/agent-configurations/${encodeURIComponent(configurationId)}`,
      {
        method: "DELETE",
        body: JSON.stringify({ expectedRevision }),
      },
    );
  },

  estimateAgentConfiguration(
    projectId: string,
    configurationId: string,
    configuration?: AgentConfigurationInput,
  ) {
    return request<AgentConfigurationEstimate>(
      `/api/projects/${encodeURIComponent(projectId)}/agent-configurations/${encodeURIComponent(configurationId)}/estimate`,
      {
        method: "POST",
        body: JSON.stringify(configuration ? { configuration } : {}),
      },
    );
  },

  fetchResearchData(projectId: string) {
    return request<ResearchData>(projectPath(projectId));
  },

  fetchExperimentLineages(projectId: string) {
    return request<ExperimentLineage[]>(
      `/api/projects/${encodeURIComponent(projectId)}/experiments/lineage`,
    );
  },

  createExperiment(
    projectId: string,
    input: {
      title: string;
      description?: string;
      definition: ExperimentDefinitionContent;
    },
  ) {
    return request<{
      id: string;
      projectId: string;
      title: string;
      description: string;
      definition: ExperimentDefinitionVersion;
    }>(`/api/projects/${encodeURIComponent(projectId)}/experiments`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  fetchPreregistrations(projectId: string) {
    return request<PreregistrationSnapshot[]>(
      `/api/projects/${encodeURIComponent(projectId)}/preregistrations`,
    );
  },

  createPreregistration(
    projectId: string,
    experimentId: string,
    content: PreregistrationContent,
    amendsSnapshotId?: string | null,
  ) {
    return request<PreregistrationSnapshot>(
      `/api/projects/${encodeURIComponent(projectId)}/experiments/${encodeURIComponent(experimentId)}/preregistrations`,
      {
        method: "POST",
        body: JSON.stringify({
          content,
          amendsSnapshotId: amendsSnapshotId ?? null,
          actorId: "local-user",
          actorType: "human",
          origin: "human",
        }),
      },
    );
  },

  comparePreregistration(
    projectId: string,
    snapshotId: string,
    content: PreregistrationContent,
  ) {
    return request<PreregistrationComparison[]>(
      `/api/projects/${encodeURIComponent(projectId)}/preregistrations/${encodeURIComponent(snapshotId)}/compare`,
      { method: "POST", body: JSON.stringify({ content }) },
    );
  },

  markPreregistrationEvaluated(projectId: string, snapshotId: string) {
    return request<PreregistrationSnapshot>(
      `/api/projects/${encodeURIComponent(projectId)}/preregistrations/${encodeURIComponent(snapshotId)}/final-evaluation`,
      {
        method: "POST",
        body: JSON.stringify({ actorId: "local-user" }),
      },
    );
  },

  declareAnalysisDeviation(
    projectId: string,
    snapshotId: string,
    input: {
      fieldPath: AnalysisDeviation["fieldPath"];
      afterValue: string | string[];
      rationale: string;
    },
  ) {
    return request<AnalysisDeviation>(
      `/api/projects/${encodeURIComponent(projectId)}/preregistrations/${encodeURIComponent(snapshotId)}/deviations`,
      {
        method: "POST",
        body: JSON.stringify({ ...input, actorId: "local-user" }),
      },
    );
  },

  acknowledgeAnalysisDeviation(projectId: string, deviationId: string) {
    return request<AnalysisDeviation>(
      `/api/projects/${encodeURIComponent(projectId)}/deviations/${encodeURIComponent(deviationId)}/acknowledgements`,
      {
        method: "POST",
        body: JSON.stringify({ actorId: "local-user" }),
      },
    );
  },

  fetchCostLedger(projectId: string) {
    return request<CostLedger>(
      `/api/projects/${encodeURIComponent(projectId)}/costs`,
    );
  },

  fetchClaimCosts(projectId: string) {
    return request<ClaimCostSummary[]>(
      `/api/projects/${encodeURIComponent(projectId)}/costs/claims`,
    );
  },

  createManualCost(projectId: string, input: ManualCostEntryInput) {
    return request<CostEntry>(
      `/api/projects/${encodeURIComponent(projectId)}/costs`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  importAwsCur(projectId: string, csv: string, fileName: string) {
    return request<AwsCurImportResult>(
      `/api/projects/${encodeURIComponent(projectId)}/costs/imports/aws-cur`,
      {
        method: "POST",
        body: JSON.stringify({ csv, fileName }),
      },
    );
  },

  fetchProvenance(projectId: string, limit = 100) {
    return request<ProvenanceEvent[]>(
      `/api/projects/${encodeURIComponent(projectId)}/provenance?limit=${limit}`,
    );
  },

  verifyProvenance(projectId: string) {
    return request<ProvenanceIntegrity>(
      `/api/projects/${encodeURIComponent(projectId)}/provenance/integrity`,
    );
  },

  fetchObligations(projectId: string) {
    return request<ObligationSummary>(
      `/api/projects/${encodeURIComponent(projectId)}/obligations`,
    );
  },

  saveDatasetObligation(
    projectId: string,
    datasetObjectId: string,
    input: DatasetObligationInput,
  ) {
    return request<DatasetObligation>(
      `/api/projects/${encodeURIComponent(projectId)}/datasets/${encodeURIComponent(datasetObjectId)}/obligation`,
      { method: "PUT", body: JSON.stringify(input) },
    );
  },

  evaluateObligations(projectId: string, operation: ObligationOperation) {
    return request<ObligationEvaluation>(
      `/api/projects/${encodeURIComponent(projectId)}/obligations/evaluate`,
      { method: "POST", body: JSON.stringify(operation) },
    );
  },

  approveObligationOperation(
    projectId: string,
    operation: ObligationOperation,
    input: { actorId: string; rationale: string },
  ) {
    return request<{
      approval: NonNullable<ObligationEvaluation["approval"]>;
      evaluation: ObligationEvaluation;
    }>(`/api/projects/${encodeURIComponent(projectId)}/obligations/approvals`, {
      method: "POST",
      body: JSON.stringify({ operation, ...input }),
    });
  },

  transitionObligationAlert(
    projectId: string,
    alertId: string,
    input: {
      state: "acknowledged" | "resolved";
      actorId: string;
      note: string;
    },
  ) {
    return request<ObligationAlert>(
      `/api/projects/${encodeURIComponent(projectId)}/obligations/alerts/${encodeURIComponent(alertId)}`,
      { method: "PATCH", body: JSON.stringify(input) },
    );
  },

  previewReviewerCapsule(
    projectId: string,
    claimIds: string[],
    context: Omit<
      ObligationOperation,
      "kind" | "integration" | "objectIds"
    > = {},
  ) {
    return request<ReviewerCapsule>(
      `/api/projects/${encodeURIComponent(projectId)}/reviewer-capsule/preview`,
      {
        method: "POST",
        body: JSON.stringify({ claimIds, ...context }),
      },
    );
  },

  exportReviewerCapsule(
    projectId: string,
    claimIds: string[],
    context: Omit<
      ObligationOperation,
      "kind" | "integration" | "objectIds"
    > = {},
  ) {
    return request<ReviewerCapsule>(
      `/api/projects/${encodeURIComponent(projectId)}/reviewer-capsule/export`,
      {
        method: "POST",
        body: JSON.stringify({ claimIds, ...context }),
      },
    );
  },

  fetchLineageSuggestions(projectId: string) {
    return request<LineageSuggestion[]>(
      `/api/projects/${encodeURIComponent(projectId)}/lineage-suggestions`,
    );
  },

  fetchDecisionBriefs(projectId: string) {
    return request<DecisionBrief[]>(
      `/api/projects/${encodeURIComponent(projectId)}/decision-briefs`,
    );
  },

  generateDecisionBrief(projectId: string, actor = "local-user") {
    return request<{
      brief: DecisionBrief | null;
      created: boolean;
      noChanges: boolean;
    }>(`/api/projects/${encodeURIComponent(projectId)}/decision-briefs`, {
      method: "POST",
      body: JSON.stringify({ actor }),
    });
  },

  transitionDecisionBriefFinding(
    projectId: string,
    briefId: string,
    findingId: string,
    input: {
      status: DecisionBriefFindingStatus;
      owner?: string | null;
      reason?: string | null;
      actor?: string;
    },
  ) {
    return request<DecisionBriefFinding>(
      `/api/projects/${encodeURIComponent(projectId)}/decision-briefs/${encodeURIComponent(briefId)}/findings/${encodeURIComponent(findingId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    );
  },

  scanLineage(projectId: string) {
    return request<LineageScanResult>(
      `/api/projects/${encodeURIComponent(projectId)}/lineage-suggestions/scan`,
      { method: "POST" },
    );
  },

  reviewLineageSuggestions(
    projectId: string,
    decisions: LineageReviewDecision[],
    actor = "local-user",
  ) {
    return request<{ suggestions: LineageSuggestion[] }>(
      `/api/projects/${encodeURIComponent(projectId)}/lineage-suggestions/review`,
      {
        method: "POST",
        body: JSON.stringify({ actor, decisions }),
      },
    );
  },

  createObject(projectId: string, input: CreateObjectInput) {
    return request<ResearchObject>(`${projectPath(projectId)}/objects`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updateSource(
    projectId: string,
    sourceId: string,
    input: { description: string; payload: Record<string, unknown> },
  ) {
    return request<ResearchObject>(
      `${projectPath(projectId)}/objects/${encodeURIComponent(sourceId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    );
  },

  updateClaimStatus(projectId: string, claimId: string, status: ClaimStatus) {
    return request<ResearchObject>(
      `${projectPath(projectId)}/claims/${encodeURIComponent(claimId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          reviewStatus: status,
        }),
      },
    );
  },

  createRelationship(projectId: string, input: CreateRelationshipInput) {
    return request<Relationship>(`${projectPath(projectId)}/relationships`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  reviewRelationship(
    projectId: string,
    relationshipId: string,
    input: { reviewState: "approved" | "rejected"; confidence: number | null },
  ) {
    return request<Relationship>(
      `${projectPath(projectId)}/relationships/${encodeURIComponent(relationshipId)}/review`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    );
  },

  searchLiterature(projectId: string, query: string, limit = 25) {
    return request<{
      papers: LiteraturePaper[];
      provider: string;
      reranking: CrossEncoderReranking;
    }>(`/api/projects/${encodeURIComponent(projectId)}/literature/search`, {
      method: "POST",
      body: JSON.stringify({ query, limit }),
    });
  },

  importLiteratureMetadata(
    projectId: string,
    input:
      | {
          format: "metadata";
          records: Array<{
            title: string;
            authors?: string | string[];
            abstract?: string;
            citation?: string;
            doi?: string;
            journal?: string;
            url?: string;
            year?: number | string;
          }>;
          readingListIds?: string[];
        }
      | {
          format: "bibtex";
          content: string;
          readingListIds?: string[];
        },
  ) {
    return request<LiteratureImportResult>(
      `/api/projects/${encodeURIComponent(projectId)}/literature/imports`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  fetchReadingLists(projectId: string) {
    return request<LiteratureReadingList[]>(
      `/api/projects/${encodeURIComponent(projectId)}/literature/reading-lists`,
    );
  },

  createReadingList(projectId: string, name: string, description = "") {
    return request<LiteratureReadingList>(
      `/api/projects/${encodeURIComponent(projectId)}/literature/reading-lists`,
      { method: "POST", body: JSON.stringify({ name, description }) },
    );
  },

  addSourceToReadingList(projectId: string, listId: string, sourceId: string) {
    return request<{ added: boolean; readingList: LiteratureReadingList }>(
      `/api/projects/${encodeURIComponent(projectId)}/literature/reading-lists/${encodeURIComponent(listId)}/sources/${encodeURIComponent(sourceId)}`,
      { method: "PUT" },
    );
  },

  removeSourceFromReadingList(
    projectId: string,
    listId: string,
    sourceId: string,
  ) {
    return request<{ removed: boolean }>(
      `/api/projects/${encodeURIComponent(projectId)}/literature/reading-lists/${encodeURIComponent(listId)}/sources/${encodeURIComponent(sourceId)}`,
      { method: "DELETE" },
    );
  },
};
