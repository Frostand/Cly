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
import { readSelectedSourceFiles } from "../domain/local-source-import";
import { filterAndSortClaims } from "../domain/logic";
import type {
  InheritedRestriction,
  ObligationEvaluation,
  ObligationOperation,
} from "../domain/obligations";
import type {
  Claim,
  ClaimStatus,
  ClyRepositoryData,
  ExperimentType,
  ResearchProject,
  Source,
} from "../domain/types";
import {
  apiClient,
  type LiteratureReadingList,
  type ProvenanceEvent,
  type ReviewerCapsule,
} from "../services/api-client";
import { capabilityUnavailableMessage } from "../services/capabilities";
import { desktopLiteratureService } from "../services/literature-service";
import { projectServices } from "../services/project-services";
import {
  isClyExplicitTestFixtureRuntime,
  isClyTestFixtureRuntime,
} from "../services/runtime";
import { claimStatusTone, useClyStore } from "../store/cly-store";

const noInheritedRestrictions: InheritedRestriction[] = [];

export function SourcesScreen() {
  const activeProject = useClyStore((s) =>
    s.data.projects.find((project) => project.id === s.activeProjectId),
  );
  const sources = useClyStore((s) => s.data.sources);
  const claims = useClyStore((s) => s.data.claims);
  const selectedId = useClyStore((s) => s.selectedId);
  const setSelected = useClyStore((s) => s.setSelected);
  const notify = useClyStore((s) => s.notify);
  const loadFromApi = useClyStore((s) => s.loadFromApi);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("All");
  const [sort, setSort] = useState<"Relevance" | "Newest" | "Title">(
    "Relevance",
  );
  const [importOpen, setImportOpen] = useState(false);
  const [importFormat, setImportFormat] = useState<"metadata" | "bibtex">(
    "metadata",
  );
  const [title, setTitle] = useState("");
  const [authors, setAuthors] = useState("");
  const [year, setYear] = useState("");
  const [doi, setDoi] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceAbstract, setSourceAbstract] = useState("");
  const [bibtex, setBibtex] = useState("");
  const [importType, setImportType] = useState<Source["type"]>("Paper");
  const [readingLists, setReadingLists] = useState<LiteratureReadingList[]>([]);
  const [readingListId, setReadingListId] = useState("");
  const [newReadingListName, setNewReadingListName] = useState("");
  const [importing, setImporting] = useState(false);
  const [folderImporting, setFolderImporting] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const selectedSource = sources.find((source) => source.id === selectedId);
  const relevanceRank = { Core: 0, High: 1, Medium: 2, Low: 3 };
  const filtered = sources
    .filter(
      (source) =>
        (type === "Archived" ? source.archived : !source.archived) &&
        (!query ||
          `${source.title} ${source.authors} ${source.tags.join(" ")}`
            .toLowerCase()
            .includes(query.toLowerCase())) &&
        (type === "All" || type === "Archived" || source.type === type),
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
      {
        id: "grounding",
        header: "Grounding",
        accessorFn: (row) => row.groundedSummary?.claims.length ?? 0,
        cell: ({ row }) =>
          row.original.groundedSummary
            ? `${row.original.groundedSummary.claims.length} cited sentence${row.original.groundedSummary.claims.length === 1 ? "" : "s"}`
            : "—",
      },
    ],
    [],
  );

  const openImport = (format: "metadata" | "bibtex" = "metadata") => {
    setImportFormat(format);
    setImportType("Paper");
    setImportOpen(true);
    if (activeProject && !isClyExplicitTestFixtureRuntime) {
      void apiClient
        .fetchReadingLists(activeProject.id)
        .then(setReadingLists)
        .catch(() => setReadingLists([]));
    }
  };

  const resetImport = () => {
    setTitle("");
    setAuthors("");
    setYear("");
    setDoi("");
    setSourceUrl("");
    setSourceAbstract("");
    setBibtex("");
    setImportType("Paper");
    setReadingListId("");
    setNewReadingListName("");
  };

  const importSource = async () => {
    setImporting(true);
    try {
      if (importType === "Paper") {
        if (!activeProject) throw new Error("Select a research project first.");
        let selectedReadingListId = readingListId;
        if (readingListId === "new") {
          const readingList = await apiClient.createReadingList(
            activeProject.id,
            newReadingListName,
          );
          selectedReadingListId = readingList.id;
        }
        const readingListIds = selectedReadingListId
          ? [selectedReadingListId]
          : [];
        const result = await apiClient.importLiteratureMetadata(
          activeProject.id,
          importFormat === "bibtex"
            ? { format: "bibtex", content: bibtex, readingListIds }
            : {
                format: "metadata",
                records: [
                  {
                    title,
                    authors,
                    year: year || undefined,
                    doi: doi || undefined,
                    url: sourceUrl || undefined,
                    abstract: sourceAbstract || undefined,
                  },
                ],
                readingListIds,
              },
        );
        await loadFromApi(activeProject.id);
        const source = result.results[0]?.source;
        if (source) setSelected(source.id);
        setImportOpen(false);
        resetImport();
        notify(
          result.duplicateCount ? "Duplicate source found" : "Paper imported",
          result.duplicateCount
            ? `Matched the existing source by ${result.results[0]?.matchedBy ?? "normalized metadata"}; no duplicate record was created.`
            : `${result.importedCount} normalized source record${result.importedCount === 1 ? "" : "s"} saved with grounded abstract evidence.`,
        );
        return;
      }
      const source = await projectServices.sources.create({
        title: title.trim() || "Imported source",
        type: importType,
      });
      setImportOpen(false);
      resetImport();
      setSelected(source.id);
      notify(
        "Source imported",
        "The source record was saved and is ready for metadata review.",
      );
    } catch (error) {
      notify(
        "Source was not saved",
        error instanceof Error ? error.message : "Unable to import source.",
      );
    } finally {
      setImporting(false);
    }
  };

  const importSourceFolder = async (files: FileList | null) => {
    if (!files?.length) return;
    if (!activeProject) {
      notify("Folder was not imported", "Select a research project first.");
      return;
    }
    setFolderImporting(true);
    try {
      const batch = await readSelectedSourceFiles(files);
      let importedCount = 0;
      let duplicateCount = 0;
      const failures = [...batch.failures];
      for (const entry of batch.entries) {
        try {
          const result = await apiClient.importLiteratureMetadata(
            activeProject.id,
            entry.format === "bibtex"
              ? { format: "bibtex", content: entry.content }
              : { format: "metadata", records: entry.records },
          );
          importedCount += result.importedCount;
          duplicateCount += result.duplicateCount;
        } catch (error) {
          failures.push({
            fileName: entry.fileName,
            reason:
              error instanceof Error ? error.message : "Import request failed.",
          });
        }
      }
      if (importedCount || duplicateCount) await loadFromApi(activeProject.id);
      if (!importedCount && !duplicateCount) {
        notify(
          "Folder was not imported",
          failures.length
            ? failures
                .slice(0, 3)
                .map((failure) => `${failure.fileName}: ${failure.reason}`)
                .join(" ")
            : "No supported source records were found.",
        );
      } else {
        notify(
          "Folder import complete",
          `${importedCount} source${importedCount === 1 ? "" : "s"} imported, ${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"} matched${failures.length ? `, ${failures.length} file${failures.length === 1 ? "" : "s"} skipped` : ""}.`,
        );
      }
    } catch (error) {
      notify(
        "Folder was not imported",
        error instanceof Error
          ? error.message
          : "Unable to read selected files.",
      );
    } finally {
      setFolderImporting(false);
      if (folderInputRef.current) folderInputRef.current.value = "";
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
            <input
              ref={folderInputRef}
              type="file"
              accept=".bib,.json,application/x-bibtex,application/json"
              multiple
              style={{ display: "none" }}
              {...({ webkitdirectory: "" } as Record<string, string>)}
              onChange={(event) =>
                void importSourceFolder(event.currentTarget.files)
              }
            />
            <Button
              disabled={folderImporting}
              onClick={() => folderInputRef.current?.click()}
            >
              <FolderInput size={13} />
              {folderImporting ? "Importing…" : "Import folder"}
            </Button>
            <Button variant="primary" onClick={() => openImport()}>
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
          label="Archived"
          value={sources.filter((item) => item.archived).length}
          detail="Preserved in project history"
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
            <option>Archived</option>
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
          <Button onClick={() => openImport("bibtex")}>
            <FileInput size={13} /> BibTeX
          </Button>
          <Button onClick={() => openImport("metadata")}>
            <Link2 size={13} /> Add URL
          </Button>
        </div>
        {sources.length === 0 ? (
          <EmptyState
            title="No sources in this project"
            description="Import a paper, note, dataset, or URL."
            action={
              <Button variant="primary" onClick={() => openImport()}>
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
            disabled={!selectedId}
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
            variant="danger"
            onClick={() => {
              if (!selectedId || !selectedSource) return;
              const archived = !selectedSource.archived;
              void projectServices.sources
                .setArchived(selectedId, archived)
                .then(() =>
                  notify(
                    archived ? "Source archived" : "Source restored",
                    archived
                      ? "The source remains available in project history and the Archived filter."
                      : "The source is active again.",
                  ),
                )
                .catch((error) =>
                  notify(
                    "Archive update failed",
                    error instanceof Error
                      ? error.message
                      : "Unable to update the source.",
                  ),
                );
            }}
          >
            <Archive size={13} />{" "}
            {selectedSource?.archived ? "Restore" : "Archive"}
          </Button>
        </div>
      </DisclosureRow>
      <Dialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import source"
        description="Normalize paper metadata, detect duplicates, and preserve grounded abstract evidence."
        footer={
          <>
            <Button onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={
                importing ||
                (importType === "Paper" &&
                  (importFormat === "bibtex"
                    ? !bibtex.trim()
                    : !title.trim())) ||
                (importType === "Paper" &&
                  readingListId === "new" &&
                  !newReadingListName.trim())
              }
              onClick={() => void importSource()}
            >
              {importing ? "Importing…" : "Import and scan"}
            </Button>
          </>
        }
      >
        <div className="cly-field">
          <label htmlFor="source-type">Source type</label>
          <select
            id="source-type"
            className="cly-select"
            value={importType}
            onChange={(event) => {
              const nextType = event.target.value as Source["type"];
              setImportType(nextType);
              if (nextType !== "Paper") setReadingListId("");
            }}
          >
            <option>Paper</option>
            <option>Dataset</option>
            <option>Documentation</option>
            <option>Lab note</option>
            <option>Webpage</option>
          </select>
        </div>
        {importType !== "Paper" || importFormat === "metadata" ? (
          <div className="cly-field" style={{ marginTop: 12 }}>
            <label htmlFor="source-title">Source title</label>
            <input
              className="cly-input"
              id="source-title"
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Paper, dataset, documentation, or note"
            />
          </div>
        ) : null}
        {importType === "Paper" ? (
          <>
            <div className="cly-field" style={{ marginTop: 12 }}>
              <label htmlFor="source-import-format">Metadata format</label>
              <select
                id="source-import-format"
                className="cly-select"
                value={importFormat}
                onChange={(event) =>
                  setImportFormat(event.target.value as "metadata" | "bibtex")
                }
              >
                <option value="metadata">Paper metadata</option>
                <option value="bibtex">BibTeX</option>
              </select>
            </div>
            {importFormat === "bibtex" ? (
              <div className="cly-field" style={{ marginTop: 12 }}>
                <label htmlFor="source-bibtex">BibTeX records</label>
                <textarea
                  className="cly-textarea"
                  id="source-bibtex"
                  rows={9}
                  value={bibtex}
                  onChange={(event) => setBibtex(event.target.value)}
                  placeholder="@article{key, title = {…}, author = {…}, year = {2026}}"
                />
              </div>
            ) : (
              <>
                <div className="cly-field" style={{ marginTop: 12 }}>
                  <label htmlFor="source-authors">Authors</label>
                  <input
                    className="cly-input"
                    id="source-authors"
                    value={authors}
                    onChange={(event) => setAuthors(event.target.value)}
                    placeholder="Author One; Author Two"
                  />
                </div>
                <div className="cly-row" style={{ marginTop: 12 }}>
                  <div className="cly-field" style={{ flex: 1 }}>
                    <label htmlFor="source-year">Year</label>
                    <input
                      className="cly-input"
                      id="source-year"
                      inputMode="numeric"
                      value={year}
                      onChange={(event) => setYear(event.target.value)}
                      placeholder="2026"
                    />
                  </div>
                  <div className="cly-field" style={{ flex: 2 }}>
                    <label htmlFor="source-doi">DOI</label>
                    <input
                      className="cly-input"
                      id="source-doi"
                      value={doi}
                      onChange={(event) => setDoi(event.target.value)}
                      placeholder="10.1234/example"
                    />
                  </div>
                </div>
                <div className="cly-field" style={{ marginTop: 12 }}>
                  <label htmlFor="source-url">Canonical URL</label>
                  <input
                    className="cly-input"
                    id="source-url"
                    type="url"
                    value={sourceUrl}
                    onChange={(event) => setSourceUrl(event.target.value)}
                    placeholder="https://doi.org/…"
                  />
                </div>
                <div className="cly-field" style={{ marginTop: 12 }}>
                  <label htmlFor="source-abstract">Abstract</label>
                  <textarea
                    className="cly-textarea"
                    id="source-abstract"
                    rows={3}
                    value={sourceAbstract}
                    onChange={(event) => setSourceAbstract(event.target.value)}
                    placeholder="Used to create an extractive summary with sentence-level evidence."
                  />
                </div>
              </>
            )}
            <div className="cly-field" style={{ marginTop: 12 }}>
              <label htmlFor="source-reading-list">Reading list</label>
              <select
                id="source-reading-list"
                className="cly-select"
                value={readingListId}
                onChange={(event) => setReadingListId(event.target.value)}
              >
                <option value="">No reading list</option>
                {readingLists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name} ({list.sourceCount})
                  </option>
                ))}
                <option value="new">Create a new reading list…</option>
              </select>
            </div>
            {readingListId === "new" ? (
              <div className="cly-field" style={{ marginTop: 12 }}>
                <label htmlFor="source-new-reading-list">New list name</label>
                <input
                  className="cly-input"
                  id="source-new-reading-list"
                  value={newReadingListName}
                  onChange={(event) =>
                    setNewReadingListName(event.target.value)
                  }
                  placeholder="Methods to review"
                />
              </div>
            ) : null}
            <div className="cly-callout" style={{ marginTop: 12 }}>
              Exact identifier matches reuse the existing source. Abstract
              summaries retain sentence-level evidence.
            </div>
          </>
        ) : (
          <>
            <div className="cly-field" style={{ marginTop: 12 }}>
              <label htmlFor="source-location">
                {importType === "Dataset" ? "Dataset location" : "Source URL"}
              </label>
              <input
                className="cly-input"
                id="source-location"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder={
                  importType === "Dataset"
                    ? "Local path, DOI, or official download URL"
                    : "https://…"
                }
              />
            </div>
            <div className="cly-field" style={{ marginTop: 12 }}>
              <label htmlFor="source-notes">Role in this project</label>
              <textarea
                className="cly-textarea"
                id="source-notes"
                rows={3}
                value={sourceAbstract}
                onChange={(event) => setSourceAbstract(event.target.value)}
                placeholder="What does this source contribute to the research question?"
              />
            </div>
            <div className="cly-callout" style={{ marginTop: 12 }}>
              Cly saves the location and research role now. Content extraction
              remains unavailable in the open beta.
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}

type LiteratureView =
  | "Matrix"
  | "Themes"
  | "Chronological"
  | "Claims"
  | "Methods";
type LiteratureMatrixMode = "Discover" | "Saved matrix";
type LiteratureResultFilter = "All results" | "Unsaved" | "Saved";
type LiteratureResultSort = "Relevance" | "Newest" | "Title";
const literatureViews = [
  "Matrix",
  "Themes",
  "Chronological",
  "Claims",
  "Methods",
] as const;

export function LiteratureScreen() {
  const activeProject = useClyStore((s) =>
    s.data.projects.find((project) => project.id === s.activeProjectId),
  );
  const sources = useClyStore((s) => s.data.sources);
  const claims = useClyStore((s) => s.data.claims);
  const setSelected = useClyStore((s) => s.setSelected);
  const notify = useClyStore((s) => s.notify);
  const fixtureMode = useClyStore((s) => s.fixtureMode);
  const showTestFixtureLiterature =
    isClyTestFixtureRuntime && fixtureMode !== "empty";
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
  const themes = useMemo(() => {
    if (showTestFixtureLiterature) {
      return [
        "Calibration & uncertainty",
        "Distribution shift",
        "Cost-normalized baselines",
        "Reproducibility",
      ].map((title, index) => ({
        title,
        count: index + 2,
        summary:
          index === 2
            ? "A clear literature gap remains: few comparisons include tuning cost and coverage simultaneously."
            : "Sources converge on the need for regime-specific evaluation and explicit failure reporting.",
      }));
    }
    return previewLiteratureThemes(sources).map(({ label, sourceCount }) => ({
      title: label,
      count: sourceCount,
      summary: `${sourceCount} saved source${sourceCount === 1 ? "" : "s"} use this tag or method.`,
    }));
  }, [showTestFixtureLiterature, sources]);
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
      const searchProject: ResearchProject = activeProject.localOnly
        ? {
            ...activeProject,
            externalTransmissionApprovals: ["arxiv", "semantic-scholar"],
          }
        : activeProject;
      if (searchProject.localOnly) {
        await apiClient.ensureProject(searchProject);
      }
      const results = await desktopLiteratureService.search(
        searchProject,
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
                  headingLevel="h2"
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
        themes.length ? (
          <div className="cly-grid-3">
            {themes.map((theme) => (
              <Panel key={theme.title}>
                <div className="cly-panel-header">
                  <strong>{theme.title}</strong>
                  <Badge>{theme.count} sources</Badge>
                </div>
                <div className="cly-panel-body">
                  <p className="cly-muted cly-small">{theme.summary}</p>
                  <Button onClick={() => notify("Theme focused", theme.title)}>
                    Focus cluster <ArrowRight size={13} />
                  </Button>
                </div>
              </Panel>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No literature themes yet"
            description="Add tagged sources or recorded methods to build themes from project evidence."
          />
        )
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
    </div>
  );
}

// Retained temporarily for migration compatibility; no production route exposes it.
// biome-ignore lint/correctness/noUnusedVariables: legacy read-only fixture component
function NotebookLmWorkspace({
  sources,
  answer,
  setAnswer,
  importedAnswers,
  setImportedAnswers,
  showTestFixtureContent,
}: {
  sources: Source[];
  answer: string;
  setAnswer: (value: string) => void;
  importedAnswers: string[];
  setImportedAnswers: (value: string[]) => void;
  showTestFixtureContent: boolean;
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
                <strong>
                  {showTestFixtureContent
                    ? "Surrogate reliability · NotebookLM companion"
                    : "NotebookLM companion"}
                </strong>
              </div>
              <div className="cly-muted cly-small">
                Manual companion workflow · no login, scraping, or website
                automation
              </div>
            </div>
            <Badge tone={bundle.length ? "info" : "neutral"}>
              {showTestFixtureContent
                ? "Bundle ready"
                : `${bundle.length} selected`}
            </Badge>
          </div>
          <div className="cly-panel-body">
            <div className="cly-metric-row">
              <Metric label="Bundle sources" value={bundle.length} />
              <Metric
                label="Manifest"
                value={showTestFixtureContent ? "Ready" : "Not generated"}
              />
              <Metric
                label="Last export"
                value={showTestFixtureContent ? "Yesterday" : "Never"}
              />
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
                disabled={!isClyTestFixtureRuntime}
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
                disabled={!isClyTestFixtureRuntime}
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
                disabled={!isClyTestFixtureRuntime}
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
            disabled={!answer.trim() || !isClyTestFixtureRuntime}
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
  const [query, setQuery] = useState("");
  const selected =
    notebooks.find((item) => item.id === selectedId) ?? notebooks[0];
  const visible = notebooks.filter(
    (item) =>
      !query ||
      `${item.name} ${item.title} ${item.path}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="cly-page cly-page-wide cly-route-notebooks">
      <PageHeader
        kicker="Research"
        title="Notebook Scanner"
        description="Review previously indexed notebook execution and reproducibility findings."
      />
      {notebooks.length === 0 ? (
        <EmptyState
          title="No notebooks indexed"
          description="This project does not have any persisted notebook scan results."
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
                </div>
              </Panel>
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}

export function CodeLinkerScreen() {
  const code = useClyStore((s) => s.data.code);
  const selectedId = useClyStore((s) => s.selectedId);
  const setSelected = useClyStore((s) => s.setSelected);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"Files" | "Risks" | "Unlinked">("Files");
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
            options={["Files", "Risks", "Unlinked"] as const}
            onChange={setView}
            label="Code linker view"
          />
        }
      />
      {code.length === 0 ? (
        <EmptyState
          title="No code artifacts indexed"
          description="This project does not have any persisted code scan results."
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

export function buildDeterministicClaimReport(
  projectId: string,
  claim: Claim,
  data: ClyRepositoryData,
  provenance: ProvenanceEvent[],
) {
  const supportingIds = new Set(claim.supportingSourceIds);
  const contradictingIds = new Set(claim.contradictingSourceIds);
  const experimentIds = new Set(claim.experimentIds);
  const artifactIds = new Set(claim.artifactIds);
  const relatedIds = new Set([
    claim.id,
    ...supportingIds,
    ...contradictingIds,
    ...experimentIds,
    ...artifactIds,
  ]);
  const byId = <T extends { id: string }>(items: T[], ids: Set<string>) =>
    items
      .filter((item) => ids.has(item.id))
      .sort((a, b) => a.id.localeCompare(b.id));
  return {
    schemaVersion: 1,
    projectId,
    claim,
    evidence: {
      supportingSources: byId(data.sources, supportingIds),
      contradictingSources: byId(data.sources, contradictingIds),
    },
    experiments: byId(data.experiments, experimentIds),
    artifacts: byId(data.artifacts, artifactIds),
    relationships: data.graphEdges
      .filter(
        (edge) => relatedIds.has(edge.source) && relatedIds.has(edge.target),
      )
      .sort((a, b) => a.id.localeCompare(b.id)),
    provenance: provenance
      .filter((event) => event.objectId && relatedIds.has(event.objectId))
      .sort(
        (a, b) =>
          (a.sequence ?? Number.MAX_SAFE_INTEGER) -
            (b.sequence ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id),
      ),
  };
}

function ClaimDetail({
  claim,
}: {
  claim: ReturnType<typeof useClyStore.getState>["data"]["claims"][number];
}) {
  const data = useClyStore((s) => s.data);
  const notify = useClyStore((s) => s.notify);
  const activeProjectId = useClyStore((s) => s.activeProjectId);
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
  const [experimentOpen, setExperimentOpen] = useState(false);
  const [experimentName, setExperimentName] = useState("");
  const [experimentGoal, setExperimentGoal] = useState("");
  const [experimentHypothesis, setExperimentHypothesis] = useState("");
  const [experimentType, setExperimentType] = useState<ExperimentType>(
    "Statistical analysis",
  );
  const [savingExperiment, setSavingExperiment] = useState(false);
  const [exportingReport, setExportingReport] = useState(false);
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
  const openExperiment = () => {
    setExperimentName(`Test claim: ${claim.text.slice(0, 72)}`);
    setExperimentGoal(
      claim.nextExperiment || "Design a discriminating test for this claim.",
    );
    setExperimentHypothesis(claim.text);
    setExperimentType("Statistical analysis");
    setExperimentOpen(true);
  };
  const createLinkedExperiment = async () => {
    if (!experimentName.trim() || !experimentGoal.trim()) return;
    setSavingExperiment(true);
    try {
      const experiment = await projectServices.experiments.create({
        name: experimentName.trim(),
        goal: experimentGoal.trim(),
        hypothesis: experimentHypothesis.trim() || claim.text,
        type: experimentType,
      });
      try {
        await projectServices.claims.linkExperiment(claim.id, experiment.id);
      } catch (error) {
        throw new Error(
          `Experiment ${experiment.id} was saved, but its claim relationship failed: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
      setExperimentOpen(false);
      notify(
        "Planned experiment created",
        "The experiment and claim-testing relationship were persisted.",
      );
    } catch (error) {
      notify(
        "Experiment was not fully linked",
        error instanceof Error
          ? error.message
          : "Unable to create the planned experiment.",
      );
    } finally {
      setSavingExperiment(false);
    }
  };
  const exportClaimReport = async () => {
    const desktopApi = getDesktopApi();
    if (!desktopApi) {
      notify(
        "Desktop app required",
        "Open Cly in Electron to choose where to save the claim report.",
      );
      return;
    }
    setExportingReport(true);
    try {
      const provenance = await apiClient.fetchProvenance(activeProjectId, 500);
      const report = buildDeterministicClaimReport(
        activeProjectId,
        claim,
        data,
        provenance,
      );
      const safeId = claim.id.replace(/[^a-zA-Z0-9._-]+/g, "-");
      const saved = await desktopApi.saveTextFile({
        contents: `${JSON.stringify(report, null, 2)}\n`,
        defaultPath: `cly-claim-${safeId}.json`,
        title: "Export Cly claim report",
      });
      if (saved) {
        notify(
          "Claim report exported",
          "The saved JSON contains the claim, linked evidence, experiments, relationships, and provenance.",
        );
      }
    } catch (error) {
      notify(
        "Claim report was not exported",
        error instanceof Error ? error.message : "Unable to export the report.",
      );
    } finally {
      setExportingReport(false);
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
          <Button variant="primary" onClick={openExperiment}>
            <BeakerIcon /> Generate experiment
          </Button>
        </Panel>
        <Panel className="cly-panel-body">
          <div className="cly-inspector-label">Claim actions</div>
          <div className="cly-stack">
            <Button
              disabled={
                !isClyTestFixtureRuntime && data.experiments.length === 0
              }
              title={
                !isClyTestFixtureRuntime && data.experiments.length === 0
                  ? "Create an experiment before linking evidence."
                  : undefined
              }
              onClick={(event) => {
                if (isClyTestFixtureRuntime) {
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
              disabled={exportingReport}
              onClick={() => void exportClaimReport()}
            >
              <Download size={13} />
              {exportingReport ? "Exporting…" : "Export claim report"}
            </Button>
            <Button onClick={() => setScreen("graph")}>
              <ArrowRight size={13} /> Trace in graph
            </Button>
          </div>
        </Panel>
      </aside>
      <Dialog
        open={experimentOpen}
        onClose={() => setExperimentOpen(false)}
        title="Plan an experiment for this claim"
        description="Review the proposed test before Cly saves the experiment and its claim relationship."
        footer={
          <>
            <Button onClick={() => setExperimentOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={
                savingExperiment ||
                !experimentName.trim() ||
                !experimentGoal.trim()
              }
              onClick={() => void createLinkedExperiment()}
            >
              {savingExperiment ? "Saving…" : "Create and link experiment"}
            </Button>
          </>
        }
      >
        <div className="cly-field">
          <label htmlFor={`claim-experiment-name-${claim.id}`}>Name</label>
          <input
            id={`claim-experiment-name-${claim.id}`}
            className="cly-input"
            value={experimentName}
            onChange={(event) => setExperimentName(event.target.value)}
          />
        </div>
        <div className="cly-field">
          <label htmlFor={`claim-experiment-goal-${claim.id}`}>Goal</label>
          <textarea
            id={`claim-experiment-goal-${claim.id}`}
            className="cly-textarea"
            rows={3}
            value={experimentGoal}
            onChange={(event) => setExperimentGoal(event.target.value)}
          />
        </div>
        <div className="cly-field">
          <label htmlFor={`claim-experiment-hypothesis-${claim.id}`}>
            Hypothesis
          </label>
          <textarea
            id={`claim-experiment-hypothesis-${claim.id}`}
            className="cly-textarea"
            rows={3}
            value={experimentHypothesis}
            onChange={(event) => setExperimentHypothesis(event.target.value)}
          />
        </div>
        <div className="cly-field">
          <label htmlFor={`claim-experiment-type-${claim.id}`}>Type</label>
          <select
            id={`claim-experiment-type-${claim.id}`}
            className="cly-select"
            value={experimentType}
            onChange={(event) =>
              setExperimentType(event.target.value as ExperimentType)
            }
          >
            <option>Statistical analysis</option>
            <option>Benchmark</option>
            <option>Reproduction attempt</option>
            <option>Ablation</option>
            <option>Custom</option>
          </select>
        </div>
      </Dialog>
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
