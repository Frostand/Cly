import {
  attachProviderCalls,
  requestLiteratureProvider,
} from "./provider-runtime.js";
import { LiteratureSearchError } from "./semantic-scholar.js";
import { defineLiteratureSourceAdapter } from "./source-adapter.js";

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
      pdfUrl: providerId
        ? `https://arxiv.org/pdf/${providerId}.pdf`
        : undefined,
      doi: text(entry, "arxiv:doi") || undefined,
      tags: [...entry.matchAll(/<category[^>]+term=["']([^"']+)["']/gi)].map(
        (category) => category[1],
      ),
    };
  });
}

export async function searchArxiv(query, options = {}) {
  const { limit = 25 } = options;
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];
  const url = new URL(ARXIV_SEARCH_URL);
  url.searchParams.set("search_query", `all:${normalizedQuery}`);
  url.searchParams.set("start", "0");
  url.searchParams.set("max_results", String(limit));
  try {
    const { response, providerCall } = await requestLiteratureProvider(
      "arxiv",
      url,
      options,
    );
    if (response.status === 429) {
      const error = new LiteratureSearchError(
        "arXiv rate limit reached.",
        "rate_limited",
        {
          provider: "arxiv",
          retryAfterMs: providerCall.attempts.at(-1)?.retryAfterMs ?? null,
        },
      );
      error.providerCall = providerCall;
      throw error;
    }
    if (!response.ok) {
      const error = new LiteratureSearchError(
        "Unable to search arXiv right now.",
        "general",
        {
          provider: "arxiv",
        },
      );
      error.providerCall = providerCall;
      throw error;
    }
    return attachProviderCalls(parseArxivFeed(await response.text()), [
      providerCall,
    ]);
  } catch (error) {
    if (error instanceof LiteratureSearchError) throw error;
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      const wrapped = new LiteratureSearchError(
        "arXiv search timed out.",
        "timeout",
        {
          provider: "arxiv",
        },
      );
      wrapped.providerCall = error.providerCall;
      throw wrapped;
    }
    const wrapped = new LiteratureSearchError(
      "Unable to search arXiv right now.",
      "general",
      {
        provider: "arxiv",
      },
    );
    wrapped.providerCall = error.providerCall;
    throw wrapped;
  }
}

export const arxivAdapter = defineLiteratureSourceAdapter({
  id: "arxiv",
  kind: "remote",
  search: searchArxiv,
});
