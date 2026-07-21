import { searchArxiv } from "./arxiv.js";
import { searchCrossref } from "./crossref.js";
import { attachProviderCalls } from "./provider-runtime.js";
import { searchPubMed } from "./pubmed.js";
import { createLiteratureQueryPlan } from "./query-plan.js";
import { searchSemanticScholar } from "./semantic-scholar.js";

const normalizeDoi = (doi) =>
  doi?.toLowerCase().replace(/^https?:\/\/doi\.org\//, "");
const normalizeTitle = (title) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function deduplicatePapers(papers) {
  const seen = new Set();
  return papers.filter((paper) => {
    const key = normalizeDoi(paper.doi) || normalizeTitle(paper.title);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const providerFailure = (provider, error) => ({
  provider: error?.provider ?? provider,
  kind: error?.kind ?? "general",
  message:
    error instanceof Error ? error.message : `${provider} search failed.`,
  retryable: error?.retryable !== false,
  retryAfterMs: error?.retryAfterMs ?? null,
  action:
    error?.action ??
    "Retry the search or select a different literature provider.",
  providerCall: error?.providerCall ?? null,
  providerCalls:
    error?.providerCalls ?? (error?.providerCall ? [error.providerCall] : []),
});

const providerSets = {
  all: ["arxiv", "semantic-scholar", "crossref", "pubmed"],
  both: ["arxiv", "semantic-scholar"],
};

export async function searchLiteratureProviders(
  query,
  {
    limit = 25,
    provider = "both",
    arxivSearch = searchArxiv,
    semanticSearch = searchSemanticScholar,
    crossrefSearch = searchCrossref,
    pubmedSearch = searchPubMed,
  } = {},
) {
  const searches = {
    arxiv: arxivSearch,
    "semantic-scholar": semanticSearch,
    crossref: crossrefSearch,
    pubmed: pubmedSearch,
  };
  const retrievalPlan = createLiteratureQueryPlan(query);
  const selectedProviders = providerSets[provider] ?? [provider];
  const results = await Promise.allSettled(
    selectedProviders.map((providerId) =>
      searches[providerId](retrievalPlan.expandedQuery, { limit }),
    ),
  );
  const fulfilled = results.map((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  const papers = [];
  const candidateCount = Math.max(0, ...fulfilled.map((items) => items.length));
  for (let index = 0; index < candidateCount; index += 1) {
    for (const items of fulfilled) {
      if (items[index]) papers.push(items[index]);
    }
  }
  const failures = results.flatMap((result, index) =>
    result.status === "rejected"
      ? [providerFailure(selectedProviders[index], result.reason)]
      : [],
  );
  if (papers.length === 0) {
    const rejected = results.find((result) => result.status === "rejected");
    if (rejected) {
      rejected.reason.providerCalls = failures.flatMap(
        (failure) => failure.providerCalls,
      );
      throw rejected.reason;
    }
  }
  const deduplicated = deduplicatePapers(papers).slice(0, limit);
  deduplicated.providerFailures = failures;
  const output = attachProviderCalls(deduplicated, [
    ...results.flatMap((result) =>
      result.status === "fulfilled" ? (result.value.providerCalls ?? []) : [],
    ),
    ...failures.flatMap((failure) => failure.providerCalls),
  ]);
  Object.defineProperty(output, "retrievalPlan", {
    configurable: false,
    enumerable: false,
    value: retrievalPlan,
  });
  return output;
}
