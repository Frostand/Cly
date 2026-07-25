export const SEMANTIC_SCHOLAR_SEARCH_URL =
  "https://api.semanticscholar.org/graph/v1/paper/search";

const fields = [
  "title",
  "authors",
  "abstract",
  "year",
  "url",
  "externalIds",
  "fieldsOfStudy",
  "openAccessPdf",
].join(",");

export class LiteratureSearchError extends Error {
  constructor(
    message,
    kind = "general",
    { provider = null, retryAfterMs = null } = {},
  ) {
    super(message);
    this.kind = kind;
    this.provider = provider;
    this.retryAfterMs = retryAfterMs;
    this.retryable =
      kind === "rate_limited" || kind === "timeout" || kind === "general";
    this.action =
      kind === "rate_limited"
        ? "Wait for the provider retry window, then retry the search."
        : kind === "timeout"
          ? "Retry the search or select the other literature provider."
          : "Retry the search or select a different literature provider.";
  }
}

const clean = (value) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

export function normalizeSemanticScholarPaper(value) {
  const providerId = clean(value?.paperId);
  if (!providerId) return null;
  const externalIds = value?.externalIds ?? {};
  return {
    id: `semantic-scholar:${providerId}`,
    provider: "semantic-scholar",
    providerId,
    title: clean(value.title) || "Untitled paper",
    authors: Array.isArray(value.authors)
      ? value.authors.map((author) => clean(author?.name)).filter(Boolean)
      : [],
    abstract: clean(value.abstract),
    year: Number.isInteger(value.year) ? value.year : undefined,
    url:
      clean(value.url) || `https://www.semanticscholar.org/paper/${providerId}`,
    doi: clean(externalIds.DOI) || undefined,
    pdfUrl: clean(value?.openAccessPdf?.url) || undefined,
    tags: Array.isArray(value.fieldsOfStudy)
      ? value.fieldsOfStudy.map(clean).filter(Boolean)
      : [],
  };
}

export async function searchSemanticScholar(query, options = {}) {
  const { limit = 25 } = options;
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];
  const url = new URL(SEMANTIC_SCHOLAR_SEARCH_URL);
  url.searchParams.set("query", normalizedQuery);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("fields", fields);

  let requested;
  try {
    requested = await requestLiteratureProvider(
      "semantic-scholar",
      url,
      options,
    );
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      const wrapped = new LiteratureSearchError(
        "Semantic Scholar search timed out.",
        "timeout",
        { provider: "semantic-scholar" },
      );
      wrapped.providerCall = error.providerCall;
      throw wrapped;
    }
    const wrapped = new LiteratureSearchError(
      "Unable to search Semantic Scholar right now.",
      "general",
      { provider: "semantic-scholar" },
    );
    wrapped.providerCall = error.providerCall;
    throw wrapped;
  }
  const { response, providerCall } = requested;
  if (response.status === 429) {
    const error = new LiteratureSearchError(
      "Semantic Scholar rate limit reached.",
      "rate_limited",
      {
        provider: "semantic-scholar",
        retryAfterMs: providerCall.attempts.at(-1)?.retryAfterMs ?? null,
      },
    );
    error.providerCall = providerCall;
    throw error;
  }
  if (!response.ok) {
    const error = new LiteratureSearchError(
      "Unable to search Semantic Scholar right now.",
      "general",
      { provider: "semantic-scholar" },
    );
    error.providerCall = providerCall;
    throw error;
  }
  const payload = await response.json();
  if (!payload || !Array.isArray(payload.data)) {
    const error = new LiteratureSearchError(
      "Semantic Scholar returned invalid data.",
      "invalid_response",
      { provider: "semantic-scholar" },
    );
    error.providerCall = providerCall;
    throw error;
  }
  return attachProviderCalls(
    payload.data.map(normalizeSemanticScholarPaper).filter(Boolean),
    [providerCall],
  );
}

export const semanticScholarAdapter = defineLiteratureSourceAdapter({
  id: "semantic-scholar",
  kind: "remote",
  search: searchSemanticScholar,
});

import {
  attachProviderCalls,
  requestLiteratureProvider,
} from "./provider-runtime.js";
import { defineLiteratureSourceAdapter } from "./source-adapter.js";
