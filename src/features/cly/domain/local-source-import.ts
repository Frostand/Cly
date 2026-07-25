export const SOURCE_IMPORT_LIMITS = {
  maxFiles: 100,
  maxFileBytes: 1_000_000,
  maxTotalBytes: 10_000_000,
} as const;

export interface LocalSourceMetadataRecord {
  title: string;
  authors?: string | string[];
  abstract?: string;
  citation?: string;
  doi?: string;
  journal?: string;
  url?: string;
  year?: number | string;
}

export type SourceImportEntry =
  | { fileName: string; format: "bibtex"; content: string }
  | {
      fileName: string;
      format: "metadata";
      records: LocalSourceMetadataRecord[];
    };

export interface SourceImportFailure {
  fileName: string;
  reason: string;
}

const supportedExtension = (name: string) =>
  name.toLowerCase().endsWith(".bib") || name.toLowerCase().endsWith(".json");

export async function readSelectedSourceFiles(files: FileList | File[]) {
  const selected = Array.from(files);
  if (selected.length === 0) return { entries: [], failures: [] };
  if (selected.length > SOURCE_IMPORT_LIMITS.maxFiles) {
    throw new Error(`Select at most ${SOURCE_IMPORT_LIMITS.maxFiles} files.`);
  }
  const totalBytes = selected.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > SOURCE_IMPORT_LIMITS.maxTotalBytes) {
    throw new Error("The selected source files exceed the 10 MB total limit.");
  }
  const entries: SourceImportEntry[] = [];
  const failures: SourceImportFailure[] = [];
  for (const file of selected) {
    const fileName = file.webkitRelativePath || file.name;
    if (!supportedExtension(file.name)) {
      failures.push({
        fileName,
        reason: "Unsupported extension; use .bib or .json.",
      });
      continue;
    }
    if (file.size > SOURCE_IMPORT_LIMITS.maxFileBytes) {
      failures.push({ fileName, reason: "File exceeds the 1 MB limit." });
      continue;
    }
    try {
      const content = await file.text();
      if (file.name.toLowerCase().endsWith(".bib")) {
        entries.push({ fileName, format: "bibtex", content });
        continue;
      }
      const parsed: unknown = JSON.parse(content);
      const records = Array.isArray(parsed) ? parsed : [parsed];
      if (
        records.length === 0 ||
        records.length > 100 ||
        records.some(
          (record) =>
            !record ||
            typeof record !== "object" ||
            typeof (record as { title?: unknown }).title !== "string",
        )
      ) {
        throw new Error(
          "JSON must contain one metadata object or an array of up to 100 objects with titles.",
        );
      }
      entries.push({
        fileName,
        format: "metadata",
        records: records as LocalSourceMetadataRecord[],
      });
    } catch (error) {
      failures.push({
        fileName,
        reason:
          error instanceof Error ? error.message : "File could not be read.",
      });
    }
  }
  return { entries, failures };
}
