// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { enrichLiteraturePapers } from "./full-text.js";
import { acquirePdf, parsePdfInSandbox } from "./pdf-pipeline.js";

const fixtures = JSON.parse(
  readFileSync(new URL("./fixtures/acceptance.json", import.meta.url), "utf8"),
);

const publicDns = vi.fn().mockResolvedValue([{ address: "93.184.216.34" }]);

const textPdf = Buffer.from(`%PDF-1.7
1 0 obj
<< /Length 256 >>
stream
BT
(Introduction) Tj
(We study calibration under distribution shift.) Tj
(Methods) Tj
(We use conformal prediction on the ShiftBench dataset.) Tj
(Results) Tj
(Coverage improved by 8 percent.) Tj
(References) Tj
(This reference text must be removed.) Tj
ET
endstream
endobj
%%EOF`);

describe("bounded PDF acquisition and sandboxed parsing", () => {
  it("retries a rate limit within configured bounds and keeps bytes in memory", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("", {
          status: fixtures.rateLimit.status,
          headers: { "retry-after": fixtures.rateLimit.retryAfter },
        }),
      )
      .mockResolvedValueOnce(
        new Response(textPdf, {
          headers: { "content-type": "application/pdf" },
        }),
      );

    await expect(
      acquirePdf("https://arxiv.org/pdf/fixture.pdf", {
        fetchImpl,
        sleep,
        maxRetryDelayMs: 500,
        resolveHost: publicDns,
      }),
    ).resolves.toMatchObject({ attempts: 2, bytes: textPdf });
    expect(sleep).toHaveBeenCalledWith(500);
  });

  it("blocks private destinations before fetch and after redirects", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response("", {
        status: 302,
        headers: { location: "https://127.0.0.1/private.pdf" },
      }),
    );
    await expect(
      acquirePdf("https://127.0.0.1/private.pdf", { fetchImpl }),
    ).rejects.toMatchObject({ kind: "blocked_address" });
    expect(fetchImpl).not.toHaveBeenCalled();

    await expect(
      acquirePdf("https://papers.example/public.pdf", {
        fetchImpl,
        resolveHost: publicDns,
      }),
    ).rejects.toMatchObject({ kind: "blocked_address" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
  });

  it("keeps page-accurate section provenance across content streams", async () => {
    const twoPagePdf = Buffer.from(`%PDF-1.7
<< /Length 64 >>
stream
(Methods) Tj
(We use the first cohort.) Tj
endstream
<< /Length 64 >>
stream
(We evaluate the second cohort.) Tj
endstream
%%EOF`);
    const parsed = await parsePdfInSandbox(twoPagePdf);
    expect(parsed.sections).toMatchObject([
      { name: "methods", page: 1, text: "We use the first cohort." },
      { name: "methods", page: 2, text: "We evaluate the second cohort." },
    ]);
  });

  it("parses useful sections in a resource-limited worker and strips references", async () => {
    const parsed = await parsePdfInSandbox(textPdf);
    expect(parsed).toMatchObject({ pageCount: 1 });
    expect(
      parsed.sections.map((section: { name: string }) => section.name),
    ).toEqual(["introduction", "methods", "results"]);
    expect(parsed.text).toContain("ShiftBench dataset");
    expect(parsed.text).not.toContain("reference text");
  });

  it("falls back to exact abstract passages when a malformed PDF cannot be parsed", async () => {
    const [paper] = await enrichLiteraturePapers(
      [
        {
          id: "paper-1",
          title: "Fallback paper",
          abstract: "We use a bounded method. The result improves accuracy.",
          pdfUrl: "https://example.test/paper.pdf",
        },
      ],
      {
        acquire: vi.fn().mockResolvedValue({
          attempts: 1,
          bytes: Buffer.from(fixtures.malformedPdfBase64, "base64"),
        }),
        parse: parsePdfInSandbox,
        clock: () => "2026-07-21T18:00:00.000Z",
      },
    );
    expect(paper).toMatchObject({
      fullTextStatus: "parse_failed",
      extraction: {
        hasFullText: false,
        methods: [
          {
            passage: {
              quote: "We use a bounded method.",
              locator: expect.stringMatching(/^abstract:chars:/),
            },
            confidence: 76,
          },
        ],
      },
    });
  });
});
