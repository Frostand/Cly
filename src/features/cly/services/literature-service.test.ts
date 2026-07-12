import { afterEach, describe, expect, it, vi } from "vitest";
import { desktopLiteratureService } from "./literature-service";

afterEach(() => vi.unstubAllGlobals());

describe("desktop literature service", () => {
  it("maps provider rate limits into a stable error kind", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Rate limited", { status: 429 })),
    );
    await expect(
      desktopLiteratureService.search("project-1", "calibration"),
    ).rejects.toMatchObject({ kind: "rate_limited" });
  });

  it("returns RRF-ranked normalized papers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            provider: "semantic-scholar",
            papers: [
              {
                id: "semantic-scholar:paper-1",
                provider: "semantic-scholar",
                providerId: "paper-1",
                title: "Robust calibration",
                authors: ["Ada Lovelace"],
                abstract: "Calibration under shift.",
                year: 2024,
                url: "https://example.test/paper-1",
                tags: [],
              },
            ],
          }),
        ),
      ),
    );
    await expect(
      desktopLiteratureService.search("project-1", "robust calibration"),
    ).resolves.toMatchObject([
      { method: "rrf:metadata_similarity_fixture_v1" },
    ]);
  });
});
