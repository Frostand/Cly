export function SourceBadge({ source }: { source: string }) {
  const isSemanticScholar = source === "semantic_scholar";
  return (
    <span
      className={
        isSemanticScholar
          ? "rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800"
          : "rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800"
      }
    >
      {sourceLabel(source)}
    </span>
  );
}

export function sourceLabel(source: string) {
  if (source === "semantic_scholar") {
    return "Semantic Scholar";
  }
  if (source === "both") {
    return "Both";
  }
  return "arXiv";
}
