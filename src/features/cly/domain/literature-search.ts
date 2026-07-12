import type { Source } from "./types";

export interface LiteraturePaper {
  id: string;
  provider: string;
  providerId: string;
  title: string;
  authors: string[];
  abstract: string;
  year?: number;
  url: string;
  doi?: string;
  tags: string[];
}

export interface LiteratureSearchResult {
  source: Source;
  score: number;
  explanation: string;
  method: string;
  components: Record<string, number>;
  query: string;
  retrievedAt: string;
}

export interface SemanticRankingSignal {
  sourceId: string;
  score: number;
  explanation: string;
}

export interface LiteratureSemanticRanker {
  method: string;
  rank(query: string, sources: Source[]): Promise<SemanticRankingSignal[]>;
}

export function sourceFromLiteraturePaper(paper: LiteraturePaper): Source {
  return {
    id: paper.id,
    title: paper.title,
    authors: paper.authors.join(", ") || "Unknown authors",
    year: paper.year ?? new Date().getFullYear(),
    type: "Paper",
    status: "Queued",
    relevance: "Medium",
    confidence: 0,
    summary: paper.abstract || "Abstract unavailable.",
    url: paper.url,
    doi: paper.doi,
    providerId: paper.providerId,
    provider: paper.provider,
    methods: [],
    findings: [],
    limitations: [],
    tags: paper.tags,
    linkedClaimIds: [],
    linkedExperimentIds: [],
    inNotebookBundle: false,
    path: `sources/${paper.provider}/${paper.providerId}`,
    updatedAt: new Date().toISOString(),
  };
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "in",
  "of",
  "the",
  "to",
  "with",
]);
const terms = (value: string) =>
  value
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9-]{1,}/g)
    ?.filter((term) => !STOP_WORDS.has(term)) ?? [];

/** Deterministic local ranking seam for the eventual cross-encoder adapter. */
export function rankLiterature(
  query: string,
  sources: Source[],
  retrievedAt = new Date().toISOString(),
): LiteratureSearchResult[] {
  const queryTerms = [...new Set(terms(query))];
  if (queryTerms.length === 0) return [];
  return sources
    .map((source) => {
      const titleTerms = new Set(terms(source.title));
      const bodyTerms = new Set(
        terms(
          [
            source.summary,
            ...source.methods,
            ...source.findings,
            ...source.tags,
          ].join(" "),
        ),
      );
      const titleMatches = queryTerms.filter((term) => titleTerms.has(term));
      const bodyMatches = queryTerms.filter((term) => bodyTerms.has(term));
      const score = Math.min(
        1,
        (titleMatches.length / queryTerms.length) * 0.65 +
          (bodyMatches.length / queryTerms.length) * 0.35,
      );
      const result: LiteratureSearchResult = {
        source,
        score,
        query,
        retrievedAt,
        method: "keyword_overlap_v1" as const,
        components: {
          titleMatchRatio: titleMatches.length / queryTerms.length,
          bodyMatchRatio: bodyMatches.length / queryTerms.length,
        },
        explanation:
          titleMatches.length || bodyMatches.length
            ? `Matched ${titleMatches.length} title term(s) and ${bodyMatches.length} abstract/method term(s).`
            : "No lexical match; retained for transparent empty-signal review.",
      };
      return result;
    })
    .filter((result) => result.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.source.title.localeCompare(right.source.title),
    );
}

const RRF_K = 60;

export async function rankLiteratureWithRrf(
  query: string,
  sources: Source[],
  semanticRanker: LiteratureSemanticRanker,
  retrievedAt = new Date().toISOString(),
): Promise<LiteratureSearchResult[]> {
  const keyword = rankLiterature(query, sources, retrievedAt);
  if (keyword.length === 0) return [];
  const semantic = await semanticRanker.rank(query, sources);
  const keywordRanks = new Map(
    keyword.map((result, index) => [result.source.id, index + 1]),
  );
  const semanticRanks = new Map(
    [...semantic]
      .sort((left, right) => right.score - left.score)
      .map((result, index) => [result.sourceId, index + 1]),
  );
  const semanticById = new Map(
    semantic.map((result) => [result.sourceId, result]),
  );
  const maxRrfScore = 2 / (RRF_K + 1);

  return sources
    .map((source) => {
      const keywordRank = keywordRanks.get(source.id);
      const semanticRank = semanticRanks.get(source.id);
      if (!keywordRank && !semanticRank) return null;
      const rawScore =
        (keywordRank ? 1 / (RRF_K + keywordRank) : 0) +
        (semanticRank ? 1 / (RRF_K + semanticRank) : 0);
      const result: LiteratureSearchResult = {
        source,
        score: rawScore / maxRrfScore,
        query,
        retrievedAt,
        method: `rrf:${semanticRanker.method}`,
        components: {
          keywordRank: keywordRank ?? 0,
          semanticRank: semanticRank ?? 0,
          rrfScore: rawScore,
        },
        explanation:
          `Combined keyword rank ${keywordRank ?? "not ranked"} and semantic rank ${semanticRank ?? "not ranked"} with Reciprocal Rank Fusion. ${semanticById.get(source.id)?.explanation ?? ""}`.trim(),
      };
      return result;
    })
    .filter((result): result is NonNullable<typeof result> => result !== null)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.source.title.localeCompare(right.source.title),
    );
}

export const deterministicSemanticRanker: LiteratureSemanticRanker = {
  method: "metadata_similarity_fixture_v1",
  async rank(query, sources) {
    const queryTerms = new Set(terms(query));
    return sources.map((source) => {
      const documentTerms = new Set(terms(`${source.title} ${source.summary}`));
      const intersection = [...queryTerms].filter((term) =>
        documentTerms.has(term),
      ).length;
      const union = new Set([...queryTerms, ...documentTerms]).size || 1;
      return {
        sourceId: source.id,
        score: intersection / union,
        explanation:
          "Deterministic metadata similarity fixture; no cross-encoder model was used.",
      };
    });
  },
};

export function findDuplicateSource(
  candidate: Source,
  sources: Source[],
): Source | undefined {
  const doi = candidate.doi
    ?.toLowerCase()
    .replace(/^https?:\/\/doi\.org\//, "");
  return sources.find((source) =>
    candidate.providerId && candidate.provider
      ? source.providerId === candidate.providerId &&
        source.provider === candidate.provider
      : doi
        ? source.doi?.toLowerCase().replace(/^https?:\/\/doi\.org\//, "") ===
          doi
        : Boolean(candidate.url && source.url === candidate.url),
  );
}
