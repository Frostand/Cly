import { create } from "zustand";
import {
  createNewAgentSession,
  workbenchFixtureTabs,
} from "../agent-sessions/fixtures";
import type {
  AgentIdentity,
  AgentMessage,
  AgentSession,
  AgentSessionOverviewFilter,
  AgentSessionOverviewSort,
  AgentSessionsMode,
  NewAgentSessionInput,
  WorkbenchTab,
  WorkbenchTabType,
} from "../agent-sessions/types";
import { findDuplicateSource } from "../domain/literature-search";
import type {
  Relationship,
  ResearchObject,
  SourcePayload,
} from "../domain/research-bridge";
import type {
  AgentPreset,
  Claim,
  ClaimStatus,
  ClyRepositoryData,
  ContextItem,
  EntityType,
  Experiment,
  FixtureMode,
  GraphEdge,
  Integration,
  LineageReviewDecision,
  LineageScanMeasurement,
  LineageSuggestion,
  NotebookArtifact,
  ResearchDecision,
  ScreenId,
  Source,
} from "../domain/types";
import { createFixtureRepository } from "../fixtures/repository";
import { apiClient, type ResearchData } from "../services/api-client";

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
  selectedId: string | null;
  sidebarCollapsed: boolean;
  inspectorOpen: boolean;
  activityOpen: boolean;
  commandPaletteOpen: boolean;
  projectSwitcherOpen: boolean;
  fixtureSwitcherOpen: boolean;
  globalSearch: string;
  toasts: ToastMessage[];
  lineageSuggestions: LineageSuggestion[];
  lineageMeasurement: LineageScanMeasurement | null;
  agentSessionsMode: AgentSessionsMode;
  selectedAgentSessionId: string | null;
  selectedOverviewSessionId: string | null;
  agentSessionFilter: AgentSessionOverviewFilter;
  agentSessionSort: AgentSessionOverviewSort;
  agentSessionSearch: string;
  newAgentSessionOpen: boolean;
  agentConfigurationId: string | null;
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
    >
  >;
  setScreen: (screen: ScreenId) => void;
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
  scanLineage: () => Promise<boolean>;
  reviewLineageSuggestions: (
    decisions: LineageReviewDecision[],
  ) => Promise<boolean>;
  updateContextItem: (id: string, patch: Partial<ContextItem>) => void;
  updateClaim: (id: string, patch: Partial<Claim>) => void;
  addClaim: (claim: Claim) => void;
  addSource: (source: Source) => Promise<Source | null>;
  updateSource: (id: string, patch: Partial<Source>) => void;
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
  updateIntegration: (id: string, patch: Partial<Integration>) => void;
  updateNextStep: (
    id: string,
    status: "Accepted" | "Deferred" | "Dismissed" | "In progress",
  ) => void;
  addDecision: (decision: ResearchDecision) => void;
  updateDecision: (id: string, patch: Partial<ResearchDecision>) => void;
  addAgentPreset: (preset: AgentPreset) => void;
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
const uiStorageKey = explicitDemoMode ? "cly-demo-ui" : "cly-prototype-ui";
const initialFixtureMode = resolveInitialFixtureMode({
  demoFlag: import.meta.env.VITE_CLY_DEMO_MODE,
  development: import.meta.env.DEV,
});

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
      },
    ]),
  ) as ClyState["agentSessionLayouts"];

const initialData = hydrateAgentSessionLayouts(
  createFixtureRepository(initialFixtureMode),
  saved.agentSessionLayouts,
);
const savedAgentSessionIsValid = saved.selectedAgentSessionId
  ? initialData.agentSessions.some(
      (session) => session.id === saved.selectedAgentSessionId,
    )
  : true;

const sourceFromResearchObject = (object: ResearchObject): Source => {
  const payload = object.payload as SourcePayload;
  return {
    id: object.id,
    title: object.title,
    authors:
      payload.authors?.join(", ") || payload.citation || "Unknown authors",
    year: payload.year ?? new Date(object.createdAt).getFullYear(),
    type: "Paper",
    status: "Needs metadata",
    relevance: "Medium",
    confidence: 0,
    summary: object.description || "Awaiting extraction.",
    url: payload.url,
    doi: payload.doi,
    providerId: payload.providerId,
    provider: payload.provider,
    methods: payload.methods ?? [],
    findings: payload.findings ?? [],
    limitations: payload.limitations ?? [],
    tags: [],
    linkedClaimIds: [],
    linkedExperimentIds: [],
    inNotebookBundle: false,
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
  "generated-by": "generated by",
  uses: "uses",
  tests: "tests",
  implements: "implements",
};

const entityTypeFromResearchObject: Record<ResearchObject["type"], EntityType> =
  {
    artifact: "report",
    source: "source",
    claim: "claim",
    experiment: "experiment",
    run: "run",
  };

/**
 * Replaces project-scoped fixture records with the research records SQLite
 * owns. Only the project catalog survives hydration.
 */
const mapResearchData = (
  fixtureData: ClyRepositoryData,
  researchData: ResearchData,
): ClyRepositoryData => {
  const objectsById = new Map(
    researchData.objects.map((object) => [object.id, object]),
  );
  const relationships = researchData.relationships;

  const sources = researchData.objects
    .filter((object) => object.type === "source")
    .map((object) => {
      const source = sourceFromResearchObject(object);
      return {
        ...source,
        linkedClaimIds: relationships
          .filter(
            (relationship) =>
              relationship.fromObjectId === object.id &&
              objectsById.get(relationship.toObjectId)?.type === "claim",
          )
          .map((relationship) => relationship.toObjectId),
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
      supportingSourceIds: relationships
        .filter(
          (relationship) =>
            relationship.toObjectId === object.id &&
            relationship.type === "supports" &&
            objectsById.get(relationship.fromObjectId)?.type === "source",
        )
        .map((relationship) => relationship.fromObjectId),
      contradictingSourceIds: relationships
        .filter(
          (relationship) =>
            relationship.toObjectId === object.id &&
            relationship.type === "contradicts" &&
            objectsById.get(relationship.fromObjectId)?.type === "source",
        )
        .map((relationship) => relationship.fromObjectId),
      experimentIds: relationships
        .filter(
          (relationship) =>
            relationship.toObjectId === object.id &&
            relationship.type === "tests" &&
            objectsById.get(relationship.fromObjectId)?.type === "experiment",
        )
        .map((relationship) => relationship.fromObjectId),
      notebookIds: [],
      artifactIds: [],
      assumptions: [],
      weaknesses: [],
      reviewerRisks: [],
      nextExperiment: "Link evidence or design a test.",
      updatedAt: object.updatedAt,
    }));
  const experiments = researchData.objects
    .filter((object) => object.type === "experiment")
    .map((object) => ({
      id: object.id,
      name: object.title,
      goal: object.description || "Define the research goal.",
      hypothesis:
        object.payload.kind === "experiment"
          ? (object.payload.hypothesis ?? "To be specified")
          : "To be specified",
      type: "Custom" as const,
      status: "Planned" as const,
      command: "Not configured",
      environment: "Not captured",
      claimIds: relationships
        .filter(
          (relationship) =>
            relationship.fromObjectId === object.id &&
            relationship.type === "tests" &&
            objectsById.get(relationship.toObjectId)?.type === "claim",
        )
        .map((relationship) => relationship.toObjectId),
      dataset: "Not linked",
      limitations: [],
      nextStep: "Complete configuration",
      runIds: [],
      updatedAt: object.updatedAt,
    }));

  return {
    ...fixtureData,
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
    agentSessions: [],
    reports: [],
    activity: [],
    sources,
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
    })),
  };
};

const clearPersistedResearchData = (
  data: ClyRepositoryData,
): ClyRepositoryData => ({
  ...data,
  sources: [],
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
  agentSessions: [],
  graphNodes: [],
  graphEdges: [],
  reports: [],
  activity: [],
});

export const useClyStore = create<ClyState>((set, get) => ({
  data: initialData,
  fixtureMode: initialFixtureMode,
  activeProjectId: saved.activeProjectId ?? "project-cly",
  activeScreen: saved.activeScreen ?? "overview",
  selectedId: null,
  sidebarCollapsed: saved.sidebarCollapsed ?? false,
  inspectorOpen: saved.inspectorOpen ?? true,
  activityOpen: false,
  commandPaletteOpen: false,
  projectSwitcherOpen: false,
  fixtureSwitcherOpen: false,
  globalSearch: "",
  toasts: [],
  lineageSuggestions: [],
  lineageMeasurement: null,
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
  agentSessionLayouts: saved.agentSessionLayouts ?? {},

  setScreen: (activeScreen) => {
    set({ activeScreen, selectedId: null, commandPaletteOpen: false });
    persistUi({ activeScreen });
  },
  setSelected: (selectedId) =>
    set({ selectedId, inspectorOpen: selectedId ? true : get().inspectorOpen }),
  setActiveProject: (activeProjectId) => {
    if (activeProjectId === get().activeProjectId) {
      set({ projectSwitcherOpen: false, selectedId: null });
      return;
    }
    set((state) => ({
      activeProjectId,
      data: clearPersistedResearchData(state.data),
      lineageSuggestions: [],
      lineageMeasurement: null,
      projectSwitcherOpen: false,
      selectedId: null,
    }));
    persistUi({ activeProjectId });
    void get().loadFromApi(activeProjectId);
  },
  setFixtureMode: (fixtureMode) =>
    set({
      data: createFixtureRepository(fixtureMode),
      fixtureMode,
      selectedId: null,
      agentSessionsMode: "overview",
      selectedAgentSessionId: null,
      selectedOverviewSessionId: null,
      lineageSuggestions: [],
      lineageMeasurement: null,
      fixtureSwitcherOpen: false,
    }),
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
  loadFromApi: async (requestedProjectId) => {
    const projectId = requestedProjectId ?? get().activeProjectId;
    const project = get().data.projects.find((item) => item.id === projectId);
    if (!project) return false;
    try {
      await apiClient.ensureProject(project);
      const [researchData, lineageSuggestions] = await Promise.all([
        apiClient.fetchResearchData(projectId),
        // Lineage reconstruction is additive. Older or temporarily unavailable
        // APIs must not prevent hydration of the canonical research graph.
        apiClient.fetchLineageSuggestions(projectId).catch(() => []),
      ]);
      if (get().activeProjectId !== projectId) return false;
      set((state) => ({
        data: hydrateAgentSessionLayouts(
          mapResearchData(state.data, researchData),
          state.agentSessionLayouts,
        ),
        fixtureMode: "empty",
        lineageSuggestions,
        lineageMeasurement: null,
        selectedId: null,
      }));
      return true;
    } catch {
      // Keep the fixture repository intact when the Electron API is unavailable.
      return false;
    }
  },
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
      data: { ...state.data, graphEdges: [...state.data.graphEdges, edge] },
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
  createAgentSession: (input, open) => {
    const session = createNewAgentSession(input);
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
    const template = workbenchFixtureTabs().find((tab) => tab.type === type);
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
