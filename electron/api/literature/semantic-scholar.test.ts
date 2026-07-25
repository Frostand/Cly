// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  type LiteratureSearchError,
  searchSemanticScholar,
} from "./semantic-scholar.js";

describe("Semantic Scholar literature search", () => {
  it("normalizes paper metadata", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              paperId: "abc123",
              title: "  Robust   calibration ",
              authors: [{ name: "Ada Lovelace" }],
              abstract: " Under shift. ",
              year: 2024,
              externalIds: { DOI: "10.1000/example" },
              fieldsOfStudy: ["Computer Science"],
            },
          ],
        }),
      ),
    );
    const papers = await searchSemanticScholar("calibration", { fetchImpl });
    expect(papers).toEqual([
      expect.objectContaining({
        id: "semantic-scholar:abc123",
        title: "Robust calibration",
        authors: ["Ada Lovelace"],
        doi: "10.1000/example",
      }),
    ]);
  });

  it("classifies provider rate limits", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 429 }));
    await expect(
      searchSemanticScholar("topic", {
        fetchImpl,
        maxAttempts: 2,
        sleep: vi.fn(),
      }),
    ).rejects.toMatchObject({
      kind: "rate_limited",
    } satisfies Partial<LiteratureSearchError>);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not request a blank query", async () => {
    const fetchImpl = vi.fn();
    await expect(searchSemanticScholar("  ", { fetchImpl })).resolves.toEqual(
      [],
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
