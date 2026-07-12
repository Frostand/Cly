"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  API_BASE_URL,
  addPaperToFolder,
  createFolder,
  deleteFolder,
  fetchFolder,
  fetchFolders,
  createResearchRun,
  fetchProvidersWithHealth,
  fetchRunSnapshot,
  removePaperFromFolder,
  renameFolder,
  startResearchRun,
} from "./api";
import { FolderSidebar } from "./components/FolderSidebar";
import { PaperDetailPanel } from "./components/PaperDetailPanel";
import { SourceBadge, sourceLabel } from "./components/SourceBadge";
import type {
  Folder,
  FolderWithPapers,
  Landscape,
  PaperSource,
  PaperExtraction,
  ProviderHealth,
  ProviderInfo,
  RankedPaperSearchResponse,
  ResearchRun,
} from "./types";

const TOPIC_MAX_LENGTH = 500;
const PAPER_TABLE_PREFS_STORAGE_KEY =
  "research-field-mapper.paper-table-prefs.v1";

type WorkflowState =
  | "idle"
  | "creating"
  | "searching"
  | "ranking"
  | "semantic_ranking"
  | "pdf_downloading"
  | "extracting"
  | "synthesizing"
  | "complete"
  | "failed";

type PipelineStage = Extract<
  WorkflowState,
  | "searching"
  | "ranking"
  | "semantic_ranking"
  | "pdf_downloading"
  | "extracting"
  | "synthesizing"
>;

const PIPELINE_STAGES: { key: PipelineStage; label: string }[] = [
  { key: "searching", label: "Searching" },
  { key: "ranking", label: "Ranking" },
  { key: "semantic_ranking", label: "Semantic ranking" },
  { key: "pdf_downloading", label: "PDF parsing" },
  { key: "extracting", label: "Extracting" },
  { key: "synthesizing", label: "Synthesizing" },
];

const CLOUD_ACK_STORAGE_KEY = "research-field-mapper.cloud-provider-ack.v2";

const CLOUD_PRICING_USD_PER_1M: Record<
  string,
  { input: number; output: number; modelLabel: string }
> = {
  openai: { input: 0.15, output: 0.6, modelLabel: "gpt-4o-mini" },
  anthropic: {
    input: 0.8,
    output: 4,
    modelLabel: "claude-3-5-haiku-latest",
  },
};

const PAPER_SOURCE_OPTIONS: { value: PaperSource; label: string }[] = [
  { value: "arxiv", label: "arXiv" },
  { value: "semantic_scholar", label: "Semantic Scholar" },
  { value: "both", label: "Both" },
];

type SortKey = "rank" | "title" | "score" | "date";
type SortDir = "asc" | "desc";
type ToggleableColumn = "score" | "categories" | "links" | "explanation";

type PaperTablePreferences = {
  compactRows: boolean;
  visibleColumns: Record<ToggleableColumn, boolean>;
};

const DEFAULT_TABLE_PREFERENCES: PaperTablePreferences = {
  compactRows: false,
  visibleColumns: {
    score: true,
    categories: true,
    links: true,
    explanation: true,
  },
};

const PAPER_TABLE_COLUMNS: { key: ToggleableColumn; label: string }[] = [
  { key: "score", label: "Score" },
  { key: "categories", label: "Categories" },
  { key: "links", label: "Links" },
  { key: "explanation", label: "Explanation" },
];

export default function Home() {
  const [topic, setTopic] = useState("retrieval augmented generation");
  const [maxResults, setMaxResults] = useState(10);
  const [selectedPaperSource, setSelectedPaperSource] =
    useState<PaperSource>("arxiv");
  const [selectedProviderName, setSelectedProviderName] = useState("mock");
  const [workflowState, setWorkflowState] = useState<WorkflowState>("idle");
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [rankedResult, setRankedResult] =
    useState<RankedPaperSearchResponse | null>(null);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [tablePreferences, setTablePreferences] =
    useState<PaperTablePreferences>(DEFAULT_TABLE_PREFERENCES);
  const [tablePreferencesLoaded, setTablePreferencesLoaded] = useState(false);
  const [extractionsByPaperId, setExtractionsByPaperId] = useState<
    Record<string, PaperExtraction>
  >({});
  const [landscape, setLandscape] = useState<Landscape | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [providerHealth, setProviderHealth] = useState<
    Record<string, ProviderHealth>
  >({});
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderDetailsById, setFolderDetailsById] = useState<
    Record<string, FolderWithPapers>
  >({});
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [folderErrorMessage, setFolderErrorMessage] = useState<string | null>(
    null,
  );
  const [folderActionMessage, setFolderActionMessage] = useState<string | null>(
    null,
  );
  const [folderMutationKey, setFolderMutationKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedProvider =
    providers.find((provider) => provider.name === selectedProviderName) ??
    providers.find((provider) => provider.name === "mock") ??
    providers[0];
  const selectedProviderHealth = selectedProvider
    ? providerHealth[selectedProvider.name]
    : null;
  const cloudCostEstimate = selectedProvider?.sends_data_off_machine
    ? estimateCloudRunCost({
        providerName: selectedProvider.name,
        topicLength: topic.trim().length,
        maxResults,
      })
    : null;
  const selectedFolderDetail = selectedFolderId
    ? folderDetailsById[selectedFolderId] ?? null
    : null;
  const folderRankedPapers = useMemo(() => {
    if (!selectedFolderDetail) {
      return [];
    }

    return selectedFolderDetail.papers.map((folderPaper, index) => ({
      paper: folderPaper.paper,
      rank_position: index + 1,
      relevance_score: 0,
      ranking_method: "folder_saved_v1",
      ranking_explanation: `Saved to ${selectedFolderDetail.folder.name} on ${formatPaperDate(
        folderPaper.added_at,
      )}`,
    }));
  }, [selectedFolderDetail]);
  const visibleRankedPapers =
    selectedFolderId === null ? rankedResult?.papers ?? [] : folderRankedPapers;
  const selectedRankedPaper =
    visibleRankedPapers.find(
      (rankedPaper) => rankedPaper.paper.paper_id === selectedPaperId,
    ) ??
    rankedResult?.papers.find(
      (rankedPaper) => rankedPaper.paper.paper_id === selectedPaperId,
    ) ??
    null;
  const savedFolderIdsByPaperId = useMemo(() => {
    const folderIdsByPaperId: Record<string, string[]> = {};
    Object.values(folderDetailsById).forEach((folderDetail) => {
      folderDetail.papers.forEach((folderPaper) => {
        const paperId = folderPaper.paper.paper_id;
        folderIdsByPaperId[paperId] = [
          ...(folderIdsByPaperId[paperId] ?? []),
          folderDetail.folder.folder_id,
        ];
      });
    });
    return folderIdsByPaperId;
  }, [folderDetailsById]);
  const selectedPaperSavedFolderIds = selectedPaperId
    ? savedFolderIdsByPaperId[selectedPaperId] ?? []
    : [];
  const sortedPapers = useMemo(() => {
    const papers = visibleRankedPapers;
    return [...papers].sort((left, right) => {
      let comparison = 0;

      if (sortKey === "rank") {
        comparison = left.rank_position - right.rank_position;
      } else if (sortKey === "title") {
        comparison = left.paper.title.localeCompare(right.paper.title);
      } else if (sortKey === "score") {
        comparison = left.relevance_score - right.relevance_score;
      } else {
        return compareNullableDates(
          left.paper.published_date,
          right.paper.published_date,
          sortDir,
        );
      }

      return sortDir === "asc" ? comparison : comparison * -1;
    });
  }, [sortDir, sortKey, visibleRankedPapers]);
  const rowPaddingClass = tablePreferences.compactRows ? "py-2" : "py-4";
  const visibleColumns = tablePreferences.visibleColumns;

  useEffect(() => {
    if (providers.length === 0) {
      return;
    }

    const hasSelectedProvider = providers.some(
      (provider) => provider.name === selectedProviderName,
    );
    if (hasSelectedProvider) {
      return;
    }

    const fallbackProvider =
      providers.find((provider) => provider.name === "mock") ?? providers[0];
    if (fallbackProvider) {
      setSelectedProviderName(fallbackProvider.name);
    }
  }, [providers, selectedProviderName]);

  const isWorking =
    workflowState === "creating" ||
    workflowState === "searching" ||
    workflowState === "ranking" ||
    workflowState === "semantic_ranking" ||
    workflowState === "pdf_downloading" ||
    workflowState === "extracting" ||
    workflowState === "synthesizing";

  const showProviderWarning = Boolean(
    selectedProvider &&
      selectedProviderHealth &&
      selectedProviderHealth.available === false,
  );
  const runInProgress = isWorkflowInProgress(workflowState);

  useEffect(() => {
    async function loadProviders() {
      try {
        const providerData = await fetchProvidersWithHealth();
        setProviders(providerData.providers);
        setProviderHealth(providerData.providerHealth);
      } catch {
        setErrorMessage("Could not reach the local backend provider routes.");
      }
    }

    loadProviders();
  }, []);

  useEffect(() => {
    loadFolders();
  }, []);

  useEffect(() => {
    if (selectedPaperId === null) {
      return;
    }
    const paperIsVisible = visibleRankedPapers.some(
      (rankedPaper) => rankedPaper.paper.paper_id === selectedPaperId,
    );
    if (!paperIsVisible) {
      setSelectedPaperId(null);
    }
  }, [selectedPaperId, visibleRankedPapers]);

  useEffect(() => {
    try {
      const storedPreferences = window.localStorage.getItem(
        PAPER_TABLE_PREFS_STORAGE_KEY,
      );
      if (storedPreferences) {
        setTablePreferences(parseTablePreferences(storedPreferences));
      }
    } catch {
      // Keep defaults when localStorage is unavailable or malformed.
    } finally {
      setTablePreferencesLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!tablePreferencesLoaded) {
      return;
    }

    try {
      window.localStorage.setItem(
        PAPER_TABLE_PREFS_STORAGE_KEY,
        JSON.stringify(tablePreferences),
      );
    } catch {
      // Preference persistence is best effort.
    }
  }, [tablePreferences, tablePreferencesLoaded]);

  useEffect(() => {
    if (!runInProgress || runStartedAt === null) {
      return;
    }

    const updateElapsed = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - runStartedAt) / 1000)));
    };

    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [runInProgress, runStartedAt]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTopic = topic.trim();
    if (!trimmedTopic) {
      setErrorMessage("Enter a research topic first.");
      return;
    }
    if (trimmedTopic.length > TOPIC_MAX_LENGTH) {
      setErrorMessage(
        `Research topics must be ${TOPIC_MAX_LENGTH} characters or fewer.`,
      );
      return;
    }
    if (selectedProviderHealth?.available === false) {
      setErrorMessage(
        `${selectedProvider?.display_name ?? "Selected provider"} is not available. ${selectedProviderHealth.message}`,
      );
      return;
    }
    if (
      selectedProvider?.sends_data_off_machine &&
      !confirmCloudProviderUse(selectedProvider)
    ) {
      return;
    }

    setErrorMessage(null);
    setRankedResult(null);
    setSelectedPaperId(null);
    setSortKey("rank");
    setSortDir("asc");
    setExtractionsByPaperId({});
    setLandscape(null);
    setRun(null);
    setRunStartedAt(Date.now());
    setElapsedSeconds(0);
    setWorkflowState("creating");

    try {
      const createdRun = await createResearchRun(trimmedTopic);
      setRun(createdRun);

      await startResearchRun({
        runId: createdRun.run_id,
        maxResults,
        providerName: selectedProvider?.name ?? "mock",
        paperSource: selectedPaperSource,
      });

      await pollRun(createdRun.run_id, trimmedTopic, selectedPaperSource);
    } catch (error) {
      setWorkflowState("failed");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The local backend could not complete the research search.",
      );
    }
  }

  async function pollRun(
    runId: string,
    searchTopic: string,
    paperSource: PaperSource,
  ) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const runSnapshot = await fetchRunSnapshot(runId);
      const updatedRun = runSnapshot.run;
      setRun(updatedRun);
      setLandscape(runSnapshot.landscape);
      setExtractionsByPaperId(
        Object.fromEntries(
          runSnapshot.extractions.map((extraction) => [
            extraction.paper_id,
            extraction,
          ]),
        ),
      );

      if (runSnapshot.papers.length > 0) {
        setRankedResult({
          topic: searchTopic,
          source: paperSource,
          max_results: maxResults,
          ranking_method: runSnapshot.papers[0].ranking_method,
          papers: runSnapshot.papers,
        });
      }

      if (updatedRun.status === "failed") {
        throw new Error(updatedRun.error_message ?? "Run failed");
      }

      if (updatedRun.status === "complete") {
        setSortKey("rank");
        setSortDir("asc");
        setWorkflowState("complete");
        return;
      }

      if (
        updatedRun.current_stage === "searching" ||
        updatedRun.current_stage === "ranking" ||
        updatedRun.current_stage === "semantic_ranking" ||
        updatedRun.current_stage === "pdf_downloading" ||
        updatedRun.current_stage === "extracting" ||
        updatedRun.current_stage === "synthesizing"
      ) {
        setWorkflowState(updatedRun.current_stage);
      }

      await sleep(1000);
    }

    throw new Error("Run polling timed out");
  }

  function handleSort(nextSortKey: SortKey) {
    if (sortKey === nextSortKey) {
      setSortDir((currentSortDir) =>
        currentSortDir === "asc" ? "desc" : "asc",
      );
      return;
    }

    setSortKey(nextSortKey);
    setSortDir(nextSortKey === "score" || nextSortKey === "date" ? "desc" : "asc");
  }

  function setCompactRows(compactRows: boolean) {
    setTablePreferences((currentPreferences) => ({
      ...currentPreferences,
      compactRows,
    }));
  }

  function toggleColumn(column: ToggleableColumn) {
    setTablePreferences((currentPreferences) => ({
      ...currentPreferences,
      visibleColumns: {
        ...currentPreferences.visibleColumns,
        [column]: !currentPreferences.visibleColumns[column],
      },
    }));
  }

  async function loadFolders() {
    setFoldersLoading(true);
    setFolderErrorMessage(null);
    try {
      const nextFolders = await fetchFolders();
      setFolders(nextFolders);
      const folderDetails = await Promise.all(
        nextFolders.map(async (folder) => fetchFolder(folder.folder_id)),
      );
      setFolderDetailsById(
        Object.fromEntries(
          folderDetails.map((folderDetail) => [
            folderDetail.folder.folder_id,
            folderDetail,
          ]),
        ),
      );
    } catch (error) {
      setFolderErrorMessage(
        error instanceof Error ? error.message : "Could not load folders.",
      );
    } finally {
      setFoldersLoading(false);
    }
  }

  async function handleCreateFolder(name: string) {
    setFolderErrorMessage(null);
    try {
      const folder = await createFolder(name);
      const folderDetail = await fetchFolder(folder.folder_id);
      setFolders((currentFolders) => [folderDetail.folder, ...currentFolders]);
      setFolderDetailsById((currentDetails) => ({
        ...currentDetails,
        [folder.folder_id]: folderDetail,
      }));
      setSelectedFolderId(folder.folder_id);
    } catch (error) {
      setFolderErrorMessage(
        error instanceof Error ? error.message : "Could not create folder.",
      );
      throw error;
    }
  }

  async function handleRenameFolder(folderId: string, name: string) {
    setFolderErrorMessage(null);
    try {
      const folder = await renameFolder({ folderId, name });
      setFolders((currentFolders) =>
        currentFolders.map((currentFolder) =>
          currentFolder.folder_id === folder.folder_id ? folder : currentFolder,
        ),
      );
      setFolderDetailsById((currentDetails) => {
        const currentDetail = currentDetails[folder.folder_id];
        if (!currentDetail) {
          return currentDetails;
        }
        return {
          ...currentDetails,
          [folder.folder_id]: {
            ...currentDetail,
            folder,
          },
        };
      });
    } catch (error) {
      setFolderErrorMessage(
        error instanceof Error ? error.message : "Could not rename folder.",
      );
      throw error;
    }
  }

  async function handleDeleteFolder(folderId: string) {
    setFolderErrorMessage(null);
    try {
      await deleteFolder(folderId);
      setFolders((currentFolders) =>
        currentFolders.filter((folder) => folder.folder_id !== folderId),
      );
      setFolderDetailsById((currentDetails) => {
        const nextDetails = { ...currentDetails };
        delete nextDetails[folderId];
        return nextDetails;
      });
      if (selectedFolderId === folderId) {
        setSelectedFolderId(null);
      }
    } catch (error) {
      setFolderErrorMessage(
        error instanceof Error ? error.message : "Could not delete folder.",
      );
      throw error;
    }
  }

  async function handleAddPaperToFolder(paperId: string, folderId: string) {
    await setPaperFolderMembership(paperId, folderId, true);
  }

  async function handleTogglePaperFolder(
    paperId: string,
    folderId: string,
    shouldSave: boolean,
  ) {
    await setPaperFolderMembership(paperId, folderId, shouldSave);
  }

  async function setPaperFolderMembership(
    paperId: string,
    folderId: string,
    shouldSave: boolean,
  ) {
    const mutationKey = `${folderId}:${paperId}`;
    const folderName =
      folders.find((folder) => folder.folder_id === folderId)?.name ?? "folder";
    setFolderMutationKey(mutationKey);
    setFolderErrorMessage(null);
    setFolderActionMessage(null);
    try {
      const folderDetail = shouldSave
        ? await addPaperToFolder({ folderId, paperId })
        : await removePaperFromFolder({ folderId, paperId });
      setFolderDetailsById((currentDetails) => ({
        ...currentDetails,
        [folderDetail.folder.folder_id]: folderDetail,
      }));
      setFolders((currentFolders) =>
        currentFolders.map((folder) =>
          folder.folder_id === folderDetail.folder.folder_id
            ? folderDetail.folder
            : folder,
        ),
      );
      setFolderActionMessage(
        shouldSave ? `Saved to ${folderName}.` : `Removed from ${folderName}.`,
      );
    } catch (error) {
      setFolderErrorMessage(
        error instanceof Error
          ? error.message
          : shouldSave
            ? "Could not save paper."
            : "Could not remove paper.",
      );
      throw error;
    } finally {
      setFolderMutationKey(null);
    }
  }

  return (
    <main className="min-h-screen px-5 py-5 text-[color:var(--foreground)] md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-col justify-between gap-4 border-b border-[color:var(--line)] pb-4 md:flex-row md:items-end">
          <div>
            <h1 className="text-3xl font-semibold leading-tight md:text-4xl">
              Research Field Mapper
            </h1>
          </div>
          <div className="flex items-center gap-2 text-sm text-[color:var(--muted)]">
            <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--accent)]" />
            Backend: {API_BASE_URL}
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
          <div className="rounded-lg border border-[color:var(--line)] bg-[color:var(--panel)] p-4 shadow-sm md:p-5">
            <form onSubmit={handleSubmit} className="grid gap-4">
              <div className="grid gap-2">
                <label
                  htmlFor="topic"
                  className="text-sm font-semibold text-[color:var(--foreground)]"
                >
                  Research topic
                </label>
                <input
                  id="topic"
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  maxLength={TOPIC_MAX_LENGTH}
                  className="min-h-12 rounded-md border border-[color:var(--line)] bg-white px-3 text-base text-[color:var(--foreground)]"
                  placeholder="retrieval augmented generation"
                />
                <p className="text-xs text-[color:var(--muted)]">
                  {topic.trim().length}/{TOPIC_MAX_LENGTH} characters
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="grid gap-2 sm:w-44">
                  <label
                    htmlFor="max-results"
                    className="text-sm font-semibold text-[color:var(--foreground)]"
                  >
                    Papers
                  </label>
                  <select
                    id="max-results"
                    value={maxResults}
                    onChange={(event) => setMaxResults(Number(event.target.value))}
                    className="min-h-11 rounded-md border border-[color:var(--line)] bg-white px-3 text-sm"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                  </select>
                </div>
                <div className="grid gap-2 sm:min-w-48">
                  <label
                    htmlFor="paper-source"
                    className="text-sm font-semibold text-[color:var(--foreground)]"
                  >
                    Source
                  </label>
                  <select
                    id="paper-source"
                    value={selectedPaperSource}
                    disabled={isWorking}
                    onChange={(event) =>
                      setSelectedPaperSource(event.target.value as PaperSource)
                    }
                    className="min-h-11 rounded-md border border-[color:var(--line)] bg-white px-3 text-sm"
                  >
                    {PAPER_SOURCE_OPTIONS.map((sourceOption) => (
                      <option key={sourceOption.value} value={sourceOption.value}>
                        {sourceOption.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2 sm:min-w-52">
                  <label
                    htmlFor="provider"
                    className="text-sm font-semibold text-[color:var(--foreground)]"
                  >
                    Provider
                  </label>
                  <select
                    id="provider"
                    value={selectedProvider?.name ?? ""}
                    disabled={isWorking || providers.length === 0}
                    onChange={(event) => setSelectedProviderName(event.target.value)}
                    className="min-h-11 rounded-md border border-[color:var(--line)] bg-white px-3 text-sm"
                  >
                    {providers.map((provider) => {
                      const health = providerHealth[provider.name];
                      const availabilityLabel =
                        health == null
                          ? "Checking…"
                          : health.available === false
                            ? "Unavailable"
                            : "Available";
                      const locationLabel = provider.sends_data_off_machine
                        ? "Cloud"
                        : "Local";
                      return (
                        <option key={provider.name} value={provider.name}>
                          {provider.display_name} ({locationLabel}, {availabilityLabel})
                        </option>
                      );
                    })}
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={runInProgress}
                  className="min-h-11 rounded-md bg-[color:var(--accent)] px-5 text-sm font-semibold text-white transition hover:bg-[color:var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {runInProgress
                    ? "Working"
                    : "Start research run"}
                </button>
              </div>
            </form>

            {showProviderWarning ? (
              <p role="alert" className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {selectedProvider?.display_name} is selected, but its health check
                reports it as unavailable. {selectedProviderHealth?.message}
              </p>
            ) : null}

            {selectedProvider?.sends_data_off_machine ? (
              <CloudProviderDisclosure
                provider={selectedProvider}
                costEstimate={cloudCostEstimate}
              />
            ) : null}

            {runInProgress ? (
              <ResearchProgress
                currentStage={workflowState}
                elapsedSeconds={elapsedSeconds}
              />
            ) : null}

            {errorMessage ? (
              <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-[color:var(--danger)]">
                {errorMessage}
              </p>
            ) : null}

            <div className="mt-5 grid gap-3 border-t border-[color:var(--line)] pt-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatusMetric label="Run status" value={run?.status ?? "not started"} />
              <StatusMetric
                label="Search stage"
                value={workflowState}
              />
              <StatusMetric
                label="Ranking"
                value={rankedResult?.ranking_method ?? "rrf_keyword_semantic_v1"}
              />
              <StatusMetric
                label="Source"
                value={sourceLabel(selectedPaperSource)}
              />
            </div>
          </div>

          <aside className="rounded-lg border border-[color:var(--line)] bg-[color:var(--panel)] p-4 shadow-sm md:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Provider status</h2>
                <p className="mt-1 text-sm text-[color:var(--muted)]">
                  Selected: {selectedProvider?.display_name ?? "Loading"}
                </p>
              </div>
              <span
                className={
                  selectedProvider?.sends_data_off_machine
                    ? "rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900"
                    : "rounded-md bg-[color:var(--panel-strong)] px-2 py-1 text-xs font-semibold text-[color:var(--accent-strong)]"
                }
              >
                {selectedProvider?.sends_data_off_machine ? "Cloud" : "Local"}
              </span>
            </div>
            <div className="mt-4 grid gap-3">
              {providers.map((provider) => {
                const health = providerHealth[provider.name];
                return (
                  <div
                    key={provider.name}
                    className="rounded-md border border-[color:var(--line)] p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">
                        {provider.display_name}
                      </p>
                      <ProviderDot provider={provider} health={health} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span
                        className={
                          provider.sends_data_off_machine
                            ? "rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900"
                            : "rounded-md bg-[color:var(--panel-strong)] px-2 py-0.5 text-xs font-semibold text-[color:var(--accent-strong)]"
                        }
                      >
                        {provider.sends_data_off_machine
                          ? "Sends data off machine"
                          : "Local only"}
                      </span>
                      {health?.status === "not_configured" ? (
                        <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                          Not configured
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[color:var(--muted)]">
                      {health?.message ?? "Checking provider health"}
                    </p>
                    {provider.name === "openai" ? (
                      <a
                        href="https://platform.openai.com/api-keys"
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex text-xs font-semibold text-[color:var(--accent-strong)] hover:underline"
                      >
                        OpenAI API keys
                      </a>
                    ) : null}
                    {provider.name === "anthropic" ? (
                      <a
                        href="https://console.anthropic.com/settings/keys"
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex text-xs font-semibold text-[color:var(--accent-strong)] hover:underline"
                      >
                        Anthropic API keys
                      </a>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </aside>
        </section>

        <section className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <FolderSidebar
            folders={folders}
            selectedFolderId={selectedFolderId}
            isLoading={foldersLoading}
            errorMessage={folderErrorMessage}
            onCreateFolder={handleCreateFolder}
            onSelectFolder={(folderId) => {
              setSelectedFolderId(folderId);
              setSelectedPaperId(null);
              setSortKey("rank");
              setSortDir("asc");
            }}
            onRenameFolder={handleRenameFolder}
            onDeleteFolder={handleDeleteFolder}
          />

          <div className="grid min-w-0 gap-5">
            <LandscapePanel landscape={landscape} />

            <section className="rounded-lg border border-[color:var(--line)] bg-[color:var(--panel)] shadow-sm">
              <div className="flex flex-col justify-between gap-2 border-b border-[color:var(--line)] px-4 py-3 md:flex-row md:items-center md:px-5">
                <div>
                  <h2 className="text-lg font-semibold">
                    {selectedFolderDetail
                      ? selectedFolderDetail.folder.name
                      : "Ranked papers"}
                  </h2>
                  <p className="mt-1 text-sm text-[color:var(--muted)]">
                    {selectedFolderDetail
                      ? `${selectedFolderDetail.papers.length} saved papers`
                      : rankedResult
                      ? `${rankedResult.papers.length} results from ${sourceLabel(
                          rankedResult.source as PaperSource,
                        )}`
                      : "No ranked papers yet."}
                  </p>
                  {folderActionMessage ? (
                    <p className="mt-1 text-sm font-semibold text-[color:var(--accent-strong)]">
                      {folderActionMessage}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2 md:items-end">
                  {run ? (
                    <p className="break-all text-xs text-[color:var(--muted)]">
                      Run ID: {run.run_id}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-[color:var(--muted)]">
                    <label className="flex items-center gap-2 font-semibold">
                      <input
                        type="checkbox"
                        checked={tablePreferences.compactRows}
                        onChange={(event) => setCompactRows(event.target.checked)}
                        className="h-4 w-4 accent-[color:var(--accent)]"
                      />
                      Dense rows
                    </label>
                    <details className="relative">
                      <summary className="cursor-pointer rounded-md border border-[color:var(--line)] px-2 py-1 font-semibold text-[color:var(--foreground)] hover:bg-[color:var(--panel-strong)]">
                        Columns
                      </summary>
                      <div className="absolute right-0 z-10 mt-2 grid w-44 gap-2 rounded-md border border-[color:var(--line)] bg-[color:var(--panel)] p-3 shadow-lg">
                        {PAPER_TABLE_COLUMNS.map((column) => (
                          <label
                            key={column.key}
                            className="flex items-center gap-2 font-semibold"
                          >
                            <input
                              type="checkbox"
                              checked={visibleColumns[column.key]}
                              onChange={() => toggleColumn(column.key)}
                              className="h-4 w-4 accent-[color:var(--accent)]"
                            />
                            {column.label}
                          </label>
                        ))}
                      </div>
                    </details>
                  </div>
                </div>
              </div>

              <div className="overflow-x-hidden">
                <table className="w-full table-fixed border-collapse text-left">
                  <thead className="bg-[color:var(--panel-strong)] text-xs uppercase tracking-normal text-[color:var(--muted)]">
                    <tr>
                      <SortableHeader
                        label="Rank"
                        sortKey="rank"
                        activeSortKey={sortKey}
                        sortDir={sortDir}
                        onSort={handleSort}
                        className="w-12 px-2 py-3 sm:w-16 sm:px-4"
                      />
                      <SortableHeader
                        label="Paper"
                        sortKey="title"
                        activeSortKey={sortKey}
                        sortDir={sortDir}
                        onSort={handleSort}
                        className="px-2 py-3 sm:px-4"
                      />
                      <SortableHeader
                        label="Date"
                        sortKey="date"
                        activeSortKey={sortKey}
                        sortDir={sortDir}
                        onSort={handleSort}
                        className="hidden w-28 px-4 py-3 sm:table-cell"
                      />
                      {visibleColumns.score ? (
                        <SortableHeader
                          label="Score"
                          sortKey="score"
                          activeSortKey={sortKey}
                          sortDir={sortDir}
                          onSort={handleSort}
                          className="w-16 px-2 py-3 sm:w-24 sm:px-4"
                        />
                      ) : null}
                      {visibleColumns.categories ? (
                        <th className="hidden w-44 px-4 py-3 font-semibold md:table-cell">
                          Categories
                        </th>
                      ) : null}
                      {visibleColumns.links ? (
                        <th className="hidden w-36 px-4 py-3 font-semibold md:table-cell">
                          Links
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPapers.map((rankedPaper) => (
                      <tr
                        key={rankedPaper.paper.paper_id}
                        tabIndex={0}
                        role="button"
                        aria-label={`Open details for ${rankedPaper.paper.title}`}
                        onClick={() => setSelectedPaperId(rankedPaper.paper.paper_id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            if ((event.target as Element).closest("a, button, input, select, textarea")) {
                              return;
                            }
                            event.preventDefault();
                            setSelectedPaperId(rankedPaper.paper.paper_id);
                          }
                        }}
                        className="cursor-pointer border-t border-[color:var(--line)] align-top transition hover:bg-[color:var(--panel-strong)] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-[rgba(15,123,108,0.28)]"
                      >
                        <td className={`${rowPaddingClass} px-2 text-sm font-semibold sm:px-4`}>
                          {rankedPaper.rank_position}
                        </td>
                        <td className={`${rowPaddingClass} min-w-0 px-2 sm:px-4`}>
                          <a
                            href={rankedPaper.paper.paper_url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            className="block truncate text-sm font-semibold text-[color:var(--accent-strong)] hover:underline sm:whitespace-normal"
                          >
                            {rankedPaper.paper.title}
                          </a>
                          <p className="mt-1 text-xs text-[color:var(--muted)] sm:hidden">
                            {formatPaperDate(rankedPaper.paper.published_date)}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <SourceBadge source={rankedPaper.paper.source} />
                            {rankedPaper.paper.reference_count !== null ? (
                              <span className="rounded-md bg-[color:var(--panel-strong)] px-2 py-1 text-xs font-semibold text-[color:var(--muted)]">
                                {rankedPaper.paper.reference_count} refs
                              </span>
                            ) : null}
                            {rankedPaper.paper.citation_count !== null ? (
                              <span className="rounded-md bg-[color:var(--panel-strong)] px-2 py-1 text-xs font-semibold text-[color:var(--muted)]">
                                {rankedPaper.paper.citation_count} citations
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs leading-5 text-[color:var(--muted)]">
                            {rankedPaper.paper.authors.slice(0, 5).join(", ")}
                          </p>
                          <p className="mt-2 max-w-[320px] truncate text-sm leading-6 text-[color:var(--foreground)] sm:line-clamp-3 sm:max-w-none sm:whitespace-normal">
                            {rankedPaper.paper.abstract}
                          </p>
                          <ExtractionPreview
                            extraction={extractionsByPaperId[rankedPaper.paper.paper_id]}
                          />
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <select
                              value=""
                              disabled={
                                folders.length === 0 ||
                                folderMutationKey?.endsWith(
                                  `:${rankedPaper.paper.paper_id}`,
                                )
                              }
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => {
                                event.stopPropagation();
                                const folderId = event.target.value;
                                if (folderId) {
                                  handleAddPaperToFolder(
                                    rankedPaper.paper.paper_id,
                                    folderId,
                                  ).catch(() => undefined);
                                }
                              }}
                              className="rounded-md border border-[color:var(--line)] bg-white px-2 py-1 text-xs font-semibold text-[color:var(--accent-strong)] disabled:cursor-not-allowed disabled:text-[color:var(--muted)]"
                              aria-label={`Save ${rankedPaper.paper.title} to folder`}
                            >
                              <option value="">
                                {folders.length === 0 ? "No folders" : "Save to folder"}
                              </option>
                              {folders.map((folder) => (
                                <option key={folder.folder_id} value={folder.folder_id}>
                                  {savedFolderIdsByPaperId[
                                    rankedPaper.paper.paper_id
                                  ]?.includes(folder.folder_id)
                                    ? `Saved: ${folder.name}`
                                    : folder.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          {visibleColumns.explanation ? (
                            <p className="mt-2 text-xs text-[color:var(--muted)]">
                              {rankedPaper.ranking_explanation}
                            </p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap gap-3 text-xs md:hidden">
                            {visibleColumns.categories ? (
                              <span className="text-[color:var(--muted)]">
                                {rankedPaper.paper.categories.join(", ") || "No categories"}
                              </span>
                            ) : null}
                            {visibleColumns.links ? (
                              <span className="flex gap-3">
                                <a
                                  href={rankedPaper.paper.paper_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(event) => event.stopPropagation()}
                                  className="font-semibold text-[color:var(--accent-strong)] hover:underline"
                                >
                                  Abstract
                                </a>
                                {rankedPaper.paper.pdf_url ? (
                                  <a
                                    href={rankedPaper.paper.pdf_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(event) => event.stopPropagation()}
                                    className="font-semibold text-[color:var(--accent-strong)] hover:underline"
                                  >
                                    PDF
                                  </a>
                                ) : null}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className={`${rowPaddingClass} hidden px-4 text-sm sm:table-cell`}>
                          {formatPaperDate(rankedPaper.paper.published_date)}
                        </td>
                        {visibleColumns.score ? (
                          <td className={`${rowPaddingClass} px-2 text-sm sm:px-4`}>
                            {rankedPaper.relevance_score.toFixed(1)}
                          </td>
                        ) : null}
                        {visibleColumns.categories ? (
                          <td className={`${rowPaddingClass} hidden px-4 text-sm text-[color:var(--muted)] md:table-cell`}>
                            {rankedPaper.paper.categories.join(", ") || "None"}
                          </td>
                        ) : null}
                        {visibleColumns.links ? (
                          <td className={`${rowPaddingClass} hidden px-4 text-sm md:table-cell`}>
                            <div className="flex gap-3">
                              <a
                                href={rankedPaper.paper.paper_url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(event) => event.stopPropagation()}
                                className="font-semibold text-[color:var(--accent-strong)] hover:underline"
                              >
                                Abstract
                              </a>
                              {rankedPaper.paper.pdf_url ? (
                                <a
                                  href={rankedPaper.paper.pdf_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(event) => event.stopPropagation()}
                                  className="font-semibold text-[color:var(--accent-strong)] hover:underline"
                                >
                                  PDF
                                </a>
                              ) : null}
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sortedPapers.length === 0 && selectedFolderDetail ? (
                  <p className="border-t border-[color:var(--line)] px-4 py-8 text-sm text-[color:var(--muted)] md:px-5">
                    This folder is empty.
                  </p>
                ) : null}
              </div>
            </section>
          </div>
        </section>
      </div>
      <PaperDetailPanel
        rankedPaper={selectedRankedPaper}
        extraction={
          selectedPaperId ? extractionsByPaperId[selectedPaperId] : undefined
        }
        folders={folders}
        savedFolderIds={selectedPaperSavedFolderIds}
        folderMutationKey={folderMutationKey}
        onTogglePaperFolder={(folderId, shouldSave) =>
          selectedPaperId
            ? handleTogglePaperFolder(selectedPaperId, folderId, shouldSave)
            : Promise.resolve()
        }
        onClose={() => setSelectedPaperId(null)}
      />
    </main>
  );
}

function SortableHeader({
  label,
  sortKey,
  activeSortKey,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  activeSortKey: SortKey;
  sortDir: SortDir;
  onSort: (sortKey: SortKey) => void;
  className: string;
}) {
  const isActive = activeSortKey === sortKey;

  return (
    <th
      className={`${className} font-semibold`}
      aria-sort={isActive ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="-m-1 flex w-full cursor-pointer items-center gap-1 rounded-sm p-1 text-left hover:bg-[color:var(--panel)] hover:text-[color:var(--foreground)]"
      >
        <span>{label}</span>
        {isActive ? (
          <span className="paper-table-sort-indicator" aria-hidden="true">
            {sortDir === "asc" ? "▲" : "▼"}
          </span>
        ) : null}
      </button>
    </th>
  );
}

function compareNullableDates(
  leftDate: string | null,
  rightDate: string | null,
  sortDir: SortDir,
) {
  if (leftDate === null && rightDate === null) {
    return 0;
  }
  if (leftDate === null) {
    return 1;
  }
  if (rightDate === null) {
    return -1;
  }

  const comparison = new Date(leftDate).getTime() - new Date(rightDate).getTime();
  return sortDir === "asc" ? comparison : comparison * -1;
}

function formatPaperDate(publishedDate: string | null) {
  if (!publishedDate) {
    return "-";
  }

  return publishedDate.slice(0, 10);
}

function parseTablePreferences(rawPreferences: string): PaperTablePreferences {
  const parsedPreferences = JSON.parse(rawPreferences) as Partial<PaperTablePreferences>;
  const parsedColumns =
    parsedPreferences.visibleColumns ??
    ({} as Partial<Record<ToggleableColumn, boolean>>);

  return {
    compactRows: Boolean(parsedPreferences.compactRows),
    visibleColumns: {
      score:
        typeof parsedColumns.score === "boolean"
          ? parsedColumns.score
          : DEFAULT_TABLE_PREFERENCES.visibleColumns.score,
      categories:
        typeof parsedColumns.categories === "boolean"
          ? parsedColumns.categories
          : DEFAULT_TABLE_PREFERENCES.visibleColumns.categories,
      links:
        typeof parsedColumns.links === "boolean"
          ? parsedColumns.links
          : DEFAULT_TABLE_PREFERENCES.visibleColumns.links,
      explanation:
        typeof parsedColumns.explanation === "boolean"
          ? parsedColumns.explanation
          : DEFAULT_TABLE_PREFERENCES.visibleColumns.explanation,
    },
  };
}

function ResearchProgress({
  currentStage,
  elapsedSeconds,
}: {
  currentStage: WorkflowState;
  elapsedSeconds: number;
}) {
  const currentStageIndex = PIPELINE_STAGES.findIndex(
    (stage) => stage.key === currentStage,
  );
  const activeStepValue = currentStageIndex === -1 ? 0 : currentStageIndex + 1;
  const progressPercent =
    currentStageIndex === -1
      ? 0
      : Math.min(
          100,
          ((currentStageIndex + 0.5) / PIPELINE_STAGES.length) * 100,
        );

  return (
    <div
      className="mt-4 rounded-md border border-[color:var(--line)] bg-[color:var(--panel-strong)] px-3 py-3"
      aria-label="Research run progress"
    >
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <p className="text-sm font-semibold text-[color:var(--foreground)]">
          {currentStage === "creating" ? "Preparing run" : "Research pipeline"}
        </p>
        <p className="text-xs font-semibold uppercase tracking-normal text-[color:var(--muted)]">
          Elapsed {formatElapsedTime(elapsedSeconds)}
        </p>
      </div>

      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-[color:var(--line)]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={PIPELINE_STAGES.length}
        aria-valuenow={activeStepValue}
        aria-valuetext={
          currentStageIndex === -1
            ? "Preparing run"
            : `${PIPELINE_STAGES[currentStageIndex].label} in progress`
        }
      >
        <div
          className="h-full rounded-full bg-[color:var(--accent)] transition-all duration-500"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <ol className="mt-3 grid gap-2 sm:grid-cols-6">
        {PIPELINE_STAGES.map((stage, index) => {
          const isComplete = currentStageIndex > index;
          const isCurrent = currentStageIndex === index;
          return (
            <li
              key={stage.key}
              className={
                isCurrent || isComplete
                  ? "flex items-center gap-2 text-sm font-semibold text-[color:var(--foreground)]"
                  : "flex items-center gap-2 text-sm text-[color:var(--muted)]"
              }
            >
              <span
                className={
                  isComplete
                    ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent)] text-white"
                    : isCurrent
                      ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-[color:var(--accent)] bg-white text-[color:var(--accent-strong)]"
                      : "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[color:var(--line)] bg-white text-[color:var(--muted)]"
                }
                aria-hidden="true"
              >
                {isComplete ? <CheckIcon /> : index + 1}
              </span>
              <span>{stage.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StatusMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[color:var(--line)] bg-[color:var(--panel-strong)] px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-normal text-[color:var(--muted)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function CloudProviderDisclosure({
  provider,
  costEstimate,
}: {
  provider: ProviderInfo;
  costEstimate: CloudCostEstimate | null;
}) {
  return (
    <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
      <p className="font-semibold">
        {provider.display_name} sends your research topic, paper abstracts, and parsed paper text when available to a cloud AI provider.
      </p>
      {costEstimate ? (
        <p className="mt-1 text-xs leading-5">
          Estimated upper-bound run: {costEstimate.inputTokens.toLocaleString()} input tokens
          and {costEstimate.outputTokens.toLocaleString()} output tokens,
          about {formatUsd(costEstimate.totalUsd)} with {costEstimate.modelLabel}
          pricing. Provider pricing can change.
        </p>
      ) : (
        <p className="mt-1 text-xs leading-5">
          Cost depends on the configured model and provider account pricing.
        </p>
      )}
    </div>
  );
}

function ProviderDot({
  provider,
  health,
}: {
  provider: ProviderInfo;
  health: ProviderHealth | undefined;
}) {
  const status = getProviderDotStatus(provider, health);
  return (
    <span
      className={`h-2.5 w-2.5 rounded-full ${status.className}`}
      aria-label={status.label}
    />
  );
}

function LandscapePanel({ landscape }: { landscape: Landscape | null }) {
  return (
    <section className="rounded-lg border border-[color:var(--line)] bg-[color:var(--panel)] p-4 shadow-sm md:p-5">
      <div className="flex flex-col justify-between gap-2 md:flex-row md:items-start">
        <div>
          <h2 className="text-lg font-semibold">Landscape</h2>
          <p className="mt-1 text-sm leading-6 text-[color:var(--muted)]">
            {landscape
              ? landscape.overview
              : "Run a topic search to synthesize a field landscape."}
          </p>
        </div>
        {landscape ? (
          <span className="rounded-md bg-[color:var(--panel-strong)] px-2 py-1 text-xs font-semibold text-[color:var(--accent-strong)]">
            {landscape.provider_name}
          </span>
        ) : null}
      </div>

      {landscape ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <LandscapeList title="Clusters" items={landscape.clusters} />
          <LandscapeList title="Open Problems" items={landscape.open_problems} />
          <LandscapeList
            title="Reading Path"
            items={landscape.recommended_reading_path}
          />
        </div>
      ) : null}
    </section>
  );
}

function LandscapeList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border border-[color:var(--line)] bg-[color:var(--panel-strong)] p-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-2 grid gap-2 text-sm leading-6 text-[color:var(--foreground)]">
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function ExtractionPreview({
  extraction,
}: {
  extraction: PaperExtraction | undefined;
}) {
  if (!extraction) {
    return (
      <p className="mt-2 text-xs text-[color:var(--muted)]">
        Extraction pending.
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-[color:var(--line)] bg-[color:var(--panel-strong)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-normal text-[color:var(--muted)]">
          Structured note
        </p>
        <span className="text-xs text-[color:var(--muted)]">
          {extraction.provider_name} · {(extraction.confidence * 100).toFixed(0)}%
        </span>
        <ExtractionTextBadge extraction={extraction} />
      </div>
      <p className="mt-2 text-sm leading-6">
        <span className="font-semibold">Problem:</span> {extraction.problem}
      </p>
      <p className="mt-1 text-sm leading-6">
        <span className="font-semibold">Contribution:</span>{" "}
        {extraction.main_contribution}
      </p>
      {extraction.tags.length > 0 ? (
        <p className="mt-2 text-xs text-[color:var(--muted)]">
          Tags: {extraction.tags.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

function ExtractionTextBadge({ extraction }: { extraction: PaperExtraction }) {
  if (extraction.has_full_text) {
    return (
      <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
        Full text
      </span>
    );
  }

  return (
    <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
      {extraction.full_text_status === "no_pdf_available"
        ? "No PDF"
        : extraction.full_text_status === "parsing_failed"
          ? "PDF parse failed"
          : extraction.full_text_status === "download_failed"
            ? "PDF download failed"
            : "Abstract only"}
    </span>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
    >
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
    </svg>
  );
}

function isWorkflowInProgress(workflowState: WorkflowState) {
  return (
    workflowState === "creating" ||
    workflowState === "searching" ||
    workflowState === "ranking" ||
    workflowState === "semantic_ranking" ||
    workflowState === "pdf_downloading" ||
    workflowState === "extracting" ||
    workflowState === "synthesizing"
  );
}

function formatElapsedTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

type CloudCostEstimate = {
  inputTokens: number;
  outputTokens: number;
  totalUsd: number;
  modelLabel: string;
};

function estimateCloudRunCost({
  providerName,
  topicLength,
  maxResults,
}: {
  providerName: string;
  topicLength: number;
  maxResults: number;
}): CloudCostEstimate | null {
  const pricing = CLOUD_PRICING_USD_PER_1M[providerName];
  if (!pricing) {
    return null;
  }

  const extractionCount = Math.min(10, maxResults);
  const parsedPdfSectionCharacters = 5 * 2000;
  const inputCharacters =
    topicLength +
    extractionCount * 1500 +
    extractionCount * parsedPdfSectionCharacters +
    extractionCount * 950;
  const inputTokens = Math.ceil(inputCharacters / 4);
  const outputTokens = extractionCount * 700 + 1000;
  const totalUsd =
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output;

  return {
    inputTokens,
    outputTokens,
    totalUsd,
    modelLabel: pricing.modelLabel,
  };
}

function formatUsd(value: number) {
  if (value < 0.01) {
    return "<$0.01";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getProviderDotStatus(
  provider: ProviderInfo,
  health: ProviderHealth | undefined,
) {
  if (!health) {
    return { className: "bg-gray-400", label: "Checking" };
  }
  if (!health.available) {
    if (health.status === "not_configured") {
      return { className: "bg-gray-400", label: "Not configured" };
    }
    return { className: "bg-[color:var(--danger)]", label: "Unavailable" };
  }
  if (provider.sends_data_off_machine) {
    return { className: "bg-[color:var(--warning)]", label: "Available cloud provider" };
  }

  return { className: "bg-[color:var(--accent)]", label: "Available local provider" };
}

function confirmCloudProviderUse(provider: ProviderInfo) {
  const storageKey = `${CLOUD_ACK_STORAGE_KEY}.${provider.name}`;
  try {
    if (window.localStorage.getItem(storageKey) === "true") {
      return true;
    }
  } catch {
    return window.confirm(cloudConfirmationMessage(provider));
  }

  const confirmed = window.confirm(cloudConfirmationMessage(provider));
  if (confirmed) {
    try {
      window.localStorage.setItem(storageKey, "true");
    } catch {
      // Browser storage can be disabled; the confirmation still applies to this run.
    }
  }

  return confirmed;
}

function cloudConfirmationMessage(provider: ProviderInfo) {
  return `${provider.display_name} will receive your research topic, paper abstracts, and parsed paper text when available for this run. Continue with this cloud provider?`;
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}
