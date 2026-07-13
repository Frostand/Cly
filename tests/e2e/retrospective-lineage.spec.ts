import { expect, test } from "@playwright/test";

const suggestion = {
  id: "lineage-1",
  projectId: "project-cly",
  logicalKey: "c".repeat(64),
  fingerprint: "a".repeat(64),
  revision: 1,
  lifecycleState: "current",
  supersedesSuggestionId: null,
  chain: [
    "objective",
    "notebook",
    "commit",
    "experiment",
    "artifact",
    "claim",
  ].map((kind) => ({
    kind,
    id: `${kind}-1`,
    label: kind,
    coordinates: {},
  })),
  confidence: 0.78,
  rationale: "A bounded local scan found a complete candidate chain.",
  origin: "inferred",
  reviewState: "unreviewed",
  reviewedBy: null,
  reviewedAt: null,
  createdAt: "2026-07-13T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z",
  evidence: [
    {
      id: "evidence-1",
      projectId: "project-cly",
      suggestionId: "lineage-1",
      evidenceType: "notebook",
      path: "notebooks/analysis.ipynb",
      coordinates: { lineStart: 1 },
      excerpt: null,
      contentHash: "b".repeat(64),
      createdAt: "2026-07-13T00:00:00.000Z",
    },
  ],
};

test("keeps retrospective reconstruction inside the existing graph screen and requires review", async ({
  page,
}) => {
  await page.route(
    "**/api/projects/*/lineage-suggestions/scan",
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          projectId: "project-cly",
          suggestions: [suggestion],
          measurement: {
            id: "measurement-1",
            projectId: "project-cly",
            scanDurationMs: 42,
            timeToFirstChainMs: 23,
            suggestionCount: 1,
            acceptedCount: 0,
            rejectedCount: 0,
            correctionCount: 0,
            manualConfig: {},
            createdAt: "2026-07-13T00:00:00.000Z",
          },
        }),
      });
    },
  );
  await page.route(
    "**/api/projects/*/lineage-suggestions/review",
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          suggestions: [
            {
              ...suggestion,
              reviewState: "approved",
              reviewedAt: "2026-07-13T00:01:00.000Z",
              reviewedBy: "local-user",
            },
          ],
        }),
      });
    },
  );

  await page.goto("/");
  await page.getByTestId("nav-graph").click();
  const panel = page.getByTestId("lineage-reconstruction-panel");
  await expect(panel).toBeVisible();
  await expect(
    panel.getByText("No saved reconstruction suggestions"),
  ).toBeVisible();

  await panel.getByRole("button", { name: "Reconstruct lineage" }).click();
  await expect(
    panel.getByText(
      "objective → notebook → commit → experiment → artifact → claim",
    ),
  ).toBeVisible();
  await expect(panel.getByText("inferred · unreviewed")).toBeVisible();
  await panel.getByText("Inspect 1 evidence coordinates").click();
  await expect(panel.getByText("notebooks/analysis.ipynb")).toBeVisible();

  await panel
    .getByRole("checkbox", { name: /Select lineage suggestion/ })
    .check();
  await panel.getByRole("button", { name: "Approve selected" }).click();
  await expect(panel.getByText("approved", { exact: true })).toBeVisible();
});
