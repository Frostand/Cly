import { extractStructuredLiterature } from "./ingestion.js";
import { acquirePdf, parsePdfInSandbox } from "./pdf-pipeline.js";

const fallback = (paper, status, failure, extractedAt) => ({
  ...paper,
  fullTextStatus: status,
  pdfFailure: failure
    ? {
        kind: failure.kind ?? "pdf_failure",
        message: failure.message,
        retryable: failure.retryable === true,
        retryAfterMs: failure.retryAfterMs ?? null,
        action: failure.retryable
          ? "Retry full-text acquisition, or continue with the grounded abstract."
          : "Continue with the grounded abstract or open the paper manually.",
      }
    : undefined,
  extraction: extractStructuredLiterature(paper, null, extractedAt),
});

export async function enrichLiteraturePapers(
  papers,
  {
    pdfLimit = 3,
    acquire = acquirePdf,
    parse = parsePdfInSandbox,
    clock = () => new Date().toISOString(),
  } = {},
) {
  let eligible = 0;
  return Promise.all(
    papers.map(async (paper) => {
      const extractedAt = clock();
      if (!paper.pdfUrl || eligible >= pdfLimit)
        return fallback(
          paper,
          paper.pdfUrl ? "not_attempted_limit" : "not_available",
          null,
          extractedAt,
        );
      eligible += 1;
      try {
        const acquired = await acquire(paper.pdfUrl);
        try {
          const parsed = await parse(acquired.bytes);
          return {
            ...paper,
            fullTextStatus: "parsed",
            pdfAcquisition: {
              attempts: acquired.attempts,
              finalUrl: acquired.finalUrl,
              redirects: acquired.redirects,
            },
            extraction: extractStructuredLiterature(paper, parsed, extractedAt),
          };
        } catch (error) {
          return fallback(paper, "parse_failed", error, extractedAt);
        }
      } catch (error) {
        return fallback(paper, "download_failed", error, extractedAt);
      }
    }),
  );
}
