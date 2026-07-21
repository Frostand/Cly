/**
 * Real SourceService backed by the research repository (SQLite/Drizzle).
 *
 * This is the first Phase 2 backend service. It implements the same
 * SourceService interface backed by the persisted research API.
 * through the existing research repository.
 *
 * Usage:
 *   const db = new DatabaseSync(projectDbPath);
 *   const repo = createResearchRepository(db);
 *   const sources = createRealSourceService(repo, projectId);
 */

import type { SourcePayload } from "../../research/domain/research-types";
import type { LiteratureSearchResult } from "../domain/literature-search";
import type { Source } from "../domain/types";
import type { SourceService } from "./interfaces";

/** Maps a persisted research object to the Cly UI Source type. */
function toClySource(row: {
  id: string;
  title: string;
  description: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}): Source {
  const payload = row.payload as unknown as SourcePayload;
  const typeBySourceType = {
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
    id: row.id,
    title: row.title,
    authors:
      payload.authors?.join(", ") ?? payload.citation ?? "Unknown authors",
    year: payload.year ?? new Date(row.createdAt).getFullYear(),
    type: typeBySourceType[payload.sourceType ?? "paper"],
    status: payload.status === "resolved" ? "Queued" : "Needs metadata",
    relevance: "Medium",
    confidence: 0,
    summary:
      payload.groundedSummary?.text ||
      row.description ||
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
    path: `sources/${row.id}`,
    updatedAt: row.updatedAt,
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
            retrievedAt: payload.retrievedAt ?? row.createdAt,
          }
        : undefined,
  };
}

interface ResearchRepo {
  createObject(input: {
    id?: string;
    projectId: string;
    type: string;
    title: string;
    description?: string;
    payload?: Record<string, unknown>;
  }): {
    id: string;
    title: string;
    description: string;
    payload: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
  };
  listProject(projectId: string): {
    objects: Array<{
      id: string;
      type: string;
      title: string;
      description: string;
      payload: Record<string, unknown>;
      createdAt: string;
      updatedAt: string;
    }>;
  };
}

export function createRealSourceService(
  repository: ResearchRepo,
  projectId: string,
): SourceService {
  return {
    async create(input) {
      const sourceTypeByKind = {
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
      >;
      const obj = repository.createObject({
        projectId,
        type: "source",
        title: input.title,
        payload: {
          kind: "source",
          sourceType: sourceTypeByKind[input.type],
          status: "placeholder",
        } satisfies SourcePayload,
      });
      return toClySource(obj);
    },

    async createFromSearch(result: LiteratureSearchResult) {
      const obj = repository.createObject({
        projectId,
        type: "source",
        title: result.source.title,
        description: result.source.summary,
        payload: {
          kind: "source",
          status: "resolved",
          authors: result.source.authors
            .split(",")
            .map((author) => author.trim())
            .filter(Boolean),
          year: result.source.year,
          url: result.source.url,
          doi: result.source.doi,
          providerId: result.source.providerId,
          provider: result.source.provider ?? "local-fixture",
          query: result.query,
          rankingScore: result.score,
          rankingMethod: result.method,
          rankingModel: result.model,
          rankingComponents: result.components,
          rankingExplanation: result.explanation,
          retrievedAt: result.retrievedAt,
        } satisfies SourcePayload,
      });
      return toClySource(obj);
    },

    async addToNotebookBundle(_id: string) {
      // Notebook bundling is a future feature.
      // For now this is tracked in-memory via the Cly store.
    },

    async linkClaim(_sourceId: string, _claimId: string) {
      throw new Error(
        "Claim linking requires the project relationship service boundary.",
      );
    },

    async enrich(_sourceId: string) {
      throw new Error("Enrichment requires the project research API boundary.");
    },

    async reviewField(_sourceId, _fieldId, _verificationState) {
      throw new Error(
        "Source review requires the project research API boundary.",
      );
    },
  };
}
