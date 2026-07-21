import {
  createSignalSemanticRanker,
  deterministicSemanticRanker,
  rankLiteratureWithRrf,
  sourceFromLiteraturePaper,
} from "../domain/literature-search";
import { ApiRequestError, apiClient } from "./api-client";
import type { LiteratureService } from "./interfaces";

export type LiteratureSearchErrorKind =
  | "invalid_query"
  | "rate_limited"
  | "timeout"
  | "offline"
  | "provider_failure";

export interface LiteratureProviderFailure {
  provider: string;
  kind: string;
  message: string;
  retryable: boolean;
  retryAfterMs: number | null;
  action: string;
}

export class LiteratureSearchFailure extends Error {
  constructor(
    message: string,
    readonly kind: LiteratureSearchErrorKind,
    readonly details: {
      provider?: string;
      retryable: boolean;
      retryAfterMs?: number | null;
      action: string;
    } = {
      retryable: true,
      action: "Retry the search or choose a different literature provider.",
    },
  ) {
    super(message);
  }
}

export const desktopLiteratureService: LiteratureService = {
  async search(project, query) {
    if (!query.trim()) {
      throw new LiteratureSearchFailure(
        "Enter a research question before searching.",
        "invalid_query",
        {
          retryable: false,
          action: "Enter a topic, method, dataset, or research question.",
        },
      );
    }
    try {
      await apiClient.ensureProject(project);
      const response = await apiClient.searchLiterature(project.id, query);
      const semanticRanker =
        response.reranking.status === "completed" && response.reranking.method
          ? createSignalSemanticRanker(
              response.reranking.method,
              response.reranking.signals,
              response.reranking.model,
            )
          : deterministicSemanticRanker;
      const results = await rankLiteratureWithRrf(
        query,
        response.papers.map(sourceFromLiteraturePaper),
        semanticRanker,
      );
      for (const result of results) {
        result.providerCalls = response.providerCalls ?? [];
      }
      Object.defineProperty(results, "providerFailures", {
        configurable: false,
        enumerable: false,
        value: response.providerFailures ?? [],
      });
      Object.defineProperty(results, "providerCalls", {
        configurable: false,
        enumerable: false,
        value: response.providerCalls ?? [],
      });
      return results;
    } catch (error) {
      if (error instanceof ApiRequestError) {
        const kind: LiteratureSearchErrorKind =
          error.status === 429
            ? "rate_limited"
            : error.status === 504
              ? "timeout"
              : error.status === 502
                ? "provider_failure"
                : "offline";
        const details =
          error.details && typeof error.details === "object"
            ? (error.details as Record<string, unknown>)
            : {};
        throw new LiteratureSearchFailure(error.message, kind, {
          provider:
            typeof details.provider === "string" ? details.provider : undefined,
          retryable:
            typeof details.retryable === "boolean" ? details.retryable : true,
          retryAfterMs:
            typeof details.retryAfterMs === "number"
              ? details.retryAfterMs
              : null,
          action:
            typeof details.action === "string"
              ? details.action
              : "Retry the search or choose a different literature provider.",
        });
      }
      throw new LiteratureSearchFailure(
        error instanceof Error ? error.message : "Literature search failed.",
        "offline",
        {
          retryable: true,
          action: "Check the local service and network connection, then retry.",
        },
      );
    }
  },
};
