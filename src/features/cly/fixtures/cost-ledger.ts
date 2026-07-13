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
    runTitle: "Ensemble ×5",
    source: "manual",
    providerEntryId: null,
    amountMinor: 18_420,
    currency: "USD",
    category: "gpu",
    startedAt: "2026-07-07T12:02:00.000Z",
    endedAt: "2026-07-07T15:40:00.000Z",
    confidenceBps: 9000,
    description: "5 × A100 runtime",
    raw: { schema: "cly.manual-cost.v1", note: "Lab rate card" },
    createdAt: "2026-07-07T16:00:00.000Z",
    waste: [],
  },
  {
    id: "cost-run-03-rerun",
    projectId: "project-cly",
    runId: "run-03",
    runTitle: "Ensemble ×8",
    source: "manual",
    providerEntryId: null,
    amountMinor: 22_800,
    currency: "USD",
    category: "rerun",
    startedAt: "2026-07-07T17:20:00.000Z",
    endedAt: "2026-07-07T23:11:00.000Z",
    confidenceBps: 8500,
    description: "Expanded ensemble rerun",
    raw: { schema: "cly.manual-cost.v1", note: "Compute estimate" },
    createdAt: "2026-07-08T00:00:00.000Z",
    waste: ["repeated"],
  },
  {
    id: "cost-run-04-aws",
    projectId: "project-cly",
    runId: "run-04",
    runTitle: "Single shift grid",
    source: "aws-cur",
    providerEntryId: "li-20260710-run04",
    amountMinor: 36_250,
    currency: "USD",
    category: "gpu",
    startedAt: "2026-07-10T08:42:00.000Z",
    endedAt: "2026-07-10T14:51:00.000Z",
    confidenceBps: 9500,
    description: "AmazonEC2 · P5 GPU usage",
    raw: {
      fileName: "aws-cur-july.csv",
      rowNumber: 84,
      schema: "aws-cur.v1",
    },
    createdAt: "2026-07-11T08:00:00.000Z",
    waste: [],
  },
  {
    id: "cost-run-05-api",
    projectId: "project-cly",
    runId: "run-05",
    runTitle: "Compound shift grid",
    source: "aws-cur",
    providerEntryId: "li-20260711-run05",
    amountMinor: 4_410,
    currency: "USD",
    category: "model-api",
    startedAt: "2026-07-11T06:04:00.000Z",
    endedAt: "2026-07-11T08:40:00.000Z",
    confidenceBps: 9500,
    description: "AmazonBedrock · evaluator calls",
    raw: {
      fileName: "aws-cur-july.csv",
      rowNumber: 113,
      schema: "aws-cur.v1",
    },
    createdAt: "2026-07-11T08:40:00.000Z",
    waste: ["abandoned", "unused"],
  },
  {
    id: "cost-run-06-failed",
    projectId: "project-cly",
    runId: "run-06",
    runTitle: "OpenFOAM reproduction",
    source: "manual",
    providerEntryId: null,
    amountMinor: 780,
    currency: "USD",
    category: "cloud",
    startedAt: "2026-07-10T21:48:00.000Z",
    endedAt: "2026-07-10T22:10:00.000Z",
    confidenceBps: 8000,
    description: "Failed reference solver attempt",
    raw: { schema: "cly.manual-cost.v1", note: "On-demand rate" },
    createdAt: "2026-07-10T22:15:00.000Z",
    waste: ["failed"],
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
