const DEFAULT_MODEL = "BAAI/bge-reranker-base";

export class CrossEncoderError extends Error {
  constructor(message, kind = "unavailable") {
    super(message);
    this.kind = kind;
  }
}

export function resolveCrossEncoderEndpoint(value) {
  if (!value?.trim()) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new CrossEncoderError(
      "The cross-encoder endpoint is not a valid URL.",
      "invalid_endpoint",
    );
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)
  ) {
    throw new CrossEncoderError(
      "The cross-encoder endpoint must use a loopback address.",
      "invalid_endpoint",
    );
  }
  return new URL("rerank", url.href.endsWith("/") ? url : `${url.href}/`);
}

export async function rerankWithLocalCrossEncoder(
  query,
  papers,
  {
    endpoint = process.env.CLY_CROSS_ENCODER_URL,
    fetchImpl = fetch,
    model = process.env.CLY_CROSS_ENCODER_MODEL || DEFAULT_MODEL,
    timeoutMs = 20_000,
  } = {},
) {
  const url = resolveCrossEncoderEndpoint(endpoint);
  if (!url || papers.length === 0) {
    return {
      method: null,
      model,
      signals: [],
      status: url ? "empty" : "not_configured",
    };
  }
  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query,
        texts: papers.map((paper) => `${paper.title}\n\n${paper.abstract}`),
        raw_scores: false,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new CrossEncoderError(
      error?.name === "TimeoutError" || error?.name === "AbortError"
        ? "The local cross-encoder timed out."
        : "The local cross-encoder is unavailable.",
      error?.name === "TimeoutError" || error?.name === "AbortError"
        ? "timeout"
        : "unavailable",
    );
  }
  if (!response.ok) {
    throw new CrossEncoderError(
      `The local cross-encoder returned HTTP ${response.status}.`,
    );
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new CrossEncoderError(
      "The local cross-encoder returned invalid JSON.",
      "invalid_response",
    );
  }
  if (!Array.isArray(payload)) {
    throw new CrossEncoderError(
      "The local cross-encoder returned invalid data.",
      "invalid_response",
    );
  }
  const signals = payload.map((item) => ({
    index: item?.index,
    sourceId: papers[item?.index]?.id,
    score: Number(item?.score),
  }));
  if (
    signals.some(
      (signal) =>
        !Number.isInteger(signal.index) ||
        !signal.sourceId ||
        !Number.isFinite(signal.score),
    ) ||
    new Set(signals.map((signal) => signal.index)).size !== signals.length
  ) {
    throw new CrossEncoderError(
      "The local cross-encoder returned invalid scores.",
      "invalid_response",
    );
  }
  return {
    method: `cross_encoder_tei:${model}`,
    model,
    signals: signals.map(({ sourceId, score }) => ({ sourceId, score })),
    status: "completed",
  };
}

export async function tryLocalCrossEncoder(query, papers, options) {
  try {
    return await rerankWithLocalCrossEncoder(query, papers, options);
  } catch (error) {
    if (!(error instanceof CrossEncoderError)) throw error;
    return {
      error: error.message,
      errorKind: error.kind,
      method: null,
      model:
        options?.model ?? process.env.CLY_CROSS_ENCODER_MODEL ?? DEFAULT_MODEL,
      signals: [],
      status: "unavailable",
    };
  }
}
