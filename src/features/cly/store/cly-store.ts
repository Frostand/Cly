import { create } from "zustand";
import type { ExperimentLineage } from "../../research/contracts/experiment-provenance";
import { productionAgentSessionServices } from "../agent-sessions/production-services";
import type {
  AgentConfiguration,
  AgentIdentity,
  AgentMessage,
  AgentSession,
  AgentSessionOverviewFilter,
  AgentSessionOverviewSort,
  AgentSessionsMode,
  ClyDevSessionOverview,
  NewAgentSessionInput,
  WorkbenchTab,
  WorkbenchTabType,
} from "../agent-sessions/types";
import type {
  AgentContextSnapshot,
  AgentContextItem as DurableContextItem,
} from "../domain/agent-context";
import { findDuplicateSource } from "../domain/literature-search";
import type {
  DatasetObligation,
  DatasetObligationInput,
  InheritedRestriction,
  ObligationAlert,
  ObligationEvaluation,
  ObligationOperation,
} from "../domain/obligations";
import type {
  Relationship,
  ResearchObject,
  SourcePayload,
} from "../domain/research-bridge";
import type {
  AgentPreset,
  AnalysisDeviation,
  AuditFinding,
  Claim,
  ClaimCostSummary,
  ClaimStatus,
  ClyRepositoryData,
  ContextItem,
  CostEntry,
  CostLedger,
  DecisionBrief,
  DecisionBriefFinding,
  DecisionBriefFindingStatus,
  DevSection,
  EntityType,
  EvidencePassage,
  Experiment,
  FixtureMode,
  GraphEdge,
  Integration,
  LineageReviewDecision,
  LineageScanMeasurement,
  LineageSuggestion,
  NextStep,
  NotebookArtifact,
  PreregistrationContent,
  PreregistrationSnapshot,
  ProductArea,
  ReproducibilityAudit,
  ResearchDecision,
  ScreenId,
  Source,
} from "../domain/types";
import {
  type AwsCurImportResult,
  apiClient,
  type ManualCostEntryInput,
  nextStepFromPlannerRecommendation,
  type PlannerRecommendation,
  type ResearchData,
} from "../services/api-client";
import { CapabilityUnavailableError } from "../services/capabilities";
import {
  createProductionRepository,
  emptyCostLedger,
} from "./production-repository";

export interface ToastMessage {
  id: string;
  title: string;
  detail?: string;
}

interface ClyState {
  data: ClyRepositoryData;
  fixtureMode: FixtureMode;
  activeProjectId: string;
  activeScreen: ScreenId;
  activeProduct: ProductArea;
  lastResearchScreen: ScreenId;
  lastResearchSelectedId: string | null;
  activeDevSection: DevSection;
  selectedId: string | null;
  sidebarCollapsed: boolean;
  inspectorOpen: boolean;
  activityOpen: boolean;
  commandPaletteOpen: boolean;
  projectSwitcherOpen: boolean;
  fixtureSwitcherOpen: boolean;
  globalSearch: string;
  toasts: ToastMessage[];
  costLedger: CostLedger;
  claimCosts: Record<string, ClaimCostSummary>;
  costsLoading: boolean;
  costsError: string | null;
  selectedCostEntryId: string | null;
  lineageSuggestions: LineageSuggestion[];
  lineageMeasurement: LineageScanMeasurement | null;
  decisionBriefs: DecisionBrief[];
  decisionBriefsLoading: boolean;
  decisionBriefsError: string | null;
  preregistrations: PreregistrationSnapshot[];
  preregistrationsLoading: boolean;
  preregistrationsError: string | null;
  datasetObligations: DatasetObligation[];
  obligationAlerts: ObligationAlert[];
  inheritedRestrictions: Record<string, InheritedRestriction[]>;
  obligationsLoading: boolean;
  obligationsError: string | null;
  clyDevSessions: ClyDevSessionOverview[];
  clyDevSessionsLoading: boolean;
  clyDevSessionsError: string | null;
  agentContext: AgentContextSnapshot;
  agentContextProjectId: string | null;
  agentContextLoading: boolean;
  agentContextError: string | null;
  agentSessionsMode: AgentSessionsMode;
  selectedAgentSessionId: string | null;
  selectedOverviewSessionId: string | null;
  agentSessionFilter: AgentSessionOverviewFilter;
  agentSessionSort: AgentSessionOverviewSort;
  agentSessionSearch: string;
  newAgentSessionOpen: boolean;
  agentConfigurationId: string | null;
  agentDestructiveConfirmation: {
    sessionId: string;
    action: "stop" | "archive";
  } | null;
  agentSessionLayouts: Record<
    string,
    Pick<
      AgentSession,
      | "workbenchTabs"
      | "activeWorkbenchTabId"
      | "workbenchCollapsed"
      | "workbenchMaximized"
      | "workbenchWidth"
      | "draft"
      | "workspaceMode"
    >
  >;
  setScreen: (screen: ScreenId) => void;
  setProductArea: (area: ProductArea) => void;
  setDevSection: (section: DevSection) => void;
  setSelected: (id: string | null) => void;
  setActiveProject: (id: string) => void;
  setFixtureMode: (mode: FixtureMode) => void;
  toggleSidebar: () => void;
  toggleInspector: () => void;
  toggleActivity: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setProjectSwitcherOpen: (open: boolean) => void;
  setFixtureSwitcherOpen: (open: boolean) => void;
  setGlobalSearch: (value: string) => void;
  notify: (title: string, detail?: string) => void;
  dismissToast: (id: string) => void;
  loadFromApi: (projectId?: string) => Promise<boolean>;
  setAgentContextSnapshot: (
    projectId: string,
    snapshot: AgentContextSnapshot,
  ) => void;
  loadClyDevSessions: (projectId?: string) => Promise<boolean>;
  loadObligations: (projectId?: string) => Promise<boolean>;
  saveDatasetObligation: (
    datasetObjectId: string,
    input: DatasetObligationInput,
  ) => Promise<DatasetObligation | null>;
  evaluateObligations: (
    operation: ObligationOperation,
  ) => Promise<ObligationEvaluation>;
  approveObligationOperation: (
    operation: ObligationOperation,
    input: { actorId: string; rationale: string },
  ) => Promise<ObligationEvaluation | null>;
  transitionObligationAlert: (
    alertId: string,
    input: {
      state: "acknowledged" | "resolved";
      actorId: string;
      note: string;
    },
  ) => Promise<ObligationAlert | null>;
  loadCosts: (projectId?: string) => Promise<boolean>;
  createCostEntry: (input: ManualCostEntryInput) => Promise<CostEntry | null>;
  importAwsCur: (
    csv: string,
    fileName: string,
  ) => Promise<AwsCurImportResult | null>;
  setSelectedCostEntry: (id: string | null) => void;
  scanLineage: () => Promise<boolean>;
  reviewLineageSuggestions: (
    decisions: LineageReviewDecision[],
  ) => Promise<boolean>;
  loadDecisionBriefs: () => Promise<boolean>;
  generateDecisionBrief: () => Promise<{
    brief: DecisionBrief | null;
    created: boolean;
    noChanges: boolean;
  } | null>;
  transitionDecisionBriefFinding: (
    briefId: string,
    findingId: string,
    input: {
      status: DecisionBriefFindingStatus;
      owner?: string | null;
      reason?: string | null;
    },
  ) => Promise<DecisionBriefFinding | null>;
  createPreregistration: (
    experimentId: string,
    content: PreregistrationContent,
    amendsSnapshotId?: string | null,
  ) => Promise<PreregistrationSnapshot | null>;
  markPreregistrationEvaluated: (
    snapshotId: string,
  ) => Promise<PreregistrationSnapshot | null>;
  declareAnalysisDeviation: (
    snapshotId: string,
    input: {
      fieldPath: AnalysisDeviation["fieldPath"];
      afterValue: string | string[];
      rationale: string;
    },
  ) => Promise<AnalysisDeviation | null>;
  acknowledgeAnalysisDeviation: (
    deviationId: string,
  ) => Promise<AnalysisDeviation | null>;
  updateContextItem: (id: string, patch: Partial<ContextItem>) => void;
  updateClaim: (id: string, patch: Partial<Claim>) => void;
  addClaim: (claim: Claim) => void;
  addSource: (source: Source) => Promise<Source | null>;
  updateSource: (id: string, patch: Partial<Source>) => void;
  addEvidencePassage: (evidence: EvidencePassage) => void;
  updateEvidencePassage: (id: string, patch: Partial<EvidencePassage>) => void;
  addExperiment: (experiment: Experiment) => void;
  updateExperiment: (id: string, patch: Partial<Experiment>) => void;
  addNotebook: (notebook: NotebookArtifact) => void;
  addGraphEdge: (edge: GraphEdge) => void;
  updateGraphEdge: (id: string, patch: Partial<GraphEdge>) => void;
  updateFinding: (
    id: string,
    patch: {
      status?: "Open" | "Assigned" | "Resolved" | "Ignored";
      assignee?: string;
    },
  ) => void;
  replaceReproducibilityAudit: (
    audit: ReproducibilityAudit,
    findings: AuditFinding[],
  ) => void;
  updateIntegration: (id: string, patch: Partial<Integration>) => void;
  updateNextStep: (
    id: string,
    status: "Accepted" | "Deferred" | "Dismissed" | "In progress",
  ) => void;
  replaceNextSteps: (steps: NextStep[]) => void;
  addDecision: (decision: ResearchDecision) => void;
  updateDecision: (id: string, patch: Partial<ResearchDecision>) => void;
  addAgentPreset: (preset: AgentPreset) => void;
  setAgentConfigurations: (configurations: AgentConfiguration[]) => void;
  setAgentSessionsMode: (
    mode: AgentSessionsMode,
    sessionId?: string | null,
  ) => void;
  openAgentSession: (sessionId: string) => void;
  setSelectedOverviewSession: (sessionId: string | null) => void;
  setAgentSessionFilter: (filter: AgentSessionOverviewFilter) => void;
  setAgentSessionSort: (sort: AgentSessionOverviewSort) => void;
  setAgentSessionSearch: (search: string) => void;
  setNewAgentSessionOpen: (open: boolean) => void;
  setAgentConfigurationId: (id: string | null) => void;
  setAgentDestructiveConfirmation: (
    confirmation: {
      sessionId: string;
      action: "stop" | "archive";
    } | null,
  ) => void;
  createAgentSession: (input: NewAgentSessionInput, open: boolean) => string;
  updateAgentSession: (
    id: string,
    updater: (session: AgentSession) => AgentSession,
  ) => void;
  setAgentSessionDraft: (sessionId: string, draft: string) => void;
  appendAgentMessage: (sessionId: string, message: AgentMessage) => void;
  openWorkbenchTab: (sessionId: string, type: WorkbenchTabType) => void;
  closeWorkbenchTab: (sessionId: string, tabId: string) => void;
  activateWorkbenchTab: (sessionId: string, tabId: string) => void;
  reorderWorkbenchTab: (
    sessionId: string,
    fromIndex: number,
    toIndex: number,
  ) => void;
  duplicateWorkbenchTab: (sessionId: string, tabId: string) => void;
  toggleWorkbenchTabPin: (sessionId: string, tabId: string) => void;
  toggleWorkbench: (sessionId: string) => void;
  toggleWorkbenchMaximized: (sessionId: string) => void;
  setWorkbenchWidth: (sessionId: string, width: number) => void;
  updateDelegatedAgent: (
    sessionId: string,
    agentId: string,
    patch: Partial<AgentIdentity>,
  ) => void;
  resolveAgentApproval: (
    sessionId: string,
    approvalId: string,
    state: "approved" | "rejected",
  ) => void;
  pauseAgentSession: (sessionId: string) => void;
  stopAgentSession: (sessionId: string) => void;
  archiveAgentSession: (sessionId: string) => void;
}

let toastSequence = 0;
export const resolveInitialFixtureMode = ({
  demoFlag,
  development,
}: {
  demoFlag?: string;
  development: boolean;
}): FixtureMode => (development && demoFlag === "1" ? "active" : "empty");
const explicitDemoMode =
  resolveInitialFixtureMode({
    demoFlag: import.meta.env.VITE_CLY_DEMO_MODE,
    development: import.meta.env.DEV,
  }) === "active";
const testRuntime = import.meta.env.MODE === "test";
const demoFixtureRuntime = explicitDemoMode || testRuntime;
const uiStorageKey = explicitDemoMode ? "cly-demo-ui" : "cly-prototype-ui";
const initialFixtureMode = resolveInitialFixtureMode({
  demoFlag: import.meta.env.VITE_CLY_DEMO_MODE,
  development: import.meta.env.DEV,
});
let createDemoAgentSession:
  | ((input: NewAgentSessionInput) => AgentSession)
  | null = null;
let createDemoWorkbenchTabs: (() => WorkbenchTab[]) | null = null;
if (__CLY_INCLUDE_DEMOS__ && testRuntime) {
  const agentFixtureModule = await import("../agent-sessions/fixtures");
  createDemoAgentSession = agentFixtureModule.createNewAgentSession;
  createDemoWorkbenchTabs = agentFixtureModule.workbenchFixtureTabs;
}

const persistUi = (partial: Record<string, unknown>) => {
  try {
    const current = JSON.parse(
      localStorage.getItem(uiStorageKey) ?? "{}",
    ) as Record<string, unknown>;
    localStorage.setItem(
      uiStorageKey,
      JSON.stringify({ ...current, ...partial }),
    );
  } catch {
    // Browser storage is an optional convenience in this fixture phase.
  }
};

const loadUi = () => {
  try {
    return JSON.parse(localStorage.getItem(uiStorageKey) ?? "{}") as Partial<
      Pick<
        ClyState,
        | "activeScreen"
        | "activeProduct"
        | "lastResearchScreen"
        | "lastResearchSelectedId"
        | "activeDevSection"
        | "sidebarCollapsed"
        | "inspectorOpen"
        | "activeProjectId"
        | "agentSessionsMode"
        | "selectedAgentSessionId"
        | "selectedOverviewSessionId"
        | "agentSessionFilter"
        | "agentSessionSort"
        | "agentSessionLayouts"
      >
    >;
  } catch {
    return {};
  }
};

const saved = typeof localStorage === "undefined" ? {} : loadUi();

const hydrateAgentSessionLayouts = (
  data: ClyRepositoryData,
  layouts: ClyState["agentSessionLayouts"] | undefined,
): ClyRepositoryData => ({
  ...data,
  agentSessions: data.agentSessions.map((session) => {
    const layout = layouts?.[session.id];
    return layout ? { ...session, ...layout } : session;
  }),
});

const snapshotAgentSessionLayouts = (sessions: AgentSession[]) =>
  Object.fromEntries(
    sessions.map((session) => [
      session.id,
      {
        workbenchTabs: session.workbenchTabs,
        activeWorkbenchTabId: session.activeWorkbenchTabId,
        workbenchCollapsed: session.workbenchCollapsed,
        workbenchMaximized: session.workbenchMaximized,
        workbenchWidth: session.workbenchWidth,
        draft: session.draft,
        workspaceMode: session.workspaceMode,
      },
    ]),
  ) as ClyState["agentSessionLayouts"];

const initialData = hydrateAgentSessionLayouts(
  createProductionRepository(),
  saved.agentSessionLayouts,
);
const initialCosts = {
  ledger: emptyCostLedger(),
  claimCosts: {},
};
const savedAgentSessionIsValid = saved.selectedAgentSessionId
  ? initialData.agentSessions.some(
      (session) => session.id === saved.selectedAgentSessionId,
    )
  : true;

const sourceFromResearchObject = (object: ResearchObject): Source => {
  const payload = object.payload as SourcePayload;
  const sourceType = {
    dataset: "Dataset",
    documentation: "Documentation",
    note: "Note",
    paper: "Paper",
    pdf: "PDF",
    webpage: "Webpage",
    book: "Book",
    repository: "Repository",
    "hugging-face": "Hugging Face",
    import: "Import",
  } as const;
  return {
    id: object.id,
    title: object.title,
    authors:
      payload.authors?.join(", ") || payload.citation || "Unknown authors",
    year: payload.year ?? new Date(object.createdAt).getFullYear(),
    type: sourceType[payload.sourceType ?? "paper"],
    status: payload.status === "resolved" ? "Queued" : "Needs metadata",
    relevance: "Medium",
    confidence: 0,
    summary:
      payload.groundedSummary?.text ||
      object.description ||
      payload.abstract ||
      "Awaiting extraction.",
    url: payload.url,
    doi: payload.doi,
    providerId: payload.providerId,
    provider: payload.provider,
    methods: payload.methods ?? [],
    findings: payload.findings ?? [],
    limitations: payload.limitations ?? [],
    tags: payload.tags ?? [],
    folder: payload.folder,
    extractedFields: payload.extractedFields,
    contradictoryEvidence: payload.contradictoryEvidence,
    customReviewFields: payload.customReviewFields,
    linkedClaimIds: [],
    linkedExperimentIds: [],
    inNotebookBundle: false,
    groundedSummary: payload.groundedSummary,
    path: `sources/${object.id}`,
    updatedAt: object.updatedAt,
    provenance:
      payload.provider && payload.query && payload.rankingExplanation
        ? {
            provider: payload.provider,
            query: payload.query,
            score: payload.rankingScore ?? 0,
            method: payload.rankingMethod ?? "unknown",
            model: payload.rankingModel,
            components: payload.rankingComponents,
            explanation: payload.rankingExplanation,
            retrievedAt: payload.retrievedAt ?? object.createdAt,
          }
        : undefined,
  };
};

const claimStatusFromResearchObject = (object: ResearchObject): ClaimStatus => {
  if (object.payload.kind !== "claim") return "Unsupported";
  if (object.payload.reviewStatus) return object.payload.reviewStatus;
  const statusByPayload = {
    draft: "Unsupported",
    supported: "Strong",
    contradicted: "Invalidated",
    "needs-evidence": "Needs review",
  } satisfies Record<
    "draft" | "supported" | "contradicted" | "needs-evidence",
    ClaimStatus
  >;
  return statusByPayload[object.payload.status];
};

const graphRelationFromRelationship: Record<
  Relationship["type"],
  GraphEdge["relation"]
> = {
  supports: "supports",
  contradicts: "contradicts",
  contains: "contains",
  "generated-by": "generated by",
  uses: "uses",
  tests: "tests",
  implements: "implements",
};

const entityTypeFromResearchObject: Record<ResearchObject["type"], EntityType> =
  {
    artifact: "report",
    source: "source",
    evidence: "source",
    claim: "claim",
    experiment: "experiment",
    run: "run",
  };

/**
 * Replaces project-scoped fixture records with the research records SQLite
 * owns. Only the project catalog survives hydration.
 */
const mapResearchData = (
  baseData: ClyRepositoryData,
  researchData: ResearchData,
  experimentLineages: ExperimentLineage[] = [],
  plannerRecommendations?: PlannerRecommendation[],
): ClyRepositoryData => {
  const objectsById = new Map(
    researchData.objects.map((object) => [object.id, object]),
  );
  const relationships = researchData.relationships;
  const evidenceObjects = researchData.objects.filter(
    (object) => object.type === "evidence",
  );
  const claimSourceIds = (
    claimId: string,
    relationshipType: "supports" | "contradicts",
  ) =>
    relationships
      .filter(
        (relationship) =>
          relationship.toObjectId === claimId &&
          relationship.type === relationshipType,
      )
      .flatMap((relationship) => {
        const from = objectsById.get(relationship.fromObjectId);
        if (from?.type === "source") return [from.id];
        if (from?.type === "evidence") return [from.payload.sourceId];
        return [];
      });
  const lineageByExperimentId = new Map(
    experimentLineages.map((lineage) => [lineage.experiment.id, lineage]),
  );
  const detailedRunsById = new Map(
    experimentLineages
      .flatMap((lineage) => lineage.runs)
      .map((run) => [run.id, run]),
  );

  const sources = researchData.objects
    .filter((object) => object.type === "source")
    .map((object) => {
      const source = sourceFromResearchObject(object);
      const evidenceIds = relationships
        .filter(
          (relationship) =>
            relationship.fromObjectId === object.id &&
            relationship.type === "contains",
        )
        .map((relationship) => relationship.toObjectId);
      return {
        ...source,
        linkedClaimIds: Array.from(
          new Set(
            relationships
              .filter(
                (relationship) =>
                  (relationship.fromObjectId === object.id ||
                    evidenceIds.includes(relationship.fromObjectId)) &&
                  objectsById.get(relationship.toObjectId)?.type === "claim",
              )
              .map((relationship) => relationship.toObjectId),
          ),
        ),
      };
    });
  const claims = researchData.objects
    .filter((object) => object.type === "claim")
    .map((object) => ({
      id: object.id,
      text: object.title,
      type: "Primary" as const,
      status: claimStatusFromResearchObject(object),
      confidence: 0,
      supportingSourceIds: Array.from(
        new Set(claimSourceIds(object.id, "supports")),
      ),
      contradictingSourceIds: Array.from(
        new Set(claimSourceIds(object.id, "contradicts")),
      ),
      experimentIds: relationships
        .filter(
          (relationship) =>
            relationship.toObjectId === object.id &&
            relationship.type === "tests" &&
            objectsById.get(relationship.fromObjectId)?.type === "experiment",
        )
        .map((relationship) => relationship.fromObjectId),
      notebookIds: [],
      artifactIds: relationships
        .filter(
          (relationship) =>
            relationship.toObjectId === object.id &&
            relationship.type === "supports" &&
            objectsById.get(relationship.fromObjectId)?.type === "artifact",
        )
        .map((relationship) => relationship.fromObjectId),
      assumptions: [],
      weaknesses: [],
      reviewerRisks: [],
      nextExperiment: "Link evidence or design a test.",
      updatedAt: object.updatedAt,
    }));
  const runs = researchData.objects
    .filter((object) => object.type === "run")
    .map((object) => {
      const experimentId = relationships.find(
        (relationship) =>
          relationship.fromObjectId === object.id &&
          relationship.type === "generated-by" &&
          objectsById.get(relationship.toObjectId)?.type === "experiment",
      )?.toObjectId;
      const status = {
        completed: "Complete",
        failed: "Failed",
        planned: "Queued",
        running: "Running",
      }[object.payload.status] as "Complete" | "Failed" | "Queued" | "Running";
      const detailed = detailedRunsById.get(object.id);
      const durationMs = detailed?.finishedAt
        ? Date.parse(detailed.finishedAt) - Date.parse(detailed.startedAt)
        : null;
      const config = detailed
        ? Object.fromEntries(
            Object.entries(detailed.configuration).filter(
              (entry): entry is [string, string | number | boolean] =>
                ["string", "number", "boolean"].includes(typeof entry[1]),
            ),
          )
        : {};
      return {
        id: object.id,
        experimentId: experimentId ?? "",
        name: object.title,
        status:
          detailed?.status === "cancelled" ? ("Cancelled" as const) : status,
        startedAt: detailed?.startedAt ?? object.createdAt,
        duration:
          durationMs === null
            ? "In progress"
            : `${Math.max(0, Math.round(durationMs / 1000))}s`,
        codeVersion:
          detailed?.commitSha ?? object.payload.commitSha ?? "Not recorded",
        environment: detailed ? "Inputs captured" : "Not captured",
        metrics: detailed
          ? Object.fromEntries(
              detailed.metrics.map((metric) => [metric.name, metric.value]),
            )
          : {},
        config,
        reproducibility:
          detailed?.status === "failed" || detailed?.status === "cancelled"
            ? ("Blocked" as const)
            : detailed?.status === "completed" &&
                detailed.artifacts.length > 0 &&
                detailed.artifacts.every(
                  (artifact) => artifact.state === "current",
                )
              ? ("Verified" as const)
              : ("Partial" as const),
        canonical:
          detailed?.definitionVersionId ===
          lineageByExperimentId.get(experimentId ?? "")?.definitions.at(-1)?.id,
      };
    });
  const experiments = researchData.objects
    .filter((object) => object.type === "experiment")
    .map((object) => {
      const lineage = lineageByExperimentId.get(object.id);
      const latestDefinition = lineage?.definitions.at(-1);
      const experimentRuns = runs.filter(
        (run) => run.experimentId === object.id,
      );
      const configuredType = latestDefinition?.configuration.experimentType;
      const validTypes = new Set([
        "Training run",
        "Simulation",
        "Statistical analysis",
        "Parameter sweep",
        "Benchmark",
        "Reproduction attempt",
        "Notebook analysis",
        "Data pipeline",
        "Ablation",
        "Custom",
      ]);
      return {
        id: object.id,
        name: object.title,
        goal:
          latestDefinition?.objective ||
          object.description ||
          "Define the research goal.",
        hypothesis:
          latestDefinition?.hypothesis ??
          (object.payload.kind === "experiment"
            ? (object.payload.hypothesis ?? "To be specified")
            : "To be specified"),
        type:
          typeof configuredType === "string" && validTypes.has(configuredType)
            ? (configuredType as Experiment["type"])
            : ("Custom" as const),
        status: experimentRuns.some((run) => run.status === "Running")
          ? ("Running" as const)
          : experimentRuns.some((run) => run.status === "Failed")
            ? ("Failed" as const)
            : experimentRuns.length > 0 &&
                experimentRuns.every((run) => run.status === "Complete")
              ? ("Complete" as const)
              : ("Planned" as const),
        command: "Not configured",
        environment: lineage ? "Inputs captured per run" : "Not captured",
        claimIds: relationships
          .filter(
            (relationship) =>
              relationship.fromObjectId === object.id &&
              relationship.type === "tests" &&
              objectsById.get(relationship.toObjectId)?.type === "claim",
          )
          .map((relationship) => relationship.toObjectId),
        dataset:
          latestDefinition?.datasets
            .map((dataset) => `${dataset.id}@${dataset.version}`)
            .join(", ") || "Not linked",
        limitations: [],
        nextStep: experimentRuns.length ? "Review run lineage" : "Record a run",
        runIds: experimentRuns.map((run) => run.id),
        updatedAt: latestDefinition?.createdAt ?? object.updatedAt,
      };
    });
  const artifacts = experimentLineages.flatMap((lineage) =>
    lineage.runs.flatMap((run) =>
      run.artifacts.map((artifact) => ({
        id: artifact.id,
        name: artifact.title,
        kind:
          artifact.kind === "figure"
            ? ("Figure" as const)
            : artifact.kind === "table"
              ? ("Table" as const)
              : ("Output" as const),
        path: artifact.path,
        preview:
          artifact.description ||
          `${artifact.mediaType} generated by ${artifact.generatorPath ?? "an unrecorded generator"}.`,
        sourceData:
          run.datasets
            .map((dataset) => `${dataset.id}@${dataset.version}`)
            .join(", ") || "No dataset reference",
        generator: artifact.generatorPath ?? "Not recorded",
        experimentId: lineage.experiment.id,
        runId: run.id,
        commit: run.commitSha,
        claimIds: [],
        regeneration:
          artifact.state === "stale"
            ? ("Stale" as const)
            : artifact.generatorPath
              ? ("Ready" as const)
              : ("Manual" as const),
        staleReasons: artifact.staleReasons.map((reason) => {
          if (reason.kind === "experiment-definition") {
            return "The experiment definition changed after this output was generated.";
          }
          if (reason.kind === "git-commit") {
            return "The current Git commit differs from the captured run commit.";
          }
          if (reason.kind === "configuration") {
            return "The current run configuration differs from the captured configuration.";
          }
          if (reason.kind === "datasets") {
            return "One or more dataset versions differ from the captured inputs.";
          }
          return "Generating code differs from the captured code snapshot.";
        }),
        hash: artifact.contentHash,
        updatedAt: artifact.checkedAt,
      })),
    ),
  );

  return {
    ...baseData,
    runs,
    notebooks: [],
    code: [],
    artifacts,
    findings: [],
    audits: [],
    integrations: [],
    nextSteps:
      plannerRecommendations?.map(nextStepFromPlannerRecommendation) ?? [],
    decisions: [],
    contextItems: baseData.contextItems,
    contextPacks: baseData.contextPacks,
    agentPresets: [],
    agentSessions: [],
    reports: [],
    activity: [],
    sources,
    evidencePassages: evidenceObjects.map((object) => ({
      id: object.id,
      sourceId: object.payload.sourceId,
      quote: object.payload.quote,
      locator: object.payload.locator,
      contentHash: object.payload.contentHash,
      verificationState: object.payload.verificationState,
      origin: object.origin,
      reviewedBy: object.reviewedBy,
      reviewedAt: object.reviewedAt,
      version: object.version,
      createdAt: object.createdAt,
      updatedAt: object.updatedAt,
    })),
    claims,
    experiments,
    graphNodes: researchData.objects.map((object, index) => ({
      id: object.id,
      type: entityTypeFromResearchObject[object.type],
      label: object.title,
      status:
        object.reviewState === "approved"
          ? "Confirmed"
          : object.reviewState === "rejected"
            ? "Broken"
            : "Suggested",
      x: 180 + (index % 4) * 220,
      y: 160 + Math.floor(index / 4) * 150,
    })),
    graphEdges: relationships.map((relationship) => ({
      id: relationship.id,
      source: relationship.fromObjectId,
      target: relationship.toObjectId,
      relation: graphRelationFromRelationship[relationship.type],
      confidence: relationship.confidence,
      approved: relationship.reviewState === "approved",
      origin: relationship.origin,
      reviewState: relationship.reviewState,
      reviewedBy: relationship.reviewedBy,
      reviewedAt: relationship.reviewedAt,
      version: relationship.version,
      createdAt: relationship.createdAt,
    })),
  };
};

const clearPersistedResearchData = (
  data: ClyRepositoryData,
): ClyRepositoryData => ({
  ...data,
  sources: [],
  evidencePassages: [],
  claims: [],
  experiments: [],
  runs: [],
  notebooks: [],
  code: [],
  artifacts: [],
  findings: [],
  audits: [],
  integrations: [],
  nextSteps: [],
  decisions: [],
  contextItems: [],
  contextPacks: [],
  agentPresets: [],
  agentConfigurations: [],
  agentSessions: [],
  graphNodes: [],
  graphEdges: [],
  reports: [],
  activity: [],
});

const emptyAgentContext = (): AgentContextSnapshot => ({
  items: [],
  packs: [],
  manifests: [],
});

const mapAgentContextItem = (
  item: DurableContextItem,
  packs: AgentContextSnapshot["packs"],
): ContextItem => {
  const revision = item.approvedRevision ?? item.proposedRevisions[0] ?? null;
  const packEntry = packs
    .flatMap((pack) => pack.entries)
    .find((entry) => entry.itemId === item.id);
  return {
    id: item.id,
    name: item.label,
    category: revision?.originClass ?? "approved_fact",
    type: revision?.verificationState ?? "unverified",
    tokens: revision
      ? Math.max(
          1,
          Math.ceil(new TextEncoder().encode(revision.content).length / 4),
        )
      : 0,
    freshness:
      revision?.verificationState === "stale"
        ? "Stale"
        : revision?.verificationState === "conflicted"
          ? "Aging"
          : "Fresh",
    representation: packEntry?.representation === "summary" ? "Summary" : "Raw",
    included: Boolean(packEntry),
    pinned: item.pinned,
    confidence: Math.round((revision?.confidence ?? 0) * 100),
    source: revision
      ? `${revision.producerProcess}${revision.producerModel ? ` · ${revision.producerModel}` : ""}`
      : "No approved revision",
    linkedIds: revision?.evidenceRefs ?? [],
    priority: (packEntry?.position ?? 0) + 1,
  };
};

const applyAgentContextSnapshot = (
  data: ClyRepositoryData,
  snapshot: AgentContextSnapshot,
): ClyRepositoryData => ({
  ...data,
  contextItems: snapshot.items.map((item) =>
    mapAgentContextItem(item, snapshot.packs),
  ),
  contextPacks: snapshot.packs.map((pack) => ({
    id: pack.id,
    name: pack.name,
    description: `${pack.entries.length} exact revisions · ${pack.configurationId}/${pack.roleId}`,
    itemIds: pack.entries.map((entry) => entry.itemId),
  })),
});

export const useClyStore = create<ClyState>((set, get) => ({
  data: initialData,
  fixtureMode: initialFixtureMode,
  activeProjectId: saved.activeProjectId ?? "project-cly",
  activeScreen:
    saved.activeProduct === "dev" ? "dev" : (saved.activeScreen ?? "overview"),
  activeProduct: saved.activeProduct ?? "research",
  lastResearchScreen:
    saved.lastResearchScreen ??
    (saved.activeScreen && saved.activeScreen !== "dev"
      ? saved.activeScreen
      : "overview"),
  lastResearchSelectedId: saved.lastResearchSelectedId ?? null,
  activeDevSection: saved.activeDevSection ?? "projects",
  selectedId: null,
  sidebarCollapsed: saved.sidebarCollapsed ?? false,
  inspectorOpen: saved.inspectorOpen ?? true,
  activityOpen: false,
  commandPaletteOpen: false,
  projectSwitcherOpen: false,
  fixtureSwitcherOpen: false,
  globalSearch: "",
  toasts: [],
  costLedger: initialCosts.ledger,
  claimCosts: initialCosts.claimCosts,
  costsLoading: false,
  costsError: null,
  selectedCostEntryId: initialCosts.ledger.entries[0]?.id ?? null,
  lineageSuggestions: [],
  lineageMeasurement: null,
  decisionBriefs: [],
  decisionBriefsLoading: false,
  decisionBriefsError: null,
  preregistrations: [],
  preregistrationsLoading: false,
  preregistrationsError: null,
  datasetObligations: [],
  obligationAlerts: [],
  inheritedRestrictions: {},
  obligationsLoading: false,
  obligationsError: null,
  clyDevSessions: [],
  clyDevSessionsLoading: false,
  clyDevSessionsError: null,
  agentContext: emptyAgentContext(),
  agentContextProjectId: null,
  agentContextLoading: false,
  agentContextError: null,
  agentSessionsMode: savedAgentSessionIsValid
    ? (saved.agentSessionsMode ?? "overview")
    : "overview",
  selectedAgentSessionId: savedAgentSessionIsValid
    ? (saved.selectedAgentSessionId ?? null)
    : null,
  selectedOverviewSessionId: saved.selectedOverviewSessionId ?? "session-01",
  agentSessionFilter: saved.agentSessionFilter ?? "active",
  agentSessionSort: saved.agentSessionSort ?? "recent",
  agentSessionSearch: "",
  newAgentSessionOpen: false,
  agentConfigurationId: null,
  agentDestructiveConfirmation: null,
  agentSessionLayouts: saved.agentSessionLayouts ?? {},

  setScreen: (activeScreen) => {
    const current = get();
    const activeProduct = activeScreen === "dev" ? "dev" : "research";
    const lastResearchScreen =
      activeProduct === "research"
        ? activeScreen
        : current.activeProduct === "research" && current.activeScreen !== "dev"
          ? current.activeScreen
          : current.lastResearchScreen;
    const lastResearchSelectedId =
      activeProduct === "research"
        ? null
        : current.activeProduct === "research"
          ? current.selectedId
          : current.lastResearchSelectedId;
    set({
      activeScreen,
      activeProduct,
      lastResearchScreen,
      lastResearchSelectedId,
      selectedId: null,
      commandPaletteOpen: false,
    });
    persistUi({
      activeScreen,
      activeProduct,
      lastResearchScreen,
      lastResearchSelectedId,
    });
  },
  setProductArea: (activeProduct) => {
    const current = get();
    const lastResearchScreen =
      current.activeProduct === "research" && current.activeScreen !== "dev"
        ? current.activeScreen
        : current.lastResearchScreen;
    const activeScreen: ScreenId =
      activeProduct === "dev" ? "dev" : lastResearchScreen;
    const selectedId =
      activeProduct === "research" ? current.lastResearchSelectedId : null;
    const lastResearchSelectedId =
      current.activeProduct === "research"
        ? current.selectedId
        : current.lastResearchSelectedId;
    set({
      activeProduct,
      activeScreen,
      selectedId,
      lastResearchScreen,
      lastResearchSelectedId,
    });
    persistUi({
      activeProduct,
      activeScreen,
      lastResearchScreen,
      lastResearchSelectedId,
    });
  },
  setDevSection: (activeDevSection) => {
    set({
      activeProduct: "dev",
      activeScreen: "dev",
      activeDevSection,
      selectedId: null,
    });
    persistUi({
      activeProduct: "dev",
      activeScreen: "dev",
      activeDevSection,
    });
  },
  setSelected: (selectedId) => {
    const state = get();
    const lastResearchSelectedId =
      state.activeProduct === "research"
        ? selectedId
        : state.lastResearchSelectedId;
    set({
      selectedId,
      lastResearchSelectedId,
      inspectorOpen: selectedId ? true : state.inspectorOpen,
    });
    if (state.activeProduct === "research")
      persistUi({ lastResearchSelectedId });
  },
  setActiveProject: (activeProjectId) => {
    if (activeProjectId === get().activeProjectId) {
      set({
        projectSwitcherOpen: false,
        selectedId: null,
        lastResearchSelectedId: null,
      });
      persistUi({ lastResearchSelectedId: null });
      return;
    }
    set((state) => ({
      activeProjectId,
      data: clearPersistedResearchData(state.data),
      agentContext: emptyAgentContext(),
      agentContextProjectId: null,
      agentContextLoading: true,
      agentContextError: null,
      lineageSuggestions: [],
      lineageMeasurement: null,
      decisionBriefs: [],
      decisionBriefsLoading: false,
      decisionBriefsError: null,
      preregistrations: [],
      preregistrationsLoading: false,
      preregistrationsError: null,
      costLedger: emptyCostLedger(),
      claimCosts: {},
      costsLoading: false,
      costsError: null,
      selectedCostEntryId: null,
      projectSwitcherOpen: false,
      selectedId: null,
      lastResearchSelectedId: null,
    }));
    persistUi({ activeProjectId, lastResearchSelectedId: null });
    void get().loadFromApi(activeProjectId);
  },
  setFixtureMode: (fixtureMode) => {
    if (!__CLY_INCLUDE_DEMOS__ || !demoFixtureRuntime) return;
    const beforeHydration = get();
    const restoreSavedSession =
      beforeHydration.fixtureMode === fixtureMode &&
      beforeHydration.data.agentSessions.length === 0;
    const closeFixtureSwitcherWhenReady = get().fixtureSwitcherOpen;
    if (fixtureMode === "empty") {
      const data = createProductionRepository(get().data.projects);
      const costs = emptyCostLedger();
      set((state) => ({
        data,
        fixtureMode,
        selectedId: null,
        costLedger: costs,
        claimCosts: {},
        selectedCostEntryId: null,
        fixtureSwitcherOpen: closeFixtureSwitcherWhenReady
          ? false
          : state.fixtureSwitcherOpen,
      }));
      return;
    }
    void Promise.all([
      import("../fixtures/repository"),
      import("../fixtures/cost-ledger"),
      import("../agent-sessions/fixtures"),
    ]).then(([repositoryModule, costModule, agentFixtureModule]) => {
      createDemoAgentSession = agentFixtureModule.createNewAgentSession;
      createDemoWorkbenchTabs = agentFixtureModule.workbenchFixtureTabs;
      const data = hydrateAgentSessionLayouts(
        repositoryModule.createFixtureRepository(fixtureMode),
        get().agentSessionLayouts,
      );
      const costs = costModule.createCostLedgerFixture(fixtureMode, data);
      set((state) => ({
        data,
        fixtureMode,
        selectedId: null,
        agentSessionsMode:
          restoreSavedSession &&
          saved.agentSessionsMode === "chat" &&
          data.agentSessions.some(
            (session) => session.id === saved.selectedAgentSessionId,
          )
            ? "chat"
            : "overview",
        selectedAgentSessionId:
          restoreSavedSession &&
          data.agentSessions.some(
            (session) => session.id === saved.selectedAgentSessionId,
          )
            ? (saved.selectedAgentSessionId ?? null)
            : null,
        selectedOverviewSessionId: restoreSavedSession
          ? (saved.selectedOverviewSessionId ?? null)
          : null,
        lineageSuggestions: [],
        lineageMeasurement: null,
        decisionBriefs: [],
        decisionBriefsLoading: false,
        decisionBriefsError: null,
        preregistrations: [],
        preregistrationsLoading: false,
        preregistrationsError: null,
        costLedger: costs.ledger,
        claimCosts: costs.claimCosts,
        costsLoading: false,
        costsError: null,
        selectedCostEntryId: costs.ledger.entries[0]?.id ?? null,
        fixtureSwitcherOpen: closeFixtureSwitcherWhenReady
          ? false
          : state.fixtureSwitcherOpen,
      }));
    });
  },
  toggleSidebar: () =>
    set((state) => {
      const sidebarCollapsed = !state.sidebarCollapsed;
      persistUi({ sidebarCollapsed });
      return { sidebarCollapsed };
    }),
  toggleInspector: () =>
    set((state) => {
      const inspectorOpen = !state.inspectorOpen;
      persistUi({ inspectorOpen });
      return { inspectorOpen };
    }),
  toggleActivity: () => set((state) => ({ activityOpen: !state.activityOpen })),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  setProjectSwitcherOpen: (projectSwitcherOpen) => set({ projectSwitcherOpen }),
  setFixtureSwitcherOpen: (fixtureSwitcherOpen) => set({ fixtureSwitcherOpen }),
  setGlobalSearch: (globalSearch) => set({ globalSearch }),
  notify: (title, detail) => {
    const toast = { id: `toast-${++toastSequence}`, title, detail };
    set((state) => ({ toasts: [...state.toasts, toast].slice(-4) }));
    window.setTimeout(() => get().dismissToast(toast.id), 4200);
  },
  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),
  setAgentContextSnapshot: (projectId, snapshot) => {
    if (get().activeProjectId !== projectId) return;
    set((state) => ({
      agentContext: snapshot,
      agentContextProjectId: projectId,
      agentContextLoading: false,
      agentContextError: null,
      data: applyAgentContextSnapshot(state.data, snapshot),
    }));
  },
  loadFromApi: async (requestedProjectId) => {
    const projectId = requestedProjectId ?? get().activeProjectId;
    const project = get().data.projects.find((item) => item.id === projectId);
    if (!project) return false;
    if (get().activeProjectId === projectId)
      set({ agentContextLoading: true, agentContextError: null });
    let contextHydrationStarted = false;
    try {
      await apiClient.ensureProject(project);
      const researchHydration = Promise.all([
        apiClient.fetchResearchData(projectId),
        apiClient.fetchExperimentLineages(projectId).catch(() => []),
        apiClient.fetchAgentConfigurations(projectId).catch(() => undefined),
        apiClient.fetchLineageSuggestions(projectId).catch(() => []),
        apiClient.fetchDecisionBriefs(projectId).catch(() => undefined),
        apiClient.fetchNextSteps(projectId).catch(() => undefined),
        apiClient.fetchPreregistrations(projectId).catch(() => undefined),
        apiClient.fetchObligations(projectId).catch(() => undefined),
        apiClient.fetchCostLedger(projectId).catch(() => emptyCostLedger()),
        apiClient.fetchClaimCosts(projectId).catch(() => []),
      ]);
      contextHydrationStarted = true;
      const contextHydration = apiClient
        .fetchAgentContext(projectId)
        .then((snapshot) => {
          if (get().activeProjectId === projectId)
            set((state) => ({
              agentContext: snapshot,
              agentContextProjectId: projectId,
              agentContextLoading: false,
              agentContextError: null,
              data: applyAgentContextSnapshot(state.data, snapshot),
            }));
          return { snapshot, error: null };
        })
        .catch((error) => {
          const message =
            error instanceof Error
              ? error.message
              : "Durable context could not load.";
          if (get().activeProjectId === projectId)
            set({
              agentContextProjectId: null,
              agentContextLoading: false,
              agentContextError: message,
            });
          return { snapshot: undefined, error: message };
        });
      const [
        researchData,
        experimentLineages,
        agentConfigurations,
        lineageSuggestions,
        decisionBriefs,
        plannerRecommendations,
        preregistrations,
        obligationSummary,
        costLedger,
        claimCostList,
      ] = await researchHydration;
      const agentContextResult = await contextHydration;
      if (get().activeProjectId !== projectId) return false;
      const agentContext = agentContextResult.snapshot;
      set((state) => ({
        data: hydrateAgentSessionLayouts(
          agentContext
            ? applyAgentContextSnapshot(
                agentConfigurations
                  ? {
                      ...mapResearchData(
                        state.data,
                        researchData,
                        experimentLineages,
                        plannerRecommendations,
                      ),
                      agentConfigurations,
                    }
                  : mapResearchData(
                      state.data,
                      researchData,
                      experimentLineages,
                      plannerRecommendations,
                    ),
                agentContext,
              )
            : agentConfigurations
              ? {
                  ...mapResearchData(
                    state.data,
                    researchData,
                    experimentLineages,
                    plannerRecommendations,
                  ),
                  agentConfigurations,
                }
              : mapResearchData(
                  state.data,
                  researchData,
                  experimentLineages,
                  plannerRecommendations,
                ),
          state.agentSessionLayouts,
        ),
        ...(agentContext
          ? { agentContext, agentContextProjectId: projectId }
          : { agentContextProjectId: null }),
        agentContextError: agentContextResult.error,
        agentContextLoading: false,
        fixtureMode: "empty",
        lineageSuggestions,
        lineageMeasurement: null,
        ...(decisionBriefs
          ? { decisionBriefs, decisionBriefsError: null }
          : {}),
        ...(preregistrations
          ? {
              preregistrations,
              preregistrationsError: null,
              preregistrationsLoading: false,
            }
          : {}),
        ...(obligationSummary
          ? {
              datasetObligations: obligationSummary.obligations,
              obligationAlerts: obligationSummary.alerts,
              inheritedRestrictions: obligationSummary.inheritedRestrictions,
              obligationsError: null,
              obligationsLoading: false,
            }
          : {}),
        costLedger,
        claimCosts: Object.fromEntries(
          claimCostList.map((summary) => [summary.claimId, summary]),
        ),
        costsLoading: false,
        costsError: null,
        selectedCostEntryId: costLedger.entries[0]?.id ?? null,
        selectedId: null,
      }));
      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Research data could not load.";
      console.error("[cly:research-hydration-failed]", {
        errorName: error instanceof Error ? error.name : "UnknownError",
        operation: "hydrate-project-research",
      });
      if (get().activeProjectId === projectId && !contextHydrationStarted)
        set({ agentContextLoading: false, agentContextError: message });
      get().notify("Research data could not load", message);
      return false;
    }
  },
  loadClyDevSessions: async (requestedProjectId) => {
    const projectId = requestedProjectId ?? get().activeProjectId;
    set({ clyDevSessionsLoading: true, clyDevSessionsError: null });
    try {
      const sessions = await productionAgentSessionServices.hydrate(projectId);
      if (get().activeProjectId !== projectId) return false;
      set({
        clyDevSessions: sessions,
        clyDevSessionsLoading: false,
        clyDevSessionsError: null,
      });
      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Agent sessions could not load.";
      set({ clyDevSessionsLoading: false, clyDevSessionsError: message });
      return false;
    }
  },
  loadObligations: async (requestedProjectId) => {
    const projectId = requestedProjectId ?? get().activeProjectId;
    set({ obligationsLoading: true, obligationsError: null });
    try {
      const summary = await apiClient.fetchObligations(projectId);
      if (get().activeProjectId !== projectId) return false;
      set({
        datasetObligations: summary.obligations,
        obligationAlerts: summary.alerts,
        inheritedRestrictions: summary.inheritedRestrictions,
        obligationsLoading: false,
      });
      return true;
    } catch (error) {
      if (get().activeProjectId === projectId) {
        set({
          obligationsLoading: false,
          obligationsError:
            error instanceof Error
              ? error.message
              : "Obligations could not be loaded.",
        });
      }
      return false;
    }
  },
  saveDatasetObligation: async (datasetObjectId, input) => {
    const projectId = get().activeProjectId;
    set({ obligationsLoading: true, obligationsError: null });
    try {
      const obligation = await apiClient.saveDatasetObligation(
        projectId,
        datasetObjectId,
        input,
      );
      if (get().activeProjectId !== projectId) return obligation;
      await get().loadObligations(projectId);
      return obligation;
    } catch (error) {
      if (get().activeProjectId === projectId) {
        set({
          obligationsLoading: false,
          obligationsError:
            error instanceof Error
              ? error.message
              : "Obligation could not be saved.",
        });
      }
      return null;
    }
  },
  evaluateObligations: (operation) =>
    apiClient.evaluateObligations(get().activeProjectId, operation),
  approveObligationOperation: async (operation, input) => {
    const projectId = get().activeProjectId;
    try {
      const result = await apiClient.approveObligationOperation(
        projectId,
        operation,
        input,
      );
      if (get().activeProjectId === projectId)
        await get().loadObligations(projectId);
      return result.evaluation;
    } catch (error) {
      set({
        obligationsError:
          error instanceof Error
            ? error.message
            : "Approval could not be recorded.",
      });
      return null;
    }
  },
  transitionObligationAlert: async (alertId, input) => {
    const projectId = get().activeProjectId;
    try {
      const alert = await apiClient.transitionObligationAlert(
        projectId,
        alertId,
        input,
      );
      if (get().activeProjectId === projectId) {
        set((state) => ({
          obligationAlerts: state.obligationAlerts.map((item) =>
            item.id === alert.id ? alert : item,
          ),
        }));
      }
      return alert;
    } catch (error) {
      set({
        obligationsError:
          error instanceof Error
            ? error.message
            : "Alert could not be updated.",
      });
      return null;
    }
  },
  createPreregistration: async (experimentId, content, amendsSnapshotId) => {
    const projectId = get().activeProjectId;
    set({ preregistrationsLoading: true, preregistrationsError: null });
    try {
      const snapshot = await apiClient.createPreregistration(
        projectId,
        experimentId,
        content,
        amendsSnapshotId,
      );
      if (get().activeProjectId !== projectId) return snapshot;
      set((state) => ({
        preregistrations: [
          snapshot,
          ...state.preregistrations.filter((item) => item.id !== snapshot.id),
        ],
        preregistrationsLoading: false,
      }));
      return snapshot;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Preregistration could not be saved.";
      if (get().activeProjectId === projectId) {
        set({ preregistrationsLoading: false, preregistrationsError: message });
        get().notify("Preregistration was not saved", message);
      }
      return null;
    }
  },
  markPreregistrationEvaluated: async (snapshotId) => {
    const projectId = get().activeProjectId;
    set({ preregistrationsLoading: true, preregistrationsError: null });
    try {
      const snapshot = await apiClient.markPreregistrationEvaluated(
        projectId,
        snapshotId,
      );
      if (get().activeProjectId !== projectId) return snapshot;
      set((state) => ({
        preregistrations: state.preregistrations.map((item) =>
          item.id === snapshot.id ? snapshot : item,
        ),
        preregistrationsLoading: false,
      }));
      return snapshot;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Final evaluation could not be recorded.";
      if (get().activeProjectId === projectId) {
        set({ preregistrationsLoading: false, preregistrationsError: message });
        get().notify("Evaluation was not recorded", message);
      }
      return null;
    }
  },
  declareAnalysisDeviation: async (snapshotId, input) => {
    const projectId = get().activeProjectId;
    set({ preregistrationsLoading: true, preregistrationsError: null });
    try {
      const deviation = await apiClient.declareAnalysisDeviation(
        projectId,
        snapshotId,
        input,
      );
      if (get().activeProjectId !== projectId) return deviation;
      set((state) => ({
        preregistrations: state.preregistrations.map((snapshot) =>
          snapshot.id === snapshotId
            ? {
                ...snapshot,
                deviations: [...snapshot.deviations, deviation],
              }
            : snapshot,
        ),
        preregistrationsLoading: false,
      }));
      return deviation;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Analysis deviation could not be recorded.";
      if (get().activeProjectId === projectId) {
        set({ preregistrationsLoading: false, preregistrationsError: message });
        get().notify("Deviation was not recorded", message);
      }
      return null;
    }
  },
  acknowledgeAnalysisDeviation: async (deviationId) => {
    const projectId = get().activeProjectId;
    set({ preregistrationsLoading: true, preregistrationsError: null });
    try {
      const deviation = await apiClient.acknowledgeAnalysisDeviation(
        projectId,
        deviationId,
      );
      if (get().activeProjectId !== projectId) return deviation;
      set((state) => ({
        preregistrations: state.preregistrations.map((snapshot) => ({
          ...snapshot,
          deviations: snapshot.deviations.map((item) =>
            item.id === deviation.id ? deviation : item,
          ),
        })),
        preregistrationsLoading: false,
      }));
      return deviation;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Analysis deviation could not be acknowledged.";
      if (get().activeProjectId === projectId) {
        set({ preregistrationsLoading: false, preregistrationsError: message });
        get().notify("Deviation was not acknowledged", message);
      }
      return null;
    }
  },
  loadCosts: async (requestedProjectId) => {
    const projectId = requestedProjectId ?? get().activeProjectId;
    set({ costsLoading: true, costsError: null });
    try {
      const [costLedger, claimCostList] = await Promise.all([
        apiClient.fetchCostLedger(projectId),
        apiClient.fetchClaimCosts(projectId),
      ]);
      if (get().activeProjectId !== projectId) return false;
      set((state) => ({
        costLedger,
        claimCosts: Object.fromEntries(
          claimCostList.map((summary) => [summary.claimId, summary]),
        ),
        costsLoading: false,
        selectedCostEntryId:
          state.selectedCostEntryId &&
          costLedger.entries.some(
            (entry) => entry.id === state.selectedCostEntryId,
          )
            ? state.selectedCostEntryId
            : (costLedger.entries[0]?.id ?? null),
      }));
      return true;
    } catch (error) {
      if (get().activeProjectId !== projectId) return false;
      set({
        costsLoading: false,
        costsError:
          error instanceof Error
            ? error.message
            : "Cost ledger could not load.",
      });
      return false;
    }
  },
  createCostEntry: async (input) => {
    const projectId = get().activeProjectId;
    set({ costsLoading: true, costsError: null });
    try {
      const entry = await apiClient.createManualCost(projectId, input);
      if (get().activeProjectId !== projectId) return entry;
      const [costLedger, claimCostList] = await Promise.all([
        apiClient.fetchCostLedger(projectId),
        apiClient.fetchClaimCosts(projectId),
      ]);
      if (get().activeProjectId !== projectId) return entry;
      set({
        costLedger,
        claimCosts: Object.fromEntries(
          claimCostList.map((summary) => [summary.claimId, summary]),
        ),
        costsLoading: false,
        selectedCostEntryId: entry.id,
      });
      return entry;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Cost entry was not saved.";
      if (get().activeProjectId === projectId) {
        set({ costsLoading: false, costsError: message });
        get().notify("Cost entry was not saved", message);
      }
      return null;
    }
  },
  importAwsCur: async (csv, fileName) => {
    const projectId = get().activeProjectId;
    set({ costsLoading: true, costsError: null });
    try {
      const result = await apiClient.importAwsCur(projectId, csv, fileName);
      if (get().activeProjectId !== projectId) return result;
      const claimCostList = await apiClient.fetchClaimCosts(projectId);
      if (get().activeProjectId !== projectId) return result;
      set({
        costLedger: result.ledger,
        claimCosts: Object.fromEntries(
          claimCostList.map((summary) => [summary.claimId, summary]),
        ),
        costsLoading: false,
        selectedCostEntryId:
          result.ledger.entries[0]?.id ?? get().selectedCostEntryId,
      });
      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "AWS CUR import failed.";
      if (get().activeProjectId === projectId) {
        set({ costsLoading: false, costsError: message });
        get().notify("AWS CUR import failed", message);
      }
      return null;
    }
  },
  setSelectedCostEntry: (selectedCostEntryId) => set({ selectedCostEntryId }),
  scanLineage: async () => {
    const projectId = get().activeProjectId;
    try {
      const result = await apiClient.scanLineage(projectId);
      if (get().activeProjectId !== projectId) return false;
      set({
        lineageMeasurement: result.measurement,
        lineageSuggestions: result.suggestions,
      });
      return true;
    } catch (error) {
      get().notify(
        "Lineage reconstruction was not completed",
        error instanceof Error
          ? error.message
          : "Unable to reach the research API.",
      );
      return false;
    }
  },
  reviewLineageSuggestions: async (decisions) => {
    if (!decisions.length) return false;
    const projectId = get().activeProjectId;
    try {
      const { suggestions } = await apiClient.reviewLineageSuggestions(
        projectId,
        decisions,
      );
      if (get().activeProjectId !== projectId) return false;
      const byId = new Map(
        suggestions.map((suggestion) => [suggestion.id, suggestion]),
      );
      set((state) => ({
        lineageSuggestions: state.lineageSuggestions.map(
          (suggestion) => byId.get(suggestion.id) ?? suggestion,
        ),
      }));
      return true;
    } catch (error) {
      get().notify(
        "Lineage review was not saved",
        error instanceof Error
          ? error.message
          : "Unable to reach the research API.",
      );
      return false;
    }
  },
  loadDecisionBriefs: async () => {
    const projectId = get().activeProjectId;
    set({ decisionBriefsLoading: true, decisionBriefsError: null });
    try {
      const decisionBriefs = await apiClient.fetchDecisionBriefs(projectId);
      if (get().activeProjectId !== projectId) return false;
      set({ decisionBriefs, decisionBriefsLoading: false });
      return true;
    } catch (error) {
      if (get().activeProjectId !== projectId) return false;
      set({
        decisionBriefsLoading: false,
        decisionBriefsError:
          error instanceof Error
            ? error.message
            : "Decision briefs could not load.",
      });
      return false;
    }
  },
  generateDecisionBrief: async () => {
    const projectId = get().activeProjectId;
    set({ decisionBriefsLoading: true, decisionBriefsError: null });
    try {
      const result = await apiClient.generateDecisionBrief(projectId);
      if (get().activeProjectId !== projectId) return null;
      set((state) => ({
        decisionBriefsLoading: false,
        decisionBriefs: result.brief
          ? [
              result.brief,
              ...state.decisionBriefs.filter(
                (brief) => brief.id !== result.brief?.id,
              ),
            ]
          : state.decisionBriefs,
      }));
      return result;
    } catch (error) {
      if (get().activeProjectId === projectId) {
        set({
          decisionBriefsLoading: false,
          decisionBriefsError:
            error instanceof Error
              ? error.message
              : "Decision brief generation failed.",
        });
      }
      return null;
    }
  },
  transitionDecisionBriefFinding: async (briefId, findingId, input) => {
    const projectId = get().activeProjectId;
    try {
      const finding = await apiClient.transitionDecisionBriefFinding(
        projectId,
        briefId,
        findingId,
        input,
      );
      if (get().activeProjectId !== projectId) return null;
      set((state) => ({
        decisionBriefs: state.decisionBriefs.map((brief) =>
          brief.id === briefId
            ? {
                ...brief,
                findings: brief.findings.map((item) =>
                  item.id === finding.id ? { ...item, ...finding } : item,
                ),
              }
            : brief,
        ),
      }));
      return finding;
    } catch (error) {
      set({
        decisionBriefsError:
          error instanceof Error ? error.message : "Finding update failed.",
      });
      return null;
    }
  },
  updateContextItem: (id, patch) =>
    set((state) => ({
      data: {
        ...state.data,
        contextItems: state.data.contextItems.map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
      },
    })),
  updateClaim: (id, patch) =>
    set((state) => ({
      data: {
        ...state.data,
        claims: state.data.claims.map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
      },
    })),
  addClaim: (claim) =>
    set((state) => ({
      data: { ...state.data, claims: [claim, ...state.data.claims] },
    })),
  addSource: async (source) => {
    const duplicate = findDuplicateSource(source, get().data.sources);
    if (duplicate) return duplicate;
    try {
      const projectId = get().activeProjectId;
      const project = get().data.projects.find((item) => item.id === projectId);
      if (!project) throw new Error("Active research project was not found.");
      await apiClient.ensureProject(project);
      const object = await apiClient.createObject(projectId, {
        type: "source",
        title: source.title,
        description: source.summary,
        payload: {
          kind: "source",
          sourceType: (
            {
              Paper: "paper",
              PDF: "pdf",
              Webpage: "webpage",
              Book: "book",
              Dataset: "dataset",
              Documentation: "documentation",
              Repository: "repository",
              "Hugging Face": "hugging-face",
              Note: "note",
              Import: "import",
              "Lab note": "note",
              "NotebookLM result": "import",
            } as const satisfies Record<
              Source["type"],
              NonNullable<SourcePayload["sourceType"]>
            >
          )[source.type],
          status: source.url ? "resolved" : "placeholder",
          authors: source.authors
            .split(",")
            .map((author) => author.trim())
            .filter(Boolean),
          year: source.year,
          url: source.url,
          doi: source.doi,
          providerId: source.providerId,
          abstract: source.summary,
          tags: source.tags,
          folder: source.folder,
          extractedFields: source.extractedFields,
          contradictoryEvidence: source.contradictoryEvidence,
          customReviewFields: source.customReviewFields,
          provider: source.provenance?.provider,
          query: source.provenance?.query,
          rankingScore: source.provenance?.score,
          rankingMethod: source.provenance?.method,
          rankingModel: source.provenance?.model,
          rankingComponents: source.provenance?.components,
          rankingExplanation: source.provenance?.explanation,
          retrievedAt: source.provenance?.retrievedAt,
        },
      });
      const persistedSource = sourceFromResearchObject(object);
      if (get().activeProjectId !== projectId) return persistedSource;
      set((state) => ({
        data: {
          ...state.data,
          sources: [persistedSource, ...state.data.sources],
          graphNodes: state.data.graphNodes.some(
            (node) => node.id === persistedSource.id,
          )
            ? state.data.graphNodes
            : [
                {
                  id: persistedSource.id,
                  type: "source",
                  label: persistedSource.title,
                  status: "Suggested",
                  x: 80,
                  y: 80,
                },
                ...state.data.graphNodes,
              ],
        },
      }));
      return persistedSource;
    } catch (error) {
      get().notify(
        "Source was not saved",
        error instanceof Error
          ? error.message
          : "Unable to reach the research API.",
      );
      return null;
    }
  },
  updateSource: (id, patch) =>
    set((state) => ({
      data: {
        ...state.data,
        sources: state.data.sources.map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
      },
    })),
  addEvidencePassage: (evidence) =>
    set((state) => ({
      data: {
        ...state.data,
        evidencePassages: state.data.evidencePassages.some(
          (item) => item.id === evidence.id,
        )
          ? state.data.evidencePassages.map((item) =>
              item.id === evidence.id ? evidence : item,
            )
          : [evidence, ...state.data.evidencePassages],
      },
    })),
  updateEvidencePassage: (id, patch) =>
    set((state) => ({
      data: {
        ...state.data,
        evidencePassages: state.data.evidencePassages.map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
      },
    })),
  addExperiment: (experiment) =>
    set((state) => ({
      data: {
        ...state.data,
        experiments: [experiment, ...state.data.experiments],
      },
    })),
  updateExperiment: (id, patch) =>
    set((state) => ({
      data: {
        ...state.data,
        experiments: state.data.experiments.map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
      },
    })),
  addNotebook: (notebook) =>
    set((state) => ({
      data: { ...state.data, notebooks: [notebook, ...state.data.notebooks] },
    })),
  addGraphEdge: (edge) =>
    set((state) => ({
      data: {
        ...state.data,
        graphEdges: state.data.graphEdges.some((item) => item.id === edge.id)
          ? state.data.graphEdges.map((item) =>
              item.id === edge.id ? edge : item,
            )
          : [...state.data.graphEdges, edge],
      },
    })),
  updateGraphEdge: (id, patch) =>
    set((state) => ({
      data: {
        ...state.data,
        graphEdges: state.data.graphEdges.map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
      },
    })),
  updateFinding: (id, patch) =>
    set((state) => ({
      data: {
        ...state.data,
        findings: state.data.findings.map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
      },
    })),
  replaceReproducibilityAudit: (audit, findings) =>
    set((state) => ({
      data: {
        ...state.data,
        audits: [
          audit,
          ...state.data.audits.filter((item) => item.id !== audit.id),
        ],
        findings,
      },
    })),
  updateIntegration: (id, patch) =>
    set((state) => ({
      data: {
        ...state.data,
        integrations: state.data.integrations.map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
      },
    })),
  updateNextStep: (id, status) =>
    set((state) => ({
      data: {
        ...state.data,
        nextSteps: state.data.nextSteps.map((item) =>
          item.id === id ? { ...item, status } : item,
        ),
      },
    })),
  replaceNextSteps: (steps) =>
    set((state) => ({ data: { ...state.data, nextSteps: steps } })),
  addDecision: (decision) =>
    set((state) => ({
      data: { ...state.data, decisions: [decision, ...state.data.decisions] },
    })),
  updateDecision: (id, patch) =>
    set((state) => ({
      data: {
        ...state.data,
        decisions: state.data.decisions.map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
      },
    })),
  addAgentPreset: (preset) =>
    set((state) => ({
      data: {
        ...state.data,
        agentPresets: [preset, ...state.data.agentPresets],
      },
    })),
  setAgentConfigurations: (agentConfigurations) =>
    set((state) => ({
      data: { ...state.data, agentConfigurations },
    })),
  setAgentSessionsMode: (agentSessionsMode, requestedSessionId) => {
    const state = get();
    const selectedAgentSessionId =
      requestedSessionId === undefined
        ? state.selectedAgentSessionId
        : requestedSessionId;
    const isValid = selectedAgentSessionId
      ? state.data.agentSessions.some(
          (session) => session.id === selectedAgentSessionId,
        )
      : false;
    const nextMode =
      agentSessionsMode === "chat" && selectedAgentSessionId && !isValid
        ? "overview"
        : agentSessionsMode;
    set({
      activeScreen: "agents",
      agentSessionsMode: nextMode,
      selectedAgentSessionId: isValid ? selectedAgentSessionId : null,
      commandPaletteOpen: false,
    });
    persistUi({
      activeScreen: "agents",
      agentSessionsMode: nextMode,
      selectedAgentSessionId: isValid ? selectedAgentSessionId : null,
    });
  },
  openAgentSession: (selectedAgentSessionId) => {
    if (
      !get().data.agentSessions.some(
        (item) => item.id === selectedAgentSessionId,
      )
    )
      return;
    set({
      activeScreen: "agents",
      agentSessionsMode: "chat",
      selectedAgentSessionId,
      selectedOverviewSessionId: selectedAgentSessionId,
      commandPaletteOpen: false,
    });
    persistUi({
      activeScreen: "agents",
      agentSessionsMode: "chat",
      selectedAgentSessionId,
      selectedOverviewSessionId: selectedAgentSessionId,
    });
  },
  setSelectedOverviewSession: (selectedOverviewSessionId) => {
    set({ selectedOverviewSessionId });
    persistUi({ selectedOverviewSessionId });
  },
  setAgentSessionFilter: (agentSessionFilter) => {
    set({ agentSessionFilter });
    persistUi({ agentSessionFilter });
  },
  setAgentSessionSort: (agentSessionSort) => {
    set({ agentSessionSort });
    persistUi({ agentSessionSort });
  },
  setAgentSessionSearch: (agentSessionSearch) => set({ agentSessionSearch }),
  setNewAgentSessionOpen: (newAgentSessionOpen) => set({ newAgentSessionOpen }),
  setAgentConfigurationId: (agentConfigurationId) =>
    set({ agentConfigurationId }),
  setAgentDestructiveConfirmation: (agentDestructiveConfirmation) =>
    set({ agentDestructiveConfirmation }),
  createAgentSession: (input, open) => {
    if (!demoFixtureRuntime || !createDemoAgentSession)
      throw new CapabilityUnavailableError("agents.execute");
    const session = createDemoAgentSession(input);
    set((state) => ({
      data: {
        ...state.data,
        agentSessions: [session, ...state.data.agentSessions],
      },
      newAgentSessionOpen: false,
      selectedOverviewSessionId: session.id,
      selectedAgentSessionId: open ? session.id : state.selectedAgentSessionId,
      agentSessionsMode: open ? "chat" : "overview",
    }));
    persistUi({
      selectedOverviewSessionId: session.id,
      selectedAgentSessionId: open ? session.id : get().selectedAgentSessionId,
      agentSessionsMode: open ? "chat" : "overview",
      agentSessionLayouts: snapshotAgentSessionLayouts(
        get().data.agentSessions,
      ),
    });
    return session.id;
  },
  updateAgentSession: (id, updater) => {
    set((state) => ({
      data: {
        ...state.data,
        agentSessions: state.data.agentSessions.map((session) =>
          session.id === id ? updater(session) : session,
        ),
      },
    }));
    const agentSessionLayouts = snapshotAgentSessionLayouts(
      get().data.agentSessions,
    );
    set({ agentSessionLayouts });
    persistUi({ agentSessionLayouts });
  },
  setAgentSessionDraft: (sessionId, draft) =>
    get().updateAgentSession(sessionId, (session) => ({ ...session, draft })),
  appendAgentMessage: (sessionId, message) =>
    get().updateAgentSession(sessionId, (session) => ({
      ...session,
      messages: [...session.messages, message],
      updatedAt: "Just now",
    })),
  openWorkbenchTab: (sessionId, type) => {
    if (!demoFixtureRuntime || !createDemoWorkbenchTabs)
      throw new CapabilityUnavailableError("agents.workbench");
    const template = createDemoWorkbenchTabs().find((tab) => tab.type === type);
    if (!template) return;
    get().updateAgentSession(sessionId, (session) => {
      const existing = session.workbenchTabs.find((tab) => tab.type === type);
      if (existing)
        return {
          ...session,
          activeWorkbenchTabId: existing.id,
          workbenchCollapsed: false,
        };
      const tab: WorkbenchTab = {
        ...template,
        id: `${template.id}-${Date.now()}`,
      };
      return {
        ...session,
        workbenchTabs: [...session.workbenchTabs, tab],
        activeWorkbenchTabId: tab.id,
        workbenchCollapsed: false,
      };
    });
  },
  closeWorkbenchTab: (sessionId, tabId) =>
    get().updateAgentSession(sessionId, (session) => {
      const tab = session.workbenchTabs.find((item) => item.id === tabId);
      if (tab?.pinned) return session;
      const index = session.workbenchTabs.findIndex(
        (item) => item.id === tabId,
      );
      const workbenchTabs = session.workbenchTabs.filter(
        (item) => item.id !== tabId,
      );
      const fallback =
        workbenchTabs[Math.max(0, index - 1)] ?? workbenchTabs[0];
      return {
        ...session,
        workbenchTabs,
        activeWorkbenchTabId:
          session.activeWorkbenchTabId === tabId
            ? fallback?.id
            : session.activeWorkbenchTabId,
      };
    }),
  activateWorkbenchTab: (sessionId, activeWorkbenchTabId) =>
    get().updateAgentSession(sessionId, (session) => ({
      ...session,
      activeWorkbenchTabId,
      workbenchCollapsed: false,
    })),
  reorderWorkbenchTab: (sessionId, fromIndex, toIndex) =>
    get().updateAgentSession(sessionId, (session) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= session.workbenchTabs.length ||
        toIndex >= session.workbenchTabs.length
      )
        return session;
      const workbenchTabs = [...session.workbenchTabs];
      const [moved] = workbenchTabs.splice(fromIndex, 1);
      if (!moved) return session;
      workbenchTabs.splice(toIndex, 0, moved);
      return { ...session, workbenchTabs };
    }),
  duplicateWorkbenchTab: (sessionId, tabId) =>
    get().updateAgentSession(sessionId, (session) => {
      const index = session.workbenchTabs.findIndex((tab) => tab.id === tabId);
      const source = session.workbenchTabs[index];
      if (!source) return session;
      const duplicate = {
        ...source,
        id: `${source.id}-copy-${Date.now()}`,
        title: `${source.title} copy`,
        pinned: false,
      };
      const workbenchTabs = [...session.workbenchTabs];
      workbenchTabs.splice(index + 1, 0, duplicate);
      return {
        ...session,
        workbenchTabs,
        activeWorkbenchTabId: duplicate.id,
      };
    }),
  toggleWorkbenchTabPin: (sessionId, tabId) =>
    get().updateAgentSession(sessionId, (session) => ({
      ...session,
      workbenchTabs: session.workbenchTabs.map((tab) =>
        tab.id === tabId ? { ...tab, pinned: !tab.pinned } : tab,
      ),
    })),
  toggleWorkbench: (sessionId) =>
    get().updateAgentSession(sessionId, (session) => ({
      ...session,
      workbenchCollapsed: !session.workbenchCollapsed,
      workbenchMaximized: false,
    })),
  toggleWorkbenchMaximized: (sessionId) =>
    get().updateAgentSession(sessionId, (session) => ({
      ...session,
      workbenchMaximized: !session.workbenchMaximized,
      workbenchCollapsed: false,
    })),
  setWorkbenchWidth: (sessionId, workbenchWidth) =>
    get().updateAgentSession(sessionId, (session) => ({
      ...session,
      workbenchWidth: Math.min(58, Math.max(30, workbenchWidth)),
    })),
  updateDelegatedAgent: (sessionId, agentId, patch) =>
    get().updateAgentSession(sessionId, (session) => ({
      ...session,
      delegatedAgents: session.delegatedAgents.map((agent) =>
        agent.id === agentId ? { ...agent, ...patch } : agent,
      ),
    })),
  resolveAgentApproval: (sessionId, approvalId, approvalState) =>
    get().updateAgentSession(sessionId, (session) => ({
      ...session,
      status: approvalState === "approved" ? "running" : session.status,
      approvals: session.approvals.map((approval) =>
        approval.id === approvalId
          ? { ...approval, state: approvalState }
          : approval,
      ),
      messages: session.messages.map((message) =>
        message.type === "approval" && message.status === "pending"
          ? { ...message, status: approvalState }
          : message,
      ),
    })),
  pauseAgentSession: (sessionId) =>
    get().updateAgentSession(sessionId, (session) => ({
      ...session,
      status: session.status === "paused" ? "running" : "paused",
      orchestrator: {
        ...session.orchestrator,
        status: session.orchestrator.status === "paused" ? "working" : "paused",
      },
    })),
  stopAgentSession: (sessionId) =>
    get().updateAgentSession(sessionId, (session) => ({
      ...session,
      status: "stopped",
      orchestrator: { ...session.orchestrator, status: "stopped" },
      delegatedAgents: session.delegatedAgents.map((agent) => ({
        ...agent,
        status: "stopped",
      })),
    })),
  archiveAgentSession: (sessionId) =>
    get().updateAgentSession(sessionId, (session) => ({
      ...session,
      status: "archived",
      archived: true,
    })),
}));

export const claimStatusTone = (status: ClaimStatus) =>
  status === "Strong" || status === "Paper-ready"
    ? "success"
    : status === "Weak" || status === "Unsupported" || status === "Invalidated"
      ? "danger"
      : status === "Needs review"
        ? "warning"
        : "info";
