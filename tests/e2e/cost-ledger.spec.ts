import { expect, test } from "@playwright/test";
import { navigateToResearch } from "./navigation-helpers";

type Entry = {
  id: string;
  projectId: string;
  runId: string;
  runTitle: string;
  source: "manual" | "aws-cur";
  providerEntryId: string | null;
  amountMinor: number;
  currency: string;
  category:
    | "gpu"
    | "cloud"
    | "storage"
    | "model-api"
    | "agent"
    | "rerun"
    | "other";
  startedAt: string;
  endedAt: string;
  confidenceBps: number;
  description: string;
  raw: Record<string, unknown>;
  createdAt: string;
  waste: Array<
    | "failed"
    | "duplicated"
    | "abandoned"
    | "unused"
    | "repeated"
    | "stale-rerun"
  >;
};

function aggregate(entries: Entry[]) {
  const totals = new Map<string, number>();
  const categories = new Map<string, Map<string, number>>();
  for (const entry of entries) {
    totals.set(
      entry.currency,
      (totals.get(entry.currency) ?? 0) + entry.amountMinor,
    );
    const categoryTotals =
      categories.get(entry.category) ?? new Map<string, number>();
    categoryTotals.set(
      entry.currency,
      (categoryTotals.get(entry.currency) ?? 0) + entry.amountMinor,
    );
    categories.set(entry.category, categoryTotals);
  }
  const mapTotals = (values: Map<string, number>) =>
    [...values].map(([currency, amountMinor]) => ({ currency, amountMinor }));
  const mappedTotals = mapTotals(totals);
  return {
    totals: mappedTotals,
    categorizedTotals: [...categories].map(([category, values]) => ({
      category,
      totals: mapTotals(values),
    })),
    conversionState:
      mappedTotals.length > 1
        ? "unsupported-mixed-currency"
        : mappedTotals.length
          ? "single-currency"
          : "empty",
  };
}

function ledger(entries: Entry[]) {
  const wasteEntries = entries.filter((entry) => entry.waste.length > 0);
  return {
    ...aggregate(entries),
    entries,
    waste: { ...aggregate(wasteEntries), entryCount: wasteEntries.length },
  };
}

test("records, imports, and attributes cost to a claim", async ({ page }) => {
  let entries: Entry[] = [];
  let manualRequest: Record<string, unknown> | undefined;
  let importedCsv = "";

  await page.route("**/api/projects/project-cly/costs**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (pathname.endsWith("/costs/imports/aws-cur")) {
      const body = request.postDataJSON() as { csv: string; fileName: string };
      importedCsv = body.csv;
      const imported: Entry = {
        id: "cost-aws-e2e",
        projectId: "project-cly",
        runId: "run-02",
        runTitle: "Ensemble ×5",
        source: "aws-cur",
        providerEntryId: "li-e2e-run-02",
        amountMinor: 1900,
        currency: "USD",
        category: "gpu",
        startedAt: "2026-07-07T13:02:00.000Z",
        endedAt: "2026-07-07T14:02:00.000Z",
        confidenceBps: 9500,
        description: "AmazonEC2 · BoxUsage:p5.48xlarge",
        raw: { fileName: body.fileName, rowNumber: 2, schema: "aws-cur.v1" },
        createdAt: "2026-07-13T15:01:00.000Z",
        waste: [],
      };
      entries = [imported, ...entries];
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          rowCount: 2,
          importedCount: 1,
          duplicateCount: 1,
          ledger: ledger(entries),
        }),
      });
      return;
    }

    if (pathname.endsWith("/costs/claims")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            claimId: "claim-01",
            runIds: ["run-02"],
            entries,
            ...aggregate(entries),
          },
        ]),
      });
      return;
    }

    if (request.method() === "POST") {
      manualRequest = request.postDataJSON() as Record<string, unknown>;
      const manual: Entry = {
        id: "cost-manual-e2e",
        projectId: "project-cly",
        runId: String(manualRequest.runId),
        runTitle: "Ensemble ×5",
        source: "manual",
        providerEntryId: null,
        amountMinor: Number(manualRequest.amountMinor),
        currency: String(manualRequest.currency),
        category: "gpu",
        startedAt: String(manualRequest.startedAt),
        endedAt: String(manualRequest.endedAt),
        confidenceBps: Number(manualRequest.confidenceBps),
        description: String(manualRequest.description),
        raw: { schema: "cly.manual-cost.v1", note: manualRequest.description },
        createdAt: "2026-07-13T15:00:00.000Z",
        waste: ["repeated"],
      };
      entries = [manual];
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(manual),
      });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(ledger(entries)),
    });
  });

  await page.goto("/");
  await navigateToResearch(page, "costs");
  await expect(
    page.getByRole("heading", { name: "Cost ledger", level: 1 }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Add cost" }).click();
  const manualDialog = page.getByRole("dialog", { name: "Add run cost" });
  await manualDialog.getByLabel("Run").selectOption("run-02");
  await manualDialog.getByLabel("Amount").fill("12.34");
  await manualDialog.getByLabel("Description").fill("E2E rate card");
  await manualDialog.getByRole("button", { name: "Add cost" }).click();

  expect(manualRequest).toMatchObject({
    runId: "run-02",
    amountMinor: 1234,
    currency: "USD",
    confidenceBps: 9000,
  });
  await expect(
    page.getByText("USD 12.34", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Repeated", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("cly.manual-cost.v1", { exact: false }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Import AWS CUR" }).click();
  const csv = [
    "identity/LineItemId,resourceTags/user:cly-run-id,lineItem/UsageStartDate,lineItem/UsageEndDate,lineItem/UnblendedCost,lineItem/CurrencyCode,lineItem/ProductCode,lineItem/UsageType,lineItem/ResourceId",
    "li-e2e-run-02,run-02,2026-07-07T13:02:00Z,2026-07-07T14:02:00Z,19.00,USD,AmazonEC2,BoxUsage:p5.48xlarge,i-e2e",
  ].join("\n");
  await page.getByLabel("Choose AWS CUR CSV").setInputFiles({
    name: "aws-cur-e2e.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("button", { name: "Import costs" }).click();

  await expect(page.getByText("AWS CUR imported")).toBeVisible();
  expect(importedCsv).toBe(csv);
  await expect(
    page.getByText("USD 31.34", { exact: true }).first(),
  ).toBeVisible();

  await page.getByTestId("nav-claims").click();
  await page.getByRole("radio", { name: "Detail" }).click();
  await expect(
    page.getByText("USD 31.34", { exact: true }).last(),
  ).toBeVisible();
  await expect(page.getByText("1 deduplicated run")).toBeVisible();
  const importedDisclosure = page
    .locator(".cly-claim-cost-entries details")
    .filter({ hasText: "AWS CUR" })
    .first();
  await importedDisclosure.locator("summary").click();
  await expect(
    importedDisclosure.getByText("aws-cur.v1", { exact: false }),
  ).toBeVisible();
});
