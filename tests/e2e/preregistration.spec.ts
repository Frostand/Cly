import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("preregisters an experiment and acknowledges a retrospective deviation", async ({
  page,
}) => {
  let snapshot:
    | {
        id: string;
        projectId: string;
        experimentId: string;
        version: number;
        amendsSnapshotId: null;
        content: Record<string, string | string[]>;
        contentHash: string;
        actorType: "human";
        actorId: string;
        origin: "human";
        provenanceEventId: string;
        createdAt: string;
        finalEvaluation: null | {
          id: string;
          actorId: string;
          provenanceEventId: string;
          evaluatedAt: string;
        };
        deviations: Array<Record<string, unknown>>;
      }
    | undefined;
  let snapshotRequest: Record<string, unknown> | undefined;
  let deviationRequest: Record<string, unknown> | undefined;

  await page.route(
    "**/api/projects/project-cly/experiments/*/preregistrations",
    async (route) => {
      const request = route.request();
      snapshotRequest = request.postDataJSON();
      const parts = new URL(request.url()).pathname.split("/");
      const experimentId = parts[parts.indexOf("experiments") + 1];
      snapshot = {
        id: "snapshot-e2e",
        projectId: "project-cly",
        experimentId,
        version: 1,
        amendsSnapshotId: null,
        content: snapshotRequest?.content as Record<string, string | string[]>,
        contentHash: "a".repeat(64),
        actorType: "human",
        actorId: "local-user",
        origin: "human",
        provenanceEventId: "event-snapshot-e2e",
        createdAt: "2026-07-13T12:00:00.000Z",
        finalEvaluation: null,
        deviations: [],
      };
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(snapshot),
      });
    },
  );

  await page.route(
    "**/api/projects/project-cly/preregistrations/snapshot-e2e/final-evaluation",
    async (route) => {
      if (!snapshot) throw new Error("Snapshot was not created.");
      snapshot = {
        ...snapshot,
        finalEvaluation: {
          id: "evaluation-e2e",
          actorId: "local-user",
          provenanceEventId: "event-evaluation-e2e",
          evaluatedAt: "2026-07-13T13:00:00.000Z",
        },
      };
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(snapshot),
      });
    },
  );

  await page.route(
    "**/api/projects/project-cly/preregistrations/snapshot-e2e/deviations",
    async (route) => {
      if (!snapshot) throw new Error("Snapshot was not created.");
      deviationRequest = route.request().postDataJSON();
      const fieldPath = deviationRequest?.fieldPath as string;
      const deviation = {
        id: "deviation-e2e",
        projectId: "project-cly",
        snapshotId: snapshot.id,
        fieldPath,
        beforeValue: snapshot.content[fieldPath.slice(1)],
        afterValue: deviationRequest?.afterValue,
        rationale: deviationRequest?.rationale,
        declarationTiming: "retrospective",
        actorId: "local-user",
        provenanceEventId: "event-deviation-e2e",
        declaredAt: "2026-07-13T14:00:00.000Z",
        acknowledgement: null,
      };
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(deviation),
      });
    },
  );

  await page.route(
    "**/api/projects/project-cly/deviations/deviation-e2e/acknowledgements",
    async (route) => {
      if (!snapshot || !deviationRequest) {
        throw new Error("Deviation was not created.");
      }
      const fieldPath = deviationRequest.fieldPath as string;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "deviation-e2e",
          projectId: "project-cly",
          snapshotId: snapshot.id,
          fieldPath,
          beforeValue: snapshot.content[fieldPath.slice(1)],
          afterValue: deviationRequest.afterValue,
          rationale: deviationRequest.rationale,
          declarationTiming: "retrospective",
          actorId: "local-user",
          provenanceEventId: "event-deviation-e2e",
          declaredAt: "2026-07-13T14:00:00.000Z",
          acknowledgement: {
            id: "ack-e2e",
            state: "acknowledged",
            actorId: "local-user",
            provenanceEventId: "event-ack-e2e",
            acknowledgedAt: "2026-07-13T14:01:00.000Z",
          },
        }),
      });
    },
  );

  await page.goto("/");
  await page.getByTestId("nav-experiments").click();
  await page.locator('[data-table-id="experiments"] tbody tr').first().click();
  await page.getByRole("radio", { name: "Preregistration" }).click();
  await expect(page.getByTestId("preregistration-workspace")).toBeVisible();

  await page.getByRole("button", { name: "Create snapshot" }).first().click();
  const snapshotDialog = page.getByRole("dialog", {
    name: "Preregister analysis",
  });
  await expect(snapshotDialog.getByLabel("Hypothesis")).toBeFocused();
  await expect(snapshotDialog.getByLabel("Hypothesis")).not.toHaveValue("");
  await snapshotDialog
    .getByLabel("Primary metrics")
    .fill("Worst-group error, ECE");
  await snapshotDialog
    .getByLabel("Success criteria")
    .fill("Worst-group error improves by two points.");
  await snapshotDialog.getByRole("button", { name: "Lock snapshot" }).click();

  await expect(page.getByRole("heading", { name: "Version 1" })).toBeVisible();
  expect(snapshotRequest).toMatchObject({
    actorId: "local-user",
    actorType: "human",
    origin: "human",
    content: {
      primaryMetrics: ["Worst-group error", "ECE"],
      successCriteria: "Worst-group error improves by two points.",
    },
  });

  await page.getByRole("button", { name: "Record evaluation" }).click();
  const evaluationDialog = page.getByRole("dialog", {
    name: "Record final evaluation",
  });
  await expect(evaluationDialog).toContainText(
    "Deviations declared after this point are marked retrospective.",
  );
  await evaluationDialog
    .getByRole("button", { name: "Record evaluation" })
    .click();
  await expect(page.getByText("Final evaluation recorded")).toBeVisible();

  await page.getByRole("button", { name: "Declare deviation" }).click();
  const deviationDialog = page.getByRole("dialog", {
    name: "Declare analysis deviation",
  });
  await expect(deviationDialog).toContainText(
    "This will be recorded as retrospective.",
  );
  await deviationDialog
    .getByLabel("New value")
    .fill("Use a stratified paired analysis with bootstrap intervals.");
  await deviationDialog
    .getByLabel("Rationale")
    .fill("Sparse strata invalidated the planned interval estimator.");
  await deviationDialog
    .getByRole("button", { name: "Record deviation" })
    .click();

  await expect(page.getByText("Retrospective", { exact: true })).toBeVisible();
  expect(deviationRequest).toMatchObject({
    fieldPath: "/analysisPlan",
    afterValue: "Use a stratified paired analysis with bootstrap intervals.",
    rationale: "Sparse strata invalidated the planned interval estimator.",
  });
  await page.getByRole("button", { name: "Acknowledge" }).click();
  await expect(page.getByText("Acknowledged by local-user")).toBeVisible();

  const accessibility = await new AxeBuilder({ page })
    .include('[data-testid="preregistration-workspace"]')
    .analyze();
  expect(
    accessibility.violations.filter(
      (violation) =>
        violation.impact === "critical" || violation.impact === "serious",
    ),
  ).toEqual([]);
});
