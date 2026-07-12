// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  rerankWithLocalCrossEncoder,
  resolveCrossEncoderEndpoint,
  tryLocalCrossEncoder,
} from "./cross-encoder.js";

const papers = [
  { id: "paper-1", title: "First", abstract: "One" },
  { id: "paper-2", title: "Second", abstract: "Two" },
];

describe("local TEI cross-encoder", () => {
  it("uses the documented TEI rerank contract and maps scores to papers", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          { index: 1, score: 0.92 },
          { index: 0, score: 0.3 },
        ]),
      ),
    );
    const result = await rerankWithLocalCrossEncoder("query", papers, {
      endpoint: "http://127.0.0.1:8080",
      fetchImpl,
      model: "BAAI/bge-reranker-base",
    });
    expect(result).toMatchObject({
      method: "cross_encoder_tei:BAAI/bge-reranker-base",
      status: "completed",
      signals: [
        { sourceId: "paper-2", score: 0.92 },
        { sourceId: "paper-1", score: 0.3 },
      ],
    });
    const request = fetchImpl.mock.calls[0];
    expect(String(request[0])).toBe("http://127.0.0.1:8080/rerank");
    expect(JSON.parse(request[1].body)).toEqual({
      query: "query",
      texts: ["First\n\nOne", "Second\n\nTwo"],
      raw_scores: false,
    });
  });

  it("rejects non-loopback endpoints", () => {
    expect(() => resolveCrossEncoderEndpoint("https://example.com")).toThrow(
      "loopback",
    );
  });

  it("rejects non-HTTP endpoint schemes", () => {
    expect(() => resolveCrossEncoderEndpoint("file://localhost/model")).toThrow(
      "loopback",
    );
  });

  it("falls back with an explicit unavailable status", async () => {
    await expect(
      tryLocalCrossEncoder("query", papers, {
        endpoint: "http://localhost:8080",
        fetchImpl: vi.fn().mockRejectedValue(new Error("offline")),
      }),
    ).resolves.toMatchObject({
      status: "unavailable",
      errorKind: "unavailable",
    });
  });

  it("falls back when the local model returns malformed JSON", async () => {
    await expect(
      tryLocalCrossEncoder("query", papers, {
        endpoint: "http://localhost:8080",
        fetchImpl: vi
          .fn()
          .mockResolvedValue(new Response("not-json", { status: 200 })),
      }),
    ).resolves.toMatchObject({
      status: "unavailable",
      errorKind: "invalid_response",
    });
  });
});
