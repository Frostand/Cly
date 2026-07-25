import {
  attachProviderCalls,
  requestLiteratureProvider,
} from "./provider-runtime.js";
import { LiteratureSearchError } from "./semantic-scholar.js";
import { defineLiteratureSourceAdapter } from "./source-adapter.js";

export const PUBMED_SEARCH_URL =
  "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
export const PUBMED_SUMMARY_URL =
  "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi";

const clean = (value) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

const yearFrom = (value) => {
  const match = clean(value).match(/\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b/);
  return match ? Number(match[1]) : undefined;
};

export function normalizePubMedSummary(uid, value) {
  const title = clean(value?.title);
  if (!uid || !title) return null;
  const articleIds = Array.isArray(value.articleids) ? value.articleids : [];
  const doi = clean(articleIds.find((entry) => entry?.idtype === "doi")?.value);
  return {
    id: `pubmed:${uid}`,
    provider: "pubmed",
    providerId: uid,
    title,
    authors: Array.isArray(value.authors)
      ? value.authors.map((author) => clean(author?.name)).filter(Boolean)
      : [],
    abstract: "",
    year: yearFrom(value.pubdate),
    url: `https://pubmed.ncbi.nlm.nih.gov/${uid}/`,
    doi: doi || undefined,
    tags: [clean(value.fulljournalname)].filter(Boolean),
  };
}

const requestPubMed = async (operation, url, options) => {
  try {
    const requested = await requestLiteratureProvider("pubmed", url, options);
    requested.providerCall.operation = operation;
    if (requested.response.status === 429 || !requested.response.ok) {
      const error = new LiteratureSearchError(
        requested.response.status === 429
          ? "PubMed rate limit reached."
          : "Unable to search PubMed right now.",
        requested.response.status === 429 ? "rate_limited" : "general",
        {
          provider: "pubmed",
          retryAfterMs:
            requested.providerCall.attempts.at(-1)?.retryAfterMs ?? null,
        },
      );
      error.providerCall = requested.providerCall;
      throw error;
    }
    return requested;
  } catch (error) {
    if (error instanceof LiteratureSearchError) throw error;
    const wrapped = new LiteratureSearchError(
      error?.name === "TimeoutError" || error?.name === "AbortError"
        ? "PubMed search timed out."
        : "Unable to search PubMed right now.",
      error?.name === "TimeoutError" || error?.name === "AbortError"
        ? "timeout"
        : "general",
      { provider: "pubmed" },
    );
    wrapped.providerCall = error.providerCall;
    throw wrapped;
  }
};

export async function searchPubMed(query, options = {}) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];
  const searchUrl = new URL(PUBMED_SEARCH_URL);
  searchUrl.searchParams.set("db", "pubmed");
  searchUrl.searchParams.set("retmode", "json");
  searchUrl.searchParams.set("retmax", String(options.limit ?? 25));
  searchUrl.searchParams.set("term", normalizedQuery);
  const searched = await requestPubMed("search", searchUrl, options);
  const searchPayload = await searched.response.json();
  const ids = searchPayload?.esearchresult?.idlist;
  if (!Array.isArray(ids)) {
    const error = new LiteratureSearchError(
      "PubMed returned invalid search data.",
      "invalid_response",
      {
        provider: "pubmed",
      },
    );
    error.providerCall = searched.providerCall;
    throw error;
  }
  if (ids.length === 0) return attachProviderCalls([], [searched.providerCall]);

  const summaryUrl = new URL(PUBMED_SUMMARY_URL);
  summaryUrl.searchParams.set("db", "pubmed");
  summaryUrl.searchParams.set("retmode", "json");
  summaryUrl.searchParams.set("id", ids.join(","));
  let summarized;
  try {
    summarized = await requestPubMed("summary", summaryUrl, options);
  } catch (error) {
    error.providerCalls = [
      searched.providerCall,
      ...(error.providerCall ? [error.providerCall] : []),
    ];
    throw error;
  }
  const summaryPayload = await summarized.response.json();
  if (!summaryPayload?.result || typeof summaryPayload.result !== "object") {
    const error = new LiteratureSearchError(
      "PubMed returned invalid summary data.",
      "invalid_response",
      {
        provider: "pubmed",
      },
    );
    error.providerCall = summarized.providerCall;
    throw error;
  }
  return attachProviderCalls(
    ids
      .map((uid) => normalizePubMedSummary(uid, summaryPayload.result[uid]))
      .filter(Boolean),
    [searched.providerCall, summarized.providerCall],
  );
}

export const pubmedAdapter = defineLiteratureSourceAdapter({
  id: "pubmed",
  kind: "remote",
  search: searchPubMed,
});
