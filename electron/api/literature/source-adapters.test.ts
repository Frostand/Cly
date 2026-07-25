// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { searchCrossref } from "./crossref.js";
import { searchPubMed } from "./pubmed.js";
import { defineLiteratureSourceAdapter } from "./source-adapter.js";
import { ingestLiteratureUpload } from "./uploads.js";

const fixtures = JSON.parse(
  readFileSync(new URL("./fixtures/acceptance.json", import.meta.url), "utf8"),
);

describe("literature source-adapter contracts", () => {
  it("normalizes Crossref records and records bounded call attempts", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(fixtures.crossref)));
    const papers = await searchCrossref("calibration", {
      fetchImpl,
      sleep: vi.fn(),
      now: (() => {
        let time = 0;
        return () => (time += 5);
      })(),
    });
    expect(papers).toMatchObject([
      {
        provider: "crossref",
        providerId: "10.1000/crossref-fixture",
        title: "Transparent calibration",
        authors: ["Ada Lovelace"],
      },
    ]);
    expect(papers.providerCalls[0]).toMatchObject({
      provider: "crossref",
      status: "completed",
      attempts: [
        { attempt: 1, status: 503, outcome: "retryable_http" },
        { attempt: 2, status: 200, outcome: "success" },
      ],
    });
  });

  it("retrieves and normalizes deterministic PubMed summaries", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(fixtures.pubmedSearch)),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(fixtures.pubmedSummary)),
      );
    const papers = await searchPubMed("clinical calibration", { fetchImpl });
    expect(papers).toMatchObject([
      {
        id: "pubmed:12345678",
        provider: "pubmed",
        doi: "10.1000/pubmed-fixture",
        year: 2024,
      },
    ]);
    expect(
      papers.providerCalls.map((call: { operation: string }) => call.operation),
    ).toEqual(["search", "summary"]);
  });

  it("ingests uploaded BibTeX through the local upload adapter", () => {
    expect(
      ingestLiteratureUpload({ format: "bibtex", ...fixtures.upload }),
    ).toMatchObject([
      {
        doi: "10.1000/upload-fixture",
        provider: "doi",
        upload: {
          filename: "fixture.bib",
          mediaType: "application/x-bibtex",
        },
      },
    ]);
  });

  it("rejects incomplete adapter contracts deterministically", () => {
    expect(() =>
      defineLiteratureSourceAdapter({ id: "broken", kind: "remote" }),
    ).toThrow("requires search");
  });
});
