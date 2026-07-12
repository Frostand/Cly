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
].join(",");

export class LiteratureSearchError extends Error {
  constructor(message, kind = "general") {
    super(message);
    this.kind = kind;
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
    tags: Array.isArray(value.fieldsOfStudy)
      ? value.fieldsOfStudy.map(clean).filter(Boolean)
      : [],
  };
}

export async function searchSemanticScholar(
  query,
  { fetchImpl = fetch, limit = 25, timeoutMs = 20_000 } = {},
) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];
  const url = new URL(SEMANTIC_SCHOLAR_SEARCH_URL);
  url.searchParams.set("query", normalizedQuery);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("fields", fields);

  let response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      throw new LiteratureSearchError(
        "Semantic Scholar search timed out.",
        "timeout",
      );
    }
    throw new LiteratureSearchError(
      "Unable to search Semantic Scholar right now.",
    );
  }
  if (response.status === 429) {
    throw new LiteratureSearchError(
      "Semantic Scholar rate limit reached.",
      "rate_limited",
    );
  }
  if (!response.ok) {
    throw new LiteratureSearchError(
      "Unable to search Semantic Scholar right now.",
    );
  }
  const payload = await response.json();
  if (!payload || !Array.isArray(payload.data)) {
    throw new LiteratureSearchError("Semantic Scholar returned invalid data.");
  }
  return payload.data.map(normalizeSemanticScholarPaper).filter(Boolean);
}
