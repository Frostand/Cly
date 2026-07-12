import { searchArxiv } from "./arxiv.js";
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

export async function searchLiteratureProviders(
  query,
  {
    limit = 25,
    provider = "both",
    arxivSearch = searchArxiv,
    semanticSearch = searchSemanticScholar,
  } = {},
) {
  if (provider === "arxiv") return arxivSearch(query, { limit });
  if (provider === "semantic-scholar") return semanticSearch(query, { limit });
  const results = await Promise.allSettled([
    arxivSearch(query, { limit }),
    semanticSearch(query, { limit }),
  ]);
  const papers = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  if (papers.length === 0) {
    const rejected = results.find((result) => result.status === "rejected");
    if (rejected) throw rejected.reason;
  }
  return deduplicatePapers(papers).slice(0, limit);
}
