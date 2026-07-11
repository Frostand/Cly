import type { Claim, ContextItem, NextStep } from "./types";

export const calculateContextBudget = (
  items: ContextItem[],
  capacity: number,
) => {
  const selected = items.filter((item) => item.included);
  const tokens = selected.reduce((sum, item) => sum + item.tokens, 0);
  const byCategory = selected.reduce<Record<string, number>>((acc, item) => {
    acc[item.category] = (acc[item.category] ?? 0) + item.tokens;
    return acc;
  }, {});
  return {
    tokens,
    capacity,
    ratio: capacity ? tokens / capacity : 0,
    byCategory,
    staleCount: selected.filter((item) => item.freshness === "Stale").length,
  };
};

export const filterAndSortClaims = (
  claims: Claim[],
  query: string,
  status: string,
  sort: "confidence" | "updated",
) =>
  claims
    .filter(
      (claim) =>
        (!query || claim.text.toLowerCase().includes(query.toLowerCase())) &&
        (status === "All" || claim.status === status),
    )
    .sort((a, b) =>
      sort === "confidence"
        ? b.confidence - a.confidence
        : b.updatedAt.localeCompare(a.updatedAt),
    );

const impactScore = { High: 30, Medium: 20, Low: 10 } as const;
const urgencyScore = { Now: 30, Soon: 20, Later: 10 } as const;
const effortPenalty = { Small: 0, Medium: 5, Large: 10 } as const;

export const prioritizeNextSteps = (steps: NextStep[]) =>
  [...steps].sort((a, b) => {
    const aScore =
      impactScore[a.impact] + urgencyScore[a.urgency] - effortPenalty[a.effort];
    const bScore =
      impactScore[b.impact] + urgencyScore[b.urgency] - effortPenalty[b.effort];
    return bScore - aScore || a.title.localeCompare(b.title);
  });
