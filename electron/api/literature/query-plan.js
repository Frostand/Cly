const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "in",
  "of",
  "the",
  "to",
  "with",
]);
const EXPANSIONS = {
  benchmark: ["dataset", "evaluation"],
  calibration: ["reliability", "coverage", "uncertainty"],
  contradiction: ["contrary", "conflicting", "null-result"],
  reproducibility: ["replication", "code", "data", "protocol"],
  robust: ["distribution-shift", "resilient"],
};

export function createLiteratureQueryPlan(query) {
  const normalizedTerms = [
    ...new Set(
      query
        .toLowerCase()
        .match(/[a-z0-9][a-z0-9-]{1,}/g)
        ?.filter((term) => !STOP_WORDS.has(term)) ?? [],
    ),
  ];
  const expansionTerms = [
    ...new Set(normalizedTerms.flatMap((term) => EXPANSIONS[term] ?? [])),
  ].filter((term) => !normalizedTerms.includes(term));
  return {
    normalizedQuery: normalizedTerms.join(" "),
    expansionTerms,
    expandedQuery: [...normalizedTerms, ...expansionTerms].join(" "),
    method: "deterministic_scientific_thesaurus_v1",
  };
}
