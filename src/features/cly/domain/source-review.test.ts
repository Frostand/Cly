import { describe, expect, it } from "vitest";
import { createFixtureRepository } from "../fixtures/repository";
import {
  exportLiteratureMatrixCsv,
  normalizeExtractedValue,
  reviewCellsForSource,
  sourceEvidenceSummary,
  sourceKinds,
} from "./source-review";
import type { Source } from "./types";

const source = (patch: Partial<Source> = {}): Source => ({
  id: "source-test",
  title: "Evidence-aware review",
  authors: "R. Reviewer",
  year: 2026,
  type: "Paper",
  status: "Reading",
  relevance: "High",
  confidence: 88,
  summary: "Review source passages before accepting extracted values.",
  methods: ["Structured extraction"],
  findings: ["Passage-level review prevents unsupported synthesis"],
  limitations: ["Single fixture"],
  tags: ["review"],
  linkedClaimIds: [],
  linkedExperimentIds: [],
  inNotebookBundle: false,
  path: "sources/review.pdf",
  updatedAt: "2026-07-19T12:00:00.000Z",
  ...patch,
});

describe("source review contracts", () => {
  it("supports every accepted Source Manager kind", () => {
    expect(sourceKinds).toEqual([
      "Paper",
      "PDF",
      "Webpage",
      "Book",
      "Dataset",
      "Documentation",
      "Repository",
      "Hugging Face",
      "Note",
      "Import",
    ]);
  });

  it("retains passage, confidence, and human verification per extracted value", () => {
    const reviewed = source({
      extractedFields: {
        researchProblem: {
          value: "Does review preserve evidence?",
          passage: {
            quote: "Each value retains its source sentence.",
            locator: "p. 2",
          },
          confidence: 94,
          verificationState: "verified",
          verifiedBy: "R. Reviewer",
          verifiedAt: "2026-07-19T12:05:00.000Z",
        },
      },
    });
    const cell = reviewCellsForSource(reviewed)[0];
    expect(cell).toMatchObject({
      value: "Does review preserve evidence?",
      passage: {
        quote: "Each value retains its source sentence.",
        locator: "p. 2",
      },
      confidence: 94,
      verificationState: "verified",
      verifiedBy: "R. Reviewer",
      health: "verified",
    });
  });

  it("labels empty and partial legacy records as missing rather than inventing evidence", () => {
    const empty = source({
      summary: "",
      methods: [],
      findings: [],
      limitations: [],
    });
    expect(reviewCellsForSource(empty).map((cell) => cell.health)).toEqual([
      "missing",
      "missing",
      "missing",
      "missing",
    ]);
    const partial = source();
    expect(sourceEvidenceSummary(partial)).toEqual({
      total: 4,
      verified: 0,
      unverified: 0,
      rejected: 0,
      incomplete: 4,
    });
  });

  it("isolates malformed confidence, passage, and verification state", () => {
    const malformed = normalizeExtractedValue("method", "Method", source(), {
      value: 42,
      passage: { quote: "" },
      confidence: 140,
      verificationState: "approved",
    });
    expect(malformed).toMatchObject({
      health: "malformed",
      passage: null,
      confidence: null,
      verificationState: null,
    });
  });

  it("keeps valid but unverified evidence visibly pending review", () => {
    const pending = normalizeExtractedValue("method", "Method", source(), {
      value: "Structured extraction",
      passage: { quote: "We used structured extraction.", locator: "Methods" },
      confidence: 81,
      verificationState: "unverified",
    });
    expect(pending.health).toBe("unverified");
  });

  it("exports standard and custom values with their provenance columns", () => {
    const fixture = createFixtureRepository("active").sources[0];
    const csv = exportLiteratureMatrixCsv(
      [
        {
          ...fixture,
          customReviewFields: {
            population: {
              value: "Temporal and parameter shifts",
              passage: {
                quote: "Three shift families were sampled.",
                locator: "p. 4",
              },
              confidence: 90,
              verificationState: "verified",
            },
          },
        },
      ],
      [{ id: "population", label: "Population" }],
    );
    expect(csv).toContain("Research problem passage");
    expect(csv).toContain("Population verification");
    expect(csv).toContain("Three shift families were sampled.");
    expect(csv).toContain("verified");
  });
});
