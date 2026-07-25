import { afterEach, describe, expect, it, vi } from "vitest";
import { createFixtureRepository } from "../fixtures/repository";
import { desktopLiteratureService } from "./literature-service";

const project = createFixtureRepository("active").projects[0];

afterEach(() => vi.unstubAllGlobals());

describe("desktop literature service", () => {
  it("maps provider rate limits into a stable error kind", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Rate limited", { status: 429 })),
    );
    await expect(
      desktopLiteratureService.search(project, "calibration"),
    ).rejects.toMatchObject({ kind: "rate_limited" });
  });

  it("returns RRF-ranked normalized papers", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: project.id })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            provider: "semantic-scholar",
            reranking: {
              status: "completed",
              method: "cross_encoder_tei:BAAI/bge-reranker-base",
              model: "BAAI/bge-reranker-base",
              signals: [{ sourceId: "semantic-scholar:paper-1", score: 0.97 }],
            },
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
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      desktopLiteratureService.search(project, "robust calibration"),
    ).resolves.toMatchObject([
      {
        method: "rrf:cross_encoder_tei:BAAI/bge-reranker-base",
        model: "BAAI/bge-reranker-base",
      },
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/projects/project-cly/research",
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining('"name":"Neural surrogate reliability"'),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/projects/project-cly/literature/search",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("uses the labeled deterministic fallback when no model is configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ id: project.id })))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              provider: "arxiv",
              reranking: {
                status: "not_configured",
                method: null,
                model: "BAAI/bge-reranker-base",
                signals: [],
              },
              papers: [
                {
                  id: "arxiv:paper-1",
                  provider: "arxiv",
                  providerId: "paper-1",
                  title: "Robust calibration",
                  authors: [],
                  abstract: "Calibration under shift.",
                  url: "https://arxiv.org/abs/paper-1",
                  tags: [],
                },
              ],
            }),
          ),
        ),
    );
    await expect(
      desktopLiteratureService.search(project, "robust calibration"),
    ).resolves.toMatchObject([
      { method: "rrf:metadata_similarity_fixture_v1" },
    ]);
  });
});
