import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, Coins, FileUp, Plus, ReceiptText } from "lucide-react";
import { useMemo, useState } from "react";
import { PaneHeader, Toolbar } from "../components/design-system";
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  LoadingState,
  Metric,
  PageHeader,
  SearchInput,
} from "../components/primitives";
import { ClyDataTable, ClySplitPane } from "../components/toolkit";
import {
  costCategoryLabels,
  costWasteLabels,
  formatMoney,
  formatMoneyTotals,
  parseMajorMoneyToMinor,
} from "../domain/costs";
import type { CostCategory, CostEntry } from "../domain/types";
import { useClyStore } from "../store/cly-store";

const categories = Object.keys(costCategoryLabels) as CostCategory[];

function localDateTime(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function sourceLabel(source: CostEntry["source"]) {
  return source === "aws-cur" ? "AWS CUR" : "Manual";
}

function wasteTone(waste: CostEntry["waste"]) {
  return waste.includes("failed") || waste.includes("abandoned")
    ? "danger"
    : waste.length
      ? "warning"
      : "neutral";
}

export function CostLedgerScreen() {
  const ledger = useClyStore((state) => state.costLedger);
  const runs = useClyStore((state) => state.data.runs);
  const costsLoading = useClyStore((state) => state.costsLoading);
  const costsError = useClyStore((state) => state.costsError);
  const selectedCostEntryId = useClyStore((state) => state.selectedCostEntryId);
  const setSelectedCostEntry = useClyStore(
    (state) => state.setSelectedCostEntry,
  );
  const loadCosts = useClyStore((state) => state.loadCosts);
  const [query, setQuery] = useState("");
  const [wasteOnly, setWasteOnly] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const filteredEntries = ledger.entries.filter(
    (entry) =>
      (!wasteOnly || entry.waste.length > 0) &&
      (!query ||
        `${entry.runTitle} ${entry.description} ${entry.category} ${entry.source}`
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  const selectedEntry =
    filteredEntries.find((entry) => entry.id === selectedCostEntryId) ??
    filteredEntries[0] ??
    null;
  const columns = useMemo<ColumnDef<CostEntry, unknown>[]>(
    () => [
      {
        accessorKey: "runTitle",
        header: "Run",
        cell: ({ row }) => (
          <div>
            <div className="cly-strong">{row.original.runTitle}</div>
            <div className="cly-faint cly-mono">{row.original.runId}</div>
          </div>
        ),
      },
      {
        accessorKey: "category",
        header: "Category",
        cell: ({ row }) => costCategoryLabels[row.original.category],
      },
      {
        id: "amount",
        header: "Amount",
        cell: ({ row }) => formatMoney(row.original),
        enableSorting: false,
      },
      {
        accessorKey: "source",
        header: "Source",
        cell: ({ row }) => sourceLabel(row.original.source),
      },
      {
        accessorKey: "startedAt",
        header: "Usage",
        cell: ({ row }) => new Date(row.original.startedAt).toLocaleString(),
      },
      {
        accessorKey: "confidenceBps",
        header: "Confidence",
        cell: ({ row }) => `${row.original.confidenceBps / 100}%`,
      },
      {
        id: "waste",
        header: "Waste",
        cell: ({ row }) =>
          row.original.waste.length ? (
            <Badge tone={wasteTone(row.original.waste)}>
              {row.original.waste
                .map((flag) => costWasteLabels[flag])
                .join(", ")}
            </Badge>
          ) : (
            <span className="cly-faint">—</span>
          ),
        enableSorting: false,
      },
    ],
    [],
  );

  return (
    <div className="cly-page cly-page-wide cly-route-costs">
      <PageHeader
        kicker="Cost attribution"
        title="Cost ledger"
        description="Attribute run spend to evidence and claims."
        actions={
          <>
            <Button onClick={() => setImportOpen(true)}>
              <FileUp size={13} /> Import AWS CUR
            </Button>
            <Button
              variant="primary"
              disabled={runs.length === 0}
              onClick={() => setManualOpen(true)}
            >
              <Plus size={13} /> Add cost
            </Button>
          </>
        }
      />

      <div className="cly-metric-row">
        <Metric
          label="Attributed spend"
          value={formatMoneyTotals(ledger.totals)}
          detail={`${ledger.entries.length} raw entries`}
        />
        <Metric
          label="Flagged spend"
          value={formatMoneyTotals(ledger.waste.totals)}
          detail={`${ledger.waste.entryCount} entries need review`}
        />
        <Metric
          label="Categories"
          value={ledger.categorizedTotals.length}
          detail="GPU, cloud, storage, APIs, agents, reruns"
        />
        <Metric
          label="Currencies"
          value={ledger.totals.length}
          detail={
            ledger.conversionState === "unsupported-mixed-currency"
              ? "Kept separate"
              : "No conversion applied"
          }
        />
      </div>

      {ledger.conversionState === "unsupported-mixed-currency" ? (
        <div className="cly-cost-currency-warning" role="status">
          <AlertTriangle size={14} aria-hidden="true" />
          Different currencies are shown separately. Currency conversion is not
          supported.
        </div>
      ) : null}

      {costsError ? (
        <ErrorState
          title="Cost ledger could not load"
          description={costsError}
          onRetry={() => void loadCosts()}
        />
      ) : costsLoading && ledger.entries.length === 0 ? (
        <LoadingState label="Loading cost ledger" />
      ) : ledger.entries.length === 0 ? (
        <EmptyState
          icon={<Coins size={24} />}
          title="No costs attributed"
          description="Add a run cost or import an AWS CUR export."
          action={
            runs.length ? (
              <Button variant="primary" onClick={() => setManualOpen(true)}>
                Add cost
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ClySplitPane
          id="cost-ledger-entry-inspector"
          className="cly-cost-ledger-split"
          secondarySize={34}
          secondaryMin="300px"
          label="Resize cost entry inspector"
          primary={
            <div className="cly-cost-ledger-table-pane">
              <Toolbar label="Filter cost entries">
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  label="Search cost entries"
                  placeholder="Search runs and costs…"
                />
                <Button
                  variant={wasteOnly ? "default" : "ghost"}
                  aria-pressed={wasteOnly}
                  onClick={() => setWasteOnly((value) => !value)}
                >
                  <AlertTriangle size={13} /> Waste only
                </Button>
                <span className="cly-cost-entry-count">
                  {filteredEntries.length} entries
                </span>
              </Toolbar>
              <ClyDataTable
                id="cost-ledger"
                data={filteredEntries}
                columns={columns}
                selectedId={selectedEntry?.id}
                getRowId={(entry) => entry.id}
                onSelect={(entry) => setSelectedCostEntry(entry.id)}
                emptyMessage="No costs match these filters"
              />
            </div>
          }
          secondary={
            selectedEntry ? <CostEntryInspector entry={selectedEntry} /> : null
          }
        />
      )}

      <ManualCostDialog
        open={manualOpen}
        onClose={() => setManualOpen(false)}
      />
      <AwsCurImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
      />
    </div>
  );
}

function CostEntryInspector({ entry }: { entry: CostEntry }) {
  return (
    <aside className="cly-cost-entry-inspector" aria-label="Cost entry details">
      <PaneHeader
        title={entry.runTitle}
        detail={`${sourceLabel(entry.source)} · ${entry.id}`}
      />
      <div className="cly-cost-entry-inspector-content">
        <div className="cly-cost-entry-amount">{formatMoney(entry)}</div>
        <div className="cly-cost-entry-badges">
          <Badge>{costCategoryLabels[entry.category]}</Badge>
          <Badge tone="info">{entry.confidenceBps / 100}% confidence</Badge>
          {entry.waste.map((flag) => (
            <Badge key={flag} tone={wasteTone(entry.waste)}>
              {costWasteLabels[flag]}
            </Badge>
          ))}
        </div>
        <dl className="cly-detail-grid cly-cost-entry-details">
          <dt>Run</dt>
          <dd className="cly-mono">{entry.runId}</dd>
          <dt>Usage start</dt>
          <dd>{new Date(entry.startedAt).toLocaleString()}</dd>
          <dt>Usage end</dt>
          <dd>{new Date(entry.endedAt).toLocaleString()}</dd>
          <dt>Source</dt>
          <dd>{sourceLabel(entry.source)}</dd>
          <dt>Provider ID</dt>
          <dd className="cly-mono">{entry.providerEntryId ?? "—"}</dd>
          <dt>Recorded</dt>
          <dd>{new Date(entry.createdAt).toLocaleString()}</dd>
        </dl>
        {entry.description ? <p>{entry.description}</p> : null}
        <section className="cly-inspector-section">
          <div className="cly-inspector-label">Raw traceability</div>
          <pre className="cly-cost-raw">
            {JSON.stringify(entry.raw, null, 2)}
          </pre>
        </section>
      </div>
    </aside>
  );
}

function ManualCostDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const runs = useClyStore((state) => state.data.runs);
  const createCostEntry = useClyStore((state) => state.createCostEntry);
  const [runId, setRunId] = useState(runs[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [category, setCategory] = useState<CostCategory>("gpu");
  const [startedAt, setStartedAt] = useState(() =>
    localDateTime(new Date(Date.now() - 60 * 60 * 1000)),
  );
  const [endedAt, setEndedAt] = useState(() => localDateTime());
  const [confidence, setConfidence] = useState("90");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    try {
      const amountMinor = parseMajorMoneyToMinor(amount, currency);
      const confidencePercent = Number(confidence);
      if (
        !Number.isInteger(confidencePercent) ||
        confidencePercent < 0 ||
        confidencePercent > 100
      ) {
        throw new Error("Confidence must be a whole percentage from 0 to 100.");
      }
      if (!runId) throw new Error("Select a run.");
      const entry = await createCostEntry({
        amountMinor,
        category,
        confidenceBps: confidencePercent * 100,
        currency,
        description,
        endedAt: new Date(endedAt).toISOString(),
        runId,
        startedAt: new Date(startedAt).toISOString(),
      });
      if (!entry) return;
      setAmount("");
      setDescription("");
      setError(null);
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Cost entry is invalid.",
      );
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add run cost"
      description="Amounts are saved as integer minor units with their original currency."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()}>
            Add cost
          </Button>
        </>
      }
    >
      <div className="cly-cost-form-grid">
        <div className="cly-field cly-cost-form-wide">
          <label htmlFor="cost-run">Run</label>
          <select
            id="cost-run"
            className="cly-select"
            value={runId}
            onChange={(event) => setRunId(event.target.value)}
          >
            {runs.map((run) => (
              <option key={run.id} value={run.id}>
                {run.name} · {run.id}
              </option>
            ))}
          </select>
        </div>
        <div className="cly-field">
          <label htmlFor="cost-amount">Amount</label>
          <input
            id="cost-amount"
            className="cly-input"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="125.00"
          />
        </div>
        <div className="cly-field">
          <label htmlFor="cost-currency">Currency</label>
          <input
            id="cost-currency"
            className="cly-input cly-mono"
            maxLength={3}
            value={currency}
            onChange={(event) => setCurrency(event.target.value.toUpperCase())}
          />
        </div>
        <div className="cly-field">
          <label htmlFor="cost-category">Category</label>
          <select
            id="cost-category"
            className="cly-select"
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as CostCategory)
            }
          >
            {categories.map((value) => (
              <option key={value} value={value}>
                {costCategoryLabels[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="cly-field">
          <label htmlFor="cost-confidence">Confidence (%)</label>
          <input
            id="cost-confidence"
            className="cly-input"
            inputMode="numeric"
            value={confidence}
            onChange={(event) => setConfidence(event.target.value)}
          />
        </div>
        <div className="cly-field">
          <label htmlFor="cost-start">Usage start</label>
          <input
            id="cost-start"
            className="cly-input"
            type="datetime-local"
            value={startedAt}
            onChange={(event) => setStartedAt(event.target.value)}
          />
        </div>
        <div className="cly-field">
          <label htmlFor="cost-end">Usage end</label>
          <input
            id="cost-end"
            className="cly-input"
            type="datetime-local"
            value={endedAt}
            onChange={(event) => setEndedAt(event.target.value)}
          />
        </div>
        <div className="cly-field cly-cost-form-wide">
          <label htmlFor="cost-description">Description</label>
          <textarea
            id="cost-description"
            className="cly-textarea"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Rate source, hardware, or service detail"
          />
        </div>
      </div>
      {error ? (
        <div className="cly-cost-form-error" role="alert">
          {error}
        </div>
      ) : null}
    </Dialog>
  );
}

function AwsCurImportDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const importAwsCur = useClyStore((state) => state.importAwsCur);
  const notify = useClyStore((state) => state.notify);
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState("");
  const [error, setError] = useState<string | null>(null);
  const runImport = async () => {
    if (!csv || !fileName) {
      setError("Choose an AWS CUR CSV file.");
      return;
    }
    const result = await importAwsCur(csv, fileName);
    if (!result) return;
    notify(
      "AWS CUR imported",
      `${result.importedCount} added · ${result.duplicateCount} duplicates skipped`,
    );
    setCsv("");
    setFileName("");
    setError(null);
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Import AWS CUR"
      description="Rows must include the resource tag resourceTags/user:cly-run-id. Reimporting the same line item is safe."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void runImport()}>
            Import costs
          </Button>
        </>
      }
    >
      <label className="cly-cost-file-picker" htmlFor="aws-cur-file">
        <ReceiptText size={24} aria-hidden="true" />
        <strong>{fileName || "Choose AWS CUR CSV"}</strong>
        <span>CSV only · up to 10 MB</span>
        <input
          id="aws-cur-file"
          type="file"
          aria-label="Choose AWS CUR CSV"
          accept=".csv,text/csv"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setFileName(file.name);
            void file
              .text()
              .then(setCsv)
              .catch(() => {
                setError("The selected CSV could not be read.");
              });
          }}
        />
      </label>
      {error ? (
        <div className="cly-cost-form-error" role="alert">
          {error}
        </div>
      ) : null}
    </Dialog>
  );
}
