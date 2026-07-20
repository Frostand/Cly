import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { navigateToResearch } from "./navigation-helpers";

const inheritedRestriction = {
  obligationId: "obligation-e2e",
  datasetObjectId: "src-03",
  datasetTitle: "Cylinder-flow reference trajectories v2",
  consentProtocolScope: "Protocol permits benchmark validation only.",
  approvedPurposes: ["peer-review", "research-assistance"],
  externalProcessing: "review",
  residency: ["US"],
  retentionExpiresAt: "2027-06-01",
  deletionDueAt: "2027-07-01",
  license: "CC-BY-4.0",
  owner: "Dataset steward",
  reviewDate: "2026-10-01",
};

const obligation = {
  id: "obligation-e2e",
  projectId: "project-cly",
  datasetObjectId: "src-03",
  datasetTitle: "Cylinder-flow reference trajectories v2",
  consentProtocolScope: inheritedRestriction.consentProtocolScope,
  approvedPurposes: inheritedRestriction.approvedPurposes,
  permittedCollaborators: ["reviewer@example.org"],
  externalProcessing: "review",
  permittedProviders: ["openai"],
  residency: inheritedRestriction.residency,
  retentionExpiresAt: inheritedRestriction.retentionExpiresAt,
  deletionDueAt: inheritedRestriction.deletionDueAt,
  license: inheritedRestriction.license,
  owner: inheritedRestriction.owner,
  reviewDate: inheritedRestriction.reviewDate,
  provenanceSource: "Dataset license and protocol P-17",
  notes: "",
  revision: 1,
  createdBy: "local-user",
  updatedBy: "local-user",
  createdAt: "2026-07-13T12:00:00.000Z",
  updatedAt: "2026-07-13T12:00:00.000Z",
};

const summary = {
  obligations: [obligation],
  alerts: [],
  inheritedRestrictions: {
    "claim-01": [inheritedRestriction],
    "art-01": [inheritedRestriction],
  },
};

function evaluation(
  operation: Record<string, unknown>,
  decision: "allow" | "review" | "block",
  category = "external-processing",
) {
  return {
    projectId: "project-cly",
    decision,
    complete: true,
    evaluationHash: `evaluation-${decision}`,
    operation,
    alerts:
      decision === "allow"
        ? []
        : [
            {
              id: `alert-${decision}`,
              projectId: "project-cly",
              sourceObligationId: obligation.id,
              sourceDatasetTitle: obligation.datasetTitle,
              category,
              severity: decision === "block" ? "critical" : "warning",
              affectedObjectIds: ["claim-01"],
              rationale:
                decision === "block"
                  ? "Processing residency is unknown for the restricted dataset."
                  : "External processing requires human review.",
              resolution:
                decision === "block"
                  ? "Choose the recorded US residency."
                  : "Record approval for this exact operation.",
              operation,
              state: "open",
            },
          ],
    approval:
      decision === "allow"
        ? {
            id: "approval-e2e",
            actorId: "local-user",
            rationale: "Reviewed exact operation",
            createdAt: "2026-07-13T12:00:00.000Z",
          }
        : null,
    inheritedRestrictions: summary.inheritedRestrictions,
    evaluatedAt: "2026-07-13T12:00:00.000Z",
  };
}

test.beforeEach(async ({ page }) => {
  await page.route("**/projects/project-cly/obligations", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(summary),
    });
  });
  await page.goto("/");
});

test("shows transitive restrictions and records provider approval", async ({
  page,
}) => {
  let providerApproved = false;
  await page.route("**/obligations/evaluate", async (route) => {
    const operation = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        evaluation(operation, providerApproved ? "allow" : "review"),
      ),
    });
  });
  await page.route("**/obligations/approvals", async (route) => {
    providerApproved = true;
    const body = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        approval: evaluation(body.operation, "allow").approval,
        evaluation: evaluation(body.operation, "allow"),
      }),
    });
  });

  await navigateToResearch(page, "obligations");
  await expect(
    page.getByRole("heading", { name: "Research Data Obligations" }),
  ).toBeVisible();
  await expect(page.getByText(/does not provide legal advice/i)).toBeVisible();
  await expect(
    page.getByText("Cylinder-flow reference trajectories v2").first(),
  ).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations.filter((violation) =>
      ["critical", "serious"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);

  await page.getByRole("button", { name: "Evaluate transmission" }).click();
  await expect(page.getByText("Human approval required")).toBeVisible();
  await page
    .getByLabel("Approval rationale")
    .fill("Reviewed provider, purpose, and current obligation revision.");
  await page.getByRole("button", { name: "Record approval" }).click();
  await expect(page.getByText("Approved transmission")).toBeVisible();

  await page.getByTestId("nav-claims").click();
  await page.getByRole("radio", { name: "Detail" }).click();
  await expect(
    page.getByText("Inherited data restrictions").first(),
  ).toBeVisible();
  await expect(
    page.getByText(/External processing requires review/).first(),
  ).toBeVisible();
});

test("blocks capsule bytes, then permits the exact approved export", async ({
  page,
}) => {
  let approved = false;
  let previewCount = 0;
  await page.route("**/obligations/evaluate", async (route) => {
    const operation = route.request().postDataJSON();
    const decision = approved
      ? "allow"
      : operation.residency === "US"
        ? "review"
        : "block";
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(evaluation(operation, decision, "residency")),
    });
  });
  await page.route("**/obligations/approvals", async (route) => {
    approved = true;
    const body = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        approval: evaluation(body.operation, "allow").approval,
        evaluation: evaluation(body.operation, "allow"),
      }),
    });
  });
  await page.route("**/reviewer-capsule/preview", async (route) => {
    previewCount += 1;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        html: "<!doctype html>",
        sha256: "a".repeat(64),
        manifest: {
          version: 1,
          generatedAt: "2026-07-13T12:00:00.000Z",
          selectedClaimIds: ["claim-01"],
          included: [],
          omitted: [],
        },
      }),
    });
  });

  await page.getByTestId("nav-claims").click();
  await page.getByRole("button", { name: "Reviewer capsule" }).click();
  await page.getByRole("button", { name: "Preview capsule" }).click();
  await expect(page.getByText("Export blocked")).toBeVisible();
  expect(previewCount).toBe(0);

  await page.getByLabel("Processing residency").fill("US");
  await page.getByRole("button", { name: "Preview capsule" }).click();
  await expect(page.getByText("Human approval required")).toBeVisible();
  await page
    .getByLabel("Approval rationale")
    .fill("Named reviewer and US processing match the agreement.");
  await page.getByRole("button", { name: "Record approval" }).click();
  await page.getByRole("button", { name: "Preview capsule" }).click();

  await expect(page.getByText("Safe static preview")).toBeVisible();
  expect(previewCount).toBe(1);
});
