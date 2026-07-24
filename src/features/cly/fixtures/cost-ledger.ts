import type {
  ClaimCostSummary,
  ClyRepositoryData,
  CostAggregate,
  CostCategory,
  CostEntry,
  CostLedger,
  FixtureMode,
  MoneyTotal,
} from "../domain/types";

const categories: CostCategory[] = [
  "gpu",
  "cloud",
  "storage",
  "model-api",
  "agent",
  "rerun",
  "other",
];

export const emptyCostAggregate = (): CostAggregate => ({
  categorizedTotals: [],
  conversionState: "empty",
  totals: [],
});

export const emptyCostLedger = (): CostLedger => ({
  ...emptyCostAggregate(),
  entries: [],
  waste: { ...emptyCostAggregate(), entryCount: 0 },
});

function aggregate(entries: CostEntry[]): CostAggregate {
  const totals = new Map<string, number>();
  const categoryTotals = new Map<CostCategory, Map<string, number>>();
  for (const entry of entries) {
    totals.set(
      entry.currency,
      (totals.get(entry.currency) ?? 0) + entry.amountMinor,
    );
    const values =
      categoryTotals.get(entry.category) ?? new Map<string, number>();
    values.set(
      entry.currency,
      (values.get(entry.currency) ?? 0) + entry.amountMinor,
    );
    categoryTotals.set(entry.category, values);
  }
  const mapTotals = (values: Map<string, number>): MoneyTotal[] =>
    [...values]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, amountMinor]) => ({ amountMinor, currency }));
  const mappedTotals = mapTotals(totals);
  return {
    categorizedTotals: categories
      .filter((category) => categoryTotals.has(category))
      .map((category) => ({
        category,
        totals: mapTotals(categoryTotals.get(category) ?? new Map()),
      })),
    conversionState:
      mappedTotals.length > 1
        ? "unsupported-mixed-currency"
        : mappedTotals.length
          ? "single-currency"
          : "empty",
    totals: mappedTotals,
  };
}

const fixtureEntries: CostEntry[] = [
  {
    id: "cost-run-02-gpu",
    projectId: "project-cly",
    runId: "run-02",
    runTitle: "Hash verification",
    source: "manual",
    providerEntryId: null,
    amountMinor: 2,
    currency: "USD",
    category: "storage",
    startedAt: "2026-07-22T18:48:00.000Z",
    endedAt: "2026-07-22T18:48:01.000Z",
    confidenceBps: 10000,
    description: "Local storage allocation for six CDC files",
    raw: { schema: "cly.manual-cost.v1", note: "Estimated local storage" },
    createdAt: "2026-07-22T18:50:00.000Z",
    waste: [],
  },
  {
    id: "cost-run-03-rerun",
    projectId: "project-cly",
    runId: "run-03",
    runTitle: "LDL-C-only baseline",
    source: "manual",
    providerEntryId: null,
    amountMinor: 4,
    currency: "USD",
    category: "cloud",
    startedAt: "2026-07-22T18:49:00.000Z",
    endedAt: "2026-07-22T18:49:01.000Z",
    confidenceBps: 9500,
    description: "CPU benchmark allocation",
    raw: { schema: "cly.manual-cost.v1", note: "Equivalent hosted CPU rate" },
    createdAt: "2026-07-22T18:50:00.000Z",
    waste: [],
  },
  {
    id: "cost-run-04-aws",
    projectId: "project-cly",
    runId: "run-04",
    runTitle: "Basic-health-data model",
    source: "aws-cur",
    providerEntryId: "li-20260710-run04",
    amountMinor: 9,
    currency: "USD",
    category: "cloud",
    startedAt: "2026-07-22T18:49:00.000Z",
    endedAt: "2026-07-22T18:49:01.000Z",
    confidenceBps: 10000,
    description: "Five-fold CPU model evaluation",
    raw: {
      fileName: "demo-cost-ledger.csv",
      rowNumber: 4,
      schema: "aws-cur.v1",
    },
    createdAt: "2026-07-22T18:50:00.000Z",
    waste: [],
  },
  {
    id: "cost-run-05-api",
    projectId: "project-cly",
    runId: "run-05",
    runTitle: "Threshold grid",
    source: "aws-cur",
    providerEntryId: "li-20260711-run05",
    amountMinor: 12,
    currency: "USD",
    category: "model-api",
    startedAt: "2026-07-22T19:12:00.000Z",
    endedAt: "2026-07-22T19:30:00.000Z",
    confidenceBps: 9500,
    description: "Methods-review agent calls",
    raw: {
      fileName: "demo-cost-ledger.csv",
      rowNumber: 5,
      schema: "aws-cur.v1",
    },
    createdAt: "2026-07-22T19:30:00.000Z",
    waste: [],
  },
  {
    id: "cost-run-06-failed",
    projectId: "project-cly",
    runId: "run-06",
    runTitle: "Non–HDL-C comparator",
    source: "manual",
    providerEntryId: null,
    amountMinor: 3,
    currency: "USD",
    category: "cloud",
    startedAt: "2026-07-22T19:22:00.000Z",
    endedAt: "2026-07-22T19:23:00.000Z",
    confidenceBps: 8000,
    description: "Superseded exploratory comparator attempt",
    raw: { schema: "cly.manual-cost.v1", note: "Local CPU estimate" },
    createdAt: "2026-07-22T19:24:00.000Z",
    waste: ["abandoned"],
  },
];

export function createCostLedgerFixture(
  mode: FixtureMode,
  data: ClyRepositoryData,
): { ledger: CostLedger; claimCosts: Record<string, ClaimCostSummary> } {
  const entries = ["empty", "new", "loading"].includes(mode)
    ? []
    : fixtureEntries.map((entry) => ({ ...entry, raw: { ...entry.raw } }));
  const wasteEntries = entries.filter((entry) => entry.waste.length > 0);
  const ledger: CostLedger = {
    ...aggregate(entries),
    entries,
    waste: {
      ...aggregate(wasteEntries),
      entryCount: wasteEntries.length,
    },
  };
  const claimCosts = Object.fromEntries(
    data.claims.map((claim) => {
      const runIds = new Set<string>();
      for (const experiment of data.experiments) {
        if (claim.experimentIds.includes(experiment.id)) {
          for (const runId of experiment.runIds) runIds.add(runId);
        }
      }
      for (const artifact of data.artifacts) {
        if (
          claim.artifactIds.includes(artifact.id) ||
          artifact.claimIds.includes(claim.id)
        ) {
          runIds.add(artifact.runId);
        }
      }
      const supportingEntries = entries.filter((entry) =>
        runIds.has(entry.runId),
      );
      return [
        claim.id,
        {
          ...aggregate(supportingEntries),
          claimId: claim.id,
          entries: supportingEntries,
          runIds: [...runIds].sort(),
        },
      ];
    }),
  );
  return { claimCosts, ledger };
}
