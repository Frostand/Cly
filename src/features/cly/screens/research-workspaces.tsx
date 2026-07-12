import {
  Archive,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Clipboard,
  Code2,
  Columns3,
  Database,
  Download,
  ExternalLink,
  FileInput,
  FileText,
  FolderInput,
  Link2,
  Merge,
  Notebook,
  Plus,
  ScanSearch,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { DisclosureRow } from "../components/design-system";
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
import {
  EvidenceStrength,
  ExecutionStrip,
  RelationshipChain,
} from "../components/visuals";
import { previewLiteratureThemes } from "../domain/literature-enrichment";
import type { LiteratureSearchResult } from "../domain/literature-search";
import { filterAndSortClaims } from "../domain/logic";
import type { ClaimStatus, Source } from "../domain/types";
import { desktopLiteratureService } from "../services/literature-service";
import { mockServices } from "../services/mock-services";
import { claimStatusTone, useClyStore } from "../store/cly-store";

export function SourcesScreen() {
  const sources = useClyStore((s) => s.data.sources);
  const claims = useClyStore((s) => s.data.claims);
  const selectedId = useClyStore((s) => s.selectedId);
  const setSelected = useClyStore((s) => s.setSelected);
  const notify = useClyStore((s) => s.notify);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("All");
  const [sort, setSort] = useState<"Relevance" | "Newest" | "Title">(
    "Relevance",
  );
  const [importOpen, setImportOpen] = useState(false);
  const [title, setTitle] = useState("");
  const relevanceRank = { Core: 0, High: 1, Medium: 2, Low: 3 };
  const filtered = sources
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
  const sourceColumns = useMemo<ColumnDef<Source, unknown>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Source",
        cell: ({ row }) => (
          <div className="cly-source-cell">
            <span className="cly-source-mark" data-type={row.original.type}>
              {row.original.type === "Dataset" ? (
                <Database size={12} />
              ) : (
                <BookOpen size={12} />
              )}
            </span>
            <div>
              <div>{row.original.title}</div>
              <div className="cly-faint" style={{ fontSize: 9 }}>
                {row.original.tags.join(" · ")}
              </div>
            </div>
          </div>
        ),
      },
      { accessorKey: "authors", header: "Authors" },
      { accessorKey: "year", header: "Year" },
      { accessorKey: "type", header: "Type" },
      {
        accessorKey: "status",
        header: "Review",
        cell: ({ row }) => (
          <Badge tone={toneForStatus(row.original.status)}>
            {row.original.status}
          </Badge>
        ),
      },
      { accessorKey: "relevance", header: "Relevance" },
      {
        id: "links",
        header: "Links",
        accessorFn: (row) =>
          `${row.linkedClaimIds.length} claims · ${row.linkedExperimentIds.length} exp.`,
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
        title="Source Manager"
        description="Organize and connect research sources."
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
              <Upload size={13} /> Import source
            </Button>
          </>
        }
      />
      <div className="cly-metric-row">
        <Metric
          label="Sources"
          value={sources.length.toLocaleString()}
          detail={`${sources.filter((item) => item.status === "Reviewed").length} reviewed`}
        />
        <Metric
          label="Core evidence"
          value={sources.filter((item) => item.relevance === "Core").length}
          detail="Linked to active claims"
        />
        <Metric
          label="NotebookLM bundle"
          value={sources.filter((item) => item.inNotebookBundle).length}
          detail="Ready for source manifest"
        />
        <Metric
          label="Needs metadata"
          value={
            sources.filter((item) => item.status === "Needs metadata").length
          }
          detail="Extraction pending"
        />
      </div>
      <div className="cly-section">
        <div className="cly-filterbar">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search titles, authors, and tags…"
          />
          <select
            className="cly-select"
            style={{ width: 150 }}
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
          <select
            className="cly-select"
            style={{ width: 130 }}
            value={sort}
            onChange={(event) =>
              setSort(event.target.value as "Relevance" | "Newest" | "Title")
            }
            aria-label="Sort sources"
          >
            <option>Relevance</option>
            <option>Newest</option>
            <option>Title</option>
          </select>
          <Button
            onClick={() =>
              notify(
                "BibTeX import",
                "The prototype parsed 24 fixture records and found two possible duplicates.",
              )
            }
          >
            <FileInput size={13} /> BibTeX
          </Button>
          <Button
            onClick={() =>
              notify(
                "URL source form",
                "A URL entry form would validate metadata without fetching in this UI-only phase.",
              )
            }
          >
            <Link2 size={13} /> Add URL
          </Button>
        </div>
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
          <ClyDataTable
            id="sources"
            data={filtered}
            columns={sourceColumns}
            getRowId={(row) => row.id}
            selectedId={selectedId}
            onSelect={(row) => setSelected(row.id)}
          />
        )}
      </div>
      <DisclosureRow
        title="Source actions"
        detail={
          selectedId
            ? "Actions for the selected source"
            : "Select a source first"
        }
      >
        <div className="cly-row">
          <Button
            disabled={!selectedId}
            onClick={() =>
              selectedId &&
              void mockServices.sources
                .addToNotebookBundle(selectedId)
                .then(() => notify("Added to NotebookLM bundle"))
            }
          >
            <BookOpen size={13} /> Add to NotebookLM bundle
          </Button>
          <Button
            disabled={!selectedId || claims.length === 0}
            onClick={() => {
              const claim = claims[0];
              if (!selectedId || !claim) return;
              void mockServices.sources
                .linkClaim(selectedId, claim.id)
                .then(() =>
                  notify(
                    "Evidence linked",
                    `The source now supports “${claim.text.slice(0, 70)}”.`,
                  ),
                )
                .catch((error) =>
                  notify(
                    "Evidence link failed",
                    error instanceof Error
                      ? error.message
                      : "Unable to link claim.",
                  ),
                );
            }}
          >
            <Link2 size={13} /> Link to claim
          </Button>
          <Button
            disabled={!selectedId}
            onClick={() => {
              if (!selectedId) return;
              void mockServices.sources
                .enrich(selectedId)
                .then(() =>
                  notify(
                    "Structured notes saved",
                    "Deterministic metadata enrichment was persisted with provenance. Review the fields before citing them.",
                  ),
                )
                .catch((error) =>
                  notify(
                    "Enrichment failed",
                    error instanceof Error
                      ? error.message
                      : "Unable to enrich source.",
                  ),
                );
            }}
          >
            <FileText size={13} /> Extract structured notes
          </Button>
          <Button
            disabled={!selectedId}
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
            disabled={!selectedId}
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
      </DisclosureRow>
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
  const activeProjectId = useClyStore((s) => s.activeProjectId);
  const sources = useClyStore((s) => s.data.sources);
  const claims = useClyStore((s) => s.data.claims);
  const setSelected = useClyStore((s) => s.setSelected);
  const notify = useClyStore((s) => s.notify);
  const [view, setView] = useState<LiteratureView>("Matrix");
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [importedAnswers, setImportedAnswers] = useState<string[]>([
    "The cited literature supports regime-stratified coverage reporting but does not establish compound-shift reliability.",
  ]);
  const [searchResults, setSearchResults] = useState<LiteratureSearchResult[]>(
    [],
  );
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [savedResultIds, setSavedResultIds] = useState<string[]>([]);
  const visible = sources.filter(
    (source) =>
      !query ||
      `${source.title} ${source.methods.join(" ")} ${source.findings.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );

  return (
    <div className="cly-page cly-page-wide cly-route-literature">
      <PageHeader
        kicker="Research"
        title="Literature Workspace"
        description="Compare methods, results, limitations, and claims."
        actions={
          <Segmented
            value={view}
            options={literatureViews}
            onChange={setView}
            label="Literature view"
          />
        }
      />
      {view === "Matrix" ? (
        <>
          <div className="cly-filterbar">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search literature matrix…"
            />
            <Button
              variant="primary"
              disabled={searching || !query.trim()}
              onClick={async () => {
                setSearching(true);
                setSearchError(null);
                try {
                  setSearchResults(
                    await desktopLiteratureService.search(
                      activeProjectId,
                      query,
                    ),
                  );
                } catch (error) {
                  setSearchError(
                    error instanceof Error
                      ? error.message
                      : "Literature retrieval failed. No records were changed.",
                  );
                  setSearching(false);
                  setSearchResults([]);
                  return;
                }
                setSearching(false);
              }}
            >
              <ScanSearch size={13} />{" "}
              {searching ? "Searching…" : "Search papers"}
            </Button>
            <Button
              onClick={() =>
                notify(
                  "Column chooser",
                  "13 default columns and 2 fixture custom fields are available.",
                )
              }
            >
              <Columns3 size={13} /> Columns
            </Button>
            <Button
              onClick={() =>
                notify(
                  "Custom column added",
                  "A new editable evidence dimension was added to the matrix.",
                )
              }
            >
              <Plus size={13} /> Custom column
            </Button>
            <Button
              onClick={() => {
                const themes = previewLiteratureThemes(sources);
                notify(
                  "Theme preview ready",
                  themes.length
                    ? themes
                        .map(
                          (theme) =>
                            `${theme.label} (${theme.sourceCount} source${theme.sourceCount === 1 ? "" : "s"})`,
                        )
                        .join(" · ")
                    : "Add tags or structured methods before generating a theme preview.",
                );
              }}
            >
              <Sparkles size={13} /> Related-work outline
            </Button>
          </div>
          {searchError ? (
            <div
              className="cly-callout"
              role="alert"
              style={{ marginBottom: 12 }}
            >
              <strong>Search unavailable.</strong> {searchError}
            </div>
          ) : null}
          {!searching &&
          query.trim() &&
          !searchError &&
          searchResults.length === 0 ? (
            <EmptyState
              title="No matching papers"
              description="Try a broader topic or inspect the provider status."
            />
          ) : null}
          {searchResults.length > 0 ? (
            <Panel className="cly-panel-body" style={{ marginBottom: 12 }}>
              <div className="cly-panel-header">
                <strong>Ranked literature results</strong>
                <Badge>{searchResults.length} matches · local fixture</Badge>
              </div>
              <div className="cly-stack">
                {searchResults.slice(0, 8).map((result) => {
                  const saved = savedResultIds.includes(result.source.id);
                  return (
                    <div
                      className="cly-row-between"
                      key={result.source.id}
                      style={{ gap: 12 }}
                    >
                      <div>
                        <strong>{result.source.title}</strong>
                        <div className="cly-muted cly-small">
                          Score {(result.score * 100).toFixed(0)}% ·{" "}
                          {result.method} · {result.explanation}
                        </div>
                      </div>
                      <Button
                        disabled={saved}
                        onClick={() =>
                          void mockServices.sources
                            .createFromSearch(result)
                            .then((source) => {
                              setSavedResultIds((ids) => [
                                ...ids,
                                result.source.id,
                              ]);
                              setSelected(source.id);
                              notify(
                                "Paper saved",
                                "Source record and literature matrix row created with ranking provenance.",
                              );
                            })
                        }
                      >
                        {saved ? <Check size={13} /> : <Plus size={13} />}{" "}
                        {saved ? "Saved" : "Save to project"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </Panel>
          ) : null}
          <div className="cly-table-wrap">
            <table className="cly-table" style={{ minWidth: 1500 }}>
              <thead>
                <tr>
                  <th style={{ width: 250 }}>Source</th>
                  <th>Research problem</th>
                  <th>Method</th>
                  <th>Dataset / system</th>
                  <th>Principal result</th>
                  <th>Limitations</th>
                  <th>Supports claim</th>
                  <th>Contradicts</th>
                  <th>Confidence</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, 200).map((source) => (
                  <tr key={source.id} onClick={() => setSelected(source.id)}>
                    <td>{source.title}</td>
                    <td
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={() =>
                        notify(
                          "Matrix cell updated",
                          "The edited value is retained visually in this prototype session.",
                        )
                      }
                    >
                      {source.summary}
                    </td>
                    <td>{source.methods.join(", ")}</td>
                    <td>
                      {source.type === "Dataset"
                        ? source.title
                        : source.linkedExperimentIds.length
                          ? "Cylinder-flow system"
                          : "—"}
                    </td>
                    <td>{source.findings[0] ?? "Extraction pending"}</td>
                    <td>{source.limitations.join(", ") || "None recorded"}</td>
                    <td>
                      {source.linkedClaimIds
                        .map((id) =>
                          claims
                            .find((claim) => claim.id === id)
                            ?.text.slice(0, 35),
                        )
                        .filter(Boolean)
                        .join("; ") || "—"}
                    </td>
                    <td>
                      {source.id === "src-02" || source.id === "src-04"
                        ? "Primary claim assumption"
                        : "—"}
                    </td>
                    <td>{source.confidence}%</td>
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
        </>
      ) : null}
      {view === "Themes" ? (
        <div className="cly-grid-3">
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
        <Panel className="cly-panel-body">
          <div className="cly-timeline">
            {[...sources]
              .sort((a, b) => b.year - a.year)
              .map((source) => (
                <button
                  className="cly-timeline-item"
                  key={source.id}
                  type="button"
                  onClick={() => setSelected(source.id)}
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
        <div className="cly-grid-2">
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
        <div className="cly-grid-3">
          {Array.from(new Set(sources.flatMap((source) => source.methods))).map(
            (method) => (
              <Panel className="cly-panel-body" key={method}>
                <strong>{method}</strong>
                <p className="cly-muted cly-small">
                  Used by{" "}
                  {
                    sources.filter((source) => source.methods.includes(method))
                      .length
                  }{" "}
                  source(s). Select to compare assumptions and limitations.
                </p>
                <Button onClick={() => notify("Method comparison", method)}>
                  Compare evidence
                </Button>
              </Panel>
            ),
          )}
        </div>
      ) : null}
      {view === "NotebookLM" ? (
        <NotebookLmWorkspace
          sources={sources}
          answer={answer}
          setAnswer={setAnswer}
          importedAnswers={importedAnswers}
          setImportedAnswers={setImportedAnswers}
        />
      ) : null}
    </div>
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
  const selectedId = useClyStore((s) => s.selectedId);
  const setSelected = useClyStore((s) => s.setSelected);
  const notify = useClyStore((s) => s.notify);
  const [query, setQuery] = useState("");
  const [importOpen, setImportOpen] = useState(false);
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
        title="Notebook Scanner"
        description="Find execution, output, and reproducibility issues."
        actions={
          <Button variant="primary" onClick={() => setImportOpen(true)}>
            <Upload size={13} /> Import notebook
          </Button>
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
        <div className="cly-overview-grid">
          <div>
            <div className="cly-filterbar">
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Search notebooks…"
              />
            </div>
            <Panel>
              {visible.slice(0, 100).map((notebook) => (
                <button
                  className="cly-list-row"
                  type="button"
                  key={notebook.id}
                  data-selected={selectedId === notebook.id}
                  onClick={() => setSelected(notebook.id)}
                >
                  <div>
                    <div className="cly-row">
                      <Notebook size={14} />
                      <span className="cly-list-title">{notebook.title}</span>
                      <Badge tone={toneForStatus(notebook.status)}>
                        {notebook.status}
                      </Badge>
                    </div>
                    <div className="cly-list-detail cly-mono">
                      {notebook.path}
                    </div>
                    <div className="cly-list-detail">
                      {notebook.codeCells} code cells · {notebook.outputs}{" "}
                      outputs · {notebook.figures} figures ·{" "}
                      {notebook.issues.length} issues
                    </div>
                  </div>
                  <ChevronRight size={14} />
                </button>
              ))}
            </Panel>
          </div>
          <aside>
            {selected ? (
              <Panel>
                <div className="cly-panel-header">
                  <div>
                    <strong>{selected.name}</strong>
                    <div className="cly-muted cly-small">
                      {experiments.find(
                        (item) => item.id === selected.experimentId,
                      )?.name ?? "No experiment linked"}
                    </div>
                  </div>
                  <Badge tone={toneForStatus(selected.reproducibility)}>
                    {selected.reproducibility}
                  </Badge>
                </div>
                <div className="cly-panel-body">
                  <Section title="Execution shape">
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
                  </Section>
                  <div className="cly-metric-row">
                    <Metric
                      label="Consistency"
                      value={`${selected.executionConsistency}%`}
                    />
                    <Metric label="Code cells" value={selected.codeCells} />
                    <Metric label="Outputs" value={selected.outputs} />
                  </div>
                  <Section title="Cell outline">
                    <div className="cly-stack">
                      {selected.outline.map((heading, index) => (
                        <div className="cly-row" key={heading}>
                          <span className="cly-kbd">{index + 1}</span>
                          <span>{heading}</span>
                        </div>
                      ))}
                    </div>
                  </Section>
                  <Section title="Detected issues">
                    {selected.issues.map((issue) => (
                      <div
                        className="cly-callout"
                        data-tone="warning"
                        key={issue}
                        style={{ marginBottom: 7 }}
                      >
                        {issue}
                      </div>
                    ))}
                  </Section>
                  <Section title="Notebook actions">
                    <div className="cly-grid-2">
                      <Button
                        onClick={() =>
                          notify(
                            "Notebook summary ready",
                            "The summary includes objectives, methods, results, caveats, and linked claims.",
                          )
                        }
                      >
                        <Sparkles size={12} /> Summarize
                      </Button>
                      <Button
                        onClick={() =>
                          notify(
                            "Outputs extracted",
                            `${selected.outputs} output records and ${selected.figures} figures were added to the mock artifact index.`,
                          )
                        }
                      >
                        <Download size={12} /> Extract
                      </Button>
                      <Button
                        onClick={() =>
                          notify(
                            "Notebook marked canonical",
                            "The canonical marker is simulated for this session.",
                          )
                        }
                      >
                        <Check size={12} /> Canonical
                      </Button>
                      <Button
                        onClick={() =>
                          notify(
                            "Reproducibility task created",
                            "A notebook cleanup task was added to Next Steps.",
                          )
                        }
                      >
                        <ScanSearch size={12} /> Audit
                      </Button>
                    </div>
                  </Section>
                </div>
              </Panel>
            ) : null}
          </aside>
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

export function CodeLinkerScreen() {
  const code = useClyStore((s) => s.data.code);
  const selectedId = useClyStore((s) => s.selectedId);
  const setSelected = useClyStore((s) => s.setSelected);
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
  return (
    <div className="cly-page cly-page-wide cly-route-code">
      <PageHeader
        kicker="Research"
        title="Code-to-Research Linker"
        description="Connect code to research purpose, evidence, and risk."
        actions={
          <Segmented
            value={view}
            options={
              ["Files", "Objectives", "Claims", "Risks", "Unlinked"] as const
            }
            onChange={setView}
            label="Code linker view"
          />
        }
      />
      {code.length === 0 ? (
        <EmptyState
          title="No code artifacts indexed"
          description="Scan project files to begin linking research meaning."
          action={<Button>Simulate scan</Button>}
        />
      ) : (
        <div
          className="cly-settings-layout"
          style={{
            gridTemplateColumns: "minmax(300px, .85fr) minmax(0, 1.5fr)",
          }}
        >
          <div>
            <div className="cly-filterbar">
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Search files and purposes…"
              />
            </div>
            <Panel>
              {visible.map((item) => (
                <button
                  className="cly-list-row"
                  type="button"
                  data-selected={selected?.id === item.id}
                  key={item.id}
                  onClick={() => setSelected(item.id)}
                >
                  <div>
                    <div className="cly-row">
                      <Code2 size={13} />
                      <span className="cly-list-title cly-mono">
                        {item.path}
                      </span>
                    </div>
                    <div className="cly-list-detail">{item.purpose}</div>
                  </div>
                  <Badge tone={toneForStatus(item.status)}>{item.status}</Badge>
                </button>
              ))}
            </Panel>
          </div>
          {selected ? (
            <Panel>
              <div className="cly-panel-header">
                <div>
                  <div className="cly-page-kicker">Research purpose</div>
                  <strong className="cly-mono">{selected.path}</strong>
                </div>
                <Badge tone={toneForStatus(selected.status)}>
                  {selected.confidence}% confidence
                </Badge>
              </div>
              <div className="cly-panel-body">
                <h2 style={{ marginTop: 0, fontSize: 15 }}>
                  {selected.purpose}
                </h2>
                <p className="cly-muted">Objective: {selected.objective}</p>
                <Section title="Research relationship">
                  <RelationshipChain
                    label={`Research relationship for ${selected.path}`}
                    alertAt={selected.risks.length ? 2 : undefined}
                    steps={[
                      { label: "Objective", detail: selected.objective },
                      { label: "Method", detail: selected.method },
                      { label: "Code", detail: selected.path },
                      {
                        label: "Runs",
                        detail: `${selected.experimentIds.length} experiments`,
                      },
                      {
                        label: "Claims",
                        detail: `${selected.claimIds.length} linked`,
                      },
                    ]}
                  />
                </Section>
                <dl className="cly-detail-grid">
                  <dt>Method</dt>
                  <dd>{selected.method}</dd>
                  <dt>Tests</dt>
                  <dd>{selected.tests}</dd>
                  <dt>Claims</dt>
                  <dd>{selected.claimIds.join(", ") || "None"}</dd>
                  <dt>Experiments</dt>
                  <dd>{selected.experimentIds.join(", ") || "None"}</dd>
                  <dt>Notebooks</dt>
                  <dd>{selected.notebookIds.join(", ") || "None"}</dd>
                </dl>
                <Section title="Risk and issues">
                  {selected.risks.length ? (
                    selected.risks.map((risk) => (
                      <div
                        className="cly-callout"
                        data-tone="warning"
                        key={risk}
                        style={{ marginBottom: 7 }}
                      >
                        {risk}
                      </div>
                    ))
                  ) : (
                    <div className="cly-callout">No open code risks.</div>
                  )}
                </Section>
                <Section title="Actions">
                  <div className="cly-row">
                    <Button
                      onClick={() =>
                        notify(
                          "Research link created",
                          "Choose a method, claim, experiment, or run in the inspector.",
                        )
                      }
                    >
                      <Link2 size={13} /> Link object
                    </Button>
                    <Button
                      onClick={() =>
                        notify("Inferred purpose approved", selected.purpose)
                      }
                    >
                      <Check size={13} /> Approve purpose
                    </Button>
                    <Button
                      onClick={() =>
                        notify(
                          "Output trace opened",
                          "Cly traced code → run → artifact → claim.",
                        )
                      }
                    >
                      <ArrowRight size={13} /> Trace outputs
                    </Button>
                    <Button
                      onClick={() =>
                        notify(
                          "External editor boundary",
                          "Dream’s open-in-editor infrastructure is retained for Phase 2 wiring.",
                        )
                      }
                    >
                      <ExternalLink size={13} /> External editor
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
                  </div>
                </Section>
              </div>
            </Panel>
          ) : null}
        </div>
      )}
    </div>
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
  const selectedId = useClyStore((s) => s.selectedId);
  const setSelected = useClyStore((s) => s.setSelected);
  const notify = useClyStore((s) => s.notify);
  const [view, setView] = useState<ClaimView>("Board");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [createOpen, setCreateOpen] = useState(false);
  const [text, setText] = useState("");
  const visible = filterAndSortClaims(claims, query, status, "confidence");
  const selected = claims.find((item) => item.id === selectedId) ?? claims[0];
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
        title="Claim Audit Board"
        description="Assess evidence, contradictions, and paper readiness."
        actions={
          <>
            <Segmented
              value={view}
              options={["Board", "Table", "Detail"] as const}
              onChange={setView}
              label="Claim view"
            />
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus size={13} /> New claim
            </Button>
          </>
        }
      />
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
        <>
          <div className="cly-filterbar">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search claims…"
            />
            <select
              className="cly-select"
              style={{ width: 140 }}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label="Filter claim status"
            >
              <option>All</option>
              {claimStatuses.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <Button
              disabled={!selected}
              onClick={() =>
                notify(
                  "Adversarial review preview",
                  "The agent plan will search for missing controls, weak baselines, and alternative explanations.",
                )
              }
            >
              <Sparkles size={13} /> Adversarial review
            </Button>
          </div>
          {view === "Board" ? (
            <div className="cly-claim-board">
              {claimStatuses
                .filter((item) => claims.some((claim) => claim.status === item))
                .map((column) => (
                  <div className="cly-board-column" key={column}>
                    <div className="cly-board-header">
                      <span>{column}</span>
                      <Badge tone={claimStatusTone(column)}>
                        {claims.filter((item) => item.status === column).length}
                      </Badge>
                    </div>
                    {visible
                      .filter((item) => item.status === column)
                      .map((claim) => (
                        <button
                          type="button"
                          className="cly-claim-card"
                          key={claim.id}
                          onClick={() => setSelected(claim.id)}
                          style={{
                            display: "block",
                            width: "calc(100% - 14px)",
                            textAlign: "left",
                            color: "inherit",
                          }}
                        >
                          <div
                            className="cly-clamp-2"
                            style={{ fontWeight: 590, lineHeight: 1.45 }}
                          >
                            {claim.text}
                          </div>
                          <div style={{ marginTop: 10 }}>
                            <EvidenceStrength
                              confidence={claim.confidence}
                              support={claim.supportingSourceIds.length}
                              contradictions={
                                claim.contradictingSourceIds.length
                              }
                              label="Evidence"
                            />
                          </div>
                        </button>
                      ))}
                  </div>
                ))}
            </div>
          ) : null}
          {view === "Table" ? (
            <div className="cly-table-wrap">
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
                      onClick={() => setSelected(claim.id)}
                      data-selected={selectedId === claim.id}
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
        </>
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

function ClaimDetail({
  claim,
}: {
  claim: ReturnType<typeof useClyStore.getState>["data"]["claims"][number];
}) {
  const data = useClyStore((s) => s.data);
  const notify = useClyStore((s) => s.notify);
  return (
    <div className="cly-overview-grid">
      <div>
        <Panel>
          <div className="cly-panel-header">
            <div>
              <div className="cly-page-kicker">{claim.type} claim</div>
              <h2 style={{ margin: "4px 0 0", fontSize: 18, maxWidth: 780 }}>
                {claim.text}
              </h2>
            </div>
            <select
              className="cly-select"
              style={{ width: 130 }}
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
          </div>
          <div className="cly-panel-body">
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
              <Metric
                label="Reviewer risks"
                value={claim.reviewerRisks.length}
              />
            </div>
            <Section title="Evidence chain">
              <div className="cly-evidence-chain">
                {[
                  ...claim.supportingSourceIds
                    .slice(0, 1)
                    .map(
                      (id) =>
                        data.sources.find((item) => item.id === id)?.title ??
                        id,
                    ),
                  ...claim.experimentIds
                    .slice(0, 1)
                    .map(
                      (id) =>
                        data.experiments.find((item) => item.id === id)?.name ??
                        id,
                    ),
                  ...claim.artifactIds
                    .slice(0, 1)
                    .map(
                      (id) =>
                        data.artifacts.find((item) => item.id === id)?.name ??
                        id,
                    ),
                  "Claim",
                ].map((label, index, all) => (
                  <span style={{ display: "contents" }} key={label}>
                    <div className="cly-chain-node">
                      <strong className="cly-clamp-2">{label}</strong>
                      <div className="cly-muted" style={{ marginTop: 3 }}>
                        {index === all.length - 1
                          ? claim.status
                          : "Confirmed evidence"}
                      </div>
                    </div>
                    {index < all.length - 1 ? (
                      <ArrowRight className="cly-chain-arrow" size={13} />
                    ) : null}
                  </span>
                ))}
              </div>
            </Section>
            <div className="cly-grid-2">
              <Section title="Assumptions">
                {claim.assumptions.map((item) => (
                  <div className="cly-list-row" key={item}>
                    <span>{item}</span>
                    <Badge tone="warning">Assumption</Badge>
                  </div>
                ))}
              </Section>
              <Section title="Weaknesses and reviewer risks">
                {[...claim.weaknesses, ...claim.reviewerRisks].map((item) => (
                  <div
                    className="cly-callout"
                    data-tone="warning"
                    style={{ marginBottom: 7 }}
                    key={item}
                  >
                    {item}
                  </div>
                ))}
              </Section>
            </div>
          </div>
        </Panel>
      </div>
      <aside className="cly-stack">
        <Panel className="cly-panel-body">
          <div className="cly-page-kicker">Next required experiment</div>
          <h3>{claim.nextExperiment}</h3>
          <Button
            variant="primary"
            onClick={() =>
              notify(
                "Experiment proposal created",
                "A planned experiment and linked next step were created in fixture mode.",
              )
            }
          >
            <BeakerIcon /> Generate experiment
          </Button>
        </Panel>
        <Panel className="cly-panel-body">
          <div className="cly-inspector-label">Claim actions</div>
          <div className="cly-stack">
            <Button
              onClick={() =>
                void mockServices.claims
                  .linkExperiment(claim.id, "exp-01")
                  .then(() =>
                    notify(
                      "Experiment linked",
                      "Calibrated ensemble sweep now appears in this claim's evidence chain.",
                    ),
                  )
              }
            >
              <Link2 size={13} /> Link evidence
            </Button>
            <Button
              onClick={() =>
                notify(
                  "Contradiction recorded",
                  "A conflicting source can now be selected in the inspector.",
                )
              }
            >
              <X size={13} /> Add contradiction
            </Button>
            <Button
              onClick={() =>
                notify(
                  "Claim report exported",
                  "The fixture report includes all evidence, caveats, and provenance links.",
                )
              }
            >
              <Download size={13} /> Export claim report
            </Button>
            <Button
              onClick={() =>
                notify(
                  "Graph path focused",
                  "The claim neighborhood is now focused in the graph preview.",
                )
              }
            >
              <ArrowRight size={13} /> Trace in graph
            </Button>
          </div>
        </Panel>
      </aside>
    </div>
  );
}

function BeakerIcon() {
  return <ScanSearch size={13} />;
}

import type { ColumnDef } from "@tanstack/react-table";
