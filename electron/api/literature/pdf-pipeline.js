import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Worker } from "node:worker_threads";
import { PDF_PARSER_LIMITS } from "./pdf-parser-core.js";

export class PdfPipelineError extends Error {
  constructor(message, kind, { retryable = false, retryAfterMs = null } = {}) {
    super(message);
    this.kind = kind;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

const retryDelay = (response, attempt, baseDelayMs, maxRetryDelayMs) => {
  const header = response.headers.get("retry-after");
  const seconds = Number(header);
  const requested = Number.isFinite(seconds)
    ? seconds * 1_000
    : baseDelayMs * 2 ** attempt;
  return Math.min(maxRetryDelayMs, Math.max(0, requested));
};

const readBoundedBody = async (response, maxBytes) => {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes)
    throw new PdfPipelineError(
      `PDF exceeds the ${maxBytes}-byte download limit.`,
      "too_large",
    );
  if (!response.body) return Buffer.from(await response.arrayBuffer());
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > maxBytes)
      throw new PdfPipelineError(
        `PDF exceeds the ${maxBytes}-byte download limit.`,
        "too_large",
      );
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
};

const isPrivateIpv4 = (address) => {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part)))
    return true;
  return (
    parts[0] === 0 ||
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] >= 224
  );
};

const isPrivateAddress = (address) => {
  const normalized = address.toLowerCase().replace(/^::ffff:/, "");
  if (isIP(normalized) === 4) return isPrivateIpv4(normalized);
  if (isIP(normalized) !== 6) return true;
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized)
  );
};

const validatePdfUrl = async (value, resolveHost) => {
  let url;
  try {
    url = value instanceof URL ? value : new URL(value);
  } catch {
    throw new PdfPipelineError("Paper has an invalid PDF URL.", "invalid_url");
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new PdfPipelineError(
      "PDF acquisition requires a public, credential-free HTTPS URL.",
      "blocked_address",
    );
  }
  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await resolveHost(hostname);
  if (
    !addresses.length ||
    addresses.some((entry) => isPrivateAddress(entry.address))
  ) {
    throw new PdfPipelineError(
      "PDF URL resolves to a private, loopback, or link-local address.",
      "blocked_address",
    );
  }
  return url;
};

export async function acquirePdf(
  pdfUrl,
  {
    fetchImpl = fetch,
    maxAttempts = 3,
    timeoutMs = 15_000,
    maxBytes = PDF_PARSER_LIMITS.maxBytes,
    baseDelayMs = 250,
    maxRetryDelayMs = 3_000,
    maxRedirects = 5,
    resolveHost = (hostname) => lookup(hostname, { all: true, verbatim: true }),
    sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
  } = {},
) {
  const url = await validatePdfUrl(pdfUrl, resolveHost);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let response;
    let finalUrl = url;
    let redirects = 0;
    try {
      while (true) {
        response = await fetchImpl(finalUrl, {
          redirect: "manual",
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        if (redirects >= maxRedirects) {
          throw new PdfPipelineError(
            `PDF download exceeded the ${maxRedirects}-redirect limit.`,
            "too_many_redirects",
          );
        }
        const location = response.headers.get("location");
        if (!location) {
          throw new PdfPipelineError(
            "PDF provider returned a redirect without a destination.",
            "invalid_redirect",
          );
        }
        finalUrl = await validatePdfUrl(
          new URL(location, finalUrl),
          resolveHost,
        );
        redirects += 1;
      }
    } catch (error) {
      if (error instanceof PdfPipelineError) throw error;
      if (attempt + 1 < maxAttempts) {
        await sleep(Math.min(maxRetryDelayMs, baseDelayMs * 2 ** attempt));
        continue;
      }
      const timedOut =
        error?.name === "AbortError" || error?.name === "TimeoutError";
      throw new PdfPipelineError(
        timedOut ? "PDF download timed out." : "PDF download failed.",
        timedOut ? "timeout" : "download_failed",
        { retryable: true },
      );
    }
    if (response.status === 429 || response.status >= 500) {
      const delay = retryDelay(response, attempt, baseDelayMs, maxRetryDelayMs);
      if (attempt + 1 < maxAttempts) {
        await sleep(delay);
        continue;
      }
      throw new PdfPipelineError(
        response.status === 429
          ? "PDF provider rate limit reached."
          : "PDF provider is unavailable.",
        response.status === 429 ? "rate_limited" : "provider_failure",
        { retryable: true, retryAfterMs: delay },
      );
    }
    if (!response.ok)
      throw new PdfPipelineError(
        `PDF download failed (${response.status}).`,
        "not_available",
      );
    const bytes = await readBoundedBody(response, maxBytes);
    if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-")))
      throw new PdfPipelineError(
        "Downloaded file is not a PDF.",
        "malformed_pdf",
      );
    return {
      bytes,
      attempts: attempt + 1,
      contentType: response.headers.get("content-type"),
      finalUrl: finalUrl.toString(),
      redirects,
    };
  }
  throw new PdfPipelineError("PDF download failed.", "download_failed", {
    retryable: true,
  });
}

export function parsePdfInSandbox(
  bytes,
  {
    timeoutMs = 5_000,
    limits = {},
    workerFactory = (options) =>
      new Worker(new URL("./pdf-parser-worker.js", import.meta.url), options),
  } = {},
) {
  return new Promise((resolve, reject) => {
    const worker = workerFactory({
      workerData: { bytes, limits: { ...PDF_PARSER_LIMITS, ...limits } },
      resourceLimits: {
        maxOldGenerationSizeMb: 64,
        maxYoungGenerationSizeMb: 16,
      },
    });
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(
        new PdfPipelineError(
          "PDF parsing timed out in the sandbox.",
          "parse_timeout",
        ),
      );
    }, timeoutMs);
    worker.once("message", (message) => {
      clearTimeout(timer);
      void worker.terminate();
      if (message?.ok) resolve(message.result);
      else
        reject(
          new PdfPipelineError(
            message?.error ?? "PDF parsing failed.",
            "parse_failed",
          ),
        );
    });
    worker.once("error", (error) => {
      clearTimeout(timer);
      reject(new PdfPipelineError(error.message, "parse_failed"));
    });
  });
}
