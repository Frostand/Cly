// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  createGroundedSummary,
  findLiteratureDuplicate,
  normalizeLiteratureRecord,
  parseBibtex,
} from "./ingestion.js";

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
});
