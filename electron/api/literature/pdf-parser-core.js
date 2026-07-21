import { inflateSync } from "node:zlib";

const DEFAULT_LIMITS = Object.freeze({
  maxBytes: 20 * 1024 * 1024,
  maxPages: 100,
  maxStreams: 500,
  maxTextCharacters: 2_000_000,
});

const decodePdfString = (value) =>
  value.replace(/\\([0-7]{1,3}|[nrtbf()\\])/g, (_match, escaped) => {
    if (/^[0-7]/.test(escaped))
      return String.fromCharCode(Number.parseInt(escaped, 8));
    return { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" }[escaped] ?? escaped;
  });

const extractTextOperators = (content) => {
  const values = [];
  const operatorPattern = /(\((?:\\.|[^\\)])*\)|\[(?:.|\n|\r)*?\])\s*T[Jj]/g;
  for (const match of content.matchAll(operatorPattern)) {
    const operand = match[1];
    if (operand.startsWith("(")) {
      values.push(decodePdfString(operand.slice(1, -1)));
      continue;
    }
    const fragments = [...operand.matchAll(/\((?:\\.|[^\\)])*\)/g)].map(
      (fragment) => decodePdfString(fragment[0].slice(1, -1)),
    );
    if (fragments.length) values.push(fragments.join(""));
  }
  return values
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .trim();
};

const sectionName = (line) => {
  const normalized = line
    .trim()
    .replace(/^\d+(?:\.\d+)*\s+/, "")
    .toLowerCase();
  const names = [
    "abstract",
    "introduction",
    "methods",
    "methodology",
    "materials and methods",
    "datasets",
    "data",
    "results",
    "discussion",
    "limitations",
    "conclusion",
    "conclusions",
    "references",
  ];
  return names.find((name) => normalized === name) ?? null;
};

export function parsePdfBytes(input, limits = {}) {
  const resolved = { ...DEFAULT_LIMITS, ...limits };
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (bytes.length > resolved.maxBytes)
    throw new Error(`PDF exceeds the ${resolved.maxBytes}-byte parsing limit.`);
  const source = bytes.toString("latin1");
  if (!source.startsWith("%PDF-")) throw new Error("Malformed PDF header.");

  const pages = [];
  const streamPattern = /<<(.*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let streamCount = 0;
  let textCharacters = 0;
  for (const match of source.matchAll(streamPattern)) {
    streamCount += 1;
    if (streamCount > resolved.maxStreams)
      throw new Error("PDF contains too many content streams.");
    let stream = Buffer.from(match[2], "latin1");
    if (/\/FlateDecode\b/.test(match[1])) {
      try {
        stream = inflateSync(stream, {
          maxOutputLength: resolved.maxTextCharacters,
        });
      } catch {
        throw new Error("Malformed compressed PDF stream.");
      }
    }
    const text = extractTextOperators(stream.toString("latin1"));
    if (!text) continue;
    textCharacters += text.length;
    if (textCharacters > resolved.maxTextCharacters)
      throw new Error("PDF extracted text exceeds the parsing limit.");
    pages.push({ page: pages.length + 1, text });
    if (pages.length > resolved.maxPages)
      throw new Error(
        `PDF exceeds the ${resolved.maxPages}-page parsing limit.`,
      );
  }
  if (pages.length === 0) throw new Error("PDF contains no extractable text.");

  const sections = [];
  let current = { name: "body", page: 1, text: "" };
  for (const page of pages) {
    if (current?.text.trim() && current.page !== page.page) {
      sections.push({ ...current, text: current.text.trim() });
      current = { name: current.name, page: page.page, text: "" };
    }
    for (const line of page.text.split(/\n+/).map((value) => value.trim())) {
      if (!line) continue;
      const heading = sectionName(line);
      if (heading) {
        if (current.text.trim())
          sections.push({ ...current, text: current.text.trim() });
        if (heading === "references") {
          current = null;
          break;
        }
        current = { name: heading, page: page.page, text: "" };
      } else if (current) {
        current.text += `${current.text ? " " : ""}${line}`;
      }
    }
    if (!current) break;
  }
  if (current?.text.trim())
    sections.push({ ...current, text: current.text.trim() });
  const retainedText = sections.map((section) => section.text).join("\n");
  if (!retainedText)
    throw new Error("PDF contains no body text before references.");
  return {
    pageCount: pages.length,
    pages,
    sections,
    text: retainedText,
    truncated: false,
  };
}

export const PDF_PARSER_LIMITS = DEFAULT_LIMITS;
