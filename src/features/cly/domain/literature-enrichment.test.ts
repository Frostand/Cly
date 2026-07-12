import { describe, expect, it } from "vitest";
import {
  extractLiteratureMetadata,
  previewLiteratureThemes,
} from "./literature-enrichment";
import type { Source } from "./types";

const source = (id: string, tags: string[] = []): Source => ({
  id,
  title: "Calibration paper",
  authors: "Ada Lovelace",
  year: 2024,
  type: "Paper",
  status: "Queued",
  relevance: "Medium",
  confidence: 0,
  summary: "We study calibration under shift. Coverage improves in evaluation.",
  methods: [],
  findings: [],
  limitations: [],
  tags,
  linkedClaimIds: [],
  linkedExperimentIds: [],
  inNotebookBundle: false,
  path: `sources/${id}`,
  updatedAt: "2026-07-12T00:00:00.000Z",
});

describe("literature enrichment", () => {
  it("extracts explicit deterministic metadata notes", () => {
    expect(
      extractLiteratureMetadata(
        source("one", ["Calibration"]),
        "2026-07-12T12:00:00.000Z",
      ),
    ).toMatchObject({
      researchProblem: "We study calibration under shift.",
      findings: ["Coverage improves in evaluation."],
      method: "deterministic_metadata_fixture_v1",
    });
  });

  it("previews themes without mutating sources", () => {
    expect(
      previewLiteratureThemes([
        source("one", ["Shift"]),
        source("two", ["Shift"]),
      ]),
    ).toEqual([{ label: "Shift", sourceCount: 2 }]);
  });
});
