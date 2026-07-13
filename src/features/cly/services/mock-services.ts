import { extractLiteratureMetadata } from "../domain/literature-enrichment";
import {
  deterministicSemanticRanker,
  type LiteratureSearchResult,
  rankLiteratureWithRrf,
} from "../domain/literature-search";
import type {
  Claim,
  Experiment,
  NotebookArtifact,
  ResearchDecision,
  Source,
} from "../domain/types";
import { useClyStore } from "../store/cly-store";
import { apiClient } from "./api-client";
import type { ClyServices } from "./interfaces";

const id = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
const isoNow = () => new Date().toISOString();
const isExplicitDemoRuntime =
  import.meta.env.DEV && import.meta.env.VITE_CLY_DEMO_MODE === "1";

const ensureActiveProject = async () => {
  const state = useClyStore.getState();
  const project = state.data.projects.find(
    (item) => item.id === state.activeProjectId,
  );
  if (!project) throw new Error("Active research project was not found.");
  await apiClient.ensureProject(project);
  return project.id;
};

const stateForProject = (projectId: string) => {
  const state = useClyStore.getState();
  return state.activeProjectId === projectId ? state : null;
};

const activeProjectId = () => {
  const state = useClyStore.getState();
  if (
    !state.data.projects.some((project) => project.id === state.activeProjectId)
  ) {
    throw new Error("Active research project was not found.");
  }
  return state.activeProjectId;
};

export const mockServices: ClyServices = {
  projects: {
    async switchProject(projectId) {
      useClyStore.getState().setActiveProject(projectId);
    },
  },
  context: {
    async setIncluded(itemId, included) {
      useClyStore.getState().updateContextItem(itemId, { included });
    },
    async setPinned(itemId, pinned) {
      useClyStore.getState().updateContextItem(itemId, { pinned });
    },
    async setRepresentation(itemId, representation) {
      useClyStore.getState().updateContextItem(itemId, {
        representation,
        tokens: representation === "Summary" ? 1400 : 7200,
      });
    },
  },
  agents: {
    async savePreset(preset) {
      useClyStore.getState().addAgentPreset(preset);
      useClyStore
        .getState()
        .notify(
          "Agent preset saved",
          `${preset.nodes.length} roles · ${preset.usage} usage`,
        );
    },
    async startPreview(presetId) {
      const preset = useClyStore
        .getState()
        .data.agentPresets.find((item) => item.id === presetId);
      useClyStore
        .getState()
        .notify(
          "Execution preview ready",
          preset
            ? `${preset.name} would run ${preset.nodes.length} agents with approval gates.`
            : "Preset not found.",
        );
    },
  },
  experiments: {
    async create(input) {
      const projectId = await ensureActiveProject();
      const object = await apiClient.createObject(projectId, {
        type: "experiment",
        title: input.name,
        description: input.goal,
        payload: { kind: "experiment", hypothesis: "To be specified" },
      });
      const experiment: Experiment = {
        id: object.id,
        name: input.name,
        goal: input.goal,
        hypothesis: "To be specified",
        type: input.type,
        status: "Planned",
        command: "Not configured",
        environment: "Not captured",
        claimIds: [],
        dataset: "Not linked",
        limitations: [],
        nextStep: "Complete configuration",
        runIds: [],
        updatedAt: object.updatedAt,
      };
      stateForProject(projectId)?.addExperiment(experiment);
      return experiment;
    },
    async duplicate(experimentId) {
      const source = useClyStore
        .getState()
        .data.experiments.find((item) => item.id === experimentId);
      if (!source) throw new Error("Experiment not found");
      const duplicate = {
        ...source,
        id: "",
        name: `${source.name} · copy`,
        status: "Planned" as const,
        runIds: [],
        updatedAt: isoNow(),
      };
      const projectId = await ensureActiveProject();
      const object = await apiClient.createObject(projectId, {
        type: "experiment",
        title: duplicate.name,
        description: duplicate.goal,
        payload: {
          kind: "experiment",
          hypothesis: duplicate.hypothesis,
        },
      });
      const persistedDuplicate = {
        ...duplicate,
        id: object.id,
        updatedAt: object.updatedAt,
      };
      stateForProject(projectId)?.addExperiment(persistedDuplicate);
      return persistedDuplicate;
    },
  },
  literature: {
    async search(_project, query) {
      return rankLiteratureWithRrf(
        query,
        useClyStore.getState().data.sources,
        deterministicSemanticRanker,
      );
    },
  },
  sources: {
    async create(input) {
      const source: Source = {
        id: id("src"),
        title: input.title,
        authors: "Metadata pending",
        year: new Date().getFullYear(),
        type: input.type,
        status: "Needs metadata",
        relevance: "Medium",
        confidence: 0,
        summary: "Imported source awaiting extraction.",
        methods: [],
        findings: [],
        limitations: [],
        tags: [],
        linkedClaimIds: [],
        linkedExperimentIds: [],
        inNotebookBundle: false,
        path: "sources/imported",
        updatedAt: isoNow(),
      };
      const persistedSource = await useClyStore.getState().addSource(source);
      if (!persistedSource) throw new Error("Source was not saved.");
      return persistedSource;
    },
    async createFromSearch(result: LiteratureSearchResult) {
      const candidate: Source = {
        ...result.source,
        provenance: {
          provider: result.source.provider ?? "local-fixture",
          query: result.query,
          score: result.score,
          method: result.method,
          model: result.model,
          components: result.components,
          explanation: result.explanation,
          retrievedAt: result.retrievedAt,
        },
      };
      const persisted = await useClyStore.getState().addSource(candidate);
      if (!persisted) throw new Error("Source was not saved.");
      return persisted;
    },
    async addToNotebookBundle(sourceId) {
      useClyStore.getState().updateSource(sourceId, { inNotebookBundle: true });
    },
    async linkClaim(sourceId, claimId) {
      const projectId = activeProjectId();
      const relationship = await apiClient.createRelationship(projectId, {
        fromObjectId: sourceId,
        toObjectId: claimId,
        type: "supports",
      });
      const state = stateForProject(projectId);
      if (!state) return;
      const source = state.data.sources.find((item) => item.id === sourceId);
      const claim = state.data.claims.find((item) => item.id === claimId);
      if (source) {
        state.updateSource(sourceId, {
          linkedClaimIds: Array.from(
            new Set([...source.linkedClaimIds, claimId]),
          ),
        });
      }
      if (claim) {
        state.updateClaim(claimId, {
          supportingSourceIds: Array.from(
            new Set([...claim.supportingSourceIds, sourceId]),
          ),
        });
      }
      state.addGraphEdge({
        id: relationship.id,
        source: sourceId,
        target: claimId,
        relation: "supports",
        confidence: relationship.confidence,
        approved: relationship.reviewState === "approved",
      });
    },
    async enrich(sourceId) {
      const projectId = activeProjectId();
      const state = stateForProject(projectId);
      if (!state) throw new Error("Active research project changed.");
      const source = state.data.sources.find((item) => item.id === sourceId);
      if (!source) throw new Error("Source not found.");
      const enrichment = extractLiteratureMetadata(source);
      await apiClient.updateSource(projectId, sourceId, {
        description: enrichment.researchProblem,
        payload: {
          kind: "source",
          authors: source.authors.split(",").map((author) => author.trim()),
          citation: source.url ? undefined : source.title,
          url: source.url,
          doi: source.doi,
          provider: source.provider,
          providerId: source.providerId,
          methods: enrichment.methods,
          findings: enrichment.findings,
          limitations: enrichment.limitations,
          enrichmentMethod: enrichment.method,
          enrichedAt: enrichment.enrichedAt,
        },
      });
      const updated = {
        ...source,
        summary: enrichment.researchProblem,
        methods: enrichment.methods,
        findings: enrichment.findings,
        limitations: enrichment.limitations,
        updatedAt: enrichment.enrichedAt,
      };
      stateForProject(projectId)?.updateSource(sourceId, updated);
      return updated;
    },
  },
  notebooks: {
    async importMock(name) {
      const notebook: NotebookArtifact = {
        id: id("nb"),
        name,
        path: `notebooks/${name}`,
        title: name.replace(/\.ipynb$/, "").replaceAll("-", " "),
        status: "Needs review",
        executionConsistency: 0,
        reproducibility: "At risk",
        claimIds: [],
        codeCells: 24,
        outputs: 17,
        figures: 3,
        issues: ["Mock scan queued"],
        imports: ["numpy", "pandas"],
        outline: ["Imported notebook", "Analysis", "Results"],
        updatedAt: isoNow(),
      };
      useClyStore.getState().addNotebook(notebook);
      return notebook;
    },
  },
  claims: {
    async create(text) {
      const demoState = useClyStore.getState();
      if (isExplicitDemoRuntime) {
        const claim: Claim = {
          id: id("claim"),
          text,
          type: "Result",
          status: "Unsupported",
          confidence: 0,
          supportingSourceIds: [],
          contradictingSourceIds: [],
          experimentIds: [],
          notebookIds: [],
          artifactIds: [],
          assumptions: [],
          weaknesses: ["No evidence linked yet"],
          reviewerRisks: [],
          nextExperiment: "Link evidence or design a test.",
          updatedAt: isoNow(),
        };
        demoState.addClaim(claim);
        return claim;
      }
      const projectId = await ensureActiveProject();
      const object = await apiClient.createObject(projectId, {
        type: "claim",
        title: text,
        description: "",
        payload: {
          kind: "claim",
          status: "draft",
          reviewStatus: "Unsupported",
        },
      });
      const claim: Claim = {
        id: object.id,
        text,
        type: "Result",
        status: "Unsupported",
        confidence: 0,
        supportingSourceIds: [],
        contradictingSourceIds: [],
        experimentIds: [],
        notebookIds: [],
        artifactIds: [],
        assumptions: [],
        weaknesses: ["No evidence linked yet"],
        reviewerRisks: [],
        nextExperiment: "Link evidence or design a test.",
        updatedAt: object.updatedAt,
      };
      stateForProject(projectId)?.addClaim(claim);
      return claim;
    },
    async setStatus(claimId, status) {
      const projectId = activeProjectId();
      await apiClient.updateClaimStatus(projectId, claimId, status);
      stateForProject(projectId)?.updateClaim(claimId, {
        status,
        updatedAt: isoNow(),
      });
    },
    async linkExperiment(claimId, experimentId) {
      const projectId = activeProjectId();
      const state = stateForProject(projectId);
      if (!state) return;
      const claim = state.data.claims.find((item) => item.id === claimId);
      if (!claim) return;
      const experiment = state.data.experiments.find(
        (item) => item.id === experimentId,
      );
      if (!experiment) return;
      if (isExplicitDemoRuntime) {
        state.updateClaim(claimId, {
          experimentIds: Array.from(
            new Set([...claim.experimentIds, experimentId]),
          ),
        });
        state.updateExperiment(experimentId, {
          claimIds: Array.from(new Set([...experiment.claimIds, claimId])),
        });
        state.addGraphEdge({
          id: id("edge"),
          source: experimentId,
          target: claimId,
          relation: "tests",
          confidence: null,
          approved: false,
        });
        return;
      }
      const relationship = await apiClient.createRelationship(projectId, {
        fromObjectId: experimentId,
        toObjectId: claimId,
        type: "tests",
      });
      const currentState = stateForProject(projectId);
      if (!currentState) return;
      const currentClaim = currentState.data.claims.find(
        (item) => item.id === claimId,
      );
      const currentExperiment = currentState.data.experiments.find(
        (item) => item.id === experimentId,
      );
      if (!currentClaim || !currentExperiment) return;
      currentState.updateClaim(claimId, {
        experimentIds: Array.from(
          new Set([...currentClaim.experimentIds, experimentId]),
        ),
      });
      currentState.updateExperiment(experimentId, {
        claimIds: Array.from(new Set([...currentExperiment.claimIds, claimId])),
      });
      currentState.addGraphEdge({
        id: relationship.id,
        source: experimentId,
        target: claimId,
        relation: "tests",
        confidence: relationship.confidence,
        approved: relationship.reviewState === "approved",
      });
    },
  },
  graph: {
    async createRelationship(input) {
      const projectId = activeProjectId();
      const relationship = await apiClient.createRelationship(projectId, {
        fromObjectId: input.source,
        toObjectId: input.target,
        type: input.relation === "tests" ? "tests" : "uses",
      });
      const edge = {
        ...input,
        id: relationship.id,
        relation:
          relationship.type === "tests"
            ? ("tests" as const)
            : ("uses" as const),
        confidence: relationship.confidence,
        approved: relationship.reviewState === "approved",
      };
      stateForProject(projectId)?.addGraphEdge(edge);
      return edge;
    },
    async approveRelationship(edgeId) {
      const projectId = activeProjectId();
      const relationship = await apiClient.reviewRelationship(
        projectId,
        edgeId,
        { reviewState: "approved", confidence: null },
      );
      stateForProject(projectId)?.updateGraphEdge(edgeId, {
        approved: relationship.reviewState === "approved",
        confidence: relationship.confidence,
      });
    },
  },
  reproducibility: {
    async runAudit() {
      useClyStore
        .getState()
        .notify(
          "Simulated audit started",
          "16 integrity categories are being checked against the active fixture.",
        );
    },
    async resolveFinding(findingId) {
      useClyStore.getState().updateFinding(findingId, { status: "Resolved" });
    },
  },
  integrations: {
    async updateStatus(integrationId, status) {
      useClyStore.getState().updateIntegration(integrationId, { status });
    },
  },
  planner: {
    async setStatus(stepId, status) {
      useClyStore.getState().updateNextStep(stepId, status);
    },
  },
  decisions: {
    async create(input) {
      const decision: ResearchDecision = {
        id: id("decision"),
        title: input.title,
        date: new Date().toISOString().slice(0, 10),
        decision: input.decision,
        reason: input.reason,
        alternatives: [],
        evidenceIds: [],
        affectedIds: [],
        status: "Active",
        origin: "Researcher",
      };
      useClyStore.getState().addDecision(decision);
      return decision;
    },
    async supersede(decisionId, replacementId) {
      useClyStore.getState().updateDecision(decisionId, {
        status: "Superseded",
        supersededBy: replacementId,
      });
    },
  },
};
