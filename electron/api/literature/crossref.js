import {
  attachProviderCalls,
  requestLiteratureProvider,
} from "./provider-runtime.js";
import { LiteratureSearchError } from "./semantic-scholar.js";
import { defineLiteratureSourceAdapter } from "./source-adapter.js";

export const CROSSREF_SEARCH_URL = "https://api.crossref.org/works";

const clean = (value) =>
  typeof value === "string"
    ? value
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : "";

const publishedYear = (value) => {
  const parts =
    value?.["published-print"]?.["date-parts"] ??
    value?.published?.["date-parts"];
  const year = parts?.[0]?.[0];
  return Number.isInteger(year) ? year : undefined;
};

export function normalizeCrossrefWork(value) {
  const doi = clean(value?.DOI);
  const title = clean(value?.title?.[0]);
  if (!doi || !title) return null;
  const pdfUrl = Array.isArray(value.link)
    ? clean(value.link.find((link) => /pdf/i.test(link?.["content-type"]))?.URL)
    : "";
  return {
    id: `crossref:${doi.toLowerCase()}`,
    provider: "crossref",
    providerId: doi,
    title,
    authors: Array.isArray(value.author)
      ? value.author
          .map((author) =>
            clean([author?.given, author?.family].filter(Boolean).join(" ")),
          )
          .filter(Boolean)
      : [],
    abstract: clean(value.abstract),
    year: publishedYear(value),
    url: clean(value.URL) || `https://doi.org/${doi}`,
    doi,
    pdfUrl: pdfUrl || undefined,
    tags: Array.isArray(value.subject)
      ? value.subject.map(clean).filter(Boolean)
      : [],
  };
}

export async function searchCrossref(query, options = {}) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];
  const url = new URL(CROSSREF_SEARCH_URL);
  url.searchParams.set("query.bibliographic", normalizedQuery);
  url.searchParams.set("rows", String(options.limit ?? 25));
  let requested;
  try {
    requested = await requestLiteratureProvider("crossref", url, options);
  } catch (error) {
    const wrapped = new LiteratureSearchError(
      error?.name === "TimeoutError" || error?.name === "AbortError"
        ? "Crossref search timed out."
        : "Unable to search Crossref right now.",
      error?.name === "TimeoutError" || error?.name === "AbortError"
        ? "timeout"
        : "general",
      { provider: "crossref" },
    );
    wrapped.providerCall = error.providerCall;
    throw wrapped;
  }
  const { response, providerCall } = requested;
  if (response.status === 429 || !response.ok) {
    const error = new LiteratureSearchError(
      response.status === 429
        ? "Crossref rate limit reached."
        : "Unable to search Crossref right now.",
      response.status === 429 ? "rate_limited" : "general",
      {
        provider: "crossref",
        retryAfterMs: providerCall.attempts.at(-1)?.retryAfterMs ?? null,
      },
    );
    error.providerCall = providerCall;
    throw error;
  }
  const payload = await response.json();
  if (!Array.isArray(payload?.message?.items)) {
    const error = new LiteratureSearchError(
      "Crossref returned invalid data.",
      "invalid_response",
      {
        provider: "crossref",
      },
    );
    error.providerCall = providerCall;
    throw error;
  }
  return attachProviderCalls(
    payload.message.items.map(normalizeCrossrefWork).filter(Boolean),
    [providerCall],
  );
}

export const crossrefAdapter = defineLiteratureSourceAdapter({
  id: "crossref",
  kind: "remote",
  search: searchCrossref,
});
