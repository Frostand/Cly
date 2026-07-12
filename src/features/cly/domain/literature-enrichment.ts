import type { Source } from "./types";

export interface LiteratureEnrichment {
  researchProblem: string;
  methods: string[];
  findings: string[];
  limitations: string[];
  method: "deterministic_metadata_fixture_v1";
  enrichedAt: string;
}

export function extractLiteratureMetadata(
  source: Source,
  enrichedAt = new Date().toISOString(),
): LiteratureEnrichment {
  const sentences = source.summary
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return {
    researchProblem: sentences[0] ?? source.title,
    methods: source.methods.length ? source.methods : source.tags.slice(0, 3),
    findings: source.findings.length ? source.findings : sentences.slice(1, 2),
    limitations: source.limitations.length
      ? source.limitations
      : ["Limitations require researcher review of the full paper."],
    method: "deterministic_metadata_fixture_v1",
    enrichedAt,
  };
}

export function previewLiteratureThemes(sources: Source[]) {
  const counts = new Map<string, number>();
  for (const label of sources.flatMap((source) => [
    ...source.tags,
    ...source.methods,
  ])) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )
    .slice(0, 5)
    .map(([label, sourceCount]) => ({ label, sourceCount }));
}
