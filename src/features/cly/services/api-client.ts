import type {
  ExperimentDefinitionContent,
  ExperimentDefinitionVersion,
  ExperimentLineage,
} from "../../research/contracts/experiment-provenance";
import type {
  AgentConfiguration,
  AgentConfigurationEstimate,
  AgentConfigurationInput,
  ClyDevCommandRequest,
  ClyDevCommandResult,
  ClyDevContextManifest,
  ClyDevDevice,
  ClyDevDevicePublicBundle,
  ClyDevEventInput,
  ClyDevHandoffEnvelope,
  ClyDevHandoffInspection,
  ClyDevOutboundContext,
  ClyDevResumeDestination,
  ClyDevSessionEvent,
  ClyDevSessionOverviewPage,
  ClyDevSessionRecord,
  ClyDevSessionSnapshot,
  ClyDevSessionState,
  ClyDevSyncConflict,
  ClyDevSyncStatus,
  ClyDevTask,
  ClyDevWorkbenchContext,
  ClyDevWorkspace,
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

  fetchAgentContext(projectId: string) {
    return request<AgentContextSnapshot>(
      `/api/projects/${encodeURIComponent(projectId)}/agent-context`,
    );
  },

  createAgentContextItem(
    projectId: string,
    input: {
      label: string;
      revision: Omit<
        AgentContextRevision,
        "id" | "projectId" | "itemId" | "revision" | "createdAt"
      >;
      approve: boolean;
      actor: AgentContextActor;
    },
  ) {
    return request<AgentContextItem>(
      `/api/projects/${encodeURIComponent(projectId)}/agent-context/items`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  proposeAgentContextRevision(
    projectId: string,
    itemId: string,
    input: {
      expectedVersion: number;
      revision: Omit<
        AgentContextRevision,
        "id" | "projectId" | "itemId" | "revision" | "createdAt"
      >;
      actor: AgentContextActor;
    },
  ) {
    return request<AgentContextItem>(
      `/api/projects/${encodeURIComponent(projectId)}/agent-context/items/${encodeURIComponent(itemId)}/revisions`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  approveAgentContextRevision(
    projectId: string,
    itemId: string,
    revisionId: string,
    expectedVersion: number,
    actor: AgentContextActor,
  ) {
    return request<AgentContextItem>(
      `/api/projects/${encodeURIComponent(projectId)}/agent-context/items/${encodeURIComponent(itemId)}/revisions/${encodeURIComponent(revisionId)}/approve`,
      {
        method: "POST",
        body: JSON.stringify({ expectedVersion, actor }),
      },
    );
  },

  updateAgentContextLifecycle(
    projectId: string,
    itemId: string,
    action: "pin" | "unpin" | "lock" | "unlock" | "delete" | "restore",
    expectedVersion: number,
    actor: AgentContextActor,
  ) {
    return request<AgentContextItem>(
      `/api/projects/${encodeURIComponent(projectId)}/agent-context/items/${encodeURIComponent(itemId)}/lifecycle`,
      {
        method: "POST",
        body: JSON.stringify({ action, expectedVersion, actor }),
      },
    );
  },

  saveAgentContextPack(
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
  ) {
    return request<AgentContextPack>(
      `/api/projects/${encodeURIComponent(projectId)}/agent-context/packs`,
      { method: "PUT", body: JSON.stringify(input) },
    );
  },

  previewAgentContextManifest(
    projectId: string,
    input: ContextManifestRequest,
  ) {
    return request<ContextManifestPreview>(
      `/api/projects/${encodeURIComponent(projectId)}/agent-context/manifests/preview`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  persistAgentContextManifest(
    projectId: string,
    input: ContextManifestRequest & {
      idempotencyKey: string;
      expectedSha256: string;
      transmissionApprovalId: string | null;
    },
  ) {
    return request<PersistedContextManifest>(
      `/api/projects/${encodeURIComponent(projectId)}/agent-context/manifests`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  createAgentContextTransmissionApproval(
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
  ) {
    return request<ContextTransmissionApproval>(
      `/api/projects/${encodeURIComponent(projectId)}/agent-context/approvals`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  revokeAgentContextTransmissionApproval(
    projectId: string,
    approvalId: string,
    input: { actorId: string; rationale: string },
  ) {
    return request<{ id: string; state: "revoked" }>(
      `/api/projects/${encodeURIComponent(projectId)}/agent-context/approvals/${encodeURIComponent(approvalId)}/revoke`,
      { method: "POST", body: JSON.stringify(input) },
    );
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

  fetchClyDevWorkspaces(projectId: string) {
    return request<ClyDevWorkspace[]>(
      `/api/projects/${encodeURIComponent(projectId)}/cly-dev/workspaces`,
    );
  },

  createClyDevWorkspace(
    projectId: string,
    input: {
      schemaVersion: 1;
      idempotencyKey: string;
      id?: string;
      name: string;
      repository: { id: string; remoteUrl?: string };
      worktree: { id: string; branch: string; baseRef?: string };
      machine: {
        id: string;
        platform: "darwin" | "linux" | "win32";
        architecture?: string;
      };
      localOnly: { repositoryPath: string; worktreePath: string };
    },
  ) {
    return request<ClyDevWorkspace>(
      `/api/projects/${encodeURIComponent(projectId)}/cly-dev/workspaces`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  createClyDevContextManifest(
    projectId: string,
    workspaceId: string,
    input: {
      schemaVersion: 1;
      idempotencyKey: string;
      id?: string;
      localOnly: {
        absolutePaths?: string[];
        environmentVariableNames?: string[];
        notes?: string[];
        uncommittedFilePaths?: string[];
      };
      transferable: {
        summary: string;
        entries: Array<Record<string, string>>;
      };
    },
  ) {
    return request<ClyDevContextManifest>(
      `/api/projects/${encodeURIComponent(projectId)}/cly-dev/workspaces/${encodeURIComponent(workspaceId)}/context-manifests`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  fetchClyDevTasks(projectId: string, workspaceId: string) {
    return request<ClyDevTask[]>(
      `/api/projects/${encodeURIComponent(projectId)}/cly-dev/workspaces/${encodeURIComponent(workspaceId)}/tasks`,
    );
  },

  createClyDevTask(
    projectId: string,
    workspaceId: string,
    input: {
      schemaVersion: 1;
      idempotencyKey: string;
      id?: string;
      title: string;
      objective: string;
      researchObjectIds?: string[];
    },
  ) {
    return request<ClyDevTask>(
      `/api/projects/${encodeURIComponent(projectId)}/cly-dev/workspaces/${encodeURIComponent(workspaceId)}/tasks`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  fetchClyDevSessionOverviews(projectId: string, offset = 0, limit = 50) {
    return request<ClyDevSessionOverviewPage>(
      `/api/projects/${encodeURIComponent(projectId)}/cly-dev/sessions?offset=${offset}&limit=${limit}`,
    );
  },

  createClyDevSession(
    projectId: string,
    taskId: string,
    input: {
      schemaVersion: 1;
      idempotencyKey: string;
      id?: string;
      title: string;
      contextManifestId: string;
      provider: { id: string; model: string };
      commit: { sha: string };
      state?: ClyDevSessionState;
    },
  ) {
    return request<ClyDevSessionRecord>(
      `/api/projects/${encodeURIComponent(projectId)}/cly-dev/tasks/${encodeURIComponent(taskId)}/sessions`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  createClyDevSessionAggregate(
    projectId: string,
    input: {
      workspace: {
        schemaVersion: 1;
        idempotencyKey: string;
        id?: string;
        name: string;
        repository: { id: string; remoteUrl?: string };
        worktree: { id: string; branch: string; baseRef?: string };
        machine: {
          id: string;
          platform: "darwin" | "linux" | "win32";
          architecture?: string;
        };
        localOnly: { repositoryPath: string; worktreePath: string };
      };
      contextManifest: {
        schemaVersion: 1;
        idempotencyKey: string;
        id?: string;
        localOnly: {
          absolutePaths?: string[];
          environmentVariableNames?: string[];
          notes?: string[];
          uncommittedFilePaths?: string[];
        };
        transferable: {
          summary: string;
          entries: Array<Record<string, string>>;
        };
      };
      task: {
        schemaVersion: 1;
        idempotencyKey: string;
        id?: string;
        title: string;
        objective: string;
        researchObjectIds?: string[];
      };
      session: {
        schemaVersion: 1;
        idempotencyKey: string;
        id?: string;
        title: string;
        provider: { id: string; model: string };
        commit: { sha: string };
        state?: ClyDevSessionState;
      };
    },
  ) {
    return request<{
      workspace: ClyDevWorkspace;
      contextManifest: ClyDevContextManifest;
      task: ClyDevTask;
      session: ClyDevSessionRecord;
    }>(
      `/api/projects/${encodeURIComponent(projectId)}/cly-dev/session-aggregates`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  fetchClyDevSessionSnapshot(projectId: string, sessionId: string) {
    return request<ClyDevSessionSnapshot>(
      `/api/projects/${encodeURIComponent(projectId)}/cly-dev/sessions/${encodeURIComponent(sessionId)}`,
    );
  },

  fetchClyDevWorkbench(projectId: string, sessionId: string) {
    return request<ClyDevWorkbenchContext>(
      `/api/projects/${encodeURIComponent(projectId)}/cly-dev/sessions/${encodeURIComponent(sessionId)}/workbench`,
    );
  },

  requestClyDevCommand(
    projectId: string,
    sessionId: string,
    input: { requestId?: string; command: string },
  ) {
    return request<ClyDevCommandRequest>(
      `/api/projects/${encodeURIComponent(projectId)}/cly-dev/sessions/${encodeURIComponent(sessionId)}/workbench/commands/request`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  executeClyDevCommand(
    projectId: string,
    sessionId: string,
    input: { requestId: string; command: string; approvalId?: string },
  ) {
    return request<ClyDevCommandResult>(
      `/api/projects/${encodeURIComponent(projectId)}/cly-dev/sessions/${encodeURIComponent(sessionId)}/workbench/commands/execute`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  cancelClyDevCommand(projectId: string, sessionId: string, requestId: string) {
    return request<{ canceled: boolean }>(
      `/api/projects/${encodeURIComponent(projectId)}/cly-dev/sessions/${encodeURIComponent(sessionId)}/workbench/commands/cancel`,
      { method: "POST", body: JSON.stringify({ requestId }) },
    );
  },

  fetchClyDevOutboundContext(projectId: string, sessionId: string) {
    return request<ClyDevOutboundContext>(
      `/api/projects/${encodeURIComponent(projectId)}/cly-dev/sessions/${encodeURIComponent(sessionId)}/context-envelope`,
    );
  },

  fetchClyDevSessionEvents(
    projectId: string,
    sessionId: string,
    afterSequence = 0,
    limit = 100,
  ) {
    return request<ClyDevSessionEvent[]>(
      `/api/projects/${encodeURIComponent(projectId)}/cly-dev/sessions/${encodeURIComponent(sessionId)}/events?afterSequence=${afterSequence}&limit=${limit}`,
    );
  },

  appendClyDevSessionEvent(
    projectId: string,
    sessionId: string,
    event: ClyDevEventInput,
  ) {
    return request<ClyDevSessionEvent>(
      `/api/projects/${encodeURIComponent(projectId)}/cly-dev/sessions/${encodeURIComponent(sessionId)}/events`,
      { method: "POST", body: JSON.stringify(event) },
    );
  },

  fetchClyDevDevices() {
    return request<ClyDevDevice[]>("/api/cly-dev/devices");
  },

  ensureLocalClyDevDevice(name: string) {
    return request<ClyDevDevice>("/api/cly-dev/devices/local", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },

  registerClyDevDevice(input: {
    id: string;
    name: string;
    publicBundle: ClyDevDevicePublicBundle;
  }) {
    return request<ClyDevDevice>("/api/cly-dev/devices", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  verifyClyDevDevice(deviceId: string, fingerprint: string) {
    return request<ClyDevDevice>(
      `/api/cly-dev/devices/${encodeURIComponent(deviceId)}/verify`,
      { method: "POST", body: JSON.stringify({ fingerprint }) },
    );
  },

  rotateClyDevDeviceKeys() {
    return request<ClyDevDevice>("/api/cly-dev/devices/local/rotate", {
      method: "POST",
    });
  },

  verifyClyDevPeerKeyRotation(
    deviceId: string,
    publicBundle: ClyDevDevicePublicBundle,
    fingerprint: string,
  ) {
    return request<ClyDevDevice>(
      `/api/cly-dev/devices/${encodeURIComponent(deviceId)}/keys/verify`,
      {
        method: "POST",
        body: JSON.stringify({ publicBundle, fingerprint }),
      },
    );
  },

  revokeClyDevDevice(deviceId: string, reason: string) {
    return request<ClyDevDevice>(
      `/api/cly-dev/devices/${encodeURIComponent(deviceId)}/revoke`,
      { method: "POST", body: JSON.stringify({ reason }) },
    );
  },

  fetchClyDevSyncStatus(projectId: string) {
    return request<ClyDevSyncStatus>(
      `/api/projects/${encodeURIComponent(projectId)}/cly-dev/sync/status`,
    );
  },

  stageClyDevSync(projectId: string) {
    return request<{ queued: number; policyBlocked: number }>(
      `/api/projects/${encodeURIComponent(projectId)}/cly-dev/sync/stage`,
      { method: "POST", body: "{}" },
    );
  },

  resolveClyDevSyncConflict(
    projectId: string,
    conflictId: string,
    resolution: "keep_local" | "use_incoming",
  ) {
    return request<ClyDevSyncConflict>(
      `/api/projects/${encodeURIComponent(projectId)}/cly-dev/sync/conflicts/${encodeURIComponent(conflictId)}`,
      { method: "POST", body: JSON.stringify({ resolution }) },
    );
  },

  pairClyDevDevice(input: { deviceId: string; pairingCode: string }) {
    return request<{ deviceId: string; state: "paired" }>(
      "/api/cly-dev/devices/pair",
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  publishClyDevHandoff(
    projectId: string,
    sessionId: string,
    input: { deviceId: string; expectedRevision: number },
  ) {
    return request<ClyDevHandoffEnvelope>(
      `/api/projects/${encodeURIComponent(projectId)}/cly-dev/sessions/${encodeURIComponent(sessionId)}/handoffs`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  inspectClyDevHandoff(
    handoffId: string,
    input: {
      deviceId: string;
      destination: ClyDevResumeDestination;
      offline?: boolean;
    },
  ) {
    return request<ClyDevHandoffInspection>(
      `/api/cly-dev/handoffs/${encodeURIComponent(handoffId)}/inspect`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  resumeClyDevHandoff(
    handoffId: string,
    input: {
      deviceId: string;
      destination: ClyDevResumeDestination;
      offline?: boolean;
    },
  ) {
    return request<ClyDevHandoffInspection>(
      `/api/cly-dev/handoffs/${encodeURIComponent(handoffId)}/resume`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },
};
