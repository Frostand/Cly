// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createGroundedSummary,
  extractStructuredLiterature,
  findLiteratureDuplicate,
  normalizeLiteratureRecord,
  parseBibtex,
} from "./ingestion.js";

const fixtures = JSON.parse(
  readFileSync(new URL("./fixtures/acceptance.json", import.meta.url), "utf8"),
);

describe("literature metadata ingestion", () => {
  it("parses BibTeX and normalizes stable paper identifiers", () => {
    const [record] = parseBibtex(`
      @article{calibration2026,
        title = {  Reliable {Calibration} under shift  },
        author = {Lieu, Andrew and Rivera, Sam},
        year = {2026},
        doi = {https://doi.org/10.1000/Example.1},
        abstract = {First grounded sentence. Second grounded sentence.}
      }
    `);

    expect(normalizeLiteratureRecord(record)).toMatchObject({
      authors: ["Lieu, Andrew", "Rivera, Sam"],
      doi: "10.1000/example.1",
      normalizedKey: "doi:10.1000/example.1",
      provider: "doi",
      title: "Reliable Calibration under shift",
      url: "https://doi.org/10.1000/example.1",
      year: 2026,
    });
  });

  it("detects duplicates by DOI before weaker metadata", () => {
    const candidate = normalizeLiteratureRecord({
      title: "Revised preprint title",
      doi: "doi:10.1000/PAPER",
      authors: ["A. Researcher"],
    });
    const duplicate = findLiteratureDuplicate(candidate, [
      {
        id: "source-1",
        type: "source",
        title: "Original paper title",
        description: "",
        payload: {
          kind: "source",
          status: "resolved",
          citation: "A. Researcher. Original paper title.",
          doi: "https://doi.org/10.1000/paper",
        },
      },
    ]);

    expect(duplicate).toMatchObject({
      matchedBy: "doi",
      source: { id: "source-1" },
    });
  });

  it("creates an extractive summary whose every claim quotes its source", () => {
    const summary = createGroundedSummary(
      {
        abstract:
          "We evaluate calibration under compound shift. Coverage falls in the hardest regime. Small sample size limits generalization.",
      },
      "2026-07-14T12:00:00.000Z",
    );

    expect(summary).toMatchObject({
      method: "extractive_abstract_v1",
      generatedAt: "2026-07-14T12:00:00.000Z",
    });
    expect(summary?.claims).toHaveLength(3);
    for (const claim of summary?.claims ?? []) {
      expect(claim.evidence[0]).toMatchObject({
        field: "abstract",
        quote: claim.text,
      });
    }
  });

  it("extracts contradictory findings with exact locators and confidence", () => {
    const extraction = extractStructuredLiterature(
      fixtures.contradictoryPaper,
      null,
      "2026-07-21T18:00:00.000Z",
    );
    expect(extraction.datasets[0]).toMatchObject({
      passage: {
        quote: "We evaluate calibration on the ShiftBench dataset.",
        locator: expect.stringMatching(/^abstract:chars:/),
      },
      confidence: 76,
    });
    expect(extraction.contradictions[0]).toMatchObject({
      value: "The proposed method did not improve coverage over the baseline.",
      verificationState: "unverified",
    });
    expect(extraction.reproducibility[0].passage.quote).toContain(
      "Code and data are available",
    );
  });
});
