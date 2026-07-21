import type {
  Source,
  SourceEvidencePassage,
  SourceExtractedValue,
  SourceVerificationState,
} from "./types";

export const sourceKinds: readonly Source["type"][] = [
  "Paper",
  "PDF",
  "Webpage",
  "Book",
  "Dataset",
  "Documentation",
  "Repository",
  "Hugging Face",
  "Note",
  "Import",
];

export const standardReviewColumns = [
  { id: "researchProblem", label: "Research problem" },
  { id: "method", label: "Method" },
  { id: "principalResult", label: "Principal result" },
  { id: "limitations", label: "Limitations" },
] as const;

export type SourceEvidenceHealth =
  | "verified"
  | "unverified"
  | "rejected"
  | "missing"
  | "malformed";

export interface SourceReviewCell {
  id: string;
  label: string;
  value: string;
  passage: SourceEvidencePassage | null;
  confidence: number | null;
  verificationState: SourceVerificationState | null;
  verifiedBy?: string;
  verifiedAt?: string;
  health: SourceEvidenceHealth;
  contradictoryEvidence: SourceEvidencePassage[];
}

const fallbackValue = (source: Source, id: string) => {
  if (id === "researchProblem") return source.summary;
  if (id === "method") return source.methods.join(", ");
  if (id === "principalResult") return source.findings.join("; ");
  if (id === "limitations") return source.limitations.join("; ");
  return "";
};

function isPassage(value: unknown): value is SourceEvidencePassage {
  if (!value || typeof value !== "object") return false;
  return (
    typeof (value as SourceEvidencePassage).quote === "string" &&
    Boolean((value as SourceEvidencePassage).quote.trim())
  );
}

export function normalizeExtractedValue(
  id: string,
  label: string,
  source: Source,
  candidate: unknown,
): SourceReviewCell {
  const contradiction = Array.isArray(source.contradictoryEvidence)
    ? source.contradictoryEvidence.filter(isPassage)
    : [];
  const record =
    candidate && typeof candidate === "object"
      ? (candidate as Partial<SourceExtractedValue>)
      : null;
  const fallback = fallbackValue(source, id);
  if (!record) {
    return {
      id,
      label,
      value: fallback || "Not extracted",
      passage: null,
      confidence: null,
      verificationState: null,
      health: fallback ? "missing" : "missing",
      contradictoryEvidence: contradiction,
    };
  }
  const value = typeof record.value === "string" ? record.value.trim() : "";
  const confidence =
    typeof record.confidence === "number" &&
    Number.isFinite(record.confidence) &&
    record.confidence >= 0 &&
    record.confidence <= 100
      ? record.confidence
      : null;
  const verificationState = ["unverified", "verified", "rejected"].includes(
    record.verificationState ?? "",
  )
    ? (record.verificationState as SourceVerificationState)
    : null;
  const passage = isPassage(record.passage) ? record.passage : null;
  const malformed = !value || confidence === null || !verificationState;
  const health: SourceEvidenceHealth = malformed
    ? "malformed"
    : !passage
      ? "missing"
      : verificationState;
  return {
    id,
    label,
    value: value || fallback || "Malformed value",
    passage,
    confidence,
    verificationState,
    verifiedBy:
      typeof record.verifiedBy === "string" ? record.verifiedBy : undefined,
    verifiedAt:
      typeof record.verifiedAt === "string" ? record.verifiedAt : undefined,
    health,
    contradictoryEvidence: contradiction,
  };
}

export function reviewCellsForSource(
  source: Source,
  customColumns: readonly { id: string; label: string }[] = [],
) {
  const columns = [
    ...standardReviewColumns,
    ...customColumns.filter(
      (column) =>
        column.id.trim() &&
        !standardReviewColumns.some((item) => item.id === column.id),
    ),
  ];
  return columns.map((column) =>
    normalizeExtractedValue(
      column.id,
      column.label,
      source,
      source.extractedFields?.[column.id] ??
        source.customReviewFields?.[column.id],
    ),
  );
}

export function sourceEvidenceSummary(source: Source) {
  const cells = reviewCellsForSource(source);
  return {
    total: cells.length,
    verified: cells.filter((cell) => cell.health === "verified").length,
    unverified: cells.filter((cell) => cell.health === "unverified").length,
    rejected: cells.filter((cell) => cell.health === "rejected").length,
    incomplete: cells.filter((cell) =>
      ["missing", "malformed"].includes(cell.health),
    ).length,
  };
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function exportLiteratureMatrixCsv(
  sources: readonly Source[],
  customColumns: readonly { id: string; label: string }[] = [],
) {
  const columns = [...standardReviewColumns, ...customColumns];
  const header = [
    "Source",
    "Authors",
    "Year",
    "Type",
    "Reading state",
    "Folder",
    ...columns.flatMap((column) => [
      column.label,
      `${column.label} passage`,
      `${column.label} confidence`,
      `${column.label} verification`,
    ]),
  ];
  const rows = sources.map((source) => {
    const cells = new Map(
      reviewCellsForSource(source, customColumns).map((cell) => [
        cell.id,
        cell,
      ]),
    );
    return [
      source.title,
      source.authors,
      source.year,
      source.type,
      source.status,
      source.folder ?? "Unfiled",
      ...columns.flatMap((column) => {
        const cell = cells.get(column.id);
        return [
          cell?.value ?? "",
          cell?.passage?.quote ?? "",
          cell?.confidence ?? "",
          cell?.verificationState ?? "missing",
        ];
      }),
    ];
  });
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}
