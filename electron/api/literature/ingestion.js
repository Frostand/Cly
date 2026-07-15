const collapseWhitespace = (value) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

const stripOuterBraces = (value) => {
  let result = collapseWhitespace(value);
  while (
    result.length > 1 &&
    ((result.startsWith("{") && result.endsWith("}")) ||
      (result.startsWith('"') && result.endsWith('"')))
  ) {
    result = collapseWhitespace(result.slice(1, -1));
  }
  return result.replace(/[{}]/g, "");
};

export const normalizeDoi = (value) => {
  const normalized = collapseWhitespace(value)
    .replace(/^doi:\s*/i, "")
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/[?#].*$/, "")
    .replace(/[.,;]+$/, "")
    .toLowerCase();
  return normalized || undefined;
};

export const normalizeLiteratureUrl = (value) => {
  const input = collapseWhitespace(value);
  if (!input) return undefined;
  try {
    const url = new URL(input);
    if (!new Set(["http:", "https:"]).has(url.protocol)) return undefined;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname.length > 1)
      url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return undefined;
  }
};

const normalizeAuthors = (value) => {
  const authors = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\s+and\s+|\s*;\s*/i)
      : [];
  return [
    ...new Set(
      authors.map((author) => stripOuterBraces(author)).filter(Boolean),
    ),
  ];
};

const normalizeYear = (value) => {
  const match = String(value ?? "").match(/\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b/);
  return match ? Number(match[1]) : undefined;
};

const normalizeTitleKey = (value) =>
  stripOuterBraces(value)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const inferProvider = ({ doi, provider, providerId, url }) => {
  if (collapseWhitespace(provider))
    return collapseWhitespace(provider).toLowerCase();
  if (providerId && /arxiv/i.test(providerId)) return "arxiv";
  if (url?.includes("arxiv.org")) return "arxiv";
  if (url?.includes("pubmed.ncbi.nlm.nih.gov")) return "pubmed";
  if (doi) return "doi";
  return "manual";
};

const inferProviderId = ({ doi, provider, providerId, url }) => {
  const explicit = collapseWhitespace(providerId);
  if (explicit) return explicit;
  if (provider === "arxiv" && url) {
    const match = new URL(url).pathname.match(
      /\/(?:abs|pdf)\/([^/]+?)(?:\.pdf)?$/i,
    );
    if (match) return match[1];
  }
  return doi;
};

const buildCitation = ({ authors, doi, title, year }) => {
  const authorText = authors.length ? authors.join(", ") : "Unknown authors";
  return `${authorText}${year ? ` (${year})` : ""}. ${title}.${doi ? ` https://doi.org/${doi}` : ""}`;
};

export function normalizeLiteratureRecord(record) {
  const title = stripOuterBraces(record?.title);
  if (!title) throw new Error("Paper metadata requires a title.");
  const doi = normalizeDoi(record.doi);
  const suppliedUrl = normalizeLiteratureUrl(record.url);
  const url = suppliedUrl ?? (doi ? `https://doi.org/${doi}` : undefined);
  const authors = normalizeAuthors(record.authors ?? record.author);
  const year = normalizeYear(record.year ?? record.date);
  const provider = inferProvider({ ...record, doi, url });
  const providerId = inferProviderId({ ...record, doi, provider, url });
  const abstract = stripOuterBraces(record.abstract);
  const journal = stripOuterBraces(
    record.journal ?? record.journaltitle ?? record.booktitle,
  );
  const normalizedKey = doi
    ? `doi:${doi}`
    : providerId && provider !== "manual"
      ? `${provider}:${providerId.toLowerCase()}`
      : url
        ? `url:${url.toLowerCase()}`
        : `title:${normalizeTitleKey(title)}:${year ?? "unknown"}`;
  const normalized = {
    abstract: abstract || undefined,
    authors,
    citation:
      stripOuterBraces(record.citation) ||
      buildCitation({ authors, doi, title, year }),
    doi,
    journal: journal || undefined,
    normalizedKey,
    provider,
    providerId,
    sourceType: "paper",
    status: "resolved",
    tags: Array.isArray(record.tags)
      ? [...new Set(record.tags.map(collapseWhitespace).filter(Boolean))]
      : [],
    title,
    url,
    year,
  };
  if (!normalized.url && !normalized.citation) {
    throw new Error("Paper metadata requires a URL, DOI, or citation.");
  }
  return normalized;
}

const readBalancedValue = (content, start) => {
  const opener = content[start];
  if (opener === '"') {
    let escaped = false;
    for (let index = start + 1; index < content.length; index += 1) {
      const character = content[index];
      if (character === '"' && !escaped) {
        return { end: index + 1, value: content.slice(start + 1, index) };
      }
      escaped = character === "\\" && !escaped;
      if (character !== "\\") escaped = false;
    }
    throw new Error("Unterminated quoted BibTeX field.");
  }
  if (opener !== "{") {
    const end = content.slice(start).search(/[,\n}]/);
    const stop = end === -1 ? content.length : start + end;
    return { end: stop, value: content.slice(start, stop).trim() };
  }
  let depth = 0;
  for (let index = start; index < content.length; index += 1) {
    if (content[index] === "{") depth += 1;
    if (content[index] === "}") depth -= 1;
    if (depth === 0) {
      return { end: index + 1, value: content.slice(start + 1, index) };
    }
  }
  throw new Error("Unterminated braced BibTeX field.");
};

export function parseBibtex(content) {
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("BibTeX content is required.");
  }
  const records = [];
  const entryPattern =
    /@(article|inproceedings|conference|misc|preprint)\s*[{(]/gi;
  let entryMatch = entryPattern.exec(content);
  while (entryMatch) {
    const entryStart = entryPattern.lastIndex;
    const comma = content.indexOf(",", entryStart);
    if (comma === -1) throw new Error("Invalid BibTeX entry.");
    let index = comma + 1;
    const fields = {};
    while (index < content.length) {
      while (/\s|,/.test(content[index] ?? "")) index += 1;
      if (content[index] === "}" || content[index] === ")") {
        index += 1;
        break;
      }
      const fieldMatch = content
        .slice(index)
        .match(/^([a-z][a-z0-9_-]*)\s*=\s*/i);
      if (!fieldMatch) throw new Error("Invalid BibTeX field.");
      const field = fieldMatch[1].toLowerCase();
      index += fieldMatch[0].length;
      const parsed = readBalancedValue(content, index);
      fields[field] = parsed.value;
      index = parsed.end;
    }
    entryPattern.lastIndex = index;
    records.push({ ...fields, entryType: entryMatch[1].toLowerCase() });
    entryMatch = entryPattern.exec(content);
  }
  if (records.length === 0)
    throw new Error("No supported BibTeX entries were found.");
  return records;
}

const existingRecord = (object) => ({
  ...(object.payload ?? {}),
  title: object.title,
  abstract: object.payload?.abstract ?? object.description,
});

export function findLiteratureDuplicate(candidate, objects) {
  for (const object of objects) {
    if (object.type !== "source" || object.payload?.kind !== "source") continue;
    let normalized;
    try {
      normalized = normalizeLiteratureRecord(existingRecord(object));
    } catch {
      continue;
    }
    if (candidate.doi && normalized.doi === candidate.doi) {
      return { matchedBy: "doi", source: object };
    }
    if (
      candidate.providerId &&
      normalized.providerId &&
      candidate.provider === normalized.provider &&
      candidate.providerId.toLowerCase() === normalized.providerId.toLowerCase()
    ) {
      return { matchedBy: "provider-id", source: object };
    }
    if (candidate.url && normalized.url === candidate.url) {
      return { matchedBy: "url", source: object };
    }
    if (candidate.normalizedKey === normalized.normalizedKey) {
      return { matchedBy: "title-year", source: object };
    }
  }
  return null;
}

export function createGroundedSummary(
  record,
  generatedAt = new Date().toISOString(),
) {
  const abstract = collapseWhitespace(record.abstract);
  if (!abstract) return null;
  const sentences =
    abstract
      .match(/[^.!?]+(?:[.!?]+|$)/g)
      ?.map(collapseWhitespace)
      .filter(Boolean) ?? [];
  const selected = sentences.slice(0, 3);
  if (selected.length === 0) return null;
  return {
    generatedAt,
    method: "extractive_abstract_v1",
    text: selected.join(" "),
    claims: selected.map((text, index) => ({
      text,
      evidence: [
        {
          field: "abstract",
          locator: `abstract:sentence:${index + 1}`,
          quote: text,
        },
      ],
    })),
  };
}
