import { describe, expect, it } from "vitest";
import {
  findDuplicateSource,
  rankLiterature,
  sourceFromLiteraturePaper,
} from "./literature-search";
import type { Source } from "./types";

const source = (id: string, title: string, summary: string): Source => ({
  id,
  title,
  authors: "Test author",
  year: 2026,
  type: "Paper",
  status: "Queued",
  relevance: "Medium",
  confidence: 0,
  summary,
  methods: [],
  findings: [],
  limitations: [],
  tags: [],
  linkedClaimIds: [],
  linkedExperimentIds: [],
  inNotebookBundle: false,
  path: `sources/${id}`,
  updatedAt: "2026-07-12T00:00:00Z",
});

describe("literature ranking", () => {
  it("ranks title matches above body-only matches and explains the signal", () => {
    const results = rankLiterature(
      "robust calibration",
      [
        source("title", "Robust calibration under shift", "A useful method."),
        source(
          "body",
          "Uncertainty estimation",
          "Robust calibration is evaluated.",
        ),
      ],
      "2026-07-12T00:00:00Z",
    );

    expect(results.map((result) => result.source.id)).toEqual([
      "title",
      "body",
    ]);
    expect(results[0].score).toBeGreaterThan(results[1].score);
    expect(results[0].explanation).toContain("title term");
    expect(results[0].retrievedAt).toBe("2026-07-12T00:00:00Z");
  });

  it("returns an empty result for a blank query", () => {
    expect(rankLiterature("  ", [source("one", "Paper", "Abstract")])).toEqual(
      [],
    );
  });

  it("maps normalized provider papers into Cly sources", () => {
    expect(
      sourceFromLiteraturePaper({
        id: "semantic-scholar:paper-1",
        provider: "semantic-scholar",
        providerId: "paper-1",
        title: "A paper",
        authors: ["Ada Lovelace"],
        abstract: "An abstract.",
        year: 2024,
        url: "https://example.test/paper-1",
        doi: "10.1000/paper-1",
        tags: ["Computer Science"],
      }),
    ).toMatchObject({
      title: "A paper",
      authors: "Ada Lovelace",
      provider: "semantic-scholar",
      providerId: "paper-1",
      status: "Queued",
      type: "Paper",
    });
  });

  it("deduplicates provider papers by stable identity", () => {
    const existing = {
      ...source("existing", "Existing", "Abstract"),
      provider: "semantic-scholar",
      providerId: "paper-1",
    };
    expect(
      findDuplicateSource(
        { ...existing, id: "candidate", title: "Updated title" },
        [existing],
      ),
    ).toBe(existing);
  });
});
