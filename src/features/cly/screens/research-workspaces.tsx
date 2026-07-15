import {
  Archive,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Clipboard,
  Code2,
  Columns3,
  Copy,
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
import { useEffect, useMemo, useRef, useState } from "react";
import { getDesktopApi } from "../../../lib/electron";
import {
  DisclosureRow,
  InlineMetadata,
  PaneHeader,
} from "../components/design-system";
import { InheritedRestrictions } from "../components/inherited-restrictions";
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  LoadingState,
  Metric,
  PageHeader,
  Panel,
  SearchInput,
  Section,
  Segmented,
  toneForStatus,
} from "../components/primitives";
import { ClyDataTable, ClySplitPane } from "../components/toolkit";
import {
  EvidenceStrength,
  ExecutionStrip,
  RelationshipChain,
} from "../components/visuals";
import {
  costCategoryLabels,
  costWasteLabels,
  formatMoney,
  formatMoneyTotals,
} from "../domain/costs";
import { previewLiteratureThemes } from "../domain/literature-enrichment";
import type { LiteratureSearchResult } from "../domain/literature-search";
import { filterAndSortClaims } from "../domain/logic";
import type {
  InheritedRestriction,
  ObligationEvaluation,
  ObligationOperation,
} from "../domain/obligations";
import type { Claim, ClaimStatus, Source } from "../domain/types";
import { apiClient, type ReviewerCapsule } from "../services/api-client";
import { capabilityUnavailableMessage } from "../services/capabilities";
import { desktopLiteratureService } from "../services/literature-service";
import { projectServices } from "../services/project-services";
import { isClyDemoRuntime } from "../services/runtime";
import { claimStatusTone, useClyStore } from "../store/cly-store";

const noInheritedRestrictions: InheritedRestriction[] = [];

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
  const [importType, setImportType] = useState<Source["type"]>("Paper");
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
    try {
      const source = await projectServices.sources.create({
        title: title.trim() || "Imported source",
        type: importType,
      });
      setImportOpen(false);
      setTitle("");
      setImportType("Paper");
      setSelected(source.id);
      notify(
        "Source record saved",
        "The source metadata was persisted to the active project.",
      );
    } catch {
      // addSource already reports the persistence error. Keep the dialog open
      // so the user's input is not lost and never show a success state.
    }
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
              disabled={!isClyDemoRuntime}
              title={capabilityUnavailableMessage("sources.folder-import")}
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
              <Plus size={13} /> Add source
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
            disabled={!isClyDemoRuntime}
            title={capabilityUnavailableMessage("sources.bibtex-import")}
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
            disabled={!isClyDemoRuntime}
            title={capabilityUnavailableMessage("sources.url-import")}
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
                Add source
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
            disabled={!selectedId || !isClyDemoRuntime}
            title={capabilityUnavailableMessage("exports.notebook-bundle")}
            onClick={() =>
              selectedId &&
              void projectServices.sources
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
              void projectServices.sources
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
            disabled={!selectedId || !isClyDemoRuntime}
            title={capabilityUnavailableMessage("sources.deduplicate")}
            onClick={() => {
              if (!selectedId) return;
              void projectServices.sources
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
            disabled={!selectedId || !isClyDemoRuntime}
            variant="danger"
            title={capabilityUnavailableMessage("sources.archive")}
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
        title="Add source"
        description="Create a durable source record in the active project. Add a URL or citation through metadata enrichment after saving."
        footer={
          <>
            <Button onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => void importSource()}>
              Save source
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
        <div className="cly-field" style={{ marginTop: 12 }}>
          <label htmlFor="source-type">Source type</label>
          <select
            id="source-type"
            className="cly-select"
            value={importType}
            onChange={(event) =>
              setImportType(event.target.value as Source["type"])
            }
          >
            <option>Paper</option>
            <option>Dataset</option>
            <option>Documentation</option>
            <option>Lab note</option>
            <option>Webpage</option>
          </select>
        </div>
        <div className="cly-callout" style={{ marginTop: 12 }}>
          This form stores source metadata. File parsing, URL fetching, and bulk
          import remain unavailable until their approval and provenance flows
          are implemented.
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
type LiteratureMatrixMode = "Discover" | "Saved matrix";
type LiteratureResultFilter = "All results" | "Unsaved" | "Saved";
type LiteratureResultSort = "Relevance" | "Newest" | "Title";
const literatureViews = [
  "Matrix",
  "Themes",
  "Chronological",
  "Claims",
  "Methods",
  "NotebookLM",
] as const;

export function LiteratureScreen() {
  const activeProject = useClyStore((s) =>
    s.data.projects.find((project) => project.id === s.activeProjectId),
  );
  const sources = useClyStore((s) => s.data.sources);
  const claims = useClyStore((s) => s.data.claims);
  const setSelected = useClyStore((s) => s.setSelected);
  const notify = useClyStore((s) => s.notify);
  const [view, setView] = useState<LiteratureView>("Matrix");
  const [matrixMode, setMatrixMode] =
    useState<LiteratureMatrixMode>("Discover");
  const [query, setQuery] = useState("");
  const [matrixQuery, setMatrixQuery] = useState("");
  const [matrixStatus, setMatrixStatus] = useState("All review states");
  const [resultFilter, setResultFilter] =
    useState<LiteratureResultFilter>("All results");
  const [resultSort, setResultSort] =
    useState<LiteratureResultSort>("Relevance");
  const [answer, setAnswer] = useState("");
  const [importedAnswers, setImportedAnswers] = useState<string[]>([
    "The cited literature supports regime-stratified coverage reporting but does not establish compound-shift reliability.",
  ]);
  const [searchResults, setSearchResults] = useState<LiteratureSearchResult[]>(
    [],
  );
  const [searching, setSearching] = useState(false);
  const [externalSearchApproved, setExternalSearchApproved] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const savedSearchResultIds = useMemo(
    () =>
      new Set(
        searchResults
          .filter((result) =>
            sources.some(
              (source) =>
                (source.provider === result.source.provider &&
                  source.providerId === result.source.providerId) ||
                (source.doi && source.doi === result.source.doi) ||
                (source.url && source.url === result.source.url) ||
                source.title === result.source.title,
            ),
          )
          .map((result) => result.source.id),
      ),
    [searchResults, sources],
  );
  const filteredResults = useMemo(() => {
    const filtered = searchResults.filter((result) => {
      const saved = savedSearchResultIds.has(result.source.id);
      return (
        resultFilter === "All results" ||
        (resultFilter === "Saved" ? saved : !saved)
      );
    });
    return [...filtered].sort((left, right) => {
      if (resultSort === "Newest") return right.source.year - left.source.year;
      if (resultSort === "Title")
        return left.source.title.localeCompare(right.source.title);
      return right.score - left.score;
    });
  }, [resultFilter, resultSort, savedSearchResultIds, searchResults]);
  const selectedResult =
    searchResults.find((result) => result.source.id === selectedResultId) ??
    filteredResults[0] ??
    null;
  const resultColumns = useMemo<ColumnDef<LiteratureSearchResult, unknown>[]>(
    () => [
      {
        id: "paper",
        header: "Paper",
        accessorFn: (result) => result.source.title,
        cell: ({ row }) => (
          <div className="cly-literature-paper-cell">
            <strong>{row.original.source.title}</strong>
            <span>
              {row.original.source.authors || "Unknown authors"} ·{" "}
              {row.original.source.year}
            </span>
          </div>
        ),
      },
      {
        id: "provider",
        header: "Source",
        accessorFn: (result) => result.source.provider ?? "unknown",
      },
      {
        id: "score",
        header: "Score",
        accessorFn: (result) => result.score,
        cell: ({ row }) => `${Math.round(row.original.score * 100)}%`,
      },
      {
        id: "keywordRank",
        header: "Keyword",
        accessorFn: (result) => result.components.keywordRank ?? 0,
        cell: ({ row }) =>
          row.original.components.keywordRank
            ? `#${row.original.components.keywordRank}`
            : "—",
      },
      {
        id: "semanticRank",
        header: "Semantic",
        accessorFn: (result) => result.components.semanticRank ?? 0,
        cell: ({ row }) =>
          row.original.components.semanticRank
            ? `#${row.original.components.semanticRank}`
            : "—",
      },
      {
        id: "saved",
        header: "Project",
        accessorFn: (result) =>
          savedSearchResultIds.has(result.source.id) ? "Saved" : "Unsaved",
        cell: ({ row }) => (
          <Badge
            tone={
              savedSearchResultIds.has(row.original.source.id)
                ? "success"
                : "neutral"
            }
          >
            {savedSearchResultIds.has(row.original.source.id)
              ? "Saved"
              : "Unsaved"}
          </Badge>
        ),
      },
    ],
    [savedSearchResultIds],
  );
  const matrixSources = useMemo(
    () =>
      sources.filter(
        (source) =>
          (!matrixQuery ||
            `${source.title} ${source.authors} ${source.methods.join(" ")} ${source.findings.join(" ")}`
              .toLowerCase()
              .includes(matrixQuery.toLowerCase())) &&
          (matrixStatus === "All review states" ||
            source.status === matrixStatus),
      ),
    [matrixQuery, matrixStatus, sources],
  );
  const matrixColumns = useMemo<ColumnDef<Source, unknown>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Source",
        cell: ({ row }) => (
          <div className="cly-literature-paper-cell">
            <strong>{row.original.title}</strong>
            <span>
              {row.original.authors} · {row.original.year}
            </span>
          </div>
        ),
      },
      { accessorKey: "summary", header: "Research problem" },
      {
        id: "methods",
        header: "Method",
        accessorFn: (source) => source.methods.join(", ") || "Not extracted",
      },
      {
        id: "finding",
        header: "Principal result",
        accessorFn: (source) => source.findings[0] ?? "Extraction pending",
      },
      {
        id: "limitations",
        header: "Limitations",
        accessorFn: (source) =>
          source.limitations.join(", ") || "None recorded",
      },
      {
        id: "claims",
        header: "Claims",
        accessorFn: (source) =>
          source.linkedClaimIds
            .map((id) => claims.find((claim) => claim.id === id)?.text)
            .filter(Boolean)
            .join("; ") || "—",
      },
      {
        accessorKey: "confidence",
        header: "Confidence",
        cell: ({ row }) => `${row.original.confidence}%`,
      },
      {
        accessorKey: "status",
        header: "Review",
        cell: ({ row }) => (
          <Badge tone={toneForStatus(row.original.status)}>
            {row.original.status}
          </Badge>
        ),
      },
    ],
    [claims],
  );

  const runSearch = async () => {
    setSearching(true);
    setSearchError(null);
    try {
      if (!activeProject) {
        throw new Error("Select a research project before searching.");
      }
      if (activeProject.localOnly && !externalSearchApproved) {
        throw new Error(
          "Approve transmission to arXiv and Semantic Scholar before searching this local-only project.",
        );
      }
      if (activeProject.localOnly) {
        await apiClient.ensureProject({
          ...activeProject,
          externalTransmissionApprovals: ["arxiv", "semantic-scholar"],
        });
      }
      const results = await desktopLiteratureService.search(
        activeProject,
        query,
      );
      setSearchResults(results);
      setSelectedResultId(results[0]?.source.id ?? null);
    } catch (error) {
      setSearchError(
        error instanceof Error
          ? error.message
          : "Literature retrieval failed. No records were changed.",
      );
      setSearchResults([]);
      setSelectedResultId(null);
    } finally {
      setSearching(false);
    }
  };

  const saveResult = async (result: LiteratureSearchResult) => {
    try {
      const source = await projectServices.sources.createFromSearch(result);
      setSelected(source.id);
      notify(
        "Paper saved",
        "Source record and literature matrix row created with ranking provenance.",
      );
    } catch {
      // The store reports persistence failures without marking the result saved.
    }
  };

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
        <section className="cly-literature-workspace">
          <div className="cly-literature-modebar">
            <Segmented
              value={matrixMode}
              options={["Discover", "Saved matrix"]}
              onChange={setMatrixMode}
              label="Literature workspace mode"
            />
            <InlineMetadata>
              <span>{sources.length} saved sources</span>
              <span>
                {sources.filter((source) => source.provenance).length} ranked
                imports
              </span>
            </InlineMetadata>
          </div>

          {matrixMode === "Discover" ? (
            <>
              <form
                className="cly-filterbar cly-literature-searchbar"
                aria-label="Literature discovery search"
                onSubmit={(event) => {
                  event.preventDefault();
                  void runSearch();
                }}
              >
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  label="Search literature"
                  placeholder="Ask a research question or enter keywords…"
                />
                <Button
                  type="submit"
                  variant="primary"
                  disabled={searching || !query.trim()}
                >
                  <ScanSearch size={13} />
                  {searching ? "Searching…" : "Search papers"}
                </Button>
                <label className="cly-control-label">
                  <span className="cly-sr-only">Filter search results</span>
                  <select
                    className="cly-select"
                    value={resultFilter}
                    onChange={(event) =>
                      setResultFilter(
                        event.target.value as LiteratureResultFilter,
                      )
                    }
                  >
                    <option>All results</option>
                    <option>Unsaved</option>
                    <option>Saved</option>
                  </select>
                </label>
                <label className="cly-control-label">
                  <span className="cly-sr-only">Sort search results</span>
                  <select
                    className="cly-select"
                    value={resultSort}
                    onChange={(event) =>
                      setResultSort(event.target.value as LiteratureResultSort)
                    }
                  >
                    <option>Relevance</option>
                    <option>Newest</option>
                    <option>Title</option>
                  </select>
                </label>
              </form>

              <div className="cly-callout">
                <strong>External search destinations:</strong> arXiv and
                Semantic Scholar receive the query text. Local reranking stays
                on this device.
                {activeProject?.localOnly ? (
                  <label className="cly-control-label">
                    <input
                      type="checkbox"
                      checked={externalSearchApproved}
                      onChange={(event) =>
                        setExternalSearchApproved(event.target.checked)
                      }
                    />
                    Approve sending this project’s search queries to both
                    destinations
                  </label>
                ) : null}
              </div>

              {searchError ? (
                <div className="cly-callout" role="alert">
                  <strong>Search unavailable.</strong> {searchError}
                </div>
              ) : null}
              {searching ? (
                <LoadingState label="Searching literature providers" />
              ) : null}
              {!searching &&
              query.trim() &&
              !searchError &&
              searchResults.length === 0 ? (
                <EmptyState
                  title="No matching papers"
                  description="Broaden the question, remove a phrase, or try a method or author name."
                  icon={<ScanSearch size={20} />}
                />
              ) : null}
              {!searching && searchResults.length > 0 ? (
                <>
                  <div
                    className="cly-literature-result-summary"
                    aria-live="polite"
                  >
                    <div>
                      <strong>Ranked literature results</strong>
                      <span>
                        {filteredResults.length} shown of {searchResults.length}
                      </span>
                    </div>
                    <InlineMetadata>
                      <span>{savedSearchResultIds.size} saved</span>
                      <span>
                        {searchResults[0]?.method.includes("cross_encoder_tei")
                          ? "Local cross-encoder"
                          : "Deterministic fallback"}
                      </span>
                      <span>Reciprocal Rank Fusion</span>
                    </InlineMetadata>
                  </div>
                  <ClySplitPane
                    id="literature-discovery"
                    className="cly-literature-discovery-split"
                    primary={
                      <ClyDataTable
                        id="literature-discovery-results"
                        data={filteredResults}
                        columns={resultColumns}
                        selectedId={selectedResult?.source.id}
                        getRowId={(result) => result.source.id}
                        onSelect={(result) =>
                          setSelectedResultId(result.source.id)
                        }
                        emptyMessage="No results match this filter"
                      />
                    }
                    secondary={
                      selectedResult ? (
                        <article className="cly-literature-detail">
                          <PaneHeader
                            title="Paper detail"
                            detail={`${selectedResult.source.provider ?? "Source"} · ${selectedResult.source.year}`}
                            actions={
                              <Badge
                                tone={
                                  savedSearchResultIds.has(
                                    selectedResult.source.id,
                                  )
                                    ? "success"
                                    : "neutral"
                                }
                              >
                                {savedSearchResultIds.has(
                                  selectedResult.source.id,
                                )
                                  ? "Saved"
                                  : "Unsaved"}
                              </Badge>
                            }
                          />
                          <div className="cly-literature-detail-body">
                            <h2>{selectedResult.source.title}</h2>
                            <p className="cly-literature-authors">
                              {selectedResult.source.authors}
                            </p>
                            <div className="cly-literature-detail-actions">
                              <Button
                                variant="primary"
                                disabled={savedSearchResultIds.has(
                                  selectedResult.source.id,
                                )}
                                onClick={() => void saveResult(selectedResult)}
                              >
                                {savedSearchResultIds.has(
                                  selectedResult.source.id,
                                ) ? (
                                  <Check size={13} />
                                ) : (
                                  <Plus size={13} />
                                )}
                                {savedSearchResultIds.has(
                                  selectedResult.source.id,
                                )
                                  ? "Saved to project"
                                  : "Save to project"}
                              </Button>
                              <Button
                                onClick={() => {
                                  void navigator.clipboard.writeText(
                                    `${selectedResult.source.authors} (${selectedResult.source.year}). ${selectedResult.source.title}. ${selectedResult.source.url ?? ""}`,
                                  );
                                  notify(
                                    "Citation copied",
                                    "A compact citation was copied to the clipboard.",
                                  );
                                }}
                              >
                                <Copy size={13} /> Copy citation
                              </Button>
                              {selectedResult.source.url ? (
                                <Button
                                  variant="ghost"
                                  onClick={() =>
                                    window.open(
                                      selectedResult.source.url,
                                      "_blank",
                                      "noopener,noreferrer",
                                    )
                                  }
                                >
                                  <ExternalLink size={13} /> Open paper
                                </Button>
                              ) : null}
                            </div>
                            <section>
                              <h3>Abstract</h3>
                              <p>{selectedResult.source.summary}</p>
                            </section>
                            <section>
                              <h3>Why this paper ranked here</h3>
                              <p>{selectedResult.explanation}</p>
                              <dl className="cly-literature-ranking-grid">
                                <div>
                                  <dt>Combined score</dt>
                                  <dd>
                                    {Math.round(selectedResult.score * 100)}%
                                  </dd>
                                </div>
                                <div>
                                  <dt>Keyword rank</dt>
                                  <dd>
                                    {selectedResult.components.keywordRank
                                      ? `#${selectedResult.components.keywordRank}`
                                      : "—"}
                                  </dd>
                                </div>
                                <div>
                                  <dt>Semantic rank</dt>
                                  <dd>
                                    {selectedResult.components.semanticRank
                                      ? `#${selectedResult.components.semanticRank}`
                                      : "—"}
                                  </dd>
                                </div>
                              </dl>
                            </section>
                          </div>
                        </article>
                      ) : (
                        <EmptyState
                          title="Select a paper"
                          description="Choose a result to inspect its abstract and ranking evidence."
                        />
                      )
                    }
                    secondarySize={38}
                    secondaryMin="300px"
                    label="Resize literature results and paper detail"
                  />
                </>
              ) : null}
              {!query.trim() && !searching ? (
                <EmptyState
                  title="Search across open literature"
                  description="Start with a research question. Cly will rank matching papers and keep the ranking rationale attached when you save one."
                  icon={<ScanSearch size={20} />}
                />
              ) : null}
            </>
          ) : (
            <>
              <div className="cly-filterbar cly-literature-matrix-toolbar">
                <SearchInput
                  value={matrixQuery}
                  onChange={setMatrixQuery}
                  label="Filter saved literature"
                  placeholder="Filter titles, authors, methods, or findings…"
                />
                <label className="cly-control-label">
                  <span className="cly-sr-only">Filter by review state</span>
                  <select
                    className="cly-select"
                    value={matrixStatus}
                    onChange={(event) => setMatrixStatus(event.target.value)}
                  >
                    <option>All review states</option>
                    <option>Needs metadata</option>
                    <option>Queued</option>
                    <option>Reading</option>
                    <option>Reviewed</option>
                  </select>
                </label>
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
                  <Sparkles size={13} /> Synthesize themes
                </Button>
                <Button
                  onClick={() =>
                    notify(
                      "Column settings",
                      "Column visibility is remembered for this literature matrix.",
                    )
                  }
                >
                  <Columns3 size={13} /> Columns
                </Button>
              </div>
              <div className="cly-literature-result-summary">
                <div>
                  <strong>Saved evidence matrix</strong>
                  <span>{matrixSources.length} sources in this view</span>
                </div>
                <InlineMetadata>
                  <span>
                    {
                      sources.filter((source) => source.status === "Reviewed")
                        .length
                    }{" "}
                    reviewed
                  </span>
                  <span>
                    {
                      sources.filter((source) => source.linkedClaimIds.length)
                        .length
                    }{" "}
                    linked to claims
                  </span>
                  <span>
                    {sources.filter((source) => source.provenance).length} with
                    search provenance
                  </span>
                </InlineMetadata>
              </div>
              <ClyDataTable
                id="literature-saved-matrix"
                data={matrixSources}
                columns={matrixColumns}
                getRowId={(source) => source.id}
                onSelect={(source) => setSelected(source.id)}
                emptyMessage="No saved sources match these filters"
              />
            </>
          )}
        </section>
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
                disabled={!isClyDemoRuntime}
                title={capabilityUnavailableMessage("exports.notebook-bundle")}
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
                disabled={!isClyDemoRuntime}
                title={capabilityUnavailableMessage("exports.notebook-bundle")}
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
                disabled={!isClyDemoRuntime}
                title={capabilityUnavailableMessage("exports.notebook-bundle")}
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
            disabled={!answer.trim() || !isClyDemoRuntime}
            title={capabilityUnavailableMessage("exports.notebook-bundle")}
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
    const notebook = await projectServices.notebooks.importMock(name);
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
          <Button
            variant="primary"
            disabled={!isClyDemoRuntime}
            title={capabilityUnavailableMessage("notebooks.import")}
            onClick={() => setImportOpen(true)}
          >
            <Upload size={13} /> Import notebook
          </Button>
        }
      />
      {notebooks.length === 0 ? (
        <EmptyState
          title="No notebooks discovered"
          description={
            isClyDemoRuntime
              ? "Import a notebook to inspect its execution and outputs."
              : capabilityUnavailableMessage("notebooks.import")
          }
          action={
            <Button
              variant="primary"
              disabled={!isClyDemoRuntime}
              title={capabilityUnavailableMessage("notebooks.import")}
              onClick={() => setImportOpen(true)}
            >
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
                        disabled={!isClyDemoRuntime}
                        title={capabilityUnavailableMessage("notebooks.import")}
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
                        disabled={!isClyDemoRuntime}
                        title={capabilityUnavailableMessage("notebooks.import")}
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
                        disabled={!isClyDemoRuntime}
                        title={capabilityUnavailableMessage("notebooks.import")}
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
                        disabled={!isClyDemoRuntime}
                        title={capabilityUnavailableMessage("notebooks.import")}
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
        description={capabilityUnavailableMessage("notebooks.import")}
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
          description={capabilityUnavailableMessage("code.scan")}
          action={
            <Button disabled title={capabilityUnavailableMessage("code.scan")}>
              Scan project
            </Button>
          }
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
  const activeProjectId = useClyStore((s) => s.activeProjectId);
  const [view, setView] = useState<ClaimView>("Table");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [createOpen, setCreateOpen] = useState(false);
  const [capsuleOpen, setCapsuleOpen] = useState(false);
  const [text, setText] = useState("");
  const visible = filterAndSortClaims(claims, query, status, "confidence");
  const selected = claims.find((item) => item.id === selectedId) ?? claims[0];
  const claimColumns = useMemo<ColumnDef<Claim, unknown>[]>(
    () => [
      { accessorKey: "text", header: "Claim" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge tone={claimStatusTone(row.original.status)}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: "confidence",
        header: "Confidence",
        cell: ({ row }) => `${row.original.confidence}%`,
      },
      {
        id: "support",
        header: "Support",
        accessorFn: (claim) =>
          claim.supportingSourceIds.length + claim.experimentIds.length,
      },
      {
        id: "contradictions",
        header: "Contradictions",
        accessorFn: (claim) => claim.contradictingSourceIds.length,
      },
      {
        accessorKey: "nextExperiment",
        header: "Next required experiment",
      },
    ],
    [],
  );
  const create = async () => {
    if (!text.trim()) return;
    try {
      const claim = await projectServices.claims.create(text.trim());
      setCreateOpen(false);
      setText("");
      setSelected(claim.id);
      notify(
        "Unsupported claim created",
        "Link evidence or design a required experiment.",
      );
    } catch (error) {
      notify(
        "Claim was not saved",
        error instanceof Error ? error.message : "Unable to save the claim.",
      );
    }
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
              disabled={!selected || !isClyDemoRuntime}
              title={capabilityUnavailableMessage("agents.execute")}
              onClick={() =>
                notify(
                  "Adversarial review preview",
                  "The agent plan will search for missing controls, weak baselines, and alternative explanations.",
                )
              }
            >
              <Sparkles size={13} /> Adversarial review
            </Button>
            <Button disabled={!selected} onClick={() => setCapsuleOpen(true)}>
              <Download size={13} /> Reviewer capsule
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
            <ClyDataTable
              id="claims-audit"
              data={visible}
              columns={claimColumns}
              selectedId={selectedId}
              getRowId={(claim) => claim.id}
              onSelect={(claim) => setSelected(claim.id)}
              emptyMessage="No claims match this audit filter"
            />
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
      <ReviewerCapsuleDialog
        activeProjectId={activeProjectId}
        claims={claims}
        initialClaimId={selected?.id ?? null}
        notify={notify}
        onClose={() => setCapsuleOpen(false)}
        open={capsuleOpen}
      />
    </div>
  );
}

export function ReviewerCapsuleDialog({
  activeProjectId,
  claims,
  initialClaimId,
  notify,
  onClose,
  open,
}: {
  activeProjectId: string;
  claims: Array<{ id: string; text: string; status: ClaimStatus }>;
  initialClaimId: string | null;
  notify: (title: string, message: string) => void;
  onClose: () => void;
  open: boolean;
}) {
  const parseCsv = (value: string) => [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
  const [selectedClaimIds, setSelectedClaimIds] = useState<string[]>([]);
  const [capsule, setCapsule] = useState<ReviewerCapsule | null>(null);
  const [evaluation, setEvaluation] = useState<ObligationEvaluation | null>(
    null,
  );
  const [purpose, setPurpose] = useState("peer-review");
  const [collaborators, setCollaborators] = useState("");
  const [residency, setResidency] = useState("");
  const [license, setLicense] = useState("");
  const [approvalRationale, setApprovalRationale] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedClaimIds(initialClaimId ? [initialClaimId] : []);
    setCapsule(null);
    setEvaluation(null);
  }, [initialClaimId, open]);

  const toggleClaim = (id: string) => {
    setCapsule(null);
    setEvaluation(null);
    setSelectedClaimIds((current) =>
      current.includes(id)
        ? current.filter((claimId) => claimId !== id)
        : [...current, id],
    );
  };
  const operation = (): ObligationOperation => ({
    kind: "export",
    integration: "reviewer-capsule",
    objectIds: selectedClaimIds,
    purpose,
    collaborators: parseCsv(collaborators),
    provider: null,
    residency: residency.trim() || null,
    license: license.trim() || null,
    external: true,
  });
  const context = () => ({
    purpose,
    collaborators: parseCsv(collaborators),
    residency: residency.trim() || null,
    license: license.trim() || null,
  });
  const authorize = async () => {
    const result = await apiClient.evaluateObligations(
      activeProjectId,
      operation(),
    );
    setEvaluation(result);
    if (result.decision !== "allow") {
      notify(
        result.decision === "block"
          ? "Reviewer capsule blocked"
          : "Reviewer capsule needs approval",
        result.alerts[0]?.rationale ?? "Review the obligation findings.",
      );
      return false;
    }
    return true;
  };
  const buildPreview = async () => {
    if (selectedClaimIds.length === 0) return;
    setLoading(true);
    try {
      if (!(await authorize())) return;
      setCapsule(
        await apiClient.previewReviewerCapsule(
          activeProjectId,
          selectedClaimIds,
          context(),
        ),
      );
    } catch (error) {
      notify(
        "Reviewer capsule blocked",
        error instanceof Error
          ? error.message
          : "Unable to generate a safe capsule.",
      );
    } finally {
      setLoading(false);
    }
  };
  const exportCapsule = async () => {
    if (selectedClaimIds.length === 0) return;
    setLoading(true);
    try {
      if (!(await authorize())) return;
      const exported = await apiClient.exportReviewerCapsule(
        activeProjectId,
        selectedClaimIds,
        context(),
      );
      const filename = `cly-reviewer-capsule-${exported.sha256.slice(0, 12)}.html`;
      const desktopApi = getDesktopApi();
      if (desktopApi) {
        const saved = await desktopApi.saveTextFile({
          contents: exported.html,
          defaultPath: filename,
          title: "Save reviewer capsule",
        });
        if (!saved) return;
      } else {
        const blob = new Blob([exported.html], {
          type: "text/html;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
      }
      setCapsule(exported);
      notify(
        "Reviewer capsule exported",
        `Saved exact reviewed bytes (SHA-256 ${exported.sha256.slice(0, 12)}…).`,
      );
    } catch (error) {
      notify(
        "Reviewer capsule blocked",
        error instanceof Error
          ? error.message
          : "Unable to export a safe capsule.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Reviewer capsule"
      description="Build a read-only, offline HTML record from canonical project data. Private paths, credentials, chat, provider configuration, and unsafe output are removed or block export."
      wide
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button
            disabled={loading || selectedClaimIds.length === 0}
            onClick={() => void buildPreview()}
          >
            Preview capsule
          </Button>
          <Button
            variant="primary"
            disabled={loading || selectedClaimIds.length === 0}
            onClick={() => void exportCapsule()}
          >
            <Download size={13} /> Export HTML
          </Button>
        </>
      }
    >
      <div className="cly-stack">
        <div className="cly-inspector-label">Selected claims</div>
        {claims.map((claim) => (
          <label className="cly-list-row" key={claim.id}>
            <input
              type="checkbox"
              checked={selectedClaimIds.includes(claim.id)}
              onChange={() => toggleClaim(claim.id)}
            />
            <span className="cly-clamp-2">{claim.text}</span>
            <Badge tone={claimStatusTone(claim.status)}>{claim.status}</Badge>
          </label>
        ))}
        <div className="cly-grid-2">
          <div className="cly-field">
            <label htmlFor="capsule-purpose">Approved purpose</label>
            <input
              id="capsule-purpose"
              className="cly-input"
              value={purpose}
              onChange={(event) => {
                setPurpose(event.target.value);
                setEvaluation(null);
              }}
            />
          </div>
          <div className="cly-field">
            <label htmlFor="capsule-collaborators">Recipients</label>
            <input
              id="capsule-collaborators"
              className="cly-input"
              value={collaborators}
              onChange={(event) => {
                setCollaborators(event.target.value);
                setEvaluation(null);
              }}
              placeholder="Comma-separated collaborators"
            />
          </div>
          <div className="cly-field">
            <label htmlFor="capsule-residency">Processing residency</label>
            <input
              id="capsule-residency"
              className="cly-input"
              value={residency}
              onChange={(event) => {
                setResidency(event.target.value);
                setEvaluation(null);
              }}
              placeholder="For example, US"
            />
          </div>
          <div className="cly-field">
            <label htmlFor="capsule-license">Export license / terms</label>
            <input
              id="capsule-license"
              className="cly-input"
              value={license}
              onChange={(event) => {
                setLicense(event.target.value);
                setEvaluation(null);
              }}
            />
          </div>
        </div>
        {evaluation && evaluation.decision !== "allow" ? (
          <div
            className="cly-callout"
            data-tone={evaluation.decision === "block" ? "danger" : "warning"}
            role="status"
          >
            <strong>
              {evaluation.decision === "block"
                ? "Export blocked"
                : "Human approval required"}
            </strong>
            {evaluation.alerts.map((alert) => (
              <p className="cly-small" key={alert.id}>
                {alert.rationale} {alert.resolution}
              </p>
            ))}
            {evaluation.decision === "review" ? (
              <div className="cly-stack">
                <div className="cly-field">
                  <label htmlFor="capsule-approval-rationale">
                    Approval rationale
                  </label>
                  <textarea
                    id="capsule-approval-rationale"
                    className="cly-textarea"
                    value={approvalRationale}
                    onChange={(event) =>
                      setApprovalRationale(event.target.value)
                    }
                  />
                </div>
                <Button
                  disabled={!approvalRationale.trim()}
                  onClick={async () => {
                    const result = await apiClient.approveObligationOperation(
                      activeProjectId,
                      operation(),
                      {
                        actorId: "local-user",
                        rationale: approvalRationale,
                      },
                    );
                    setEvaluation(result.evaluation);
                    notify(
                      "Export approval recorded",
                      "Preview or export again to apply the exact-operation approval.",
                    );
                  }}
                >
                  Record approval
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        {capsule ? (
          <>
            <div className="cly-callout" data-tone="success">
              <strong>Safe static preview</strong>
              <div className="cly-mono cly-small">SHA-256 {capsule.sha256}</div>
            </div>
            <div className="cly-table-wrap">
              <table className="cly-table">
                <thead>
                  <tr>
                    <th>Disposition</th>
                    <th>Records</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Included</td>
                    <td>{capsule.manifest.included.length}</td>
                    <td>
                      Current, verification, and reproducibility shown in
                      capsule
                    </td>
                  </tr>
                  <tr>
                    <td>Omitted</td>
                    <td>{capsule.manifest.omitted.length}</td>
                    <td>Explicit reason recorded in capsule manifest</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="cly-muted cly-small">
            Preview first to inspect included and omitted records before export.
          </div>
        )}
      </div>
    </Dialog>
  );
}

function ClaimDetail({
  claim,
}: {
  claim: ReturnType<typeof useClyStore.getState>["data"]["claims"][number];
}) {
  const data = useClyStore((s) => s.data);
  const notify = useClyStore((s) => s.notify);
  const claimCost = useClyStore((s) => s.claimCosts[claim.id]);
  const restrictions = useClyStore(
    (s) => s.inheritedRestrictions[claim.id] ?? noInheritedRestrictions,
  );
  const setScreen = useClyStore((s) => s.setScreen);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [relationship, setRelationship] = useState<"supports" | "contradicts">(
    "supports",
  );
  const [sourceId, setSourceId] = useState(data.sources[0]?.id ?? "");
  const [savingEvidence, setSavingEvidence] = useState(false);
  const evidenceTriggerRef = useRef<HTMLButtonElement | null>(null);
  const closeEvidence = () => {
    setEvidenceOpen(false);
    requestAnimationFrame(() => evidenceTriggerRef.current?.focus());
  };
  const openEvidence = (
    type: "supports" | "contradicts",
    trigger: HTMLButtonElement,
  ) => {
    evidenceTriggerRef.current = trigger;
    setRelationship(type);
    const linked =
      type === "supports"
        ? claim.supportingSourceIds
        : claim.contradictingSourceIds;
    setSourceId(
      data.sources.find((source) => !linked.includes(source.id))?.id ??
        data.sources[0]?.id ??
        "",
    );
    setEvidenceOpen(true);
  };
  const linkEvidence = async () => {
    if (!sourceId) return;
    setSavingEvidence(true);
    try {
      await projectServices.claims.linkEvidence(
        claim.id,
        sourceId,
        relationship,
      );
      const source = data.sources.find((item) => item.id === sourceId);
      closeEvidence();
      notify(
        relationship === "supports"
          ? "Supporting evidence linked"
          : "Contradiction recorded",
        source?.title ?? sourceId,
      );
    } catch (error) {
      notify(
        "Evidence relationship was not saved",
        error instanceof Error ? error.message : "Unable to link the source.",
      );
    } finally {
      setSavingEvidence(false);
    }
  };
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
              onChange={(event) => {
                const status = event.target.value as ClaimStatus;
                void projectServices.claims
                  .setStatus(claim.id, status)
                  .catch((error) =>
                    notify(
                      "Claim status was not saved",
                      error instanceof Error
                        ? error.message
                        : "Unable to update the claim.",
                    ),
                  );
              }}
              aria-label="Change claim status"
            >
              {claimStatuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </div>
          <div className="cly-panel-body">
            <InheritedRestrictions
              restrictions={restrictions}
              onOpen={() => setScreen("obligations")}
            />
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
              <Metric
                label="Supporting cost"
                value={formatMoneyTotals(claimCost?.totals ?? [])}
                detail={`${claimCost?.runIds.length ?? 0} deduplicated ${claimCost?.runIds.length === 1 ? "run" : "runs"}`}
              />
            </div>
            <Section
              title="Cost to claim"
              subtitle="Supporting runs are counted once across shared artifacts and evidence."
              actions={
                <Button variant="ghost" onClick={() => setScreen("costs")}>
                  Open cost ledger
                </Button>
              }
            >
              {claimCost?.conversionState === "unsupported-mixed-currency" ? (
                <div className="cly-cost-currency-warning" role="status">
                  Different currencies remain separate; conversion is not
                  supported.
                </div>
              ) : null}
              {claimCost?.entries.length ? (
                <div className="cly-claim-cost-layout">
                  <table className="cly-claim-cost-table">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th>Supporting cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {claimCost.categorizedTotals.map((category) => (
                        <tr key={category.category}>
                          <td>{costCategoryLabels[category.category]}</td>
                          <td>{formatMoneyTotals(category.totals)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th>Total</th>
                        <th>{formatMoneyTotals(claimCost.totals)}</th>
                      </tr>
                    </tfoot>
                  </table>
                  <div className="cly-claim-cost-entries">
                    {claimCost.entries.map((entry) => (
                      <DisclosureRow
                        key={entry.id}
                        title={entry.runTitle}
                        detail={`${costCategoryLabels[entry.category]} · ${entry.source === "aws-cur" ? "AWS CUR" : "Manual"}`}
                        metadata={formatMoney(entry)}
                        tone={entry.waste.length ? "warning" : undefined}
                      >
                        {entry.waste.length ? (
                          <p className="cly-claim-cost-waste">
                            {entry.waste
                              .map((flag) => costWasteLabels[flag])
                              .join(" · ")}
                          </p>
                        ) : null}
                        <dl className="cly-detail-grid">
                          <dt>Run</dt>
                          <dd className="cly-mono">{entry.runId}</dd>
                          <dt>Usage</dt>
                          <dd>
                            {new Date(entry.startedAt).toLocaleString()} –{" "}
                            {new Date(entry.endedAt).toLocaleString()}
                          </dd>
                          <dt>Confidence</dt>
                          <dd>{entry.confidenceBps / 100}%</dd>
                        </dl>
                        <pre className="cly-cost-raw">
                          {JSON.stringify(entry.raw, null, 2)}
                        </pre>
                      </DisclosureRow>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="cly-muted">No supporting run costs attributed.</p>
              )}
            </Section>
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
            disabled={!isClyDemoRuntime}
            title={capabilityUnavailableMessage("claims.secondary-actions")}
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
              disabled={!isClyDemoRuntime && data.experiments.length === 0}
              title={
                !isClyDemoRuntime && data.experiments.length === 0
                  ? "Create an experiment before linking evidence."
                  : undefined
              }
              onClick={(event) => {
                if (isClyDemoRuntime) {
                  openEvidence("supports", event.currentTarget);
                  return;
                }
                void projectServices.claims
                  .linkExperiment(claim.id, data.experiments[0].id)
                  .then(() =>
                    notify(
                      "Experiment linked",
                      "The experiment now appears in this claim's evidence chain.",
                    ),
                  );
              }}
            >
              <Link2 size={13} /> Link evidence
            </Button>
            <Button
              onClick={(event) =>
                openEvidence("contradicts", event.currentTarget)
              }
            >
              <X size={13} /> Add contradiction
            </Button>
            <Button
              disabled={!isClyDemoRuntime}
              title={capabilityUnavailableMessage("claims.secondary-actions")}
              onClick={() =>
                notify(
                  "Claim report exported",
                  "The fixture report includes all evidence, caveats, and provenance links.",
                )
              }
            >
              <Download size={13} /> Export claim report
            </Button>
            <Button onClick={() => setScreen("graph")}>
              <ArrowRight size={13} /> Trace in graph
            </Button>
          </div>
        </Panel>
      </aside>
      <Dialog
        open={evidenceOpen}
        onClose={closeEvidence}
        title={
          relationship === "supports"
            ? "Link supporting evidence"
            : "Record contradictory evidence"
        }
        description="The relationship is stored in the research graph and included in claim audits."
        footer={
          <>
            <Button onClick={closeEvidence}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!sourceId || savingEvidence}
              onClick={() => void linkEvidence()}
            >
              {savingEvidence ? "Linking…" : "Link source"}
            </Button>
          </>
        }
      >
        <div className="cly-field">
          <label htmlFor={`claim-evidence-${claim.id}`}>Source</label>
          <select
            id={`claim-evidence-${claim.id}`}
            className="cly-select"
            value={sourceId}
            onChange={(event) => setSourceId(event.target.value)}
          >
            {data.sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.title}
              </option>
            ))}
          </select>
        </div>
        <div className="cly-field">
          <label htmlFor={`claim-relation-${claim.id}`}>Relationship</label>
          <select
            id={`claim-relation-${claim.id}`}
            className="cly-select"
            value={relationship}
            onChange={(event) =>
              setRelationship(event.target.value as "supports" | "contradicts")
            }
          >
            <option value="supports">Supports claim</option>
            <option value="contradicts">Contradicts claim</option>
          </select>
        </div>
      </Dialog>
    </div>
  );
}

function BeakerIcon() {
  return <ScanSearch size={13} />;
}

import type { ColumnDef } from "@tanstack/react-table";
