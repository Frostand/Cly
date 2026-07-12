// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { searchLiteratureProviders } from "./search.js";

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
    await expect(
      searchLiteratureProviders("topic", {
        arxivSearch: vi.fn().mockRejectedValue(new Error("offline")),
        semanticSearch: vi
          .fn()
          .mockResolvedValue([{ id: "s2:1", title: "Paper" }]),
      }),
    ).resolves.toHaveLength(1);
  });
});
