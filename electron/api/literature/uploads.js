import { normalizeLiteratureRecord, parseBibtex } from "./ingestion.js";
import { defineLiteratureSourceAdapter } from "./source-adapter.js";

export function ingestLiteratureUpload(input) {
  if (!input || !new Set(["bibtex", "metadata"]).has(input.format)) {
    throw new Error("Literature uploads require bibtex or metadata format.");
  }
  const records =
    input.format === "bibtex" ? parseBibtex(input.content) : input.records;
  if (!Array.isArray(records) || records.length === 0 || records.length > 100) {
    throw new Error("Literature uploads require between 1 and 100 records.");
  }
  return records.map((record) => ({
    ...normalizeLiteratureRecord(record),
    upload: {
      filename: input.filename?.trim() || null,
      mediaType: input.mediaType?.trim() || null,
    },
  }));
}

export const uploadAdapter = defineLiteratureSourceAdapter({
  id: "upload",
  kind: "upload",
  ingest: ingestLiteratureUpload,
});
