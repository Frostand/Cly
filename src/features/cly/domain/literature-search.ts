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
  method: "keyword_overlap_v1";
  components: { titleMatchRatio: number; bodyMatchRatio: number };
  query: string;
  retrievedAt: string;
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
      return {
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
    })
    .filter((result) => result.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.source.title.localeCompare(right.source.title),
    );
}

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
