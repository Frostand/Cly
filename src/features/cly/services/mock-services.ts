import type {
  Claim,
  Experiment,
  NotebookArtifact,
  ResearchDecision,
  Source,
} from "../domain/types";
import { useClyStore } from "../store/cly-store";
import type { ClyServices } from "./interfaces";

const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}`;
const isoNow = () => new Date().toISOString();

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
      const experiment: Experiment = {
        id: id("exp"),
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
        updatedAt: isoNow(),
      };
      useClyStore.getState().addExperiment(experiment);
      return experiment;
    },
    async duplicate(experimentId) {
      const source = useClyStore
        .getState()
        .data.experiments.find((item) => item.id === experimentId);
      if (!source) throw new Error("Experiment not found");
      const duplicate = {
        ...source,
        id: id("exp"),
        name: `${source.name} · copy`,
        status: "Planned" as const,
        runIds: [],
        updatedAt: isoNow(),
      };
      useClyStore.getState().addExperiment(duplicate);
      return duplicate;
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
      useClyStore.getState().addSource(source);
      return source;
    },
    async addToNotebookBundle(sourceId) {
      useClyStore.getState().updateSource(sourceId, { inNotebookBundle: true });
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
      useClyStore.getState().addClaim(claim);
      return claim;
    },
    async setStatus(claimId, status) {
      useClyStore.getState().updateClaim(claimId, { status });
    },
    async linkExperiment(claimId, experimentId) {
      const claim = useClyStore
        .getState()
        .data.claims.find((item) => item.id === claimId);
      if (!claim) return;
      useClyStore.getState().updateClaim(claimId, {
        experimentIds: Array.from(
          new Set([...claim.experimentIds, experimentId]),
        ),
      });
    },
  },
  graph: {
    async createRelationship(input) {
      const edge = { ...input, id: id("edge") };
      useClyStore.getState().addGraphEdge(edge);
      return edge;
    },
    async approveRelationship(edgeId) {
      useClyStore.getState().updateGraphEdge(edgeId, { approved: true });
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
