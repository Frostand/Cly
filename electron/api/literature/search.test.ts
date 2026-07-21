// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { deduplicatePapers, searchLiteratureProviders } from "./search.js";
import { LiteratureSearchError } from "./semantic-scholar.js";

const fixtures = JSON.parse(
  readFileSync(new URL("./fixtures/acceptance.json", import.meta.url), "utf8"),
);

describe("multi-source literature search", () => {
  it("merges providers and deduplicates matching DOIs", async () => {
    const shared = { title: "Shared paper", doi: "10.1000/shared" };
    const papers = await searchLiteratureProviders("topic", {
      arxivSearch: vi.fn().mockResolvedValue([{ ...shared, id: "arxiv:1" }]),
      semanticSearch: vi.fn().mockResolvedValue([
        { ...shared, doi: "https://doi.org/10.1000/shared", id: "s2:1" },
        { title: "Different paper", id: "s2:2" },
      ]),
    });
    expect(papers.map((paper) => paper.id)).toEqual(["arxiv:1", "s2:2"]);
  });

  it("keeps one provider when the other fails", async () => {
    const papers = await searchLiteratureProviders("topic", {
      arxivSearch: vi.fn().mockRejectedValue(
        new LiteratureSearchError("arXiv rate limited.", "rate_limited", {
          provider: "arxiv",
          retryAfterMs: 2_000,
        }),
      ),
      semanticSearch: vi
        .fn()
        .mockResolvedValue([{ id: "s2:1", title: "Paper" }]),
    });
    expect(papers).toHaveLength(1);
    expect(papers.providerFailures).toEqual([
      expect.objectContaining({
        provider: "arxiv",
        kind: "rate_limited",
        retryable: true,
        retryAfterMs: 2_000,
        action: expect.stringContaining("retry"),
      }),
    ]);
  });

  it("deduplicates the deterministic cross-provider fixture by DOI", () => {
    expect(
      deduplicatePapers(fixtures.duplicates).map((paper) => paper.id),
    ).toEqual(["arxiv:one"]);
  });

  it("runs every remote adapter and exposes provider-call observations", async () => {
    const result = (provider: string) => {
      const papers = [{ id: `${provider}:1`, title: `${provider} paper` }];
      Object.defineProperty(papers, "providerCalls", {
        value: [
          {
            provider,
            operation: "search",
            status: "completed",
            durationMs: 10,
            attempts: [{ attempt: 1, status: 200, outcome: "success" }],
          },
        ],
      });
      return papers;
    };
    const papers = await searchLiteratureProviders("topic", {
      provider: "all",
      arxivSearch: vi.fn().mockResolvedValue(result("arxiv")),
      semanticSearch: vi.fn().mockResolvedValue(result("semantic-scholar")),
      crossrefSearch: vi.fn().mockResolvedValue(result("crossref")),
      pubmedSearch: vi.fn().mockResolvedValue(result("pubmed")),
    });
    expect(papers).toHaveLength(4);
    expect(
      papers.providerCalls.map((call: { provider: string }) => call.provider),
    ).toEqual(["arxiv", "semantic-scholar", "crossref", "pubmed"]);
  });
});
