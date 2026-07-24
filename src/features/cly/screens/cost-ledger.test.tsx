import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCostLedgerFixture } from "../fixtures/cost-ledger";
import { createFixtureRepository } from "../fixtures/repository";
import { useClyStore } from "../store/cly-store";
import { CostLedgerScreen } from "./cost-ledger";
import { ClaimsScreen } from "./research-workspaces";

const createCostEntry = useClyStore.getState().createCostEntry;
const importAwsCur = useClyStore.getState().importAwsCur;

describe("cost ledger UI", () => {
  beforeEach(() => {
    const data = createFixtureRepository("active");
    const costs = createCostLedgerFixture("active", data);
    useClyStore.setState({
      activeProjectId: "project-cly",
      activeScreen: "costs",
      claimCosts: costs.claimCosts,
      costLedger: costs.ledger,
      costsError: null,
      costsLoading: false,
      createCostEntry,
      data,
      fixtureMode: "active",
      importAwsCur,
      selectedCostEntryId: costs.ledger.entries[0]?.id ?? null,
      selectedId: null,
      toasts: [],
    });
  });

  it("shows categorized totals, waste filters, and raw provider traceability", async () => {
    const user = userEvent.setup();
    render(<CostLedgerScreen />);

    expect(screen.getByText("USD 0.30")).toBeVisible();
    expect(screen.getByText("5 raw entries")).toBeVisible();
    await user.click(screen.getByText("Basic-health-data model"));
    expect(screen.getByText(/aws-cur\.v1/)).toBeVisible();
    expect(screen.getByText(/demo-cost-ledger\.csv/)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Waste only" }));
    expect(screen.getByText("1 entry needs review")).toBeVisible();
    expect(screen.getAllByText("Non–HDL-C comparator")[0]).toBeVisible();
    expect(
      within(
        document.querySelector('[data-table-id="cost-ledger"]') as HTMLElement,
      ).queryByText("Basic-health-data model"),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Abandoned")[0]).toBeVisible();
  });

  it("converts manual decimal input to integer minor units before saving", async () => {
    const user = userEvent.setup();
    const fixtureEntry = useClyStore.getState().costLedger.entries[0];
    const save = vi.fn().mockResolvedValue({
      ...fixtureEntry,
      id: "cost-created",
      amountMinor: 1234,
    });
    useClyStore.setState({ createCostEntry: save });
    render(<CostLedgerScreen />);

    await user.click(screen.getByRole("button", { name: "Add cost" }));
    const dialog = screen.getByRole("dialog", { name: "Add run cost" });
    await user.type(within(dialog).getByLabelText("Amount"), "12.34");
    await user.clear(within(dialog).getByLabelText("Confidence (%)"));
    await user.type(within(dialog).getByLabelText("Confidence (%)"), "87");
    await user.type(
      within(dialog).getByLabelText("Description"),
      "Reserved GPU rate",
    );
    await user.click(within(dialog).getByRole("button", { name: "Add cost" }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          amountMinor: 1234,
          confidenceBps: 8700,
          currency: "USD",
          description: "Reserved GPU rate",
          runId: "run-01",
        }),
      ),
    );
    expect(
      screen.queryByRole("dialog", { name: "Add run cost" }),
    ).not.toBeInTheDocument();
  });

  it("reads an AWS CUR file and sends the exact CSV for idempotent import", async () => {
    const user = userEvent.setup();
    const ledger = useClyStore.getState().costLedger;
    const runImport = vi.fn().mockResolvedValue({
      duplicateCount: 1,
      importedCount: 1,
      ledger,
      rowCount: 2,
    });
    useClyStore.setState({ importAwsCur: runImport });
    render(<CostLedgerScreen />);

    await user.click(screen.getByRole("button", { name: "Import AWS CUR" }));
    const dialog = screen.getByRole("dialog", { name: "Import AWS CUR" });
    const csv = "identity/LineItemId\nline-1\n";
    await user.upload(
      within(dialog).getByLabelText("Choose AWS CUR CSV"),
      new File([csv], "cur.csv", { type: "text/csv" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Import costs" }),
    );

    await waitFor(() => expect(runImport).toHaveBeenCalledWith(csv, "cur.csv"));
    expect(useClyStore.getState().toasts.at(-1)).toMatchObject({
      title: "AWS CUR imported",
      detail: "1 added · 1 duplicates skipped",
    });
  });

  it("shows deduplicated categorized totals and raw entries on claim detail", async () => {
    const user = userEvent.setup();
    useClyStore.setState({ activeScreen: "claims" });
    render(<ClaimsScreen />);

    await user.click(screen.getByRole("radio", { name: "Detail" }));
    expect(
      screen.getByRole("heading", { name: "Cost to claim" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Supporting runs are counted once across shared artifacts and evidence.",
      ),
    ).toBeVisible();
    expect(screen.getByText("4 deduplicated runs")).toBeVisible();
    expect(screen.getAllByText("Cloud").length).toBeGreaterThan(0);
    await user.click(screen.getByText("Hash verification"));
    expect(screen.getAllByText(/cly\.manual-cost\.v1/).length).toBeGreaterThan(
      0,
    );
  });
});
