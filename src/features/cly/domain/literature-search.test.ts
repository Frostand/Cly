import { describe, expect, it } from "vitest";
import {
  expandLiteratureQuery,
  findDuplicateSource,
  rankLiterature,
  rankLiteratureWithRrf,
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

  it("retains every extracted passage and confidence in the source projection", () => {
    const source = sourceFromLiteraturePaper({
      id: "pubmed:1",
      provider: "pubmed",
      providerId: "1",
      title: "A paper",
      authors: [],
      abstract: "Abstract.",
      url: "https://pubmed.ncbi.nlm.nih.gov/1/",
      tags: [],
      extraction: {
        hasFullText: true,
        fullTextStatus: "parsed",
        extractedAt: "2026-07-21T00:00:00.000Z",
        method: "bounded_pdf_rules_v1",
        researchProblem: null,
        methods: [
          {
            value: "Method one.",
            passage: { quote: "Method one.", locator: "pdf:page:1" },
            confidence: 92,
            verificationState: "unverified",
          },
          {
            value: "Method two.",
            passage: { quote: "Method two.", locator: "pdf:page:2" },
            confidence: 88,
            verificationState: "unverified",
          },
        ],
        datasets: [],
        evidence: [],
        limitations: [
          {
            value: "Limited cohort.",
            passage: { quote: "Limited cohort.", locator: "pdf:page:3" },
            confidence: 90,
            verificationState: "unverified",
          },
        ],
        reproducibility: [],
        contradictions: [],
      },
    });
    expect(source.extractedValues).toMatchObject({
      methods: [
        { passage: { locator: "pdf:page:1" }, confidence: 92 },
        { passage: { locator: "pdf:page:2" }, confidence: 88 },
      ],
      limitations: [{ passage: { locator: "pdf:page:3" }, confidence: 90 }],
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

  it("fuses keyword and replaceable semantic rankings with RRF", async () => {
    const keywordFirst = source(
      "keyword",
      "Robust calibration",
      "Exact terminology.",
    );
    const semanticFirst = source(
      "semantic",
      "Uncertainty under shift",
      "Calibration behavior.",
    );
    const results = await rankLiteratureWithRrf(
      "robust calibration",
      [keywordFirst, semanticFirst],
      {
        method: "stub_cross_encoder_v1",
        async rank() {
          return [
            {
              sourceId: "semantic",
              score: 0.99,
              explanation: "Stub semantic preference.",
            },
            {
              sourceId: "keyword",
              score: 0.5,
              explanation: "Stub semantic preference.",
            },
          ];
        },
      },
      "2026-07-12T00:00:00Z",
    );

    expect(results).toHaveLength(2);
    expect(results[0].method).toBe("rrf:stub_cross_encoder_v1");
    expect(results[0].components).toMatchObject({
      keywordRank: expect.any(Number),
      semanticRank: expect.any(Number),
      rrfScore: expect.any(Number),
    });
    expect(results[0].explanation).toContain("Reciprocal Rank Fusion");
  });

  it("retains semantic-only papers when keyword ranking has no signal", async () => {
    const candidate = source(
      "semantic-only",
      "Uncertainty estimation",
      "Distribution behavior.",
    );
    const results = await rankLiteratureWithRrf("photosynthesis", [candidate], {
      method: "cross_encoder_tei:test",
      async rank() {
        return [
          {
            sourceId: candidate.id,
            score: 0.88,
            explanation: "Joint query-document score.",
          },
        ];
      },
    });
    expect(results).toMatchObject([
      {
        source: { id: "semantic-only" },
        components: { keywordRank: 0, semanticRank: 1 },
      },
    ]);
  });

  it("explains topic, method, dataset, evidence, recency, availability, reproducibility, and contradiction factors", () => {
    const baseline = source(
      "baseline",
      "Calibration study",
      "A calibration result.",
    );
    baseline.year = 2012;
    const transparent = source(
      "transparent",
      "Calibration under shift",
      "Code and data are available for reproducibility.",
    );
    transparent.year = 2026;
    transparent.methods = ["We use conformal prediction."];
    transparent.findings = ["Coverage improves on ShiftBench."];
    transparent.tags = ["ShiftBench", "dataset", "GitHub"];
    transparent.extractedFields = {
      dataset: {
        value: "ShiftBench dataset",
        passage: { quote: "We evaluate ShiftBench." },
        confidence: 92,
        verificationState: "unverified",
      },
    };
    transparent.contradictoryEvidence = [
      { quote: "The method did not improve the hardest regime." },
    ];

    const results = rankLiterature(
      "calibration conformal ShiftBench coverage",
      [baseline, transparent],
      "2026-07-21T18:00:00.000Z",
    );
    expect(results[0].source.id).toBe("transparent");
    expect(results[0].components).toMatchObject({
      topicFit: expect.any(Number),
      methodFit: expect.any(Number),
      datasetFit: expect.any(Number),
      evidenceFit: expect.any(Number),
      recency: 1,
      codeDataAvailability: 1,
      reproducibility: 1,
      contradiction: 1,
    });
  });

  it("expands, semantically filters, and synthesizes with deterministic rationale", async () => {
    expect(expandLiteratureQuery("robust calibration")).toMatchObject({
      normalizedQuery: "robust calibration",
      expansionTerms: expect.arrayContaining([
        "distribution-shift",
        "coverage",
      ]),
    });
    const results = await rankLiteratureWithRrf(
      "robust calibration",
      [
        source(
          "relevant",
          "Reliability under distribution shift",
          "Coverage is measured on a benchmark dataset.",
        ),
        source("irrelevant", "Marine ecology", "A survey of coral reefs."),
      ],
      {
        method: "deterministic_expanded_embedding_v1",
        async rank(query, sources) {
          return sources.flatMap((item) =>
            item.id === "relevant"
              ? [
                  {
                    sourceId: item.id,
                    score: 0.75,
                    explanation: `Matched expanded query ${query}.`,
                  },
                ]
              : [],
          );
        },
      },
      "2026-07-21T00:00:00.000Z",
    );
    expect(results.map((result) => result.source.id)).toEqual(["relevant"]);
    expect(results[0].explanation).toContain(
      "embedding-style semantic filtering",
    );
    expect(results.synthesis).toMatchObject({
      method: "deterministic_ranked_passages_v1",
      sourceIds: ["relevant"],
    });
  });
});
