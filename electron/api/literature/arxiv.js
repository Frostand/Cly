import { LiteratureSearchError } from "./semantic-scholar.js";

export const ARXIV_SEARCH_URL = "https://export.arxiv.org/api/query";
const text = (xml, tag) =>
  (
    xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1] ??
    ""
  )
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim()
    .replace(/\s+/g, " ");

export function parseArxivFeed(xml) {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].map((match) => {
    const entry = match[1];
    const url = text(entry, "id");
    const providerId = url.split("/").at(-1)?.replace(/v\d+$/, "") ?? url;
    const published = text(entry, "published");
    return {
      id: `arxiv:${providerId}`,
      provider: "arxiv",
      providerId,
      title: text(entry, "title") || "Untitled paper",
      authors: [
        ...entry.matchAll(
          /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi,
        ),
      ].map((author) => author[1].trim()),
      abstract: text(entry, "summary"),
      year: /^\d{4}/.test(published)
        ? Number(published.slice(0, 4))
        : undefined,
      url,
      doi: text(entry, "arxiv:doi") || undefined,
      tags: [...entry.matchAll(/<category[^>]+term=["']([^"']+)["']/gi)].map(
        (category) => category[1],
      ),
    };
  });
}

export async function searchArxiv(
  query,
  { fetchImpl = fetch, limit = 25, timeoutMs = 20_000 } = {},
) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];
  const url = new URL(ARXIV_SEARCH_URL);
  url.searchParams.set("search_query", `all:${normalizedQuery}`);
  url.searchParams.set("start", "0");
  url.searchParams.set("max_results", String(limit));
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 429)
      throw new LiteratureSearchError(
        "arXiv rate limit reached.",
        "rate_limited",
      );
    if (!response.ok)
      throw new LiteratureSearchError("Unable to search arXiv right now.");
    return parseArxivFeed(await response.text());
  } catch (error) {
    if (error instanceof LiteratureSearchError) throw error;
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      throw new LiteratureSearchError("arXiv search timed out.", "timeout");
    }
    throw new LiteratureSearchError("Unable to search arXiv right now.");
  }
}
