import { create } from "zustand";
import type {
  AgentPreset,
  Claim,
  ClaimStatus,
  ClyRepositoryData,
  ContextItem,
  Experiment,
  FixtureMode,
  GraphEdge,
  Integration,
  NotebookArtifact,
  ResearchDecision,
  ScreenId,
  Source,
} from "../domain/types";
import { createFixtureRepository } from "../fixtures/repository";

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
  updateContextItem: (id: string, patch: Partial<ContextItem>) => void;
  updateClaim: (id: string, patch: Partial<Claim>) => void;
  addClaim: (claim: Claim) => void;
  addSource: (source: Source) => void;
  updateSource: (id: string, patch: Partial<Source>) => void;
  addExperiment: (experiment: Experiment) => void;
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
}

let toastSequence = 0;

const persistUi = (partial: Record<string, unknown>) => {
  try {
    const current = JSON.parse(
      localStorage.getItem("cly-prototype-ui") ?? "{}",
    ) as Record<string, unknown>;
    localStorage.setItem(
      "cly-prototype-ui",
      JSON.stringify({ ...current, ...partial }),
    );
  } catch {
    // Browser storage is an optional convenience in this fixture phase.
  }
};

const loadUi = () => {
  try {
    return JSON.parse(
      localStorage.getItem("cly-prototype-ui") ?? "{}",
    ) as Partial<
      Pick<
        ClyState,
        | "activeScreen"
        | "sidebarCollapsed"
        | "inspectorOpen"
        | "activeProjectId"
      >
    >;
  } catch {
    return {};
  }
};

const saved = typeof localStorage === "undefined" ? {} : loadUi();

export const useClyStore = create<ClyState>((set, get) => ({
  data: createFixtureRepository("active"),
  fixtureMode: "active",
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

  setScreen: (activeScreen) => {
    set({ activeScreen, selectedId: null, commandPaletteOpen: false });
    persistUi({ activeScreen });
  },
  setSelected: (selectedId) =>
    set({ selectedId, inspectorOpen: selectedId ? true : get().inspectorOpen }),
  setActiveProject: (activeProjectId) => {
    set({ activeProjectId, projectSwitcherOpen: false, selectedId: null });
    persistUi({ activeProjectId });
  },
  setFixtureMode: (fixtureMode) =>
    set({
      data: createFixtureRepository(fixtureMode),
      fixtureMode,
      selectedId: null,
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
  addSource: (source) =>
    set((state) => ({
      data: { ...state.data, sources: [source, ...state.data.sources] },
    })),
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
}));

export const claimStatusTone = (status: ClaimStatus) =>
  status === "Strong" || status === "Paper-ready"
    ? "success"
    : status === "Weak" || status === "Unsupported" || status === "Invalidated"
      ? "danger"
      : status === "Needs review"
        ? "warning"
        : "info";
