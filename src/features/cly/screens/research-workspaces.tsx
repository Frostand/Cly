import type { ColumnDef } from "@tanstack/react-table";
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowRight,
  Beaker,
  BookOpen,
  Braces,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clipboard,
  Clock3,
  Database,
  Download,
  ExternalLink,
  FileChartColumn,
  FileCode2,
  FileInput,
  FileText,
  Folder,
  FolderInput,
  FolderOpen,
  GitBranch,
  Link2,
  ListFilter,
  Merge,
  MoreHorizontal,
  Notebook,
  PanelRightClose,
  Plus,
  ShieldCheck,
  Sparkles,
  Star,
  Table2,
  Tag,
  TestTube2,
  Upload,
  X,
} from "lucide-react";
import { type CSSProperties, type ReactNode, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Metric,
  PageHeader,
  Panel,
  SearchInput,
  Section,
  Segmented,
  toneForStatus,
} from "../components/primitives";
import { ClyDataTable } from "../components/toolkit";
import { ExecutionStrip } from "../components/visuals";
import { filterAndSortClaims } from "../domain/logic";
import type {
  Claim,
  ClaimStatus,
  CodeArtifact,
  Experiment,
  NotebookArtifact,
  Source,
} from "../domain/types";
import { mockServices } from "../services/mock-services";
import { claimStatusTone, useClyStore } from "../store/cly-store";

function relativeDateLabel(value: string) {
  const updated = new Date(value).getTime();
  const now = new Date("2026-07-12T12:00:00.000Z").getTime();
  const hours = Math.max(1, Math.round((now - updated) / 3_600_000));
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

function SourceTypeIcon({
  source,
  size = 14,
}: {
  source: Source;
  size?: number;
}) {
  if (source.type === "Dataset")
    return <Database size={size} aria-hidden="true" />;
  if (source.type === "Documentation" || source.type === "Webpage")
    return <Link2 size={size} aria-hidden="true" />;
  return <FileText size={size} aria-hidden="true" />;
}

function RatingDots({ value, label }: { value: number; label: string }) {
  const filled = Math.max(1, Math.round(value / 20));
  const markers = ["one", "two", "three", "four", "five"] as const;
  return (
    <span
      className="cly-rw-rating"
      role="img"
      aria-label={`${label}: ${value}%`}
    >
      {markers.map((marker, index) => (
        <i key={marker} data-active={index < filled} />
      ))}
    </span>
  );
}

function InspectorTitle({
  eyebrow,
  title,
  detail,
  onClose,
}: {
  eyebrow: ReactNode;
  title: string;
  detail?: ReactNode;
  onClose: () => void;
}) {
  return (
    <header className="cly-rw-inspector-header">
      <div>
        <div className="cly-rw-eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
        {detail ? (
          <div className="cly-rw-inspector-subtitle">{detail}</div>
        ) : null}
      </div>
      <Button
        variant="ghost"
        iconOnly
        aria-label="Close detail pane"
        onClick={onClose}
      >
        <PanelRightClose size={14} />
      </Button>
    </header>
  );
}

export function SourcesScreen() {
  const sources = useClyStore((s) => s.data.sources);
  const claims = useClyStore((s) => s.data.claims);
  const selectedId = useClyStore((s) => s.selectedId);
  const setSelected = useClyStore((s) => s.setSelected);
  const inspectorOpen = useClyStore((s) => s.inspectorOpen);
  const toggleInspector = useClyStore((s) => s.toggleInspector);
  const notify = useClyStore((s) => s.notify);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("All");
  const [sort, setSort] = useState<"Relevance" | "Newest" | "Title">(
    "Relevance",
  );
  const [importOpen, setImportOpen] = useState(false);
  const [title, setTitle] = useState("");
  const relevanceRank = { Core: 0, High: 1, Medium: 2, Low: 3 };
  const filtered = [...sources]
    .filter(
      (source) =>
        (!query ||
          `${source.title} ${source.authors} ${source.tags.join(" ")}`
            .toLowerCase()
            .includes(query.toLowerCase())) &&
        (type === "All" || source.type === type),
    )
    .sort((a, b) => {
      if (sort === "Newest") return b.year - a.year;
      if (sort === "Title") return a.title.localeCompare(b.title);
      return relevanceRank[a.relevance] - relevanceRank[b.relevance];
    });
  const selected =
    sources.find((source) => source.id === selectedId) ?? sources[0];
  const sourceColumns = useMemo<ColumnDef<Source, unknown>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Title",
        cell: ({ row }) => (
          <div className="cly-source-cell">
            <span
              className="cly-rw-document-preview"
              data-type={row.original.type}
            >
              <SourceTypeIcon source={row.original} size={15} />
            </span>
            <div>
              <div>{row.original.title}</div>
              <div className="cly-faint cly-rw-cell-meta">
                {row.original.path}
              </div>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => (
          <span className="cly-rw-icon-label">
            <SourceTypeIcon source={row.original} size={13} />
            {row.original.type}
          </span>
        ),
      },
      {
        id: "authors-year",
        header: "Authors / year",
        accessorFn: (row) => `${row.authors} ${row.year}`,
        cell: ({ row }) => (
          <span className="cly-rw-two-line-cell">
            <span>{row.original.authors}</span>
            <small>{row.original.year}</small>
          </span>
        ),
      },
      {
        accessorKey: "relevance",
        header: "Relevance",
        cell: ({ row }) => (
          <span className="cly-rw-relevance-cell">
            <RatingDots
              value={row.original.confidence}
              label={`${row.original.title} relevance`}
            />
            <small>{row.original.relevance}</small>
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Extraction",
        cell: ({ row }) => (
          <Badge tone={toneForStatus(row.original.status)}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        id: "links",
        header: "Linked claims",
        accessorFn: (row) => `${row.linkedClaimIds.length}`,
        cell: ({ row }) => (
          <span className="cly-rw-link-count">
            <Link2 size={12} /> {row.original.linkedClaimIds.length}
          </span>
        ),
      },
      {
        accessorKey: "updatedAt",
        header: "Last updated",
        cell: ({ row }) => relativeDateLabel(row.original.updatedAt),
      },
    ],
    [],
  );

  const importSource = async () => {
    const source = await mockServices.sources.create({
      title: title.trim() || "Imported source",
      type: "Paper",
    });
    setImportOpen(false);
    setTitle("");
    setSelected(source.id);
    notify(
      "Source imported",
      "Extraction and metadata are simulated in fixture mode.",
    );
  };

  return (
    <div className="cly-page cly-page-wide cly-route-sources">
      <PageHeader
        kicker="Research"
        title="Sources"
        description="Manage and explore the evidence behind your research."
        actions={
          <>
            <Button
              onClick={() =>
                notify(
                  "Folder import preview",
                  "12 supported source files were discovered. No filesystem changes were made.",
                )
              }
            >
              <FolderInput size={13} /> Import folder
            </Button>
            <Button variant="primary" onClick={() => setImportOpen(true)}>
              <Upload size={13} /> Import source <ChevronDown size={12} />
            </Button>
          </>
        }
      />
      {sources.length === 0 ? (
        <EmptyState
          title="No sources in this project"
          description="Import a paper, note, dataset, or URL."
          action={
            <Button variant="primary" onClick={() => setImportOpen(true)}>
              Import source
            </Button>
          }
        />
      ) : (
        <div
          className="cly-rw-master-detail cly-rw-sources-workspace"
          data-inspector-open={inspectorOpen && Boolean(selected)}
        >
          <main className="cly-rw-master-pane">
            <div className="cly-rw-toolbar">
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Search sources…"
              />
              <Button
                onClick={() =>
                  notify("Source filters", "Filters are ready for selection.")
                }
              >
                <ListFilter size={13} /> Filters
              </Button>
              <select
                className="cly-select cly-rw-compact-select"
                value={type}
                onChange={(event) => setType(event.target.value)}
                aria-label="Filter source type"
              >
                <option>All</option>
                {Array.from(new Set(sources.map((item) => item.type))).map(
                  (item) => (
                    <option key={item}>{item}</option>
                  ),
                )}
              </select>
              <Button
                onClick={() =>
                  notify("Tag filter", "Choose one or more source tags.")
                }
              >
                <Tag size={13} /> Tags <ChevronDown size={11} />
              </Button>
              <span className="cly-rw-toolbar-spacer" />
              <select
                className="cly-select cly-rw-sort-select"
                value={sort}
                onChange={(event) =>
                  setSort(
                    event.target.value as "Relevance" | "Newest" | "Title",
                  )
                }
                aria-label="Sort sources"
              >
                <option>Relevance</option>
                <option>Newest</option>
                <option>Title</option>
              </select>
              <Button
                variant="ghost"
                iconOnly
                aria-label="More import options"
                onClick={() =>
                  notify(
                    "Import options",
                    "BibTeX, URL, folder, and duplicate detection are available.",
                  )
                }
              >
                <MoreHorizontal size={14} />
              </Button>
            </div>
            <ClyDataTable
              id="sources-redesign"
              data={filtered}
              columns={sourceColumns}
              getRowId={(row) => row.id}
              selectedId={selected?.id}
              onSelect={(row) => {
                setSelected(row.id);
              }}
            />
            <footer className="cly-rw-table-footer">
              <span>
                {filtered.length ? `1–${filtered.length}` : "0"} of{" "}
                {sources.length}
              </span>
              <span className="cly-rw-toolbar-spacer" />
              <Button
                variant="ghost"
                iconOnly
                aria-label="Previous page"
                disabled
              >
                <ChevronRight size={13} className="cly-rw-flip-x" />
              </Button>
              <span className="cly-rw-page-number">1</span>
              <Button variant="ghost" iconOnly aria-label="Next page" disabled>
                <ChevronRight size={13} />
              </Button>
              <span>25 / page</span>
            </footer>
          </main>
          {inspectorOpen && selected ? (
            <SourceInspector
              source={selected}
              claims={claims}
              onClose={toggleInspector}
            />
          ) : null}
        </div>
      )}
      <Dialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import source"
        description="This fixture flow demonstrates a successful import without reading a real file."
        footer={
          <>
            <Button onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => void importSource()}>
              Import and scan
            </Button>
          </>
        }
      >
        <div className="cly-field">
          <label htmlFor="source-title">Source title</label>
          <input
            className="cly-input"
            id="source-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Paper, dataset, documentation, or note"
          />
        </div>
        <div className="cly-callout" style={{ marginTop: 12 }}>
          Supported in the production boundary: PDF, paper, book chapter,
          webpage, dataset description, Markdown, BibTeX, image, and custom
          source.
        </div>
      </Dialog>
    </div>
  );
}

function SourceInspector({
  source,
  claims,
  onClose,
}: {
  source: Source;
  claims: Claim[];
  onClose: () => void;
}) {
  const notify = useClyStore((s) => s.notify);
  const passages = source.findings.length ? source.findings : [source.summary];
  return (
    <aside
      className="cly-rw-inspector cly-rw-source-inspector"
      data-inline-inspector
      aria-label="Source details"
    >
      <InspectorTitle
        eyebrow={
          <span className="cly-rw-icon-label">
            <SourceTypeIcon source={source} size={12} /> {source.type}
          </span>
        }
        title={source.title}
        detail={`${source.authors} · ${source.year}`}
        onClose={onClose}
      />
      <div className="cly-rw-inspector-scroll">
        <div className="cly-rw-action-row">
          <Button onClick={() => notify("Source opened", source.path)}>
            <ExternalLink size={13} /> Open source
          </Button>
          <Button
            onClick={() =>
              notify(
                "Claim linker opened",
                "Select a claim to create an evidence relationship.",
              )
            }
          >
            <Link2 size={13} /> Link to claim
          </Button>
          <Button
            onClick={() =>
              notify("Note added", "A source note is ready to edit.")
            }
          >
            <Plus size={13} /> Add note
          </Button>
          <Button variant="ghost" iconOnly aria-label="More source actions">
            <MoreHorizontal size={14} />
          </Button>
        </div>
        <section className="cly-rw-inspector-section">
          <h3>Summary</h3>
          <p>{source.summary}</p>
        </section>
        <section className="cly-rw-inspector-section">
          <div className="cly-rw-section-heading">
            <h3>Extracted passages</h3>
            <Badge>{passages.length + source.limitations.length}</Badge>
          </div>
          <div className="cly-rw-passages">
            {passages.slice(0, 2).map((passage, index) => (
              <article key={passage} data-tone="high">
                <p>{passage}</p>
                <footer>
                  <span>Extracted finding {index + 1}</span>
                  <Badge tone="info">High relevance</Badge>
                </footer>
              </article>
            ))}
            {source.limitations.slice(0, 1).map((limitation) => (
              <article key={limitation} data-tone="medium">
                <p>{limitation}</p>
                <footer>
                  <span>Recorded limitation</span>
                  <Badge tone="warning">Review</Badge>
                </footer>
              </article>
            ))}
          </div>
        </section>
        <section className="cly-rw-inspector-section">
          <div className="cly-rw-section-heading">
            <h3>Notes</h3>
            <Button
              variant="ghost"
              onClick={() =>
                notify(
                  "Metadata edit enabled",
                  "Edits are retained for this mock session.",
                )
              }
            >
              Edit
            </Button>
          </div>
          <p>
            {source.limitations[0] ??
              "No limitations have been recorded for this source yet."}
          </p>
        </section>
        <section className="cly-rw-inspector-section">
          <h3>Tags</h3>
          <div className="cly-rw-tag-row">
            {source.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
            <button type="button" onClick={() => notify("Tag editor opened")}>
              + Add tag
            </button>
          </div>
        </section>
        <section className="cly-rw-inspector-section">
          <div className="cly-rw-section-heading">
            <h3>Linked claims</h3>
            <Badge>{source.linkedClaimIds.length}</Badge>
          </div>
          <div className="cly-rw-compact-list">
            {source.linkedClaimIds.map((id) => {
              const claim = claims.find((item) => item.id === id);
              return (
                <button
                  type="button"
                  key={id}
                  onClick={() => notify("Claim focused", claim?.text ?? id)}
                >
                  <FileText size={12} />
                  <span>{claim?.text ?? id}</span>
                  <CheckCircle2 size={12} className="cly-rw-success" />
                </button>
              );
            })}
          </div>
        </section>
        <details className="cly-rw-more-actions">
          <summary>More source actions</summary>
          <div>
            <Button
              onClick={() =>
                void mockServices.sources
                  .addToNotebookBundle(source.id)
                  .then(() => notify("Added to NotebookLM bundle"))
              }
            >
              <BookOpen size={13} /> Add to NotebookLM bundle
            </Button>
            <Button
              onClick={() =>
                notify(
                  "Duplicate analysis",
                  "No exact duplicate was found; one possible preprint match remains.",
                )
              }
            >
              <Merge size={13} /> Merge duplicates
            </Button>
            <Button
              variant="danger"
              onClick={() =>
                notify(
                  "Source archived",
                  "Archived sources remain in provenance and decision history.",
                )
              }
            >
              <Archive size={13} /> Archive
            </Button>
          </div>
        </details>
      </div>
      <footer className="cly-rw-inspector-footer">
        <Clock3 size={12} /> Updated {relativeDateLabel(source.updatedAt)}
      </footer>
    </aside>
  );
}

type LiteratureView =
  | "Matrix"
  | "Themes"
  | "Chronological"
  | "Claims"
  | "Methods"
  | "NotebookLM";
const literatureViews = [
  "Matrix",
  "Themes",
  "Chronological",
  "Claims",
  "Methods",
  "NotebookLM",
] as const;

export function LiteratureScreen() {
  const sources = useClyStore((s) => s.data.sources);
  const claims = useClyStore((s) => s.data.claims);
  const selectedId = useClyStore((s) => s.selectedId);
  const setSelected = useClyStore((s) => s.setSelected);
  const inspectorOpen = useClyStore((s) => s.inspectorOpen);
  const toggleInspector = useClyStore((s) => s.toggleInspector);
  const notify = useClyStore((s) => s.notify);
  const [view, setView] = useState<LiteratureView>("Matrix");
  const [query, setQuery] = useState("");
  const [inspectorTab, setInspectorTab] = useState<
    "Overview" | "Notes" | "Links" | "History"
  >("Overview");
  const [answer, setAnswer] = useState("");
  const [importedAnswers, setImportedAnswers] = useState<string[]>([
    "The cited literature supports regime-stratified coverage reporting but does not establish compound-shift reliability.",
  ]);
  const visible = sources.filter(
    (source) =>
      !query ||
      `${source.title} ${source.methods.join(" ")} ${source.findings.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const selected =
    sources.find((source) => source.id === selectedId) ?? sources[0];
  const selectSource = (source: Source) => {
    setSelected(source.id);
  };

  return (
    <div className="cly-page cly-page-wide cly-route-literature">
      <PageHeader
        kicker="Research"
        title="Literature"
        description="Manage and evaluate papers relevant to your research."
        actions={
          <>
            <Button
              onClick={() =>
                notify(
                  "Literature exported",
                  "The comparison matrix and source metadata are ready for export.",
                )
              }
            >
              <Upload size={13} /> Export <ChevronDown size={11} />
            </Button>
            <Button
              variant="primary"
              onClick={() =>
                notify("Add paper", "Import a PDF, DOI, BibTeX record, or URL.")
              }
            >
              <Plus size={13} /> Add paper
            </Button>
          </>
        }
      />
      {sources.length === 0 ? (
        <EmptyState
          title="No literature added"
          description="Add a paper to begin comparing methods and evidence."
          action={<Button variant="primary">Add paper</Button>}
        />
      ) : (
        <div
          className="cly-rw-master-detail cly-rw-literature-workspace"
          data-inspector-open={inspectorOpen && Boolean(selected)}
        >
          <main className="cly-rw-master-pane">
            <div className="cly-rw-toolbar cly-rw-literature-toolbar">
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Search papers…"
              />
              {[
                "Topic · All",
                "Year · All years",
                "Method · All",
                "Evidence · All",
                "Review status · All",
              ].map((label) => (
                <Button
                  key={label}
                  onClick={() => notify("Literature filter", label)}
                >
                  {label} <ChevronDown size={11} />
                </Button>
              ))}
              <span className="cly-rw-toolbar-spacer" />
              <Segmented
                value={view}
                options={literatureViews}
                onChange={setView}
                label="Literature view"
              />
            </div>
            {view === "Matrix" ? (
              <div className="cly-table-wrap cly-rw-literature-table">
                <table className="cly-table">
                  <thead>
                    <tr>
                      <th className="cly-rw-check-column">
                        <input
                          className="cly-checkbox"
                          type="checkbox"
                          aria-label="Select all visible papers"
                        />
                      </th>
                      <th style={{ width: 230 }}>Paper</th>
                      <th>Topic</th>
                      <th>Method</th>
                      <th>Dataset</th>
                      <th style={{ width: 190 }}>Key finding</th>
                      <th>Evidence strength</th>
                      <th>Relevance</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.slice(0, 200).map((source) => (
                      <tr
                        key={source.id}
                        tabIndex={0}
                        data-selected={selected?.id === source.id}
                        onClick={() => selectSource(source)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            selectSource(source);
                          }
                        }}
                      >
                        <td className="cly-rw-check-column">
                          <input
                            className="cly-checkbox"
                            type="checkbox"
                            checked={selected?.id === source.id}
                            aria-label={`Select ${source.title}`}
                            onChange={() => selectSource(source)}
                            onClick={(event) => event.stopPropagation()}
                          />
                        </td>
                        <td>
                          <span className="cly-rw-two-line-cell">
                            <strong>{source.title}</strong>
                            <small>
                              {source.authors} · {source.year}
                            </small>
                          </span>
                        </td>
                        <td>
                          <span className="cly-rw-cell-tag">
                            {source.tags[0] ?? "Research"}
                          </span>
                        </td>
                        <td>{source.methods[0] ?? "—"}</td>
                        <td>
                          {source.type === "Dataset"
                            ? source.title
                            : source.linkedExperimentIds.length
                              ? "Cylinder-flow system"
                              : "—"}
                        </td>
                        <td className="cly-rw-wrap-cell">
                          {source.findings[0] ?? source.summary}
                        </td>
                        <td>
                          <span className="cly-rw-strength-cell">
                            <Badge
                              tone={
                                source.confidence >= 80 ? "success" : "warning"
                              }
                            >
                              {source.confidence >= 80 ? "High" : "Medium"}
                            </Badge>
                            <RatingDots
                              value={source.confidence}
                              label="Evidence strength"
                            />
                          </span>
                        </td>
                        <td>
                          <span className="cly-rw-two-line-cell">
                            <span>
                              {Math.max(1, Math.round(source.confidence / 20))}
                              /5
                            </span>
                            <RatingDots
                              value={source.confidence}
                              label="Relevance"
                            />
                          </span>
                        </td>
                        <td>
                          <Badge tone={toneForStatus(source.status)}>
                            {source.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {view === "Themes" ? (
              <div className="cly-grid-3 cly-rw-view-content">
                {[
                  "Calibration & uncertainty",
                  "Distribution shift",
                  "Cost-normalized baselines",
                  "Reproducibility",
                ].map((theme, index) => (
                  <Panel key={theme}>
                    <div className="cly-panel-header">
                      <strong>{theme}</strong>
                      <Badge>{index + 2} sources</Badge>
                    </div>
                    <div className="cly-panel-body">
                      <p className="cly-muted cly-small">
                        {index === 2
                          ? "A clear literature gap remains: few comparisons include tuning cost and coverage simultaneously."
                          : "Sources converge on the need for regime-specific evaluation and explicit failure reporting."}
                      </p>
                      <Button onClick={() => notify("Theme focused", theme)}>
                        Focus cluster <ArrowRight size={13} />
                      </Button>
                    </div>
                  </Panel>
                ))}
              </div>
            ) : null}
            {view === "Chronological" ? (
              <Panel className="cly-panel-body cly-rw-view-content">
                <div className="cly-timeline">
                  {[...sources]
                    .sort((a, b) => b.year - a.year)
                    .map((source) => (
                      <button
                        className="cly-timeline-item"
                        key={source.id}
                        type="button"
                        onClick={() => selectSource(source)}
                        style={{
                          border: 0,
                          background: "transparent",
                          color: "inherit",
                          textAlign: "left",
                        }}
                      >
                        <span className="cly-timeline-dot" />
                        <span>
                          <strong>
                            {source.year} · {source.title}
                          </strong>
                          <span
                            className="cly-muted cly-small"
                            style={{ display: "block" }}
                          >
                            {source.summary}
                          </span>
                        </span>
                      </button>
                    ))}
                </div>
              </Panel>
            ) : null}
            {view === "Claims" ? (
              <div className="cly-grid-2 cly-rw-view-content">
                {claims.map((claim) => (
                  <Panel key={claim.id}>
                    <div className="cly-panel-header">
                      <strong className="cly-clamp-2">{claim.text}</strong>
                      <Badge tone={claimStatusTone(claim.status)}>
                        {claim.status}
                      </Badge>
                    </div>
                    <div className="cly-panel-body cly-stack">
                      <div className="cly-row-between">
                        <span className="cly-muted">Supporting sources</span>
                        <strong>{claim.supportingSourceIds.length}</strong>
                      </div>
                      <div className="cly-row-between">
                        <span className="cly-muted">Contradictions</span>
                        <strong>{claim.contradictingSourceIds.length}</strong>
                      </div>
                      <Button onClick={() => setSelected(claim.id)}>
                        Inspect claim literature
                      </Button>
                    </div>
                  </Panel>
                ))}
              </div>
            ) : null}
            {view === "Methods" ? (
              <div className="cly-grid-3 cly-rw-view-content">
                {Array.from(
                  new Set(sources.flatMap((source) => source.methods)),
                ).map((method) => (
                  <Panel className="cly-panel-body" key={method}>
                    <strong>{method}</strong>
                    <p className="cly-muted cly-small">
                      Used by{" "}
                      {
                        sources.filter((source) =>
                          source.methods.includes(method),
                        ).length
                      }{" "}
                      source(s). Select to compare assumptions and limitations.
                    </p>
                    <Button onClick={() => notify("Method comparison", method)}>
                      Compare evidence
                    </Button>
                  </Panel>
                ))}
              </div>
            ) : null}
            {view === "NotebookLM" ? (
              <div className="cly-rw-view-content">
                <NotebookLmWorkspace
                  sources={sources}
                  answer={answer}
                  setAnswer={setAnswer}
                  importedAnswers={importedAnswers}
                  setImportedAnswers={setImportedAnswers}
                />
              </div>
            ) : null}
          </main>
          {inspectorOpen && selected ? (
            <LiteratureInspector
              source={selected}
              claims={claims}
              tab={inspectorTab}
              setTab={setInspectorTab}
              onClose={toggleInspector}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function LiteratureInspector({
  source,
  claims,
  tab,
  setTab,
  onClose,
}: {
  source: Source;
  claims: Claim[];
  tab: "Overview" | "Notes" | "Links" | "History";
  setTab: (tab: "Overview" | "Notes" | "Links" | "History") => void;
  onClose: () => void;
}) {
  const notify = useClyStore((s) => s.notify);
  const linkedClaims = source.linkedClaimIds
    .map((id) => claims.find((claim) => claim.id === id))
    .filter((claim): claim is Claim => Boolean(claim));
  return (
    <aside
      className="cly-rw-inspector cly-rw-literature-inspector"
      data-inline-inspector
      aria-label="Literature details"
    >
      <InspectorTitle
        eyebrow={
          <span className="cly-rw-icon-label">
            <BookOpen size={12} /> Paper
          </span>
        }
        title={source.title}
        detail={`${source.authors} · ${source.year}`}
        onClose={onClose}
      />
      <div
        className="cly-rw-tabs"
        role="tablist"
        aria-label="Paper detail sections"
      >
        {(["Overview", "Notes", "Links", "History"] as const).map((item) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === item}
            key={item}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="cly-rw-inspector-scroll">
        {tab === "Overview" ? (
          <>
            <section className="cly-rw-inspector-section">
              <h3>Abstract summary</h3>
              <p>{source.summary}</p>
            </section>
            <section className="cly-rw-inspector-section">
              <h3>Contributions</h3>
              <ul className="cly-rw-bullet-list">
                {source.findings.map((finding) => (
                  <li key={finding}>{finding}</li>
                ))}
                {source.methods.slice(0, 2).map((method) => (
                  <li key={method}>
                    Applies {method.toLowerCase()} in the evaluation.
                  </li>
                ))}
              </ul>
            </section>
            <section className="cly-rw-inspector-section">
              <h3>Key finding</h3>
              <blockquote className="cly-rw-key-finding">
                {source.findings[0] ?? "Extraction is still pending."}
              </blockquote>
            </section>
            <section className="cly-rw-inspector-section">
              <dl className="cly-rw-metadata-list">
                <dt>Topic</dt>
                <dd>{source.tags[0] ?? "—"}</dd>
                <dt>Method</dt>
                <dd>{source.methods[0] ?? "—"}</dd>
                <dt>Dataset</dt>
                <dd>
                  {source.type === "Dataset"
                    ? source.title
                    : "Cylinder-flow benchmark"}
                </dd>
                <dt>Evidence strength</dt>
                <dd>
                  <RatingDots
                    value={source.confidence}
                    label="Evidence strength"
                  />
                </dd>
                <dt>Relevance</dt>
                <dd>{source.relevance}</dd>
                <dt>Review status</dt>
                <dd>
                  <Badge tone={toneForStatus(source.status)}>
                    {source.status}
                  </Badge>
                </dd>
              </dl>
            </section>
            <section className="cly-rw-inspector-section">
              <h3>Links</h3>
              <div className="cly-rw-compact-list">
                {linkedClaims.map((claim) => (
                  <button
                    type="button"
                    key={claim.id}
                    onClick={() => notify("Claim focused", claim.text)}
                  >
                    <FileText size={12} />
                    <span>{claim.text}</span>
                    <ExternalLink size={11} />
                  </button>
                ))}
                {source.linkedExperimentIds.map((id) => (
                  <button
                    type="button"
                    key={id}
                    onClick={() => notify("Experiment focused", id)}
                  >
                    <Beaker size={12} />
                    <span>{id} · linked experiment</span>
                    <ExternalLink size={11} />
                  </button>
                ))}
              </div>
            </section>
            <section className="cly-rw-inspector-section">
              <div className="cly-rw-section-heading">
                <h3>Notes</h3>
                <Button
                  variant="ghost"
                  onClick={() => notify("Paper note editor opened")}
                >
                  Edit
                </Button>
              </div>
              <p>
                {source.limitations.join(" ") ||
                  "No review notes have been added."}
              </p>
            </section>
          </>
        ) : null}
        {tab === "Notes" ? (
          <section className="cly-rw-inspector-section cly-rw-tab-empty">
            <FileText size={22} />
            <h3>Review notes</h3>
            <p>{source.limitations.join(" ") || "No notes yet."}</p>
            <Button onClick={() => notify("Paper note editor opened")}>
              Add note
            </Button>
          </section>
        ) : null}
        {tab === "Links" ? (
          <section className="cly-rw-inspector-section">
            <h3>Research links</h3>
            <div className="cly-rw-compact-list">
              {linkedClaims.map((claim) => (
                <button
                  type="button"
                  key={claim.id}
                  onClick={() => notify("Claim focused", claim.text)}
                >
                  <FileText size={12} />
                  <span>{claim.text}</span>
                  <ChevronRight size={12} />
                </button>
              ))}
            </div>
          </section>
        ) : null}
        {tab === "History" ? (
          <section className="cly-rw-inspector-section">
            <h3>Activity</h3>
            <div className="cly-rw-history-row">
              <Clock3 size={12} />
              <span>Metadata refreshed</span>
              <small>{relativeDateLabel(source.updatedAt)}</small>
            </div>
            <div className="cly-rw-history-row">
              <CheckCircle2 size={12} />
              <span>Review status set to {source.status}</span>
              <small>{source.year}</small>
            </div>
          </section>
        ) : null}
      </div>
    </aside>
  );
}

function NotebookLmWorkspace({
  sources,
  answer,
  setAnswer,
  importedAnswers,
  setImportedAnswers,
}: {
  sources: Source[];
  answer: string;
  setAnswer: (value: string) => void;
  importedAnswers: string[];
  setImportedAnswers: (value: string[]) => void;
}) {
  const notify = useClyStore((s) => s.notify);
  const bundle = sources.filter((source) => source.inNotebookBundle);
  return (
    <div className="cly-overview-grid">
      <div>
        <Panel>
          <div className="cly-panel-header">
            <div>
              <div className="cly-row">
                <Notebook size={16} />
                <strong>Surrogate reliability · NotebookLM companion</strong>
              </div>
              <div className="cly-muted cly-small">
                Manual companion workflow · no login, scraping, or website
                automation
              </div>
            </div>
            <Badge tone="success">Bundle ready</Badge>
          </div>
          <div className="cly-panel-body">
            <div className="cly-metric-row">
              <Metric label="Bundle sources" value={bundle.length} />
              <Metric label="Manifest" value="Ready" />
              <Metric label="Last export" value="Yesterday" />
              <Metric label="Imported answers" value={importedAnswers.length} />
            </div>
            <Section title="Source bundle">
              {bundle.map((source) => (
                <div className="cly-list-row" key={source.id}>
                  <div>
                    <div className="cly-list-title">{source.title}</div>
                    <div className="cly-list-detail">{source.path}</div>
                  </div>
                  <Badge tone="success">Included</Badge>
                </div>
              ))}
            </Section>
            <div className="cly-row" style={{ marginTop: 12 }}>
              <Button
                onClick={() =>
                  notify(
                    "Bundle preview opened",
                    `${bundle.length} files plus a machine-readable source manifest.`,
                  )
                }
              >
                <FileText size={13} /> Preview bundle
              </Button>
              <Button
                onClick={() =>
                  notify(
                    "Source manifest generated",
                    "Manifest contains titles, authors, paths, stable IDs, hashes, and linked claims.",
                  )
                }
              >
                <Download size={13} /> Generate manifest
              </Button>
              <Button
                variant="primary"
                onClick={() =>
                  notify(
                    "NotebookLM link opened",
                    "External navigation is simulated in the renderer preview.",
                  )
                }
              >
                <ExternalLink size={13} /> Open NotebookLM
              </Button>
            </div>
          </div>
        </Panel>
        <Section
          title="Suggested prompts"
          subtitle="Prompts refer to manifest IDs so answers can be linked back safely"
        >
          <Panel>
            {[
              "Which sources directly test uncertainty under compound distribution shift?",
              "Compare the limitations of ensemble disagreement and conformal residual scores.",
              "Which statements in the primary claim are not established by the source bundle?",
            ].map((prompt) => (
              <div className="cly-list-row" key={prompt}>
                <span>{prompt}</span>
                <Button
                  onClick={() => {
                    void navigator.clipboard?.writeText(prompt);
                    notify("Prompt copied");
                  }}
                >
                  <Clipboard size={12} /> Copy
                </Button>
              </div>
            ))}
          </Panel>
        </Section>
      </div>
      <aside className="cly-stack">
        <Panel className="cly-panel-body">
          <div className="cly-page-kicker">Import NotebookLM answer</div>
          <div className="cly-field">
            <label htmlFor="notebooklm-answer">Paste an answer</label>
            <textarea
              id="notebooklm-answer"
              className="cly-textarea"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="Paste a NotebookLM answer here…"
            />
          </div>
          <Button
            variant="primary"
            style={{ marginTop: 9 }}
            disabled={!answer.trim()}
            onClick={() => {
              setImportedAnswers([answer.trim(), ...importedAnswers]);
              setAnswer("");
              notify(
                "Answer imported",
                "Link it to claims and source manifest entries below.",
              );
            }}
          >
            <FileInput size={13} /> Import answer
          </Button>
        </Panel>
        {importedAnswers.map((item, index) => (
          <Panel className="cly-panel-body" key={item}>
            <div className="cly-row-between">
              <Badge tone="info">Imported answer</Badge>
              <Button
                variant="ghost"
                iconOnly
                aria-label="Remove imported answer"
                onClick={() =>
                  setImportedAnswers(
                    importedAnswers.filter((_, i) => i !== index),
                  )
                }
              >
                <X size={13} />
              </Button>
            </div>
            <p className="cly-small" style={{ lineHeight: 1.5 }}>
              {item}
            </p>
            <div className="cly-row">
              <Button
                onClick={() =>
                  notify(
                    "Answer linked to claim",
                    "A NotebookLM result source and evidence relationship were created in mock state.",
                  )
                }
              >
                <Link2 size={12} /> Claim
              </Button>
              <Button
                onClick={() =>
                  notify(
                    "Answer linked to source",
                    "The answer now cites a source-manifest record.",
                  )
                }
              >
                <BookOpen size={12} /> Source
              </Button>
            </div>
          </Panel>
        ))}
      </aside>
    </div>
  );
}

export function NotebooksScreen() {
  const notebooks = useClyStore((s) => s.data.notebooks);
  const experiments = useClyStore((s) => s.data.experiments);
  const claims = useClyStore((s) => s.data.claims);
  const selectedId = useClyStore((s) => s.selectedId);
  const setSelected = useClyStore((s) => s.setSelected);
  const inspectorOpen = useClyStore((s) => s.inspectorOpen);
  const toggleInspector = useClyStore((s) => s.toggleInspector);
  const notify = useClyStore((s) => s.notify);
  const [query, setQuery] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [tab, setTab] = useState<"Summary" | "Cells" | "Outputs" | "Metadata">(
    "Summary",
  );
  const [name, setName] = useState("new-analysis.ipynb");
  const selected =
    notebooks.find((item) => item.id === selectedId) ?? notebooks[0];
  const visible = notebooks.filter(
    (item) =>
      !query ||
      `${item.name} ${item.title} ${item.path}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const importNotebook = async () => {
    const notebook = await mockServices.notebooks.importMock(name);
    setImportOpen(false);
    setSelected(notebook.id);
    notify(
      "Notebook imported and scanned",
      `${notebook.codeCells} code cells · ${notebook.outputs} outputs · 1 queued issue`,
    );
  };
  return (
    <div className="cly-page cly-page-wide cly-route-notebooks">
      <PageHeader
        kicker="Research"
        title="Notebooks"
        description="Scan, audit, and connect notebooks to experiments and claims."
        actions={
          <>
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search notebooks…"
            />
            <Button variant="primary" onClick={() => setImportOpen(true)}>
              <Plus size={13} /> Add notebook <ChevronDown size={12} />
            </Button>
          </>
        }
      />
      {notebooks.length === 0 ? (
        <EmptyState
          title="No notebooks discovered"
          description="Import a notebook to inspect its execution and outputs."
          action={
            <Button variant="primary" onClick={() => setImportOpen(true)}>
              Import notebook
            </Button>
          }
        />
      ) : (
        <div
          className="cly-rw-notebook-workspace"
          data-inspector-open={inspectorOpen && Boolean(selected)}
        >
          <aside className="cly-rw-notebook-list" aria-label="Notebook list">
            <div className="cly-rw-rail-toolbar">
              <Button
                onClick={() =>
                  notify(
                    "Notebook filters",
                    "Filter by status, experiment, or issue.",
                  )
                }
              >
                <ListFilter size={13} /> Filter
              </Button>
              <Button
                onClick={() =>
                  notify("Notebook sort", "Sorted by most recent scan.")
                }
              >
                <Activity size={13} /> Recent <ChevronDown size={11} />
              </Button>
            </div>
            <div className="cly-rw-rail-count">{visible.length} notebooks</div>
            <div className="cly-rw-notebook-items">
              {visible.slice(0, 100).map((notebook) => (
                <button
                  type="button"
                  key={notebook.id}
                  data-selected={selected?.id === notebook.id}
                  onClick={() => {
                    setSelected(notebook.id);
                  }}
                >
                  <span className="cly-rw-notebook-item-title">
                    <Notebook size={13} /> {notebook.name}
                  </span>
                  <span className="cly-rw-notebook-item-meta">
                    <Badge tone={toneForStatus(notebook.status)}>
                      {notebook.status}
                    </Badge>
                    <small>{relativeDateLabel(notebook.updatedAt)}</small>
                  </span>
                  <span className="cly-rw-notebook-links">
                    Linked to
                    {notebook.experimentId ? (
                      <em>{notebook.experimentId.toUpperCase()}</em>
                    ) : (
                      <em>None</em>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </aside>
          {selected ? (
            <main className="cly-rw-notebook-detail">
              <header className="cly-rw-notebook-header">
                <div>
                  <h2>
                    <Notebook size={17} /> {selected.name}
                  </h2>
                  <span>
                    <Badge tone={toneForStatus(selected.status)}>
                      {selected.status}
                    </Badge>{" "}
                    · {relativeDateLabel(selected.updatedAt)}
                  </span>
                </div>
                <div
                  className="cly-rw-tabs"
                  role="tablist"
                  aria-label="Notebook sections"
                >
                  {(["Summary", "Cells", "Outputs", "Metadata"] as const).map(
                    (item) => (
                      <button
                        type="button"
                        role="tab"
                        aria-selected={tab === item}
                        key={item}
                        onClick={() => setTab(item)}
                      >
                        {item}
                        {item === "Cells" ? (
                          <span>{selected.codeCells}</span>
                        ) : null}
                        {item === "Outputs" ? (
                          <span>{selected.outputs}</span>
                        ) : null}
                      </button>
                    ),
                  )}
                </div>
              </header>
              {tab === "Summary" ? (
                <div className="cly-rw-notebook-summary">
                  <section className="cly-rw-work-section">
                    <div className="cly-rw-section-heading">
                      <h3>Execution strip</h3>
                      <span className="cly-rw-help">i</span>
                    </div>
                    <ExecutionStrip
                      cells={Array.from(
                        {
                          length: Math.min(24, Math.max(4, selected.codeCells)),
                        },
                        (_, index) =>
                          index === 0 || index % 8 === 0
                            ? "markdown"
                            : selected.issues.length && index === 11
                              ? "error"
                              : index % 4 === 0
                                ? "output"
                                : "code",
                      )}
                      label={`${selected.title} cell sequence`}
                    />
                  </section>
                  <section className="cly-rw-work-section">
                    <div className="cly-rw-section-heading">
                      <h3>Outputs preview</h3>
                      <Button variant="ghost" onClick={() => setTab("Outputs")}>
                        View all ({selected.outputs})
                      </Button>
                    </div>
                    <div className="cly-rw-output-grid">
                      {["distribution", "embedding", "heatmap", "loss"].map(
                        (kind, index) => (
                          <NotebookOutputPreview
                            kind={kind}
                            index={index}
                            key={kind}
                          />
                        ),
                      )}
                    </div>
                  </section>
                  <div className="cly-rw-notebook-summary-grid">
                    <section className="cly-rw-work-section">
                      <div className="cly-rw-section-heading">
                        <h3>Detected issues</h3>
                        <Badge>{selected.issues.length}</Badge>
                      </div>
                      <div className="cly-rw-issue-list">
                        {selected.issues.map((issue, index) => (
                          <button
                            type="button"
                            key={issue}
                            onClick={() =>
                              notify("Notebook issue focused", issue)
                            }
                          >
                            <AlertTriangle size={13} />
                            <span>{issue}</span>
                            <small>{index + 1}</small>
                            <ChevronRight size={12} />
                          </button>
                        ))}
                      </div>
                    </section>
                    <section className="cly-rw-work-section">
                      <div className="cly-rw-section-heading">
                        <h3>Notebook overview</h3>
                        <span className="cly-rw-help">i</span>
                      </div>
                      <dl className="cly-rw-notebook-stats">
                        <dt>Total cells</dt>
                        <dd>
                          {selected.codeCells +
                            Math.max(6, selected.outline.length * 2)}
                        </dd>
                        <dt>Code cells</dt>
                        <dd>{selected.codeCells}</dd>
                        <dt>Markdown sections</dt>
                        <dd>{selected.outline.length}</dd>
                        <dt>Output records</dt>
                        <dd>{selected.outputs}</dd>
                        <dt>Figures</dt>
                        <dd>{selected.figures}</dd>
                        <dt>Last executed</dt>
                        <dd>{relativeDateLabel(selected.updatedAt)}</dd>
                      </dl>
                    </section>
                  </div>
                  <section className="cly-rw-work-section">
                    <div className="cly-rw-section-heading">
                      <h3>
                        <Link2 size={13} /> Linked runs
                      </h3>
                      <Badge>{selected.experimentId ? 1 : 0}</Badge>
                    </div>
                    <div className="cly-rw-linked-runs">
                      <div className="cly-rw-linked-runs-head">
                        <span>Experiment</span>
                        <span>Status</span>
                        <span>Last run</span>
                        <span>Linked by</span>
                      </div>
                      {experiments
                        .filter(
                          (experiment) =>
                            experiment.id === selected.experimentId,
                        )
                        .map((experiment) => (
                          <button
                            type="button"
                            key={experiment.id}
                            onClick={() =>
                              notify("Experiment opened", experiment.name)
                            }
                          >
                            <span>
                              <strong>{experiment.id.toUpperCase()}</strong>{" "}
                              {experiment.name}
                            </span>
                            <Badge tone={toneForStatus(experiment.status)}>
                              {experiment.status}
                            </Badge>
                            <span>
                              {relativeDateLabel(experiment.updatedAt)}
                            </span>
                            <span>This notebook</span>
                          </button>
                        ))}
                    </div>
                  </section>
                </div>
              ) : null}
              {tab === "Cells" ? (
                <div className="cly-rw-view-content cly-rw-notebook-tab-content">
                  <section className="cly-rw-work-section">
                    <h3>Cell outline</h3>
                    {selected.outline.map((heading, index) => (
                      <button
                        type="button"
                        className="cly-rw-outline-row"
                        key={heading}
                        onClick={() =>
                          notify("Notebook section focused", heading)
                        }
                      >
                        <span>{index + 1}</span>
                        <strong>{heading}</strong>
                        <small>{index % 2 ? "Code" : "Markdown"}</small>
                        <ChevronRight size={12} />
                      </button>
                    ))}
                  </section>
                </div>
              ) : null}
              {tab === "Outputs" ? (
                <div className="cly-rw-view-content cly-rw-notebook-tab-content">
                  <section className="cly-rw-work-section">
                    <div className="cly-rw-section-heading">
                      <h3>Extracted outputs</h3>
                      <Badge>{selected.outputs}</Badge>
                    </div>
                    <div className="cly-rw-output-grid cly-rw-output-grid-large">
                      {[
                        "distribution",
                        "embedding",
                        "heatmap",
                        "loss",
                        "table",
                        "figure",
                      ].map((kind, index) => (
                        <NotebookOutputPreview
                          kind={kind}
                          index={index}
                          key={kind}
                        />
                      ))}
                    </div>
                  </section>
                </div>
              ) : null}
              {tab === "Metadata" ? (
                <div className="cly-rw-view-content cly-rw-notebook-tab-content">
                  <section className="cly-rw-work-section">
                    <h3>Notebook metadata</h3>
                    <dl className="cly-rw-metadata-list cly-rw-metadata-wide">
                      <dt>Path</dt>
                      <dd className="cly-mono">{selected.path}</dd>
                      <dt>Status</dt>
                      <dd>{selected.status}</dd>
                      <dt>Experiment</dt>
                      <dd>{selected.experimentId ?? "Not linked"}</dd>
                      <dt>Imports</dt>
                      <dd>{selected.imports.join(", ")}</dd>
                      <dt>Reproducibility</dt>
                      <dd>{selected.reproducibility}</dd>
                      <dt>Execution consistency</dt>
                      <dd>{selected.executionConsistency}%</dd>
                    </dl>
                  </section>
                </div>
              ) : null}
            </main>
          ) : null}
          {inspectorOpen && selected ? (
            <NotebookInspector
              notebook={selected}
              experiments={experiments}
              claims={claims}
              onClose={toggleInspector}
            />
          ) : null}
        </div>
      )}
      <Dialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import notebook"
        description="Choose a fixture notebook name. Cly will simulate a safe static scan; it will not execute cells."
        footer={
          <>
            <Button onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => void importNotebook()}>
              Import and scan
            </Button>
          </>
        }
      >
        <div className="cly-field">
          <label htmlFor="notebook-name">Notebook filename</label>
          <input
            id="notebook-name"
            className="cly-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
      </Dialog>
    </div>
  );
}

const notebookOutputMarks = [
  "alpha",
  "bravo",
  "charlie",
  "delta",
  "echo",
  "foxtrot",
  "golf",
  "hotel",
  "india",
  "juliet",
  "kilo",
  "lima",
] as const;

function NotebookOutputPreview({
  kind,
  index,
}: {
  kind: string;
  index: number;
}) {
  const titles = [
    "Calibration distribution",
    "Shift embedding",
    "Coverage heatmap",
    "Training / validation loss",
    "Results summary",
    "Exported figure",
  ];
  return (
    <article className="cly-rw-output-preview" data-kind={kind}>
      <div aria-hidden="true">
        {notebookOutputMarks.map((marker, item) => (
          <i
            key={marker}
            style={
              {
                "--value": `${18 + ((item * 17 + index * 11) % 68)}%`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <span>{titles[index] ?? `Output ${index + 1}`}</span>
    </article>
  );
}

function NotebookInspector({
  notebook,
  experiments,
  claims,
  onClose,
}: {
  notebook: NotebookArtifact;
  experiments: Experiment[];
  claims: Claim[];
  onClose: () => void;
}) {
  const notify = useClyStore((s) => s.notify);
  const linkedExperiment = experiments.find(
    (experiment) => experiment.id === notebook.experimentId,
  );
  return (
    <aside
      className="cly-rw-inspector cly-rw-notebook-inspector"
      data-inline-inspector
      aria-label="Notebook audit details"
    >
      <div className="cly-rw-inspector-close-row">
        <strong>Notebook audit</strong>
        <Button
          variant="ghost"
          iconOnly
          aria-label="Close notebook audit"
          onClick={onClose}
        >
          <PanelRightClose size={14} />
        </Button>
      </div>
      <div className="cly-rw-inspector-scroll">
        <section className="cly-rw-inspector-section">
          <h3>Reproducibility findings</h3>
          <div className="cly-rw-score-summary">
            <div
              className="cly-rw-score-ring"
              style={
                {
                  "--score": `${notebook.executionConsistency * 3.6}deg`,
                } as CSSProperties
              }
            >
              <strong>{notebook.executionConsistency}</strong>
              <span>/100</span>
            </div>
            <div>
              <strong>
                {notebook.executionConsistency >= 80
                  ? "Good"
                  : "Needs attention"}
              </strong>
              <span>{notebook.reproducibility}</span>
              <Button
                variant="ghost"
                onClick={() => notify("Reproducibility details opened")}
              >
                View details
              </Button>
            </div>
          </div>
          <div className="cly-rw-audit-rows">
            {(
              [
                [
                  "Data & I/O",
                  notebook.issues.some((issue) =>
                    issue.toLowerCase().includes("data"),
                  ),
                ],
                [
                  "Environment",
                  notebook.issues.some((issue) =>
                    issue.toLowerCase().includes("environment"),
                  ),
                ],
                ["Code quality", notebook.issues.length > 2],
                ["Outputs", notebook.outputs > 0],
              ] as [string, boolean][]
            ).map(([label, warning]) => (
              <div key={label}>
                <span>{label}</span>
                {warning ? (
                  <AlertTriangle size={12} />
                ) : (
                  <CheckCircle2 size={12} />
                )}
              </div>
            ))}
          </div>
        </section>
        <section className="cly-rw-inspector-section">
          <h3>Environment</h3>
          <dl className="cly-rw-metadata-list">
            <dt>Kernel</dt>
            <dd>Python 3.11.7</dd>
            <dt>Packages</dt>
            <dd>{notebook.imports.length}</dd>
            <dt>Environment</dt>
            <dd>{linkedExperiment?.environment ?? "Project default"}</dd>
            <dt>Runtime</dt>
            <dd>Local</dd>
          </dl>
          <Button
            variant="ghost"
            onClick={() => notify("Environment manifest opened")}
          >
            View full environment <ExternalLink size={11} />
          </Button>
        </section>
        <section className="cly-rw-inspector-section">
          <div className="cly-rw-section-heading">
            <h3>Extracted artifacts</h3>
            <Badge>{notebook.outputs + notebook.figures}</Badge>
          </div>
          <dl className="cly-rw-artifact-counts">
            <dt>
              <Table2 size={12} /> Tables
            </dt>
            <dd>{Math.max(1, Math.round(notebook.outputs / 5))}</dd>
            <dt>
              <FileChartColumn size={12} /> Figures
            </dt>
            <dd>{notebook.figures}</dd>
            <dt>
              <Braces size={12} /> Data outputs
            </dt>
            <dd>{notebook.outputs}</dd>
          </dl>
          <Button
            variant="ghost"
            onClick={() => notify("Notebook artifacts opened")}
          >
            View all artifacts <ExternalLink size={11} />
          </Button>
        </section>
        <section className="cly-rw-inspector-section">
          <div className="cly-rw-section-heading">
            <h3>Linked claims</h3>
            <Badge>{notebook.claimIds.length}</Badge>
          </div>
          <div className="cly-rw-compact-list">
            {notebook.claimIds.map((id) => {
              const claim = claims.find((item) => item.id === id);
              return (
                <button
                  type="button"
                  key={id}
                  onClick={() => notify("Claim focused", claim?.text ?? id)}
                >
                  <FileText size={12} />
                  <span>{claim?.text ?? id}</span>
                  <ExternalLink size={11} />
                </button>
              );
            })}
          </div>
        </section>
        <section className="cly-rw-inspector-section cly-rw-inspector-actions">
          <h3>Actions</h3>
          <Button onClick={() => notify("Notebook opened", notebook.path)}>
            <ExternalLink size={13} /> Open notebook
          </Button>
          <Button
            onClick={() =>
              notify(
                "Outputs traced",
                `${notebook.outputs} outputs linked to their producing cells.`,
              )
            }
          >
            <GitBranch size={13} /> Trace outputs
          </Button>
          <Button
            onClick={() =>
              notify(
                "Reproducibility task created",
                "A notebook cleanup task was added to Next Steps.",
              )
            }
          >
            <ShieldCheck size={13} /> Run audit
          </Button>
          <Button
            onClick={() =>
              notify(
                "Experiment linker opened",
                linkedExperiment?.name ?? "Choose an experiment",
              )
            }
          >
            <Plus size={13} /> Add to experiment
          </Button>
          <details className="cly-rw-more-actions">
            <summary>More notebook actions</summary>
            <div>
              <Button
                onClick={() =>
                  notify(
                    "Notebook summary ready",
                    "Objectives, methods, results, caveats, and linked claims were summarized.",
                  )
                }
              >
                <Sparkles size={12} /> Summarize
              </Button>
              <Button
                onClick={() =>
                  notify(
                    "Outputs extracted",
                    `${notebook.outputs} output records were indexed.`,
                  )
                }
              >
                <Download size={12} /> Extract outputs
              </Button>
              <Button
                onClick={() =>
                  notify(
                    "Notebook marked canonical",
                    "The canonical marker is simulated for this session.",
                  )
                }
              >
                <Check size={12} /> Mark canonical
              </Button>
            </div>
          </details>
        </section>
      </div>
    </aside>
  );
}

export function CodeLinkerScreen() {
  const code = useClyStore((s) => s.data.code);
  const claims = useClyStore((s) => s.data.claims);
  const experiments = useClyStore((s) => s.data.experiments);
  const selectedId = useClyStore((s) => s.selectedId);
  const setSelected = useClyStore((s) => s.setSelected);
  const inspectorOpen = useClyStore((s) => s.inspectorOpen);
  const toggleInspector = useClyStore((s) => s.toggleInspector);
  const notify = useClyStore((s) => s.notify);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<
    "Files" | "Objectives" | "Claims" | "Risks" | "Unlinked"
  >("Files");
  const selected = code.find((item) => item.id === selectedId) ?? code[0];
  const visible = code.filter(
    (item) =>
      (!query ||
        `${item.path} ${item.purpose} ${item.method}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (view !== "Unlinked" || item.status === "Unlinked") &&
      (view !== "Risks" || item.risks.length),
  );
  const grouped = visible.reduce<Record<string, CodeArtifact[]>>(
    (groups, item) => {
      const root = item.path.split("/")[0] || "project";
      groups[root] = [...(groups[root] ?? []), item];
      return groups;
    },
    {},
  );
  return (
    <div className="cly-page cly-page-wide cly-route-code">
      <PageHeader
        kicker="Research"
        title="Code Linker"
        description="Connect implementation to objectives, experiments, outputs, and claims."
        actions={
          <Button
            variant="ghost"
            iconOnly
            aria-label="Code Linker settings"
            onClick={() => notify("Code Linker settings opened")}
          >
            <MoreHorizontal size={14} />
          </Button>
        }
      />
      {code.length === 0 ? (
        <EmptyState
          title="No code artifacts indexed"
          description="Scan project files to begin linking research meaning."
          action={<Button>Simulate scan</Button>}
        />
      ) : (
        <>
          <div className="cly-rw-toolbar cly-rw-code-toolbar">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search code (⌘K)"
            />
            <span className="cly-rw-toolbar-spacer" />
            <select
              className="cly-select cly-rw-code-filter"
              aria-label="Filter language"
            >
              <option>All languages</option>
              <option>Python</option>
              <option>Shell</option>
            </select>
            <select
              className="cly-select cly-rw-code-filter"
              aria-label="Filter link status"
            >
              <option>All links</option>
              <option>Linked</option>
              <option>Unlinked</option>
            </select>
            <Segmented
              value={view}
              options={
                ["Files", "Objectives", "Claims", "Risks", "Unlinked"] as const
              }
              onChange={setView}
              label="Code linker view"
            />
          </div>
          <div
            className="cly-rw-code-workspace"
            data-inspector-open={inspectorOpen && Boolean(selected)}
          >
            <aside className="cly-rw-code-tree" aria-label="Codebase tree">
              <div className="cly-rw-rail-count">Codebase</div>
              {Object.entries(grouped).map(([root, items]) => (
                <div className="cly-rw-code-group" key={root}>
                  <div>
                    <ChevronDown size={12} />
                    <FolderOpen size={14} />
                    <strong>{root}</strong>
                  </div>
                  {items.map((item) => {
                    const path = item.path.split("/");
                    const filename = path[path.length - 1];
                    const directory = path.slice(1, -1).join("/");
                    return (
                      <div className="cly-rw-code-branch" key={item.id}>
                        {directory ? (
                          <span>
                            <Folder size={12} /> {directory}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          data-selected={selected?.id === item.id}
                          onClick={() => {
                            setSelected(item.id);
                          }}
                        >
                          <FileCode2 size={13} />
                          <span>{filename}</span>
                          {item.risks.length ? <i aria-hidden="true" /> : null}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </aside>
            {selected ? (
              <main className="cly-rw-code-detail">
                <div className="cly-rw-code-breadcrumb">
                  {selected.path.split("/").map((part, index) => (
                    <span key={`${selected.id}-${part}`}>
                      <span>{part}</span>
                      {index < selected.path.split("/").length - 1 ? (
                        <ChevronRight size={11} />
                      ) : null}
                    </span>
                  ))}
                  <Badge tone={toneForStatus(selected.status)}>
                    {selected.status}
                  </Badge>
                </div>
                <section className="cly-rw-code-section">
                  <h3>Purpose</h3>
                  <p className="cly-rw-code-purpose">{selected.purpose}</p>
                </section>
                <section className="cly-rw-code-section">
                  <h3>Related methods</h3>
                  <div className="cly-rw-tag-row">
                    {[
                      selected.method,
                      "Research evaluation",
                      "Evidence linkage",
                    ].map((method) => (
                      <span key={method}>{method}</span>
                    ))}
                  </div>
                </section>
                <section className="cly-rw-code-section">
                  <h3>Linked objectives</h3>
                  <div className="cly-rw-code-links">
                    <button
                      type="button"
                      onClick={() =>
                        notify("Objective focused", selected.objective)
                      }
                    >
                      <Circle size={11} />{" "}
                      <strong>O-{selected.id.slice(-2)}</strong>{" "}
                      {selected.objective}
                    </button>
                  </div>
                </section>
                <section className="cly-rw-code-section">
                  <h3>Linked claims</h3>
                  <div className="cly-rw-code-links">
                    {selected.claimIds.map((id) => {
                      const claim = claims.find((item) => item.id === id);
                      return (
                        <button
                          type="button"
                          key={id}
                          onClick={() =>
                            notify("Claim focused", claim?.text ?? id)
                          }
                        >
                          <ShieldCheck size={12} />
                          <strong>{id.toUpperCase()}</strong>
                          {claim?.text ?? id}
                        </button>
                      );
                    })}
                  </div>
                </section>
                <section className="cly-rw-code-section">
                  <h3>Linked experiments / runs</h3>
                  <div className="cly-rw-code-run-list">
                    {selected.experimentIds.map((id) => {
                      const experiment = experiments.find(
                        (item) => item.id === id,
                      );
                      return (
                        <button
                          type="button"
                          key={id}
                          onClick={() =>
                            notify("Experiment opened", experiment?.name ?? id)
                          }
                        >
                          <TestTube2 size={13} />
                          <strong>{id.toUpperCase()}</strong>
                          <span>{experiment?.name ?? id}</span>
                          <Badge
                            tone={toneForStatus(
                              experiment?.status ?? "Planned",
                            )}
                          >
                            {experiment?.status ?? "Planned"}
                          </Badge>
                          <small>
                            {experiment
                              ? relativeDateLabel(experiment.updatedAt)
                              : "—"}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                </section>
                <section className="cly-rw-code-section">
                  <h3>Risks / issues</h3>
                  <div className="cly-rw-code-risks">
                    {selected.risks.length ? (
                      selected.risks.map((risk) => (
                        <button
                          type="button"
                          key={risk}
                          onClick={() => notify("Code risk focused", risk)}
                        >
                          <AlertTriangle size={13} />
                          <span>{risk}</span>
                        </button>
                      ))
                    ) : (
                      <span className="cly-rw-success">
                        <CheckCircle2 size={13} /> No open code risks
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => notify("Code issue editor opened")}
                    >
                      <Plus size={12} /> Add issue
                    </button>
                  </div>
                </section>
                <section className="cly-rw-code-section">
                  <h3>Recent agent edits</h3>
                  <div className="cly-rw-agent-edits">
                    <div>
                      <Activity size={12} />
                      <span>
                        <strong>
                          Agent · {relativeDateLabel(selected.updatedAt)}
                        </strong>
                        Verified {selected.tests.toLowerCase()} and refreshed
                        research links.
                      </span>
                    </div>
                    <div>
                      <Activity size={12} />
                      <span>
                        <strong>Agent · 3d ago</strong>Mapped implementation
                        purpose to the active claim audit.
                      </span>
                    </div>
                  </div>
                </section>
              </main>
            ) : null}
            {inspectorOpen && selected ? (
              <CodeRelationshipInspector
                artifact={selected}
                claims={claims}
                experiments={experiments}
                onClose={toggleInspector}
              />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

function CodeRelationshipInspector({
  artifact,
  claims,
  experiments,
  onClose,
}: {
  artifact: CodeArtifact;
  claims: Claim[];
  experiments: Experiment[];
  onClose: () => void;
}) {
  const notify = useClyStore((s) => s.notify);
  const firstClaim = claims.find((claim) => claim.id === artifact.claimIds[0]);
  const firstExperiment = experiments.find(
    (experiment) => experiment.id === artifact.experimentIds[0],
  );
  const relationshipSteps = [
    {
      label: "Objective",
      detail: artifact.objective,
      icon: <Circle size={14} />,
      tone: "objective",
    },
    {
      label: "Method",
      detail: artifact.method,
      icon: <Clipboard size={14} />,
      tone: "method",
    },
    {
      label: "Code",
      detail: artifact.path,
      icon: <FileCode2 size={14} />,
      tone: "code",
    },
    {
      label: "Run",
      detail:
        firstExperiment?.name ??
        `${artifact.experimentIds.length} linked experiments`,
      icon: <Beaker size={14} />,
      tone: "run",
    },
    {
      label: "Output",
      detail: artifact.notebookIds.length
        ? `${artifact.notebookIds.length} notebook outputs`
        : "No output linked",
      icon: <FileText size={14} />,
      tone: "output",
    },
    {
      label: "Claim",
      detail: firstClaim?.text ?? `${artifact.claimIds.length} linked claims`,
      icon: <ShieldCheck size={14} />,
      tone: "claim",
    },
  ];
  return (
    <aside
      className="cly-rw-inspector cly-rw-code-inspector"
      data-inline-inspector
      aria-label="Code relationship details"
    >
      <div className="cly-rw-inspector-close-row">
        <strong>Relationship chain</strong>
        <Button
          variant="ghost"
          iconOnly
          aria-label="Close relationship chain"
          onClick={onClose}
        >
          <PanelRightClose size={14} />
        </Button>
      </div>
      <div className="cly-rw-inspector-scroll">
        <ol
          className="cly-rw-code-chain"
          aria-label={`Research relationship for ${artifact.path}`}
        >
          {relationshipSteps.map((step) => (
            <li key={step.label} data-tone={step.tone}>
              <span>{step.icon}</span>
              <div>
                <small>{step.label}</small>
                <strong>{step.detail}</strong>
              </div>
            </li>
          ))}
        </ol>
        <section className="cly-rw-inspector-section">
          <h3>Metadata</h3>
          <dl className="cly-rw-metadata-list">
            <dt>Language</dt>
            <dd>{artifact.path.endsWith(".py") ? "Python" : "Text"}</dd>
            <dt>Tests</dt>
            <dd>{artifact.tests}</dd>
            <dt>Last modified</dt>
            <dd>{relativeDateLabel(artifact.updatedAt)}</dd>
            <dt>Owner</dt>
            <dd>Research team</dd>
            <dt>Repository</dt>
            <dd className="cly-rw-link">cly-research / core</dd>
            <dt>Branch</dt>
            <dd>main</dd>
            <dt>Confidence</dt>
            <dd>{artifact.confidence}%</dd>
          </dl>
        </section>
        <section className="cly-rw-inspector-section cly-rw-inspector-actions">
          <h3>Actions</h3>
          <Button
            variant="primary"
            onClick={() =>
              notify(
                "External editor boundary",
                `Open ${artifact.path} in the configured editor.`,
              )
            }
          >
            <ExternalLink size={13} /> Open file
          </Button>
          <Button
            onClick={() =>
              notify(
                "Output trace opened",
                "Cly traced code → run → artifact → claim.",
              )
            }
          >
            <GitBranch size={13} /> View lineage
          </Button>
          <Button
            onClick={() =>
              notify(
                "Research link editor opened",
                "Choose a method, claim, experiment, or run.",
              )
            }
          >
            <Link2 size={13} /> Edit links
          </Button>
          <Button
            onClick={() =>
              notify("Inferred purpose approved", artifact.purpose)
            }
          >
            <Check size={13} /> Approve purpose
          </Button>
          <Button
            onClick={() =>
              notify(
                "Code review preview",
                "A research-aware code review agent plan is ready.",
              )
            }
          >
            <Sparkles size={13} /> Request review
          </Button>
        </section>
      </div>
    </aside>
  );
}

type ClaimView = "Board" | "Table" | "Detail";
const claimStatuses: ClaimStatus[] = [
  "Unsupported",
  "Weak",
  "Medium",
  "Strong",
  "Paper-ready",
  "Invalidated",
  "Needs review",
];

export function ClaimsScreen() {
  const claims = useClyStore((s) => s.data.claims);
  const sources = useClyStore((s) => s.data.sources);
  const experiments = useClyStore((s) => s.data.experiments);
  const selectedId = useClyStore((s) => s.selectedId);
  const setSelected = useClyStore((s) => s.setSelected);
  const inspectorOpen = useClyStore((s) => s.inspectorOpen);
  const toggleInspector = useClyStore((s) => s.toggleInspector);
  const notify = useClyStore((s) => s.notify);
  const [view, setView] = useState<ClaimView>("Board");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [createOpen, setCreateOpen] = useState(false);
  const [text, setText] = useState("");
  const visible = filterAndSortClaims(claims, query, status, "confidence");
  const selected = claims.find((item) => item.id === selectedId) ?? claims[0];
  const supportedCount = claims.filter((claim) =>
    ["Strong", "Paper-ready"].includes(claim.status),
  ).length;
  const contradictedCount = claims.filter(
    (claim) => claim.status === "Invalidated",
  ).length;
  const needsReviewCount = claims.filter((claim) =>
    ["Weak", "Medium", "Needs review"].includes(claim.status),
  ).length;
  const selectClaim = (claim: Claim) => {
    setSelected(claim.id);
  };
  const create = async () => {
    if (!text.trim()) return;
    const claim = await mockServices.claims.create(text.trim());
    setCreateOpen(false);
    setText("");
    setSelected(claim.id);
    notify(
      "Unsupported claim created",
      "Link evidence or design a required experiment.",
    );
  };
  return (
    <div className="cly-page cly-page-wide cly-route-claims">
      <PageHeader
        kicker="Research"
        title="Claims"
        description="Audit and track claims, evidence, and next actions."
        actions={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus size={13} /> New claim <ChevronDown size={11} />
          </Button>
        }
      />
      <section className="cly-rw-claim-summary" aria-label="Claim summary">
        <div>
          <span>Total claims</span>
          <strong>{claims.length}</strong>
        </div>
        <div data-tone="success">
          <span>Supported</span>
          <strong>{supportedCount}</strong>
        </div>
        <div data-tone="danger">
          <span>Contradicted</span>
          <strong>{contradictedCount}</strong>
        </div>
        <div data-tone="warning">
          <span>Needs review</span>
          <strong>{needsReviewCount}</strong>
        </div>
      </section>
      {claims.length === 0 ? (
        <EmptyState
          title="No claims to audit"
          description="Create a precise claim, then link evidence."
          action={
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              Create first claim
            </Button>
          }
        />
      ) : (
        <div
          className="cly-rw-master-detail cly-rw-claims-workspace"
          data-inspector-open={inspectorOpen && Boolean(selected)}
        >
          <main className="cly-rw-master-pane">
            <div className="cly-rw-toolbar cly-rw-claims-toolbar">
              <Segmented
                value={view}
                options={["Board", "Table", "Detail"] as const}
                onChange={setView}
                label="Claim view"
              />
              <select
                className="cly-select cly-rw-compact-select"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                aria-label="Filter claim status"
              >
                <option>All</option>
                {claimStatuses.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              {[
                ["Evidence", ListFilter],
                ["Type", FileText],
                ["Assignee", Activity],
              ].map(([label, Icon]) => (
                <Button
                  key={String(label)}
                  onClick={() => notify("Claim filter", String(label))}
                >
                  <Icon size={12} /> {String(label)} <ChevronDown size={11} />
                </Button>
              ))}
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Search claims…"
              />
              <span className="cly-rw-toolbar-spacer" />
              <Button
                variant="ghost"
                iconOnly
                aria-label="Run adversarial review"
                disabled={!selected}
                onClick={() =>
                  notify(
                    "Adversarial review preview",
                    "The agent plan will search for missing controls, weak baselines, and alternative explanations.",
                  )
                }
              >
                <Sparkles size={13} />
              </Button>
            </div>
            {view === "Board" ? (
              <div className="cly-rw-claim-audit-list">
                <div className="cly-rw-claim-audit-head">
                  <span>Claim</span>
                  <span>Evidence</span>
                  <span>Support / contradict</span>
                  <span>Links</span>
                  <span>Status</span>
                  <span>Next action</span>
                </div>
                {visible.map((claim) => (
                  <button
                    type="button"
                    className="cly-rw-claim-audit-row"
                    key={claim.id}
                    data-selected={selected?.id === claim.id}
                    onClick={() => selectClaim(claim)}
                  >
                    <span className="cly-rw-claim-cell-main">
                      <span className="cly-rw-row-select">
                        <span aria-hidden="true" />
                        <Star size={12} />
                      </span>
                      <span>
                        <strong>{claim.text}</strong>
                        <small>
                          <em>{claim.type}</em> · {claim.id.toUpperCase()}
                        </small>
                      </span>
                    </span>
                    <span className="cly-rw-claim-evidence">
                      <strong
                        data-tone={
                          claim.confidence >= 75
                            ? "success"
                            : claim.confidence >= 55
                              ? "warning"
                              : "danger"
                        }
                      >
                        {claim.confidence >= 75
                          ? "Strong"
                          : claim.confidence >= 55
                            ? "Moderate"
                            : "Weak"}
                      </strong>
                      <RatingDots
                        value={claim.confidence}
                        label="Claim evidence"
                      />
                      <small>{claim.confidence}%</small>
                    </span>
                    <span className="cly-rw-support-bars">
                      <span>
                        <strong>
                          {claim.supportingSourceIds.length +
                            claim.experimentIds.length}
                        </strong>
                        <i
                          data-tone="support"
                          style={
                            {
                              "--width": `${Math.min(100, 18 + (claim.supportingSourceIds.length + claim.experimentIds.length) * 14)}%`,
                            } as CSSProperties
                          }
                        />
                      </span>
                      <span>
                        <strong>{claim.contradictingSourceIds.length}</strong>
                        <i
                          data-tone="contradict"
                          style={
                            {
                              "--width": `${Math.min(100, 14 + claim.contradictingSourceIds.length * 20)}%`,
                            } as CSSProperties
                          }
                        />
                      </span>
                    </span>
                    <span className="cly-rw-claim-links">
                      <span>
                        <FileText size={12} />{" "}
                        {claim.supportingSourceIds.length}
                      </span>
                      <span>
                        <Beaker size={12} /> {claim.experimentIds.length}
                      </span>
                    </span>
                    <span>
                      <Badge tone={claimStatusTone(claim.status)}>
                        {claim.status}
                      </Badge>
                      <small>
                        Updated {relativeDateLabel(claim.updatedAt)}
                      </small>
                    </span>
                    <span className="cly-rw-next-action">
                      {claim.nextExperiment}
                      <ChevronRight size={12} />
                    </span>
                  </button>
                ))}
                <footer className="cly-rw-table-footer">
                  <span>
                    Showing 1–{visible.length} of {claims.length} claims
                  </span>
                  <span className="cly-rw-toolbar-spacer" />
                  <span className="cly-rw-page-number">1</span>
                  <span>Rows per page · 25</span>
                </footer>
              </div>
            ) : null}
            {view === "Table" ? (
              <div className="cly-table-wrap cly-rw-claim-table">
                <table className="cly-table">
                  <thead>
                    <tr>
                      <th style={{ width: "40%" }}>Claim</th>
                      <th>Status</th>
                      <th>Confidence</th>
                      <th>Support</th>
                      <th>Contradictions</th>
                      <th>Experiments</th>
                      <th>Next required experiment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((claim) => (
                      <tr
                        key={claim.id}
                        tabIndex={0}
                        onClick={() => selectClaim(claim)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ")
                            selectClaim(claim);
                        }}
                        data-selected={selected?.id === claim.id}
                      >
                        <td>{claim.text}</td>
                        <td>
                          <Badge tone={claimStatusTone(claim.status)}>
                            {claim.status}
                          </Badge>
                        </td>
                        <td>{claim.confidence}%</td>
                        <td>{claim.supportingSourceIds.length}</td>
                        <td>{claim.contradictingSourceIds.length}</td>
                        <td>{claim.experimentIds.length}</td>
                        <td>{claim.nextExperiment}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {view === "Detail" && selected ? (
              <ClaimDetail claim={selected} />
            ) : null}
          </main>
          {inspectorOpen && selected ? (
            <ClaimInspector
              claim={selected}
              sources={sources}
              experiments={experiments}
              onClose={toggleInspector}
            />
          ) : null}
        </div>
      )}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New research claim"
        description="Use precise, falsifiable language. New claims start unsupported."
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!text.trim()}
              onClick={() => void create()}
            >
              Create claim
            </Button>
          </>
        }
      >
        <div className="cly-field">
          <label htmlFor="claim-text">Claim</label>
          <textarea
            id="claim-text"
            className="cly-textarea"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="State the result, method claim, limitation, or conclusion…"
          />
        </div>
      </Dialog>
    </div>
  );
}

function ClaimDetail({ claim }: { claim: Claim }) {
  const notify = useClyStore((s) => s.notify);
  return (
    <div className="cly-rw-claim-detail-view">
      <header>
        <div>
          <span>{claim.type} claim</span>
          <h2>{claim.text}</h2>
        </div>
        <select
          className="cly-select cly-rw-compact-select"
          value={claim.status}
          onChange={(event) =>
            void mockServices.claims.setStatus(
              claim.id,
              event.target.value as ClaimStatus,
            )
          }
          aria-label="Change claim status"
        >
          {claimStatuses.map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
      </header>
      <div className="cly-metric-row">
        <Metric label="Confidence" value={`${claim.confidence}%`} />
        <Metric
          label="Supporting evidence"
          value={
            claim.supportingSourceIds.length +
            claim.experimentIds.length +
            claim.artifactIds.length
          }
        />
        <Metric
          label="Contradictions"
          value={claim.contradictingSourceIds.length}
        />
        <Metric label="Reviewer risks" value={claim.reviewerRisks.length} />
      </div>
      <div className="cly-rw-claim-detail-grid">
        <section>
          <h3>Assumptions</h3>
          {claim.assumptions.map((item) => (
            <div className="cly-rw-detail-row" key={item}>
              <span>{item}</span>
              <Badge tone="warning">Assumption</Badge>
            </div>
          ))}
        </section>
        <section>
          <h3>Weaknesses and reviewer risks</h3>
          {[...claim.weaknesses, ...claim.reviewerRisks].map((item) => (
            <div className="cly-rw-risk-row" key={item}>
              <AlertTriangle size={12} />
              <span>{item}</span>
            </div>
          ))}
        </section>
      </div>
      <section className="cly-rw-next-experiment">
        <div>
          <span>Next required experiment</span>
          <strong>{claim.nextExperiment}</strong>
        </div>
        <Button
          variant="primary"
          onClick={() =>
            notify(
              "Experiment proposal created",
              "A planned experiment and linked next step were created in fixture mode.",
            )
          }
        >
          <Beaker size={13} /> Generate experiment
        </Button>
      </section>
    </div>
  );
}

function ClaimInspector({
  claim,
  sources,
  experiments,
  onClose,
}: {
  claim: Claim;
  sources: Source[];
  experiments: Experiment[];
  onClose: () => void;
}) {
  const notify = useClyStore((s) => s.notify);
  const supporting = [
    ...claim.experimentIds.map((id) => ({
      id,
      title: experiments.find((item) => item.id === id)?.name ?? id,
      kind: "Experiment",
    })),
    ...claim.supportingSourceIds.map((id) => ({
      id,
      title: sources.find((item) => item.id === id)?.title ?? id,
      kind: "Source",
    })),
  ];
  const contradicting = claim.contradictingSourceIds.map((id) => ({
    id,
    title: sources.find((item) => item.id === id)?.title ?? id,
  }));
  return (
    <aside
      className="cly-rw-inspector cly-rw-claim-inspector"
      data-inline-inspector
      aria-label="Claim evidence details"
    >
      <InspectorTitle
        eyebrow={
          <span className="cly-rw-icon-label">
            {claim.id.toUpperCase()}{" "}
            <Badge tone={claimStatusTone(claim.status)}>{claim.status}</Badge>
          </span>
        }
        title={claim.text}
        detail={
          <span className="cly-rw-icon-label">
            <span className="cly-rw-cell-tag">{claim.type}</span> Updated{" "}
            {relativeDateLabel(claim.updatedAt)} <Star size={12} />
          </span>
        }
        onClose={onClose}
      />
      <div className="cly-rw-inspector-scroll">
        <section className="cly-rw-inspector-section">
          <h3>Evidence strength</h3>
          <div className="cly-rw-claim-strength-summary">
            <strong
              data-tone={
                claim.confidence >= 75
                  ? "success"
                  : claim.confidence >= 55
                    ? "warning"
                    : "danger"
              }
            >
              {claim.confidence >= 75
                ? "Strong"
                : claim.confidence >= 55
                  ? "Moderate"
                  : "Weak"}
            </strong>
            <RatingDots value={claim.confidence} label="Evidence strength" />
            <span>{claim.confidence}%</span>
          </div>
          <p>
            {supporting.length} supporting · {contradicting.length}{" "}
            contradicting
          </p>
        </section>
        <section className="cly-rw-inspector-section">
          <h3>Evidence chain</h3>
          <div className="cly-rw-evidence-timeline" data-tone="support">
            {supporting.map((item) => (
              <button
                type="button"
                key={`${item.kind}-${item.id}`}
                onClick={() => notify(`${item.kind} focused`, item.title)}
              >
                <i />
                <span>
                  <strong>
                    {item.id.toUpperCase()} · {item.title}
                  </strong>
                  <small>{item.kind} · linked evidence</small>
                </span>
                <Badge tone="success">Supports</Badge>
              </button>
            ))}
          </div>
        </section>
        {contradicting.length ? (
          <section className="cly-rw-inspector-section">
            <h3>Contradicting evidence</h3>
            <div className="cly-rw-evidence-timeline" data-tone="contradict">
              {contradicting.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => notify("Contradiction focused", item.title)}
                >
                  <i />
                  <span>
                    <strong>
                      {item.id.toUpperCase()} · {item.title}
                    </strong>
                    <small>Source · conflicting evidence</small>
                  </span>
                  <Badge tone="danger">Contradicts</Badge>
                </button>
              ))}
            </div>
          </section>
        ) : null}
        <section className="cly-rw-inspector-section">
          <h3>Bias / risk notes</h3>
          {[...claim.weaknesses, ...claim.reviewerRisks].map((risk) => (
            <div className="cly-rw-risk-row" key={risk}>
              <AlertTriangle size={13} />
              <span>{risk}</span>
              <Badge tone="warning">Risk</Badge>
            </div>
          ))}
        </section>
        <section className="cly-rw-inspector-section">
          <h3>Status</h3>
          <select
            className="cly-select"
            value={claim.status}
            onChange={(event) =>
              void mockServices.claims.setStatus(
                claim.id,
                event.target.value as ClaimStatus,
              )
            }
            aria-label="Update claim status"
          >
            {claimStatuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </section>
      </div>
      <footer className="cly-rw-inspector-action-footer">
        <Button
          onClick={() =>
            void mockServices.claims
              .linkExperiment(claim.id, "exp-01")
              .then(() =>
                notify(
                  "Experiment linked",
                  "The experiment now appears in this claim's evidence chain.",
                ),
              )
          }
        >
          <Link2 size={13} /> Link evidence
        </Button>
        <Button
          onClick={() =>
            notify(
              "Adversarial review preview",
              "The agent will search for missing controls and alternative explanations.",
            )
          }
        >
          <Activity size={13} /> Request review
        </Button>
        <Button
          variant="primary"
          onClick={() =>
            notify(
              "Claim promoted",
              "A paper-ready claim section was added to the writing queue.",
            )
          }
        >
          <FileText size={13} /> Promote to paper
        </Button>
      </footer>
    </aside>
  );
}
