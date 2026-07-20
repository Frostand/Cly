import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  Check,
  Columns3,
  Download,
  Eye,
  GitCompareArrows,
  Plus,
  Quote,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  exportLiteratureMatrixCsv,
  reviewCellsForSource,
  type SourceReviewCell,
  sourceEvidenceSummary,
  standardReviewColumns,
} from "../domain/source-review";
import type { Claim, Source } from "../domain/types";
import { InlineMetadata, PaneHeader, Toolbar } from "./design-system";
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  SearchInput,
  toneForStatus,
} from "./primitives";
import { ClyDataTable } from "./toolkit";

function healthLabel(cell: SourceReviewCell) {
  if (cell.health === "missing") return "Missing evidence";
  if (cell.health === "malformed") return "Malformed record";
  return `${cell.health.charAt(0).toUpperCase()}${cell.health.slice(1)}`;
}

function healthTone(cell: SourceReviewCell) {
  if (cell.health === "verified") return "success" as const;
  if (cell.health === "rejected" || cell.health === "malformed")
    return "danger" as const;
  if (cell.health === "unverified" || cell.health === "missing")
    return "warning" as const;
  return "neutral" as const;
}

export function SourceReviewInspector({
  source,
  onVerificationChange,
}: {
  source: Source;
  onVerificationChange: (
    fieldId: string,
    state: "verified" | "rejected",
  ) => void;
}) {
  const [selectedFieldId, setSelectedFieldId] = useState("researchProblem");
  const cells = reviewCellsForSource(source);
  const selected =
    cells.find((cell) => cell.id === selectedFieldId) ?? cells[0];
  const summary = sourceEvidenceSummary(source);
  return (
    <aside className="cly-source-review-inspector" aria-label="Source evidence">
      <h2 className="cly-sr-only">
        {source.title || "Untitled source"} evidence
      </h2>
      <PaneHeader
        title={source.title || "Untitled source"}
        detail={`${source.type} · ${source.status}`}
        actions={
          <Badge tone={toneForStatus(source.status)}>{source.status}</Badge>
        }
      />
      <div className="cly-source-review-body">
        <InlineMetadata>
          <span>{source.folder || "Unfiled"}</span>
          <span>
            {source.tags.length ? source.tags.join(" · ") : "No tags"}
          </span>
        </InlineMetadata>
        <dl className="cly-source-review-summary">
          <div>
            <dt>Verified fields</dt>
            <dd>
              {summary.verified}/{summary.total}
            </dd>
          </div>
          <div>
            <dt>Needs review</dt>
            <dd>{summary.unverified + summary.incomplete}</dd>
          </div>
          <div>
            <dt>Confidence</dt>
            <dd>
              {Number.isFinite(source.confidence)
                ? `${source.confidence}%`
                : "Invalid"}
            </dd>
          </div>
        </dl>
        <section>
          <h3>Extracted fields</h3>
          <div className="cly-source-field-list">
            {cells.map((cell) => (
              <button
                key={cell.id}
                type="button"
                data-selected={selected?.id === cell.id}
                onClick={() => setSelectedFieldId(cell.id)}
              >
                <span>
                  <strong>{cell.label}</strong>
                  <small>{cell.value}</small>
                </span>
                <Badge tone={healthTone(cell)}>{healthLabel(cell)}</Badge>
              </button>
            ))}
          </div>
        </section>
        {selected ? (
          <section className="cly-source-passage" aria-live="polite">
            <h3>Source passage</h3>
            {selected.passage ? (
              <blockquote>
                <Quote size={13} aria-hidden="true" />
                <p>{selected.passage.quote}</p>
                <cite>
                  {selected.passage.locator || "Locator not recorded"}
                </cite>
              </blockquote>
            ) : (
              <div className="cly-source-evidence-warning">
                <AlertTriangle size={14} aria-hidden="true" />
                <span>
                  <strong>No source passage retained</strong>
                  This value cannot be treated as verified evidence.
                </span>
              </div>
            )}
            <InlineMetadata>
              <span>
                Confidence{" "}
                {selected.confidence === null
                  ? "invalid"
                  : `${selected.confidence}%`}
              </span>
              <span>{healthLabel(selected)}</span>
            </InlineMetadata>
            {selected.passage && selected.verificationState === "unverified" ? (
              <div className="cly-source-review-actions">
                <Button
                  variant="primary"
                  onClick={() => onVerificationChange(selected.id, "verified")}
                >
                  <Check size={13} /> Verify passage
                </Button>
                <Button
                  onClick={() => onVerificationChange(selected.id, "rejected")}
                >
                  Reject
                </Button>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </aside>
  );
}

type GroupMode = "None" | "Type" | "Reading state" | "Folder";

interface CustomColumn {
  id: string;
  label: string;
}

function evidenceCell(
  source: Source,
  column: { id: string; label: string },
  open: (source: Source, cell: SourceReviewCell) => void,
) {
  const cell = reviewCellsForSource(source, [column]).find(
    (item) => item.id === column.id,
  );
  if (!cell) return null;
  return (
    <button
      type="button"
      className="cly-matrix-evidence-cell"
      data-health={cell.health}
      aria-label={`Open ${column.label} evidence for ${source.title}`}
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        open(source, cell);
      }}
    >
      <span>{cell.value}</span>
      <small>
        <Eye size={11} aria-hidden="true" />
        {cell.confidence === null ? "No confidence" : `${cell.confidence}%`} ·{" "}
        {healthLabel(cell)}
        {cell.contradictoryEvidence.length
          ? ` · ${cell.contradictoryEvidence.length} contradiction`
          : ""}
      </small>
    </button>
  );
}

function groupKey(source: Source, mode: GroupMode) {
  if (mode === "Type") return source.type;
  if (mode === "Reading state") return source.status;
  if (mode === "Folder") return source.folder || "Unfiled";
  return "All sources";
}

function downloadCsv(content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "cly-literature-matrix.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function LiteratureMatrixWorkspace({
  sources,
  claims,
  onSelectSource,
  notify,
}: {
  sources: Source[];
  claims: Claim[];
  onSelectSource: (sourceId: string) => void;
  notify: (title: string, detail?: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All review states");
  const [groupMode, setGroupMode] = useState<GroupMode>("None");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOnly, setCompareOnly] = useState(false);
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([]);
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [evidence, setEvidence] = useState<{
    source: Source;
    cell: SourceReviewCell;
  } | null>(null);

  const filtered = useMemo(
    () =>
      sources.filter((source) => {
        const haystack =
          `${source.title} ${source.authors} ${source.tags.join(" ")} ${source.folder ?? ""} ${source.methods.join(" ")} ${source.findings.join(" ")}`.toLowerCase();
        return (
          (!query || haystack.includes(query.toLowerCase())) &&
          (status === "All review states" || source.status === status) &&
          (!compareOnly || compareIds.includes(source.id))
        );
      }),
    [compareIds, compareOnly, query, sources, status],
  );
  const columns = useMemo<ColumnDef<Source, unknown>[]>(
    () => [
      {
        id: "compare",
        header: "Compare",
        enableSorting: false,
        cell: ({ row }) => (
          <label className="cly-matrix-compare">
            <input
              type="checkbox"
              checked={compareIds.includes(row.original.id)}
              aria-label={`Compare ${row.original.title}`}
              onKeyDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) =>
                setCompareIds((current) =>
                  event.target.checked
                    ? [...current, row.original.id]
                    : current.filter((id) => id !== row.original.id),
                )
              }
            />
          </label>
        ),
      },
      {
        accessorKey: "title",
        header: "Source",
        cell: ({ row }) => (
          <div className="cly-literature-paper-cell">
            <strong>{row.original.title || "Untitled source"}</strong>
            <span>
              {row.original.authors || "Unknown authors"} ·{" "}
              {row.original.year || "Unknown year"}
            </span>
          </div>
        ),
      },
      ...[...standardReviewColumns, ...customColumns].map(
        (column): ColumnDef<Source, unknown> => ({
          id: column.id,
          header: column.label,
          accessorFn: (source) =>
            reviewCellsForSource(source, customColumns).find(
              (cell) => cell.id === column.id,
            )?.value ?? "",
          cell: ({ row }) =>
            evidenceCell(row.original, column, (source, cell) =>
              setEvidence({ source, cell }),
            ),
        }),
      ),
      {
        id: "claims",
        header: "Linked claims",
        accessorFn: (source) =>
          source.linkedClaimIds
            .map((id) => claims.find((claim) => claim.id === id)?.text)
            .filter(Boolean)
            .join("; ") || "None",
      },
      {
        accessorKey: "status",
        header: "Reading state",
        cell: ({ row }) => (
          <Badge tone={toneForStatus(row.original.status)}>
            {row.original.status}
          </Badge>
        ),
      },
    ],
    [claims, compareIds, customColumns],
  );
  const groups = useMemo(() => {
    const map = new Map<string, Source[]>();
    filtered.forEach((source) => {
      const key = groupKey(source, groupMode);
      map.set(key, [...(map.get(key) ?? []), source]);
    });
    return [...map.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    );
  }, [filtered, groupMode]);

  const addCustomColumn = () => {
    const label = newColumnName.trim();
    if (!label) return;
    const base =
      label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "custom";
    let id = base;
    let suffix = 2;
    while (
      customColumns.some((column) => column.id === id) ||
      standardReviewColumns.some((column) => column.id === id)
    ) {
      id = `${base}-${suffix++}`;
    }
    setCustomColumns((current) => [...current, { id, label }]);
    setNewColumnName("");
    setColumnDialogOpen(false);
  };

  return (
    <div className="cly-literature-matrix">
      <Toolbar
        label="Literature matrix controls"
        className="cly-literature-matrix-toolbar"
      >
        <SearchInput
          value={query}
          onChange={setQuery}
          label="Filter saved literature"
          placeholder="Filter titles, tags, folders, methods, or findings…"
        />
        <label className="cly-control-label">
          <span className="cly-sr-only">Filter by review state</span>
          <select
            className="cly-select"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option>All review states</option>
            <option>Needs metadata</option>
            <option>Queued</option>
            <option>Reading</option>
            <option>Reviewed</option>
          </select>
        </label>
        <label className="cly-control-label">
          <span className="cly-sr-only">Group literature matrix</span>
          <select
            className="cly-select"
            value={groupMode}
            onChange={(event) => setGroupMode(event.target.value as GroupMode)}
          >
            <option>None</option>
            <option>Type</option>
            <option>Reading state</option>
            <option>Folder</option>
          </select>
        </label>
        <Button onClick={() => setColumnDialogOpen(true)}>
          <Columns3 size={13} /> Add column
        </Button>
        <Button
          disabled={compareIds.length < 2}
          aria-pressed={compareOnly}
          onClick={() => setCompareOnly((current) => !current)}
        >
          <GitCompareArrows size={13} />
          {compareOnly ? "Show all" : `Compare (${compareIds.length})`}
        </Button>
        <Button
          onClick={() => {
            downloadCsv(exportLiteratureMatrixCsv(filtered, customColumns));
            notify(
              "Matrix exported",
              `${filtered.length} source rows exported with passages and verification states.`,
            );
          }}
        >
          <Download size={13} /> Export CSV
        </Button>
      </Toolbar>
      <div className="cly-literature-result-summary" aria-live="polite">
        <div>
          <strong>Saved evidence matrix</strong>
          <span>{filtered.length} sources in this view</span>
        </div>
        <InlineMetadata>
          <span>
            {sources.filter((source) => source.status === "Reviewed").length}{" "}
            reviewed
          </span>
          <span>
            {
              sources.filter(
                (source) => sourceEvidenceSummary(source).incomplete,
              ).length
            }{" "}
            incomplete
          </span>
          <span>{compareIds.length} selected to compare</span>
        </InlineMetadata>
      </div>
      {sources.length === 0 ? (
        <EmptyState
          title="No sources in the literature matrix"
          description="Import a source to begin a review. Extracted cells will retain their passage, confidence, and verification state."
        />
      ) : groups.length === 0 ? (
        <EmptyState
          title="No sources match this view"
          description="Clear a filter or include another reading state."
        />
      ) : (
        <div className="cly-literature-matrix-groups">
          {groups.map(([group, groupSources]) => (
            <section key={group} aria-label={`${group} sources`}>
              {groupMode !== "None" ? (
                <header>
                  <strong>{group}</strong>
                  <span>{groupSources.length}</span>
                </header>
              ) : null}
              <ClyDataTable
                id={`literature-saved-matrix-${groupMode.toLowerCase().replaceAll(" ", "-")}-${group.toLowerCase().replaceAll(" ", "-")}`}
                data={groupSources}
                columns={columns}
                getRowId={(source) => source.id}
                onSelect={(source) => onSelectSource(source.id)}
                emptyMessage="No saved sources match these filters"
              />
            </section>
          ))}
        </div>
      )}
      <Dialog
        open={columnDialogOpen}
        onClose={() => setColumnDialogOpen(false)}
        title="Add review column"
        description="Custom columns use the same passage, confidence, and verification contract as standard columns."
        footer={
          <>
            <Button onClick={() => setColumnDialogOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!newColumnName.trim()}
              onClick={addCustomColumn}
            >
              <Plus size={13} /> Add column
            </Button>
          </>
        }
      >
        <label className="cly-field">
          <span>Column name</span>
          <input
            className="cly-input"
            autoFocus
            value={newColumnName}
            onChange={(event) => setNewColumnName(event.target.value)}
            placeholder="Population, benchmark, outcome…"
          />
        </label>
      </Dialog>
      <Dialog
        open={Boolean(evidence)}
        onClose={() => setEvidence(null)}
        title={evidence ? `${evidence.cell.label} evidence` : "Cell evidence"}
        description={evidence ? evidence.source.title : undefined}
        wide
      >
        {evidence ? (
          <div className="cly-matrix-evidence-dialog">
            <div className="cly-matrix-evidence-value">
              <strong>{evidence.cell.value}</strong>
              <Badge tone={healthTone(evidence.cell)}>
                {healthLabel(evidence.cell)}
              </Badge>
            </div>
            <dl className="cly-source-review-summary">
              <div>
                <dt>Confidence</dt>
                <dd>
                  {evidence.cell.confidence === null
                    ? "Invalid"
                    : `${evidence.cell.confidence}%`}
                </dd>
              </div>
              <div>
                <dt>Verification</dt>
                <dd>{evidence.cell.verificationState ?? "Missing"}</dd>
              </div>
              <div>
                <dt>Reviewer</dt>
                <dd>{evidence.cell.verifiedBy ?? "Not reviewed"}</dd>
              </div>
            </dl>
            <section>
              <h3>
                <ShieldCheck size={14} /> Supporting passage
              </h3>
              {evidence.cell.passage ? (
                <blockquote>
                  <p>{evidence.cell.passage.quote}</p>
                  <cite>
                    {evidence.cell.passage.locator || "Locator not recorded"}
                  </cite>
                </blockquote>
              ) : (
                <p className="cly-source-evidence-warning">
                  <AlertTriangle size={14} /> No supporting passage was
                  retained. Treat this cell as incomplete.
                </p>
              )}
            </section>
            <section>
              <h3>
                <GitCompareArrows size={14} /> Contradictory evidence
              </h3>
              {evidence.cell.contradictoryEvidence.length ? (
                evidence.cell.contradictoryEvidence.map((passage) => (
                  <blockquote
                    key={`${passage.quote}-${passage.locator ?? "unlocated"}`}
                  >
                    <p>{passage.quote}</p>
                    <cite>{passage.locator || "Locator not recorded"}</cite>
                  </blockquote>
                ))
              ) : (
                <p>No contradictory evidence is linked to this source.</p>
              )}
            </section>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
