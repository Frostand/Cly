import {
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

export class LiteratureSearchFailure extends Error {
  constructor(
    message: string,
    readonly kind: LiteratureSearchErrorKind,
  ) {
    super(message);
  }
}

export const desktopLiteratureService: LiteratureService = {
  async search(projectId, query) {
    if (!query.trim()) {
      throw new LiteratureSearchFailure(
        "Enter a research question before searching.",
        "invalid_query",
      );
    }
    try {
      const response = await apiClient.searchLiterature(projectId, query);
      return rankLiteratureWithRrf(
        query,
        response.papers.map(sourceFromLiteraturePaper),
        deterministicSemanticRanker,
      );
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
        throw new LiteratureSearchFailure(error.message, kind);
      }
      throw new LiteratureSearchFailure(
        error instanceof Error ? error.message : "Literature search failed.",
        "offline",
      );
    }
  },
};
