import type {
  AgentConfiguration,
  AgentConfigurationInput,
} from "../agent-sessions/types";
import { extractLiteratureMetadata } from "../domain/literature-enrichment";
import {
  deterministicSemanticRanker,
  type LiteratureSearchResult,
  rankLiteratureWithRrf,
} from "../domain/literature-search";
import { type LocalAnalysisResult, sha256Hex } from "../domain/local-analysis";
import { generateReproducibilityAudit } from "../domain/reproducibility-audit";
import type {
  Claim,
  Experiment,
  NotebookArtifact,
  ResearchDecision,
  Source,
} from "../domain/types";
import { useClyStore } from "../store/cly-store";
import { apiClient, nextStepFromPlannerRecommendation } from "./api-client";
import { CapabilityUnavailableError } from "./capabilities";
import type { ClyServices } from "./interfaces";
import {
  isClyExplicitTestFixtureRuntime,
  isClyTestFixtureRuntime,
} from "./runtime";

const id = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
const isoNow = () => new Date().toISOString();

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

const localActor = {
  actorId: "local-user",
  producerProcess: "cly-renderer",
  producerModel: null,
};

const refreshAgentContext = async (projectId: string) => {
  const snapshot = await apiClient.fetchAgentContext(projectId);
  useClyStore.getState().setAgentContextSnapshot(projectId, snapshot);
  return snapshot;
};

export const projectServices: ClyServices = {
  projects: {
    async switchProject(projectId) {
      useClyStore.getState().setActiveProject(projectId);
    },
    async update(patch) {
      return useClyStore.getState().updateActiveProject(patch);
    },
  },
  context: {
    async setIncluded(itemId, included) {
      if (isClyTestFixtureRuntime) {
        useClyStore.getState().updateContextItem(itemId, { included });
        return;
      }
      const projectId = activeProjectId();
      const snapshot = useClyStore.getState().agentContext;
      const pack = snapshot.packs[0];
      if (!pack)
        throw new Error(
          "Create a durable context pack before changing inclusion.",
        );
      const item = snapshot.items.find((candidate) => candidate.id === itemId);
      const revision = item?.approvedRevision;
      if (!item || !revision)
        throw new Error("Only an approved context revision can be selected.");
      const entries = included
        ? [
            ...pack.entries.map((entry) => ({
              itemId: entry.itemId,
              revisionId: entry.revisionId,
              representation: entry.representation,
              selectionReason: entry.selectionReason,
              sensitivity: entry.sensitivity,
            })),
            ...(!pack.entries.some((entry) => entry.itemId === itemId)
              ? [
                  {
                    itemId,
                    revisionId: revision.id,
                    representation: "raw" as const,
                    selectionReason: "Selected in Context Composer",
                    sensitivity: revision.sensitivity,
                  },
                ]
              : []),
          ]
        : pack.entries
            .filter((entry) => entry.itemId !== itemId)
            .map((entry) => ({
              itemId: entry.itemId,
              revisionId: entry.revisionId,
              representation: entry.representation,
              selectionReason: entry.selectionReason,
              sensitivity: entry.sensitivity,
            }));
      await apiClient.saveAgentContextPack(projectId, {
        id: pack.id,
        name: pack.name,
        configurationId: pack.configurationId,
        roleId: pack.roleId,
        expectedRevision: pack.revision,
        entries,
        actor: localActor,
      });
      await refreshAgentContext(projectId);
    },
    async setPinned(itemId, pinned) {
      if (isClyTestFixtureRuntime) {
        useClyStore.getState().updateContextItem(itemId, { pinned });
        return;
      }
      const projectId = activeProjectId();
      const item = useClyStore
        .getState()
        .agentContext.items.find((candidate) => candidate.id === itemId);
      if (!item) throw new Error("Context item was not found.");
      await apiClient.updateAgentContextLifecycle(
        projectId,
        itemId,
        pinned ? "pin" : "unpin",
        item.version,
        localActor,
      );
      await refreshAgentContext(projectId);
    },
    async setRepresentation(itemId, representation) {
      if (isClyTestFixtureRuntime) {
        useClyStore.getState().updateContextItem(itemId, {
          representation,
          tokens: representation === "Summary" ? 1400 : 7200,
        });
        return;
      }
      const projectId = activeProjectId();
      const snapshot = useClyStore.getState().agentContext;
      const pack = snapshot.packs.find((candidate) =>
        candidate.entries.some((entry) => entry.itemId === itemId),
      );
      if (!pack) throw new Error("Context item is not selected in a pack.");
      await apiClient.saveAgentContextPack(projectId, {
        id: pack.id,
        name: pack.name,
        configurationId: pack.configurationId,
        roleId: pack.roleId,
        expectedRevision: pack.revision,
        entries: pack.entries.map((entry) => ({
          itemId: entry.itemId,
          revisionId: entry.revisionId,
          representation:
            entry.itemId === itemId
              ? representation === "Summary"
                ? "summary"
                : "raw"
              : entry.representation,
          selectionReason: entry.selectionReason,
          sensitivity: entry.sensitivity,
        })),
        actor: localActor,
      });
      await refreshAgentContext(projectId);
    },
    async hydrate(projectId) {
      return refreshAgentContext(projectId);
    },
    async proposeRevision(projectId, itemId, expectedVersion, revision, actor) {
      const item = await apiClient.proposeAgentContextRevision(
        projectId,
        itemId,
        { expectedVersion, revision, actor },
      );
      await refreshAgentContext(projectId);
      return item;
    },
    async approveRevision(
      projectId,
      itemId,
      revisionId,
      expectedVersion,
      actor,
    ) {
      const item = await apiClient.approveAgentContextRevision(
        projectId,
        itemId,
        revisionId,
        expectedVersion,
        actor,
      );
      await refreshAgentContext(projectId);
      return item;
    },
    async setLifecycle(projectId, itemId, action, expectedVersion, actor) {
      const item = await apiClient.updateAgentContextLifecycle(
        projectId,
        itemId,
        action,
        expectedVersion,
        actor,
      );
      await refreshAgentContext(projectId);
      return item;
    },
    async savePack(projectId, input) {
      const pack = await apiClient.saveAgentContextPack(projectId, input);
      await refreshAgentContext(projectId);
      return pack;
    },
    preview(projectId, input) {
      return apiClient.previewAgentContextManifest(projectId, input);
    },
    async persist(projectId, input) {
      const manifest = await apiClient.persistAgentContextManifest(
        projectId,
        input,
      );
      await refreshAgentContext(projectId);
      return manifest;
    },
    createTransmissionApproval(projectId, input) {
      return apiClient.createAgentContextTransmissionApproval(projectId, input);
    },
    revokeTransmissionApproval(projectId, approvalId, input) {
      return apiClient.revokeAgentContextTransmissionApproval(
        projectId,
        approvalId,
        input,
      );
    },
  },
  agents: {
    async savePreset(preset) {
      if (isClyTestFixtureRuntime) {
        useClyStore.getState().addAgentPreset(preset);
        return;
      }
      throw new CapabilityUnavailableError("agents.configure");
    },
    async startPreview(presetId) {
      if (isClyTestFixtureRuntime) {
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
        return;
      }
      throw new CapabilityUnavailableError("agents.execute");
    },
    async listConfigurations(projectId) {
      return apiClient.fetchAgentConfigurations(projectId);
    },
    async saveConfiguration(projectId, configuration) {
      const input: AgentConfigurationInput = {
        name: configuration.name,
        maxParallel: configuration.maxParallel,
        maxTotalBudget: configuration.maxTotalBudget,
        partialFailurePolicy: configuration.partialFailurePolicy,
        roles: configuration.roles,
      };
      const persisted =
        "revision" in configuration && "id" in configuration
          ? await apiClient.updateAgentConfiguration(
              projectId,
              configuration.id,
              configuration.revision,
              input,
            )
          : await apiClient.createAgentConfiguration(projectId, input);
      stateForProject(projectId)?.setAgentConfigurations([
        ...(stateForProject(projectId)?.data.agentConfigurations ?? []).filter(
          (item: AgentConfiguration) => item.id !== persisted.id,
        ),
        persisted,
      ]);
      return persisted;
    },
    async removeConfiguration(projectId, configurationId, expectedRevision) {
      await apiClient.removeAgentConfiguration(
        projectId,
        configurationId,
        expectedRevision,
      );
      const state = stateForProject(projectId);
      state?.setAgentConfigurations(
        (state.data.agentConfigurations ?? []).filter(
          (item) => item.id !== configurationId,
        ),
      );
    },
    async estimateConfiguration(projectId, configurationId, configuration) {
      return apiClient.estimateAgentConfiguration(
        projectId,
        configurationId,
        configuration,
      );
    },
  },
  experiments: {
    async create(input) {
      const projectId = await ensureActiveProject();
      const object = await apiClient.createExperiment(projectId, {
        title: input.name,
        description: input.goal,
        definition: {
          hypothesis: input.hypothesis?.trim() || "To be specified",
          objective: input.goal,
          configuration: { experimentType: input.type },
        },
      });
      const experiment: Experiment = {
        id: object.id,
        name: input.name,
        goal: input.goal,
        hypothesis: input.hypothesis?.trim() || "To be specified",
        type: input.type,
        status: "Planned",
        command: "Not configured",
        environment: "Not captured",
        claimIds: [],
        dataset: "Not linked",
        limitations: [],
        nextStep: "Complete configuration",
        runIds: [],
        updatedAt: object.definition.createdAt,
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
      const object = await apiClient.createExperiment(projectId, {
        title: duplicate.name,
        description: duplicate.goal,
        definition: {
          hypothesis: duplicate.hypothesis,
          objective: duplicate.goal,
          configuration: { experimentType: duplicate.type },
        },
      });
      const persistedDuplicate = {
        ...duplicate,
        id: object.id,
        updatedAt: object.definition.createdAt,
      };
      stateForProject(projectId)?.addExperiment(persistedDuplicate);
      return persistedDuplicate;
    },
    async recordLocalAnalysis(input) {
      if (isClyExplicitTestFixtureRuntime) {
        throw new Error(
          "Dataset execution is unavailable in the automated fixture service. Use the production local-analysis workflow.",
        );
      }
      const projectId = await ensureActiveProject();
      const state = stateForProject(projectId);
      const experiment = state?.data.experiments.find(
        (item) => item.id === input.experimentId,
      );
      if (!experiment) throw new Error("Experiment not found.");
      const source = state?.data.sources.find(
        (item) => item.id === input.datasetSourceId,
      );
      if (!source || source.type !== "Dataset")
        throw new Error("The imported dataset source was not found.");

      const result: LocalAnalysisResult = input.result;
      const engineHash = await sha256Hex(result.engineVersion);
      const datasets = [
        {
          id: input.datasetSourceId,
          version: input.datasetHash.slice(0, 12),
          contentHash: input.datasetHash,
          uri: input.datasetFileName,
        },
      ];
      const configuration: Record<string, unknown> = {
        experimentType: "Statistical analysis",
        analysisTask: result.task,
        outcome: result.outcome,
        predictors: result.predictors.join(", "),
        folds: result.folds,
        seed: result.seed,
        rowsUsed: result.rowsUsed,
        rowsExcluded: result.rowsExcluded,
        engineVersion: `${result.engineVersion}@sha256:${engineHash}`,
        datasetFile: input.datasetFileName,
        datasetHash: input.datasetHash,
        coefficientSummary: result.coefficients
          .slice(0, 8)
          .map((item) => `${item.feature}=${item.value}`)
          .join("; "),
        warnings: result.warnings.join(" | "),
      };
      await apiClient.reviseExperimentDefinition(
        projectId,
        input.experimentId,
        {
          hypothesis: experiment.hypothesis,
          objective: experiment.goal,
          configuration,
          datasets,
          declaredMetrics: Object.keys(result.metrics),
        },
      );
      const run = await apiClient.createExperimentRun(
        projectId,
        input.experimentId,
        {
          title: `${experiment.name} · local cross-validation`,
          description: result.conclusion,
          status: "running",
          commitSha: engineHash,
          configuration,
          datasets,
          codeRefs: [
            {
              path: `builtin://${result.engineVersion}`,
              contentHash: engineHash,
            },
          ],
          startedAt: isoNow(),
        },
      );
      await apiClient.logExperimentRunMetrics(
        projectId,
        run.id,
        Object.entries(result.metrics)
          .filter(([, value]) => Number.isFinite(value))
          .map(([name, value]) => ({ name, value })),
      );
      const resultJson = JSON.stringify(result, null, 2);
      await apiClient.registerExperimentRunArtifact(projectId, run.id, {
        title: "Local analysis summary",
        description: `${result.conclusion} Limitations: ${result.warnings.join(" ")}`,
        kind: "file",
        path: `cly://analysis/${run.id}/summary.json`,
        mediaType: "application/json",
        contentHash: await sha256Hex(resultJson),
        generatorPath: `builtin://${result.engineVersion}`,
        generatorHash: engineHash,
      });
      await apiClient.updateExperimentRunStatus(projectId, run.id, {
        status: "completed",
        finishedAt: isoNow(),
        exitCode: 0,
      });

      const claim = await projectServices.claims.create(
        `${result.conclusion} Predictors: ${result.predictors.join(", ")}; outcome: ${result.outcome}.`,
      );
      await projectServices.claims.linkExperiment(claim.id, input.experimentId);
      await projectServices.claims.linkEvidence(
        claim.id,
        input.datasetSourceId,
        "supports",
        { quote: result.conclusion, origin: "system" },
      );
      const exceedsBaseline =
        result.task === "classification"
          ? (result.metrics.auc ?? 0.5) >= 0.6 &&
            (result.metrics.accuracy ?? 0) >
              (result.metrics.baselineAccuracy ?? 1)
          : (result.metrics.r2 ?? 0) > 0.1 &&
            (result.metrics.rmse ?? Number.POSITIVE_INFINITY) <
              (result.metrics.baselineRmse ?? 0);
      await projectServices.claims.setStatus(
        claim.id,
        exceedsBaseline ? "Medium" : "Needs review",
      );
      await useClyStore.getState().loadFromApi(projectId);
      return { runId: run.id, claimId: claim.id };
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
        authors: input.authors ?? "Metadata pending",
        year: input.year ?? new Date().getFullYear(),
        type: input.type,
        status: "Needs metadata",
        relevance: "Medium",
        confidence: 0,
        summary: input.summary ?? "Imported source awaiting extraction.",
        url: input.url,
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
          providerCalls: result.providerCalls,
        },
      };
      const persisted = await useClyStore.getState().addSource(candidate);
      if (!persisted) throw new Error("Source was not saved.");
      return persisted;
    },
    async addToNotebookBundle(sourceId) {
      if (isClyTestFixtureRuntime) {
        useClyStore
          .getState()
          .updateSource(sourceId, { inNotebookBundle: true });
        return;
      }
      throw new CapabilityUnavailableError("exports.notebook-bundle");
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
    async setArchived(sourceId, archived) {
      const projectId = activeProjectId();
      const object = await apiClient.setSourceArchived(
        projectId,
        sourceId,
        archived,
      );
      const source = stateForProject(projectId)?.data.sources.find(
        (item) => item.id === sourceId,
      );
      if (!source) throw new Error("Source not found.");
      const updated = { ...source, archived, updatedAt: object.updatedAt };
      stateForProject(projectId)?.updateSource(sourceId, updated);
      return updated;
    },
    async reviewField(sourceId, fieldId, verificationState) {
      const projectId = activeProjectId();
      const state = stateForProject(projectId);
      if (!state) throw new Error("Active research project changed.");
      const source = state.data.sources.find((item) => item.id === sourceId);
      const field = source?.extractedFields?.[fieldId];
      if (!source || !field) {
        throw new Error("The extracted field or its evidence is unavailable.");
      }
      const updated: Source = {
        ...source,
        extractedFields: {
          ...source.extractedFields,
          [fieldId]: {
            ...field,
            verificationState,
            verifiedBy: "local-user",
            verifiedAt: isoNow(),
          },
        },
        updatedAt: isoNow(),
      };
      await apiClient.updateSource(projectId, sourceId, {
        description: source.summary,
        payload: { extractedFields: updated.extractedFields },
      });
      stateForProject(projectId)?.updateSource(sourceId, updated);
      return updated;
    },
  },
  notebooks: {
    async importMock(name) {
      if (isClyTestFixtureRuntime) {
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
      }
      throw new CapabilityUnavailableError("notebooks.import");
    },
  },
  claims: {
    async create(text) {
      const fixtureState = useClyStore.getState();
      if (isClyExplicitTestFixtureRuntime) {
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
        fixtureState.addClaim(claim);
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
      if (isClyExplicitTestFixtureRuntime) {
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
    async linkEvidence(claimId, sourceId, type, passage) {
      const projectId = activeProjectId();
      const state = stateForProject(projectId);
      if (!state) return;
      const claim = state.data.claims.find((item) => item.id === claimId);
      const source = state.data.sources.find((item) => item.id === sourceId);
      if (!claim || !source) throw new Error("Claim or source not found.");
      const fixtureEvidenceId = isClyExplicitTestFixtureRuntime
        ? id("evidence")
        : null;
      const result = isClyExplicitTestFixtureRuntime
        ? {
            duplicate: false,
            evidence: {
              id: fixtureEvidenceId ?? "",
              payload: {
                kind: "evidence" as const,
                sourceId,
                quote: passage.quote,
                locator: passage.locator,
                contentHash: "test-fixture",
                verificationState: "unverified" as const,
              },
              origin: passage.origin ?? ("human" as const),
              reviewedBy: null,
              reviewedAt: null,
              version: 1,
              createdAt: isoNow(),
              updatedAt: isoNow(),
            },
            containsRelationship: {
              id: id("edge"),
              fromObjectId: sourceId,
              toObjectId: fixtureEvidenceId ?? "",
              type: "contains" as const,
              confidence: null,
              origin: passage.origin ?? ("human" as const),
              reviewState: "unreviewed" as const,
              reviewedBy: null,
              reviewedAt: null,
              version: 1,
              createdAt: isoNow(),
            },
            claimRelationship: {
              id: id("edge"),
              fromObjectId: fixtureEvidenceId ?? "",
              toObjectId: claimId,
              type,
              confidence: passage.confidence ?? null,
              origin: passage.origin ?? ("human" as const),
              reviewState: "unreviewed" as const,
              reviewedBy: null,
              reviewedAt: null,
              version: 1,
              createdAt: isoNow(),
            },
          }
        : await apiClient.createEvidenceLink(projectId, {
            sourceId,
            claimId,
            quote: passage.quote,
            locator: passage.locator,
            type,
            origin: passage.origin,
            confidence: passage.confidence,
          });
      const currentState = stateForProject(projectId);
      if (!currentState) return;
      const currentClaim = currentState.data.claims.find(
        (item) => item.id === claimId,
      );
      const currentSource = currentState.data.sources.find(
        (item) => item.id === sourceId,
      );
      if (!currentClaim || !currentSource) return;
      currentState.updateSource(sourceId, {
        linkedClaimIds: Array.from(
          new Set([...currentSource.linkedClaimIds, claimId]),
        ),
      });
      currentState.updateClaim(claimId, {
        supportingSourceIds:
          type === "supports"
            ? Array.from(
                new Set([...currentClaim.supportingSourceIds, sourceId]),
              )
            : currentClaim.supportingSourceIds,
        contradictingSourceIds:
          type === "contradicts"
            ? Array.from(
                new Set([...currentClaim.contradictingSourceIds, sourceId]),
              )
            : currentClaim.contradictingSourceIds,
        updatedAt: isoNow(),
      });
      currentState.addEvidencePassage({
        id: result.evidence.id,
        sourceId: result.evidence.payload.sourceId,
        quote: result.evidence.payload.quote,
        locator: result.evidence.payload.locator,
        contentHash: result.evidence.payload.contentHash,
        verificationState: result.evidence.payload.verificationState,
        origin: result.evidence.origin,
        reviewedBy: result.evidence.reviewedBy,
        reviewedAt: result.evidence.reviewedAt,
        version: result.evidence.version,
        createdAt: result.evidence.createdAt,
        updatedAt: result.evidence.updatedAt,
      });
      currentState.addGraphEdge({
        id: result.containsRelationship.id,
        source: sourceId,
        target: result.evidence.id,
        relation: "contains",
        confidence: null,
        approved: false,
        origin: result.containsRelationship.origin,
        reviewState: result.containsRelationship.reviewState,
        reviewedBy: result.containsRelationship.reviewedBy,
        reviewedAt: result.containsRelationship.reviewedAt,
        version: result.containsRelationship.version,
        createdAt: result.containsRelationship.createdAt,
      });
      currentState.addGraphEdge({
        id: result.claimRelationship.id,
        source: result.evidence.id,
        target: claimId,
        relation: type,
        confidence: result.claimRelationship.confidence,
        approved: result.claimRelationship.reviewState === "approved",
        origin: result.claimRelationship.origin,
        reviewState: result.claimRelationship.reviewState,
        reviewedBy: result.claimRelationship.reviewedBy,
        reviewedAt: result.claimRelationship.reviewedAt,
        version: result.claimRelationship.version,
        createdAt: result.claimRelationship.createdAt,
      });
    },
    async reviewEvidenceRelationship(relationshipId, reviewState, confidence) {
      const projectId = activeProjectId();
      const relationship = await apiClient.reviewRelationship(
        projectId,
        relationshipId,
        { reviewState, confidence },
      );
      stateForProject(projectId)?.updateGraphEdge(relationshipId, {
        approved: relationship.reviewState === "approved",
        reviewState: relationship.reviewState,
        confidence: relationship.confidence,
        reviewedBy: relationship.reviewedBy,
        reviewedAt: relationship.reviewedAt,
        version: relationship.version,
      });
    },
    async verifyEvidencePassage(evidenceId, verificationState) {
      const projectId = activeProjectId();
      const evidence = await apiClient.reviewEvidence(
        projectId,
        evidenceId,
        verificationState,
      );
      stateForProject(projectId)?.updateEvidencePassage(evidenceId, {
        verificationState: evidence.payload.verificationState,
        reviewedBy: evidence.reviewedBy,
        reviewedAt: evidence.reviewedAt,
        version: evidence.version,
        updatedAt: evidence.updatedAt,
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
      if (isClyTestFixtureRuntime) {
        const state = useClyStore.getState();
        const generated = generateReproducibilityAudit(state.data);
        state.replaceReproducibilityAudit(generated.audit, generated.findings);
        state.notify(
          "Reproducibility audit complete",
          `${generated.findings.filter((finding) => finding.severity !== "Passed").length} findings across code, data, environment, experiments, outputs, and claims.`,
        );
        return generated.audit;
      }
      const projectId = await ensureActiveProject();
      const report = await apiClient.runReproducibilityAudit(projectId);
      stateForProject(projectId)?.replaceReproducibilityAudit(
        report.audit,
        report.findings,
      );
      stateForProject(projectId)?.notify(
        "Reproducibility audit complete",
        `${report.audit.summary?.blockingIssueIds.length ?? 0} blockers, ${report.audit.summary?.missingRequirementCount ?? 0} missing requirements, and ${report.audit.summary?.failedCheckCount ?? 0} failed checks.`,
      );
      return report.audit;
    },
    async resolveFinding(findingId) {
      if (isClyTestFixtureRuntime) {
        useClyStore.getState().updateFinding(findingId, { status: "Resolved" });
        return;
      }
      const projectId = await ensureActiveProject();
      const state = stateForProject(projectId);
      const audit = state?.data.audits[0];
      if (!audit) throw new Error("Run a reproducibility audit first.");
      const finding = await apiClient.resolveReproducibilityFinding(
        projectId,
        audit.id,
        findingId,
      );
      state?.updateFinding(findingId, { status: finding.status });
    },
    async setFindingDisposition(findingId, input) {
      if (isClyTestFixtureRuntime) {
        useClyStore.getState().updateFinding(findingId, input);
        return;
      }
      if (input.status === "Resolved") {
        await this.resolveFinding(findingId);
        return;
      }
      throw new CapabilityUnavailableError("reproducibility.audit");
    },
  },
  integrations: {
    async updateStatus(integrationId, status) {
      if (isClyTestFixtureRuntime) {
        useClyStore.getState().updateIntegration(integrationId, { status });
        return;
      }
      throw new CapabilityUnavailableError("integrations.configure");
    },
  },
  planner: {
    async generate(seed) {
      if (isClyTestFixtureRuntime) {
        if (seed) useClyStore.getState().replaceNextSteps(seed);
        return seed ?? useClyStore.getState().data.nextSteps;
      }
      const projectId = await ensureActiveProject();
      const result = await apiClient.generateNextSteps(projectId);
      const steps = result.recommendations.map(
        nextStepFromPlannerRecommendation,
      );
      useClyStore.getState().replaceNextSteps(steps);
      return steps;
    },
    async setStatus(stepId, status, reason) {
      if (isClyTestFixtureRuntime) {
        if (status === "Recommended") {
          useClyStore
            .getState()
            .replaceNextSteps(
              useClyStore
                .getState()
                .data.nextSteps.map((step) =>
                  step.id === stepId ? { ...step, status } : step,
                ),
            );
          return;
        }
        useClyStore.getState().updateNextStep(stepId, status);
        return;
      }
      if (status === "Recommended") {
        throw new Error(
          "A reviewed recommendation cannot return to draft state.",
        );
      }
      if (status === "In progress") {
        throw new Error(
          "Starting work requires a separate, explicit execution approval.",
        );
      }
      const projectId = activeProjectId();
      const action = {
        Accepted: "accept",
        Deferred: "defer",
        Dismissed: "dismiss",
      }[status] as "accept" | "defer" | "dismiss";
      if (action !== "accept" && !reason?.trim()) {
        throw new Error(
          `${action === "defer" ? "Deferring" : "Dismissing"} a recommendation requires a reason.`,
        );
      }
      const result = await apiClient.reviewNextStep(
        projectId,
        stepId,
        action === "accept"
          ? { action }
          : {
              action,
              reason: reason?.trim() ?? "",
            },
      );
      useClyStore
        .getState()
        .updateNextStep(
          stepId,
          nextStepFromPlannerRecommendation(result.recommendation).status as
            | "Accepted"
            | "Deferred"
            | "Dismissed",
        );
    },
    async edit(stepId, edit, reason) {
      if (isClyTestFixtureRuntime) {
        const current = useClyStore
          .getState()
          .data.nextSteps.find((step) => step.id === stepId);
        if (!current) throw new Error("Recommendation was not found.");
        useClyStore
          .getState()
          .replaceNextSteps(
            useClyStore
              .getState()
              .data.nextSteps.map((step) =>
                step.id === stepId ? { ...step, ...edit } : step,
              ),
          );
        return { ...current, ...edit };
      }
      const projectId = activeProjectId();
      const result = await apiClient.reviewNextStep(projectId, stepId, {
        action: "edit",
        edit,
        reason,
      });
      const step = nextStepFromPlannerRecommendation(result.recommendation);
      useClyStore
        .getState()
        .replaceNextSteps(
          useClyStore
            .getState()
            .data.nextSteps.map((item) => (item.id === stepId ? step : item)),
        );
      return step;
    },
  },
  decisions: {
    async create(input) {
      if (isClyTestFixtureRuntime) {
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
      }
      throw new CapabilityUnavailableError("decisions.create");
    },
    async update(decisionId, input) {
      if (isClyTestFixtureRuntime) {
        useClyStore.getState().updateDecision(decisionId, input);
        const updated = useClyStore
          .getState()
          .data.decisions.find((item) => item.id === decisionId);
        if (!updated) throw new Error("Decision was not found.");
        return updated;
      }
      throw new CapabilityUnavailableError("decisions.create");
    },
    async supersede(decisionId, replacement) {
      if (isClyTestFixtureRuntime) {
        const replacementId =
          typeof replacement === "string"
            ? replacement
            : (await this.create(replacement)).id;
        useClyStore.getState().updateDecision(decisionId, {
          status: "Superseded",
          supersededBy: replacementId,
        });
        const item = useClyStore
          .getState()
          .data.decisions.find((decision) => decision.id === replacementId);
        if (!item) throw new Error("Replacement decision was not found.");
        return item;
      }
      throw new CapabilityUnavailableError("decisions.create");
    },
  },
};
