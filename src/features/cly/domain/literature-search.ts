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
  pdfUrl?: string;
  fullTextStatus?:
    | "parsed"
    | "not_available"
    | "not_attempted_limit"
    | "download_failed"
    | "parse_failed";
  extraction?: StructuredLiteratureExtraction;
  pdfAcquisition?: {
    attempts: number;
    finalUrl?: string;
    redirects?: number;
  };
  pdfFailure?: {
    kind: string;
    message: string;
    retryable: boolean;
    retryAfterMs: number | null;
    action: string;
  };
}

export interface ExtractedLiteratureValue {
  value: string;
  passage: { quote: string; locator: string };
  confidence: number;
  verificationState: "unverified";
}

export interface StructuredLiteratureExtraction {
  hasFullText: boolean;
  fullTextStatus: string;
  extractedAt: string;
  method: string;
  researchProblem: ExtractedLiteratureValue | null;
  methods: ExtractedLiteratureValue[];
  datasets: ExtractedLiteratureValue[];
  evidence: ExtractedLiteratureValue[];
  limitations: ExtractedLiteratureValue[];
  reproducibility: ExtractedLiteratureValue[];
  contradictions: ExtractedLiteratureValue[];
}

export interface LiteratureSearchResult {
  source: Source;
  score: number;
  explanation: string;
  method: string;
  model?: string;
  components: Record<string, number>;
  query: string;
  retrievedAt: string;
  providerCalls?: LiteratureProviderCall[];
}

export interface LiteratureProviderCallAttempt {
  attempt: number;
  durationMs: number;
  outcome: string;
  retryAfterMs: number | null;
  status: number | null;
}

export interface LiteratureProviderCall {
  attempts: LiteratureProviderCallAttempt[];
  durationMs: number;
  operation: string;
  provider: string;
  status: "completed" | "failed";
}

export interface LiteratureSynthesis {
  method: "deterministic_ranked_passages_v1";
  query: string;
  sourceIds: string[];
  contradictorySourceIds: string[];
  text: string;
  rationale: string;
}

export type LiteratureRankedResults = LiteratureSearchResult[] & {
  synthesis?: LiteratureSynthesis;
};

export interface SemanticRankingSignal {
  sourceId: string;
  score: number;
  explanation: string;
}

export interface LiteratureSemanticRanker {
  method: string;
  model?: string;
  rank(query: string, sources: Source[]): Promise<SemanticRankingSignal[]>;
}

export function createSignalSemanticRanker(
  method: string,
  signals: Array<{ sourceId: string; score: number }>,
  model?: string,
): LiteratureSemanticRanker {
  return {
    method,
    model,
    async rank() {
      return signals.map((signal) => ({
        ...signal,
        explanation: `Scored jointly by ${method}.`,
      }));
    },
  };
}

export function sourceFromLiteraturePaper(paper: LiteraturePaper): Source {
  const extraction = paper.extraction;
  const extractedValues = extraction
    ? {
        researchProblem: extraction.researchProblem
          ? [extraction.researchProblem]
          : [],
        methods: extraction.methods,
        datasets: extraction.datasets,
        evidence: extraction.evidence,
        limitations: extraction.limitations,
        reproducibility: extraction.reproducibility,
        contradictions: extraction.contradictions,
      }
    : undefined;
  const extractedFields = extraction
    ? Object.fromEntries(
        [
          ["researchProblem", extraction.researchProblem],
          ["method", extraction.methods[0]],
          ["dataset", extraction.datasets[0]],
          ["evidence", extraction.evidence[0]],
          ["reproducibility", extraction.reproducibility[0]],
        ]
          .filter((entry): entry is [string, ExtractedLiteratureValue] =>
            Boolean(entry[1]),
          )
          .map(([key, item]) => [key, item]),
      )
    : undefined;
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
    methods: extraction?.methods.map((item) => item.value) ?? [],
    findings: extraction?.evidence.map((item) => item.value) ?? [],
    limitations: extraction?.limitations.map((item) => item.value) ?? [],
    tags: paper.tags,
    fullTextStatus: paper.fullTextStatus,
    pdfFailure: paper.pdfFailure,
    pdfAcquisition: paper.pdfAcquisition,
    extractedFields,
    extractedValues,
    contradictoryEvidence: extraction?.contradictions.map(
      (item) => item.passage,
    ),
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

const QUERY_EXPANSIONS: Record<string, string[]> = {
  benchmark: ["dataset", "evaluation"],
  calibration: ["reliability", "coverage", "uncertainty"],
  contradiction: ["contrary", "conflicting", "null-result"],
  reproducibility: ["replication", "code", "data", "protocol"],
  robust: ["distribution-shift", "resilient"],
};

const terms = (value: string) =>
  value
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9-]{1,}/g)
    ?.filter((term) => !STOP_WORDS.has(term)) ?? [];

export function expandLiteratureQuery(query: string) {
  const normalizedTerms = [...new Set(terms(query))];
  const expansionTerms = [
    ...new Set(normalizedTerms.flatMap((term) => QUERY_EXPANSIONS[term] ?? [])),
  ].filter((term) => !normalizedTerms.includes(term));
  return {
    normalizedQuery: normalizedTerms.join(" "),
    normalizedTerms,
    expansionTerms,
    expandedQuery: [...normalizedTerms, ...expansionTerms].join(" "),
    method: "deterministic_scientific_thesaurus_v1" as const,
  };
}

const deterministicEmbedding = (value: string) => {
  const vector = new Map<string, number>();
  const tokens = terms(value);
  for (const token of tokens) vector.set(`term:${token}`, 1);
  for (let index = 0; index + 1 < tokens.length; index += 1) {
    vector.set(`bigram:${tokens[index]}_${tokens[index + 1]}`, 0.5);
  }
  return vector;
};

const embeddingSimilarity = (
  left: Map<string, number>,
  right: Map<string, number>,
) => {
  const sharedDimensions = [...left.keys()].filter((key) => right.has(key));
  const dot = sharedDimensions.reduce(
    (sum, key) => sum + (left.get(key) ?? 0) * (right.get(key) ?? 0),
    0,
  );
  const norm = (vector: Map<string, number>) =>
    Math.sqrt([...vector.values()].reduce((sum, value) => sum + value ** 2, 0));
  return {
    score: dot / (norm(left) * norm(right) || 1),
    sharedDimensions,
  };
};

const matchRatio = (queryTerms: string[], values: string[]) => {
  const candidateTerms = new Set(terms(values.join(" ")));
  return (
    queryTerms.filter((term) => candidateTerms.has(term)).length /
    queryTerms.length
  );
};

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
      const topicFit = matchRatio(queryTerms, [source.title, source.summary]);
      const methodFit = matchRatio(queryTerms, source.methods);
      const datasetFit = matchRatio(queryTerms, [
        source.extractedFields?.dataset?.value ?? "",
        ...source.tags,
      ]);
      const evidenceFit = matchRatio(queryTerms, source.findings);
      const currentYear = new Date(retrievedAt).getUTCFullYear();
      const recency = Math.max(
        0,
        Math.min(1, 1 - (currentYear - source.year) / 15),
      );
      const availabilityText = `${source.summary} ${source.tags.join(" ")} ${source.extractedFields?.reproducibility?.value ?? ""}`;
      const codeDataAvailability =
        /\b(code|data|repository|github|artifact)\b/i.test(availabilityText)
          ? 1
          : 0;
      const reproducibility =
        /\b(reproduc|protocol|implementation|code|data available)\b/i.test(
          availabilityText,
        )
          ? 1
          : 0;
      const contradiction = source.contradictoryEvidence?.length ? 1 : 0;
      const lexical =
        (titleMatches.length / queryTerms.length) * 0.65 +
        (bodyMatches.length / queryTerms.length) * 0.35;
      const score = Math.min(
        1,
        lexical * 0.2 +
          topicFit * 0.25 +
          methodFit * 0.12 +
          datasetFit * 0.1 +
          evidenceFit * 0.13 +
          recency * 0.08 +
          codeDataAvailability * 0.05 +
          reproducibility * 0.04 +
          contradiction * 0.03,
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
          topicFit,
          methodFit,
          datasetFit,
          evidenceFit,
          recency,
          codeDataAvailability,
          reproducibility,
          contradiction,
        },
        explanation:
          titleMatches.length || bodyMatches.length
            ? `Matched ${titleMatches.length} title term(s) and ${bodyMatches.length} abstract/method term(s).`
            : "No lexical match; retained for transparent empty-signal review.",
      };
      return result;
    })
    .filter(
      (result) =>
        result.components.topicFit > 0 ||
        result.components.methodFit > 0 ||
        result.components.datasetFit > 0 ||
        result.components.evidenceFit > 0,
    )
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
): Promise<LiteratureRankedResults> {
  if (sources.length === 0) return [];
  const queryPlan = expandLiteratureQuery(query);
  const keyword = rankLiterature(queryPlan.expandedQuery, sources, retrievedAt);
  const sourceIds = new Set(sources.map((source) => source.id));
  const semantic = (
    await semanticRanker.rank(queryPlan.expandedQuery, sources)
  ).filter(
    (signal) =>
      sourceIds.has(signal.sourceId) &&
      Number.isFinite(signal.score) &&
      signal.score > 0,
  );
  if (keyword.length === 0 && semantic.length === 0) return [];
  const keywordRanks = new Map(
    keyword.map((result, index) => [result.source.id, index + 1]),
  );
  const keywordById = new Map(
    keyword.map((result) => [result.source.id, result]),
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

  const ranked = sources
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
        query: queryPlan.normalizedQuery,
        retrievedAt,
        method: `rrf:${semanticRanker.method}`,
        model: semanticRanker.model,
        components: {
          ...(keywordById.get(source.id)?.components ?? {}),
          keywordRank: keywordRank ?? 0,
          semanticRank: semanticRank ?? 0,
          semanticScore: semanticById.get(source.id)?.score ?? 0,
          rrfScore: rawScore,
        },
        explanation:
          `Normalized the query and expanded it with ${queryPlan.expansionTerms.length ? queryPlan.expansionTerms.join(", ") : "no additional terms"}. Keyword filtering produced rank ${keywordRank ?? "not ranked"}; embedding-style semantic filtering produced rank ${semanticRank ?? "not ranked"}. Combined both stages with Reciprocal Rank Fusion. Factors include topic, method, dataset, evidence, recency, code/data availability, reproducibility, and contradictory evidence. ${semanticById.get(source.id)?.explanation ?? ""}`.trim(),
      };
      return result;
    })
    .filter((result): result is NonNullable<typeof result> => result !== null)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.source.title.localeCompare(right.source.title),
    );
  Object.defineProperty(ranked, "synthesis", {
    configurable: false,
    enumerable: false,
    value: synthesizeLiteratureResults(queryPlan.normalizedQuery, ranked),
  });
  return ranked;
}

export const deterministicSemanticRanker: LiteratureSemanticRanker = {
  method: "deterministic_expanded_embedding_v1",
  async rank(query, sources) {
    const queryEmbedding = deterministicEmbedding(query);
    return sources.flatMap((source) => {
      const documentEmbedding = deterministicEmbedding(
        `${source.title} ${source.summary} ${source.methods.join(" ")} ${source.findings.join(" ")} ${source.tags.join(" ")}`,
      );
      const similarity = embeddingSimilarity(queryEmbedding, documentEmbedding);
      if (similarity.score <= 0) return [];
      return {
        sourceId: source.id,
        score: similarity.score,
        explanation: `Deterministic cosine similarity over named term/bigram dimensions; shared dimensions: ${similarity.sharedDimensions.join(", ") || "none"}.`,
      };
    });
  },
};

export function synthesizeLiteratureResults(
  query: string,
  results: LiteratureSearchResult[],
): LiteratureSynthesis {
  const selected = results.slice(0, 3);
  const contradictorySourceIds = selected
    .filter((result) => result.source.contradictoryEvidence?.length)
    .map((result) => result.source.id);
  return {
    method: "deterministic_ranked_passages_v1",
    query,
    sourceIds: selected.map((result) => result.source.id),
    contradictorySourceIds,
    text: selected.length
      ? `Top evidence for ${query}: ${selected.map((result) => `${result.source.title} — ${result.source.findings[0] ?? result.source.summary}`).join(" ")}`
      : `No evidence was retained for ${query}.`,
    rationale: `Synthesized the top ${selected.length} RRF-ranked source(s) and explicitly marked ${contradictorySourceIds.length} source(s) containing contradictory passages.`,
  };
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
