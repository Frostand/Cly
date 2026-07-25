import type { ColumnDef } from "@tanstack/react-table";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
} from "@xyflow/react";
import {
  ArrowRight,
  Beaker,
  Check,
  ChevronRight,
  Filter,
  GitBranch,
  Link2,
  LoaderCircle,
  MoreHorizontal,
  Play,
  Plus,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  PageHeader,
  Panel,
  SearchInput,
  Segmented,
  toneForStatus,
} from "../components/primitives";
import { ClyDataTable, ClyMenu } from "../components/toolkit";
import { VisualMetric } from "../components/visuals";
import {
  type AnalysisTask,
  type LocalAnalysisResult,
  type ParsedDataset,
  parseDelimitedDataset,
  runLocalAnalysis,
  sha256Hex,
} from "../domain/local-analysis";
import type {
  Experiment,
  ExperimentRun,
  ExperimentType,
} from "../domain/types";
import { projectServices } from "../services/project-services";
import { isClyDemoRuntime } from "../services/runtime";
import { useClyStore } from "../store/cly-store";
import { PreregistrationWorkspace } from "./preregistration-workspace";

type ExperimentView =
  | "Experiments"
  | "Runs"
  | "Compare"
  | "Timeline"
  | "Outputs"
  | "Preregistration";
const experimentViews = [
  "Experiments",
  "Runs",
  "Compare",
  "Timeline",
  "Outputs",
  "Preregistration",
] as const;

type ClyFlowNode = Node<
  { label: string; type: string; status: string },
  "clyResearch"
>;

function ClyResearchNode({ data, selected }: NodeProps<ClyFlowNode>) {
  return (
    <div
      className="cly-flow-node"
      data-selected={selected}
      data-status={data.status}
    >
      <Handle type="target" position={Position.Left} />
      <GitBranch size={13} aria-hidden="true" />
      <span>
        <small>
          {data.type} · {data.status}
        </small>
        <strong>{data.label}</strong>
      </span>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const clyNodeTypes = { clyResearch: ClyResearchNode };

export function ExperimentsScreen() {
  const data = useClyStore((s) => s.data);
  const selectedId = useClyStore((s) => s.selectedId);
  const setSelected = useClyStore((s) => s.setSelected);
  const notify = useClyStore((s) => s.notify);
  const fixtureMode = useClyStore((s) => s.fixtureMode);
  const finishGuidedLdlAnalysis = useClyStore((s) => s.finishGuidedLdlAnalysis);
  const [view, setView] = useState<ExperimentView>("Experiments");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [compareIds, setCompareIds] = useState<string[]>(["run-01", "run-02"]);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [type, setType] = useState<ExperimentType>("Simulation");
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [analysisStage, setAnalysisStage] = useState("");
  const [analysisDataset, setAnalysisDataset] = useState("");
  const [analysisOutcome, setAnalysisOutcome] = useState("");
  const [analysisSeed, setAnalysisSeed] = useState("");
  const [analysisFolds, setAnalysisFolds] = useState("");
  const [analysisFeatures, setAnalysisFeatures] = useState("");
  const [localDataset, setLocalDataset] = useState<ParsedDataset | null>(null);
  const [localDatasetText, setLocalDatasetText] = useState("");
  const [localDatasetHash, setLocalDatasetHash] = useState("");
  const [localTask, setLocalTask] = useState<AnalysisTask>("auto");
  const [localOutcome, setLocalOutcome] = useState("");
  const [localPredictors, setLocalPredictors] = useState<string[]>([]);
  const [localSeed, setLocalSeed] = useState("42");
  const [localFolds, setLocalFolds] = useState("5");
  const [localAnalysisError, setLocalAnalysisError] = useState("");
  const [localResult, setLocalResult] = useState<LocalAnalysisResult | null>(
    null,
  );
  const [localRunId, setLocalRunId] = useState<string | null>(null);
  const guidedAnalysis = isClyDemoRuntime && fixtureMode === "guided";
  const experiments = data.experiments.filter(
    (item) =>
      (!query ||
        `${item.name} ${item.goal} ${item.type}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (filter === "All" || item.status === filter),
  );
  const selectedExperiment =
    data.experiments.find((item) => item.id === selectedId) ??
    data.experiments[0] ??
    null;
  const compareRuns = compareIds
    .map((id) => data.runs.find((item) => item.id === id))
    .filter(Boolean);
  const downloadComparisonReport = () => {
    if (compareRuns.length < 2) return;
    const rows = compareRuns.map((run) => ({
      id: run?.id,
      name: run?.name,
      experiment: data.experiments.find(
        (experiment) => experiment.id === run?.experimentId,
      )?.name,
      status: run?.status,
      configuration: run?.config,
      metrics: run?.metrics,
      codeVersion: run?.codeVersion,
      environment: run?.environment,
      reproducibility: run?.reproducibility,
      canonical: run?.canonical ?? false,
    }));
    const url = URL.createObjectURL(
      new Blob(
        [
          `${JSON.stringify(
            {
              runCount: rows.length,
              runs: rows,
            },
            null,
            2,
          )}\n`,
        ],
        { type: "application/json;charset=utf-8" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "cly-run-comparison.json";
    link.click();
    URL.revokeObjectURL(url);
    notify(
      "Comparison report downloaded",
      `${rows.length} runs with configuration, metrics, code, environment, and reproducibility.`,
    );
  };
  const aucValues = data.runs
    .map((item) => item.metrics.auc)
    .filter((value): value is number => typeof value === "number");
  const canonicalAuc = data.runs.find(
    (item) => item.canonical && typeof item.metrics.auc === "number",
  )?.metrics.auc;
  const experimentColumns = useMemo<ColumnDef<Experiment, unknown>[]>(
    () => [
      { accessorKey: "name", header: "Experiment" },
      { accessorKey: "type", header: "Type" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge tone={toneForStatus(row.original.status)}>
            {row.original.status}
          </Badge>
        ),
      },
      { accessorKey: "goal", header: "Research goal" },
      { id: "runs", header: "Runs", accessorFn: (row) => row.runIds.length },
      {
        accessorKey: "updatedAt",
        header: "Updated",
        cell: ({ row }) =>
          new Date(row.original.updatedAt).toLocaleDateString(),
      },
    ],
    [],
  );
  const runColumns = useMemo<ColumnDef<ExperimentRun, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Run",
        cell: ({ row }) =>
          `${row.original.name}${row.original.canonical ? " · canonical" : ""}`,
      },
      {
        id: "experiment",
        header: "Experiment",
        accessorFn: (run) =>
          data.experiments.find((item) => item.id === run.experimentId)?.name ??
          run.experimentId,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge tone={toneForStatus(row.original.status)}>
            {row.original.status}
          </Badge>
        ),
      },
      { accessorKey: "duration", header: "Duration" },
      { accessorKey: "codeVersion", header: "Code" },
      { accessorKey: "environment", header: "Environment" },
      {
        accessorKey: "reproducibility",
        header: "Reproducibility",
        cell: ({ row }) => (
          <Badge tone={toneForStatus(row.original.reproducibility)}>
            {row.original.reproducibility}
          </Badge>
        ),
      },
    ],
    [data.experiments],
  );

  const create = async () => {
    if (!name.trim()) return;
    try {
      const experiment = await projectServices.experiments.create({
        name: name.trim(),
        goal: goal.trim() || "Define research goal",
        hypothesis: hypothesis.trim() || undefined,
        type,
      });
      setCreateOpen(false);
      setName("");
      setGoal("");
      setHypothesis("");
      setSelected(experiment.id);
      notify(
        "Experiment created",
        "The planned experiment is available across claims, graph, and next steps.",
      );
    } catch (error) {
      notify(
        "Experiment was not saved",
        error instanceof Error
          ? error.message
          : "Unable to save the experiment.",
      );
    }
  };

  const runGuidedAnalysis = async () => {
    if (
      !analysisDataset.trim() ||
      !analysisOutcome.trim() ||
      !analysisSeed.trim() ||
      !analysisFolds.trim() ||
      !analysisFeatures.trim()
    )
      return;
    setAnalysisRunning(true);
    try {
      setAnalysisStage("Building the fasting adult cohort…");
      await new Promise((resolve) => window.setTimeout(resolve, 900));
      setAnalysisStage("Running five-fold cross-validation…");
      await new Promise((resolve) => window.setTimeout(resolve, 1_100));
      setAnalysisStage("Verifying metrics and provenance…");
      await new Promise((resolve) => window.setTimeout(resolve, 900));
      await finishGuidedLdlAnalysis();
      setCompareIds(["run-03", "run-04"]);
      setView("Compare");
      setAnalysisOpen(false);
      notify(
        "Analysis complete",
        "The verified NHANES run, metrics, artifacts, claims, and provenance are now linked.",
      );
    } finally {
      setAnalysisRunning(false);
      setAnalysisStage("");
    }
  };

  const openAnalysis = () => {
    setLocalAnalysisError("");
    setLocalResult(null);
    setLocalRunId(null);
    setAnalysisOpen(true);
  };

  const importLocalDataset = async (file: File | undefined) => {
    if (!file) return;
    setLocalAnalysisError("");
    setLocalResult(null);
    setLocalRunId(null);
    if (file.size > 20_000_000) {
      setLocalDataset(null);
      setLocalAnalysisError(
        "The open beta supports dataset files up to 20 MB.",
      );
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseDelimitedDataset(text, file.name);
      const hash = await sha256Hex(text);
      const outcomeCandidate = parsed.columns.at(-1)?.name ?? "";
      const predictors = parsed.columns
        .filter(
          (column) =>
            column.kind === "numeric" && column.name !== outcomeCandidate,
        )
        .slice(0, 12)
        .map((column) => column.name);
      setLocalDataset(parsed);
      setLocalDatasetText(text);
      setLocalDatasetHash(hash);
      setLocalOutcome(outcomeCandidate);
      setLocalPredictors(predictors);
    } catch (error) {
      setLocalDataset(null);
      setLocalDatasetText("");
      setLocalDatasetHash("");
      setLocalAnalysisError(
        error instanceof Error
          ? error.message
          : "The dataset could not be read.",
      );
    }
  };

  const runConfiguredAnalysis = async () => {
    if (
      !selectedExperiment ||
      !localDataset ||
      !localDatasetText ||
      !localDatasetHash ||
      !localOutcome ||
      !localPredictors.length
    )
      return;
    setAnalysisRunning(true);
    setLocalAnalysisError("");
    try {
      setAnalysisStage("Validating rows and building deterministic folds…");
      await new Promise((resolve) => window.setTimeout(resolve, 50));
      const result = runLocalAnalysis({
        dataset: localDataset,
        outcome: localOutcome,
        predictors: localPredictors,
        task: localTask,
        folds: Number(localFolds),
        seed: Number(localSeed),
      });
      setAnalysisStage(
        "Saving metrics, provenance, result artifact, and claim…",
      );
      const source = await projectServices.sources.create({
        title: localDataset.fileName,
        type: "Dataset",
        authors: "Local dataset import",
        year: new Date().getFullYear(),
        summary: `${localDataset.rowCount} rows · ${localDataset.columns.length} columns · SHA-256 ${localDatasetHash}. Imported locally for ${result.task}.`,
      });
      const recorded = await projectServices.experiments.recordLocalAnalysis({
        experimentId: selectedExperiment.id,
        datasetSourceId: source.id,
        datasetFileName: localDataset.fileName,
        datasetHash: localDatasetHash,
        result,
      });
      setLocalResult(result);
      setLocalRunId(recorded.runId);
      notify(
        "Local analysis complete",
        "Computed metrics, dataset checksum, provenance, result artifact, and a reviewable claim were saved locally.",
      );
    } catch (error) {
      setLocalAnalysisError(
        error instanceof Error ? error.message : "The local analysis failed.",
      );
    } finally {
      setAnalysisRunning(false);
      setAnalysisStage("");
    }
  };

  return (
    <div className="cly-page cly-page-wide cly-route-experiments">
      <PageHeader
        kicker="Research"
        title="Experiment Manager"
        description="Compare experiments, runs, evidence, and reproducibility."
        actions={
          <>
            <Segmented
              value={view}
              options={experimentViews}
              onChange={setView}
              label="Experiment view"
            />
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus size={13} /> New experiment
            </Button>
            {data.experiments.length ? (
              <Button
                data-testid={
                  guidedAnalysis ? "run-guided-analysis" : "run-local-analysis"
                }
                disabled={guidedAnalysis && !data.sources.length}
                onClick={openAnalysis}
              >
                <Play size={13} /> Run analysis
              </Button>
            ) : null}
          </>
        }
      />
      <div className="cly-visual-metrics">
        <VisualMetric
          label="Experiments"
          value={data.experiments.length}
          detail="Across 10 research types"
          values={data.experiments.map((item) => item.runIds.length)}
        />
        <VisualMetric
          label="Runs"
          value={data.runs.length}
          detail={`${data.runs.filter((item) => item.status === "Running").length} currently running`}
          values={data.runs.map((item) =>
            item.status === "Complete"
              ? 100
              : item.status === "Running"
                ? 68
                : item.status === "Queued"
                  ? 18
                  : 0,
          )}
        />
        <VisualMetric
          label={aucValues.length ? "Model AUC" : "Coverage trend"}
          value={`${Math.round(
            (canonicalAuc ??
              data.runs
                .map((item) => item.metrics.coverage)
                .filter((value): value is number => typeof value === "number")
                .at(-1) ??
              0) * 100,
          )}%`}
          detail={
            aucValues.length
              ? "Canonical five-fold result"
              : "Across comparable runs"
          }
          values={
            aucValues.length
              ? aucValues.map((value) => value * 100)
              : data.runs
                  .map((item) => item.metrics.coverage)
                  .filter((value): value is number => typeof value === "number")
                  .map((value) => value * 100)
          }
          tone="success"
        />
        <VisualMetric
          label="Failed"
          value={data.runs.filter((item) => item.status === "Failed").length}
          detail="Require follow-up"
          values={data.runs.map((item) => (item.status === "Failed" ? 1 : 0))}
          tone="danger"
        />
      </div>

      <div className="cly-section">
        <div className="cly-filterbar">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search experiments and goals…"
          />
          <select
            className="cly-select"
            style={{ width: 125 }}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            aria-label="Filter experiment status"
          >
            <option>All</option>
            <option>Complete</option>
            <option>Running</option>
            <option>Failed</option>
            <option>Planned</option>
          </select>
          {view === "Compare" ? (
            <Button
              disabled={compareRuns.length < 2}
              title={
                compareRuns.length < 2
                  ? "Select at least two runs to create a comparison report."
                  : undefined
              }
              onClick={downloadComparisonReport}
            >
              <Sparkles size={13} /> Generate comparison report
            </Button>
          ) : null}
        </div>

        {data.experiments.length === 0 ? (
          <EmptyState
            title="No experiments yet"
            description="Create a simulation, benchmark, analysis, or reproduction attempt."
            action={
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                New experiment
              </Button>
            }
          />
        ) : null}

        {view === "Experiments" && data.experiments.length ? (
          <ClyDataTable
            id="experiments"
            data={experiments}
            columns={experimentColumns}
            getRowId={(row) => row.id}
            selectedId={selectedId}
            onSelect={(row) => setSelected(row.id)}
          />
        ) : null}

        {view === "Runs" ? (
          <ClyDataTable
            id="experiment-runs"
            data={data.runs}
            columns={runColumns}
            getRowId={(row) => row.id}
            selectedId={selectedId}
            onSelect={(row) => setSelected(row.id)}
          />
        ) : null}

        {view === "Compare" ? (
          <div className="cly-grid-3">
            <Panel className="cly-panel-body">
              <div className="cly-inspector-label">Comparison selection</div>
              {data.runs.slice(0, 12).map((run) => (
                <label
                  className="cly-row-between"
                  style={{
                    padding: "7px 0",
                    borderBottom: "1px solid var(--cly-border-subtle)",
                  }}
                  key={run.id}
                >
                  <span className="cly-small">{run.name}</span>
                  <input
                    className="cly-checkbox"
                    type="checkbox"
                    checked={compareIds.includes(run.id)}
                    onChange={(event) =>
                      setCompareIds((current) =>
                        event.target.checked
                          ? [...current, run.id].slice(-3)
                          : current.filter((id) => id !== run.id),
                      )
                    }
                  />
                </label>
              ))}
            </Panel>
            {compareRuns.map((run) =>
              run ? (
                <Panel key={run.id}>
                  <div className="cly-panel-header">
                    <div>
                      <strong>{run.name}</strong>
                      <div className="cly-muted cly-small">
                        {
                          data.experiments.find(
                            (item) => item.id === run.experimentId,
                          )?.name
                        }
                      </div>
                    </div>
                    <Badge tone={toneForStatus(run.reproducibility)}>
                      {run.reproducibility}
                    </Badge>
                  </div>
                  <div className="cly-panel-body cly-stack">
                    <div className="cly-inspector-label">Metrics</div>
                    {Object.entries(run.metrics).map(([key, value]) => (
                      <div className="cly-row-between" key={key}>
                        <span className="cly-muted cly-small">{key}</span>
                        <strong>{value}</strong>
                      </div>
                    ))}
                    <div className="cly-divider" />
                    <div className="cly-inspector-label">Configuration</div>
                    {Object.entries(run.config).map(([key, value]) => (
                      <div className="cly-row-between" key={key}>
                        <span className="cly-muted cly-small">{key}</span>
                        <span className="cly-mono cly-small">
                          {String(value)}
                        </span>
                      </div>
                    ))}
                    <div
                      className="cly-callout"
                      data-tone={run.canonical ? undefined : "warning"}
                    >
                      {run.canonical
                        ? "Canonical evidence run"
                        : "Reviewer concern: configuration is not canonical."}
                    </div>
                  </div>
                </Panel>
              ) : null,
            )}
          </div>
        ) : null}

        {view === "Timeline" ? (
          <Panel className="cly-panel-body">
            <div className="cly-timeline">
              {data.runs.slice(0, 40).map((run) => (
                <button
                  type="button"
                  className="cly-timeline-item"
                  style={{
                    border: 0,
                    background: "transparent",
                    color: "inherit",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                  key={run.id}
                  onClick={() => setSelected(run.id)}
                >
                  <span className="cly-timeline-dot" />
                  <span>
                    <span className="cly-row">
                      <strong>{run.name}</strong>
                      <Badge tone={toneForStatus(run.status)}>
                        {run.status}
                      </Badge>
                    </span>
                    <span className="cly-muted cly-small">
                      {run.startedAt} · {run.duration} · {run.environment}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </Panel>
        ) : null}

        {view === "Outputs" ? (
          <div className="cly-grid-3">
            {data.artifacts.slice(0, 100).map((artifact) => (
              <button
                type="button"
                className="cly-panel cly-interactive-panel"
                key={artifact.id}
                aria-label={`Open output ${artifact.name}`}
                onClick={() => setSelected(artifact.id)}
              >
                <div className="cly-preview" style={{ minHeight: 110 }}>
                  <FilePreview kind={artifact.kind} />
                </div>
                <div className="cly-panel-body">
                  <div className="cly-row-between">
                    <strong className="cly-small">{artifact.name}</strong>
                    <Badge tone={toneForStatus(artifact.regeneration)}>
                      {artifact.regeneration}
                    </Badge>
                  </div>
                  <p className="cly-muted cly-small cly-clamp-2">
                    {artifact.regeneration === "Stale"
                      ? artifact.staleReasons?.[0] || artifact.preview
                      : artifact.preview}
                  </p>
                </div>
              </button>
            ))}
          </div>
        ) : null}

        {view === "Preregistration" ? (
          <PreregistrationWorkspace experiment={selectedExperiment} />
        ) : null}
      </div>

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New experiment"
        description="Create a versioned experiment definition. Runs and outputs can attach reproducible lineage to it; remote execution remains unavailable in this version."
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!name.trim()}
              onClick={() => void create()}
            >
              Create experiment
            </Button>
          </>
        }
      >
        <div className="cly-stack">
          <div className="cly-field">
            <label htmlFor="experiment-name">Name</label>
            <input
              id="experiment-name"
              className="cly-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Compute-matched baseline"
            />
          </div>
          <div className="cly-field">
            <label htmlFor="experiment-goal">Research goal</label>
            <textarea
              id="experiment-goal"
              className="cly-textarea"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder="What question will this experiment answer?"
            />
          </div>
          <div className="cly-field">
            <label htmlFor="experiment-hypothesis">Hypothesis</label>
            <textarea
              id="experiment-hypothesis"
              className="cly-textarea"
              value={hypothesis}
              onChange={(event) => setHypothesis(event.target.value)}
              placeholder="What outcome do you expect, and why?"
            />
          </div>
          <div className="cly-field">
            <label htmlFor="experiment-type">Type</label>
            <select
              id="experiment-type"
              className="cly-select"
              value={type}
              onChange={(event) =>
                setType(event.target.value as ExperimentType)
              }
            >
              {[
                "Training run",
                "Simulation",
                "Statistical analysis",
                "Parameter sweep",
                "Benchmark",
                "Reproduction attempt",
                "Notebook analysis",
                "Data pipeline",
                "Ablation",
                "Custom",
              ].map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>
      </Dialog>
      <Dialog
        open={analysisOpen && guidedAnalysis}
        onClose={() => {
          if (!analysisRunning) setAnalysisOpen(false);
        }}
        title="Run LDL-C discordance analysis"
        description="Replay the checked-in NHANES pipeline with an explicit dataset, target definition, seed, folds, and feature set."
        footer={
          <>
            <Button
              disabled={analysisRunning}
              onClick={() => setAnalysisOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={
                analysisRunning ||
                !analysisDataset.trim() ||
                !analysisOutcome.trim() ||
                !analysisSeed.trim() ||
                !analysisFolds.trim() ||
                !analysisFeatures.trim()
              }
              onClick={() => void runGuidedAnalysis()}
            >
              {analysisRunning ? (
                <>
                  <LoaderCircle className="animate-spin" size={13} /> Running…
                </>
              ) : (
                <>
                  <Play size={13} /> Run verified analysis
                </>
              )}
            </Button>
          </>
        }
      >
        <div className="cly-stack">
          <div className="cly-field">
            <label htmlFor="guided-analysis-dataset">Dataset</label>
            <input
              autoFocus
              className="cly-input"
              id="guided-analysis-dataset"
              value={analysisDataset}
              onChange={(event) => setAnalysisDataset(event.target.value)}
              placeholder="NHANES 2005–2006 fasting sample"
            />
          </div>
          <div className="cly-field">
            <label htmlFor="guided-analysis-outcome">Outcome definition</label>
            <textarea
              className="cly-textarea"
              id="guided-analysis-outcome"
              rows={2}
              value={analysisOutcome}
              onChange={(event) => setAnalysisOutcome(event.target.value)}
              placeholder="ApoB percentile ≥ LDL-C percentile + 20"
            />
          </div>
          <div className="cly-grid-2">
            <div className="cly-field">
              <label htmlFor="guided-analysis-seed">Random seed</label>
              <input
                className="cly-input"
                id="guided-analysis-seed"
                inputMode="numeric"
                value={analysisSeed}
                onChange={(event) => setAnalysisSeed(event.target.value)}
                placeholder="20260722"
              />
            </div>
            <div className="cly-field">
              <label htmlFor="guided-analysis-folds">
                Cross-validation folds
              </label>
              <input
                className="cly-input"
                id="guided-analysis-folds"
                inputMode="numeric"
                value={analysisFolds}
                onChange={(event) => setAnalysisFolds(event.target.value)}
                placeholder="5"
              />
            </div>
          </div>
          <div className="cly-field">
            <label htmlFor="guided-analysis-features">
              Basic health features
            </label>
            <textarea
              className="cly-textarea"
              id="guided-analysis-features"
              rows={2}
              value={analysisFeatures}
              onChange={(event) => setAnalysisFeatures(event.target.value)}
              placeholder="Age, sex, race/ethnicity, BMI, blood pressure, HDL-C, triglycerides"
            />
          </div>
          {analysisStage ? (
            <div className="cly-callout" role="status">
              <LoaderCircle className="animate-spin" size={13} />
              {analysisStage}
            </div>
          ) : (
            <div className="cly-callout">
              Demo execution uses the reproducible checked-in analysis output;
              no model provider or external network request is made.
            </div>
          )}
        </div>
      </Dialog>
      <Dialog
        open={analysisOpen && !guidedAnalysis}
        onClose={() => {
          if (!analysisRunning) setAnalysisOpen(false);
        }}
        wide
        title="Run local dataset analysis"
        description="Import a numeric CSV or TSV, map an outcome and predictors, and save a real cross-validated result without sending data off-device."
        footer={
          localResult ? (
            <>
              <Button onClick={() => setAnalysisOpen(false)}>Close</Button>
              <Button
                variant="primary"
                onClick={() => {
                  setAnalysisOpen(false);
                  setView("Runs");
                  setSelected(localRunId);
                }}
              >
                Review saved run <ArrowRight size={13} />
              </Button>
            </>
          ) : (
            <>
              <Button
                disabled={analysisRunning}
                onClick={() => setAnalysisOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={
                  analysisRunning ||
                  !localDataset ||
                  !localOutcome ||
                  !localPredictors.length ||
                  !Number.isInteger(Number(localSeed)) ||
                  !Number.isInteger(Number(localFolds)) ||
                  Number(localFolds) < 2 ||
                  Number(localFolds) > 10
                }
                onClick={() => void runConfiguredAnalysis()}
                data-testid="execute-local-analysis"
              >
                {analysisRunning ? (
                  <>
                    <LoaderCircle className="animate-spin" size={13} /> Running…
                  </>
                ) : (
                  <>
                    <Play size={13} /> Compute and save result
                  </>
                )}
              </Button>
            </>
          )
        }
      >
        {localResult ? (
          <div className="cly-stack" data-testid="local-analysis-result">
            <div className="cly-callout" data-tone="success">
              <Check size={14} />
              <span>
                <strong>Computed locally and saved.</strong>{" "}
                {localResult.conclusion}
              </span>
            </div>
            <div className="cly-analysis-result-grid">
              <Panel className="cly-panel-body">
                <div className="cly-inspector-label">
                  Cross-validation metrics
                </div>
                {Object.entries(localResult.metrics).map(([name, value]) => (
                  <div className="cly-row-between" key={name}>
                    <span className="cly-muted cly-small">{name}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </Panel>
              <Panel className="cly-panel-body">
                <div className="cly-inspector-label">
                  Standardized coefficients
                </div>
                {localResult.coefficients.slice(0, 8).map((coefficient) => (
                  <div className="cly-row-between" key={coefficient.feature}>
                    <span className="cly-small">{coefficient.feature}</span>
                    <span className="cly-mono cly-small">
                      {coefficient.value}
                    </span>
                  </div>
                ))}
              </Panel>
            </div>
            <div className="cly-analysis-warning-list">
              <div className="cly-inspector-label">
                Required interpretation limits
              </div>
              {localResult.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          </div>
        ) : (
          <div className="cly-stack">
            <div className="cly-callout" data-tone="warning">
              Use de-identified, non-regulated data only. Cly reads this file in
              the local renderer and records its checksum; the raw rows are not
              copied into the project database.
            </div>
            <div className="cly-field">
              <label htmlFor="local-analysis-file">Dataset file</label>
              <label className="cly-file-input" htmlFor="local-analysis-file">
                <Upload size={15} />
                <span>
                  {localDataset
                    ? localDataset.fileName
                    : "Choose a CSV, TSV, or delimited text file"}
                </span>
                <input
                  id="local-analysis-file"
                  data-testid="local-analysis-file"
                  type="file"
                  accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
                  onChange={(event) =>
                    void importLocalDataset(event.target.files?.[0])
                  }
                />
              </label>
              {localDataset ? (
                <div className="cly-inline-metadata">
                  <span>{localDataset.rowCount.toLocaleString()} rows</span>
                  <span>{localDataset.columns.length} columns</span>
                  <span>{localDatasetHash.slice(0, 12)}… SHA-256</span>
                </div>
              ) : null}
            </div>
            {localDataset ? (
              <>
                <div className="cly-grid-2">
                  <div className="cly-field">
                    <label htmlFor="local-analysis-outcome">
                      Outcome column
                    </label>
                    <select
                      id="local-analysis-outcome"
                      className="cly-select"
                      value={localOutcome}
                      onChange={(event) => {
                        const outcome = event.target.value;
                        setLocalOutcome(outcome);
                        setLocalPredictors((current) =>
                          current.filter((predictor) => predictor !== outcome),
                        );
                      }}
                    >
                      {localDataset.columns.map((column) => (
                        <option key={column.name} value={column.name}>
                          {column.name} · {column.kind} · {column.uniqueCount}{" "}
                          values
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="cly-field">
                    <label htmlFor="local-analysis-task">Analysis type</label>
                    <select
                      id="local-analysis-task"
                      className="cly-select"
                      value={localTask}
                      onChange={(event) =>
                        setLocalTask(event.target.value as AnalysisTask)
                      }
                    >
                      <option value="auto">Auto-detect</option>
                      <option value="classification">
                        Binary classification
                      </option>
                      <option value="regression">Numeric regression</option>
                    </select>
                  </div>
                </div>
                <fieldset className="cly-analysis-predictors">
                  <legend>Numeric predictors</legend>
                  <p>
                    Select variables available at prediction time. Do not
                    include downstream outcomes.
                  </p>
                  <div>
                    {localDataset.columns
                      .filter(
                        (column) =>
                          column.kind === "numeric" &&
                          column.name !== localOutcome,
                      )
                      .map((column) => (
                        <label key={column.name}>
                          <input
                            type="checkbox"
                            checked={localPredictors.includes(column.name)}
                            onChange={(event) =>
                              setLocalPredictors((current) =>
                                event.target.checked
                                  ? [...current, column.name]
                                  : current.filter(
                                      (predictor) => predictor !== column.name,
                                    ),
                              )
                            }
                          />
                          <span>{column.name}</span>
                          <small>
                            {Math.round(column.missingRate * 100)}% missing
                          </small>
                        </label>
                      ))}
                  </div>
                </fieldset>
                <div className="cly-grid-2">
                  <div className="cly-field">
                    <label htmlFor="local-analysis-seed">Random seed</label>
                    <input
                      id="local-analysis-seed"
                      className="cly-input"
                      inputMode="numeric"
                      value={localSeed}
                      onChange={(event) => setLocalSeed(event.target.value)}
                    />
                  </div>
                  <div className="cly-field">
                    <label htmlFor="local-analysis-folds">
                      Cross-validation folds
                    </label>
                    <input
                      id="local-analysis-folds"
                      className="cly-input"
                      inputMode="numeric"
                      value={localFolds}
                      onChange={(event) => setLocalFolds(event.target.value)}
                    />
                  </div>
                </div>
              </>
            ) : null}
            {analysisStage ? (
              <div className="cly-callout" role="status">
                <LoaderCircle className="animate-spin" size={13} />
                {analysisStage}
              </div>
            ) : null}
            {localAnalysisError ? (
              <div className="cly-callout" data-tone="danger" role="alert">
                {localAnalysisError}
              </div>
            ) : null}
          </div>
        )}
      </Dialog>
    </div>
  );
}

function FilePreview({ kind }: { kind: string }) {
  return (
    <div>
      <Beaker size={20} style={{ margin: "0 auto 8px" }} />
      <strong>{kind} preview</strong>
    </div>
  );
}

type GraphView = "Graph" | "Outline" | "Relationships" | "Evidence chain";
const graphViews = [
  "Graph",
  "Outline",
  "Relationships",
  "Evidence chain",
] as const;

export function GraphScreen() {
  const nodes = useClyStore((s) => s.data.graphNodes);
  const edges = useClyStore((s) => s.data.graphEdges);
  const selectedId = useClyStore((s) => s.selectedId);
  const setSelected = useClyStore((s) => s.setSelected);
  const notify = useClyStore((s) => s.notify);
  const lineageSuggestions = useClyStore((s) => s.lineageSuggestions);
  const lineageMeasurement = useClyStore((s) => s.lineageMeasurement);
  const scanLineage = useClyStore((s) => s.scanLineage);
  const reviewLineageSuggestions = useClyStore(
    (s) => s.reviewLineageSuggestions,
  );
  const [view, setView] = useState<GraphView>("Graph");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [hideLow, setHideLow] = useState(true);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<string[]>(
    [],
  );
  const [editingSuggestionId, setEditingSuggestionId] = useState<string | null>(
    null,
  );
  const [editedRationale, setEditedRationale] = useState("");
  const visibleNodes = useMemo(
    () =>
      nodes
        .filter(
          (node) =>
            (!query ||
              node.label.toLowerCase().includes(query.toLowerCase())) &&
            (typeFilter === "All" || node.type === typeFilter),
        )
        .slice(0, 60),
    [nodes, query, typeFilter],
  );
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = edges
    .filter(
      (edge) =>
        visibleNodeIds.has(edge.source) &&
        visibleNodeIds.has(edge.target) &&
        (!hideLow || (edge.confidence ?? 0) >= 0.7),
    )
    .slice(0, 120);
  const selectedNode = nodes.find((node) => node.id === selectedId);
  const flowNodes = useMemo<ClyFlowNode[]>(
    () =>
      visibleNodes.map((node, index) => ({
        id: node.id,
        type: "clyResearch",
        position: {
          x: nodes.length > 100 ? 30 + (index % 6) * 190 : node.x,
          y: nodes.length > 100 ? 24 + Math.floor(index / 6) * 90 : node.y,
        },
        selected: node.id === selectedId,
        data: { label: node.label, type: node.type, status: node.status },
      })),
    [nodes.length, selectedId, visibleNodes],
  );
  const flowEdges = useMemo(
    () =>
      visibleEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.relation,
        animated: !edge.approved,
        className: edge.approved ? "cly-flow-edge" : "cly-flow-edge suggested",
      })),
    [visibleEdges],
  );

  const createLink = async () => {
    if (nodes.length < 2) return;
    const source =
      selectedId && nodes.some((node) => node.id === selectedId)
        ? selectedId
        : nodes[0].id;
    const target = nodes.find((node) => node.id !== source)?.id;
    if (!target) return;
    try {
      const edge = await projectServices.graph.createRelationship({
        source,
        target,
        relation: "linked manually",
        confidence: null,
        approved: false,
      });
      notify("Relationship created", `${edge.source} → ${edge.target}`);
    } catch (error) {
      notify(
        "Relationship was not created",
        error instanceof Error
          ? error.message
          : "The relationship could not be saved.",
      );
    }
  };

  const runLineageScan = async () => {
    if (await scanLineage()) {
      setSelectedSuggestionIds([]);
      notify(
        "Lineage reconstruction completed",
        "Suggestions remain inferred until explicitly reviewed.",
      );
    }
  };

  const reviewSuggestions = async (
    action: "approve" | "reject",
    ids: string[],
  ) => {
    const pendingIds = ids.filter((id) =>
      lineageSuggestions.some(
        (suggestion) =>
          suggestion.id === id && suggestion.reviewState === "unreviewed",
      ),
    );
    if (!pendingIds.length) return;
    if (
      await reviewLineageSuggestions(pendingIds.map((id) => ({ action, id })))
    ) {
      setSelectedSuggestionIds((current) =>
        current.filter((id) => !pendingIds.includes(id)),
      );
      notify(
        action === "approve"
          ? "Lineage suggestions approved"
          : "Lineage suggestions rejected",
        `${pendingIds.length} reviewer decision${pendingIds.length === 1 ? "" : "s"} recorded.`,
      );
    }
  };

  const saveEditedSuggestion = async () => {
    if (!editingSuggestionId || !editedRationale.trim()) return;
    if (
      await reviewLineageSuggestions([
        {
          action: "edit",
          id: editingSuggestionId,
          edit: { rationale: editedRationale.trim() },
        },
      ])
    ) {
      setEditingSuggestionId(null);
      setEditedRationale("");
      notify(
        "Lineage suggestion corrected",
        "The explicit reviewer correction is recorded in provenance.",
      );
    }
  };

  return (
    <div className="cly-page cly-page-wide cly-route-graph">
      <PageHeader
        kicker="Research"
        title="Research Object Graph"
        description="Trace how research objects support one another."
        actions={
          <>
            <Segmented
              value={view}
              options={graphViews}
              onChange={setView}
              label="Graph view"
            />
            <Button
              disabled={nodes.length < 2}
              onClick={() => void createLink()}
            >
              <Link2 size={13} /> New relationship
            </Button>
            <ClyMenu
              label="Graph actions"
              trigger={
                <Button
                  iconOnly
                  variant="ghost"
                  aria-label="More graph actions"
                >
                  <MoreHorizontal size={13} />
                </Button>
              }
              items={[
                {
                  id: "fit",
                  label: "Fit graph to view",
                  onSelect: () => notify("Graph fitted to view"),
                },
                {
                  id: "export",
                  label: "Export relationship summary",
                  onSelect: () => notify("Relationship summary prepared"),
                },
              ]}
            />
          </>
        }
      />
      <Panel
        className="cly-panel-body"
        data-testid="lineage-reconstruction-panel"
      >
        <div className="cly-row-between" style={{ gap: 12 }}>
          <div>
            <div className="cly-inspector-label">
              Retrospective lineage reconstruction
            </div>
            <p className="cly-muted cly-small" style={{ margin: "4px 0 0" }}>
              Scan the registered project for inferred objective-to-claim
              chains. Nothing is verified until a reviewer decides.
            </p>
          </div>
          <Button onClick={() => void runLineageScan()}>
            <Sparkles size={13} /> Reconstruct lineage
          </Button>
        </div>
        {lineageMeasurement ? (
          <div
            className="cly-row cly-small cly-muted"
            style={{ marginTop: 10 }}
          >
            Last scan {lineageMeasurement.scanDurationMs}ms
            {lineageMeasurement.timeToFirstChainMs !== null
              ? ` · first chain ${lineageMeasurement.timeToFirstChainMs}ms`
              : " · no complete chain"}
            {` · accepted ${lineageMeasurement.acceptedCount} · corrections ${lineageMeasurement.correctionCount}`}
            {typeof lineageMeasurement.manualConfig
              .projectContextSuggestionCount === "number" &&
            lineageMeasurement.manualConfig.projectContextSuggestionCount > 0
              ? ` · ${lineageMeasurement.manualConfig.projectContextSuggestionCount} metadata-free`
              : ""}
          </div>
        ) : null}
        {lineageSuggestions.length ? (
          <div className="cly-stack" style={{ marginTop: 12 }}>
            <div className="cly-row-between">
              <label className="cly-row cly-small">
                <input
                  className="cly-checkbox"
                  type="checkbox"
                  checked={
                    lineageSuggestions.filter(
                      (suggestion) => suggestion.reviewState === "unreviewed",
                    ).length > 0 &&
                    lineageSuggestions
                      .filter(
                        (suggestion) => suggestion.reviewState === "unreviewed",
                      )
                      .every((suggestion) =>
                        selectedSuggestionIds.includes(suggestion.id),
                      )
                  }
                  onChange={(event) =>
                    setSelectedSuggestionIds(
                      event.target.checked
                        ? lineageSuggestions
                            .filter(
                              (suggestion) =>
                                suggestion.reviewState === "unreviewed",
                            )
                            .map((suggestion) => suggestion.id)
                        : [],
                    )
                  }
                />
                Select unreviewed
              </label>
              <div className="cly-row">
                <Button
                  disabled={!selectedSuggestionIds.length}
                  onClick={() =>
                    void reviewSuggestions("approve", selectedSuggestionIds)
                  }
                >
                  <Check size={13} /> Approve selected
                </Button>
                <Button
                  disabled={!selectedSuggestionIds.length}
                  onClick={() =>
                    void reviewSuggestions("reject", selectedSuggestionIds)
                  }
                >
                  <X size={13} /> Reject selected
                </Button>
              </div>
            </div>
            {lineageSuggestions.map((suggestion) => (
              <div
                className="cly-callout"
                data-tone={
                  suggestion.reviewState === "rejected" ? "warning" : undefined
                }
                key={suggestion.id}
              >
                <div
                  className="cly-row-between"
                  style={{ alignItems: "flex-start", gap: 12 }}
                >
                  <label
                    className="cly-row"
                    style={{ alignItems: "flex-start" }}
                  >
                    <input
                      aria-label={`Select lineage suggestion ${suggestion.id}`}
                      className="cly-checkbox"
                      disabled={suggestion.reviewState !== "unreviewed"}
                      type="checkbox"
                      checked={selectedSuggestionIds.includes(suggestion.id)}
                      onChange={(event) =>
                        setSelectedSuggestionIds((current) =>
                          event.target.checked
                            ? [...current, suggestion.id]
                            : current.filter((id) => id !== suggestion.id),
                        )
                      }
                    />
                    <span>
                      <strong>
                        {suggestion.chain.map((step) => step.label).join(" → ")}
                      </strong>
                      <span
                        className="cly-muted cly-small"
                        style={{ display: "block", marginTop: 4 }}
                      >
                        {Math.round(suggestion.confidence * 100)}% confidence ·
                        inferred · {suggestion.reviewState}
                      </span>
                    </span>
                  </label>
                  {suggestion.reviewState === "unreviewed" ? (
                    <div className="cly-row">
                      <Button
                        onClick={() =>
                          void reviewSuggestions("approve", [suggestion.id])
                        }
                      >
                        Approve
                      </Button>
                      <Button
                        onClick={() => {
                          setEditingSuggestionId(suggestion.id);
                          setEditedRationale(suggestion.rationale);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        onClick={() =>
                          void reviewSuggestions("reject", [suggestion.id])
                        }
                      >
                        Reject
                      </Button>
                    </div>
                  ) : (
                    <Badge
                      tone={
                        suggestion.reviewState === "approved"
                          ? "success"
                          : "warning"
                      }
                    >
                      {suggestion.reviewState}
                    </Badge>
                  )}
                </div>
                <p className="cly-muted cly-small" style={{ margin: "8px 0" }}>
                  {suggestion.rationale}
                </p>
                <details>
                  <summary className="cly-small">
                    Inspect {suggestion.evidence.length} evidence coordinates
                  </summary>
                  <div className="cly-stack" style={{ marginTop: 8 }}>
                    {suggestion.evidence.map((evidence) => (
                      <div
                        className="cly-row-between cly-small"
                        key={evidence.id}
                      >
                        <span>{evidence.evidenceType}</span>
                        <span className="cly-mono">
                          {evidence.path ??
                            JSON.stringify(evidence.coordinates)}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            ))}
          </div>
        ) : (
          <p className="cly-muted cly-small" style={{ margin: "12px 0 0" }}>
            No saved reconstruction suggestions. Run a bounded local scan to
            inspect candidate chains.
          </p>
        )}
      </Panel>
      {nodes.length === 0 ? (
        <EmptyState
          title="The research graph is empty"
          description="Add claims, sources, or experiments to build an evidence trail."
          action={<Button variant="primary">Create research question</Button>}
        />
      ) : (
        <>
          <div className="cly-filterbar">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search graph objects…"
            />
            <select
              className="cly-select"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              style={{ width: 140 }}
              aria-label="Filter node type"
            >
              <option>All</option>
              {Array.from(new Set(nodes.map((node) => node.type))).map(
                (type) => (
                  <option key={type}>{type}</option>
                ),
              )}
            </select>
            <label className="cly-row cly-small cly-muted">
              <input
                type="checkbox"
                className="cly-checkbox"
                checked={hideLow}
                onChange={(event) => setHideLow(event.target.checked)}
              />{" "}
              Hide low confidence
            </label>
            <span className="cly-faint cly-small">
              {nodes.length.toLocaleString()} nodes ·{" "}
              {edges.length.toLocaleString()} relationships · rendering{" "}
              {visibleNodes.length}
            </span>
          </div>

          {view === "Graph" ? (
            <div className="cly-graph-wrap">
              <div className="cly-graph-canvas">
                <ReactFlow
                  nodes={flowNodes}
                  edges={flowEdges}
                  nodeTypes={clyNodeTypes}
                  fitView
                  minZoom={0.25}
                  maxZoom={1.8}
                  nodesDraggable={false}
                  nodesConnectable={false}
                  onNodeClick={(_, node) => setSelected(node.id)}
                  aria-label="Research object relationship graph"
                >
                  <Background gap={22} size={1} />
                  <Controls showInteractive={false} />
                  {flowNodes.length > 18 ? <MiniMap pannable zoomable /> : null}
                </ReactFlow>
              </div>
              <aside className="cly-graph-tools">
                <div className="cly-inspector-label">Trace paths</div>
                <div className="cly-stack">
                  <Button
                    disabled={!selectedNode}
                    onClick={() =>
                      notify(
                        "Evidence path traced",
                        selectedNode
                          ? `Showing evidence supporting ${selectedNode.label}.`
                          : undefined,
                      )
                    }
                  >
                    <Check size={13} /> Evidence
                  </Button>
                  <Button
                    disabled={!selectedNode}
                    onClick={() =>
                      notify(
                        "Provenance path traced",
                        selectedNode
                          ? `Showing generating inputs for ${selectedNode.label}.`
                          : undefined,
                      )
                    }
                  >
                    <GitBranch size={13} /> Provenance
                  </Button>
                  <Button
                    disabled={!selectedNode}
                    onClick={() =>
                      notify(
                        "Contradiction path traced",
                        selectedNode
                          ? `Showing conflicting evidence around ${selectedNode.label}.`
                          : undefined,
                      )
                    }
                  >
                    <X size={13} /> Contradictions
                  </Button>
                  <Button
                    disabled={!selectedNode}
                    onClick={() =>
                      notify("Neighborhood focused", selectedNode?.label)
                    }
                  >
                    <Filter size={13} /> Neighborhood
                  </Button>
                </div>
                <div className="cly-inspector-section">
                  <div className="cly-inspector-label">Link semantics</div>
                  {[
                    "Confirmed",
                    "Suggested",
                    "Uncertain",
                    "Stale",
                    "Broken",
                  ].map((status) => (
                    <div
                      className="cly-row-between"
                      style={{ marginBottom: 7 }}
                      key={status}
                    >
                      <span className="cly-small">{status}</span>
                      <Badge tone={toneForStatus(status)}>
                        {nodes.filter((node) => node.status === status).length}
                      </Badge>
                    </div>
                  ))}
                </div>
              </aside>
            </div>
          ) : null}

          {view === "Outline" ? (
            <Panel>
              {visibleNodes.map((node) => (
                <button
                  className="cly-list-row"
                  type="button"
                  key={node.id}
                  onClick={() => setSelected(node.id)}
                >
                  <div>
                    <div className="cly-row">
                      <Badge>{node.type}</Badge>
                      <strong>{node.label}</strong>
                    </div>
                    <div className="cly-list-detail">
                      {
                        edges.filter(
                          (edge) =>
                            edge.source === node.id || edge.target === node.id,
                        ).length
                      }{" "}
                      direct relationships
                    </div>
                  </div>
                  <ChevronRight size={13} />
                </button>
              ))}
            </Panel>
          ) : null}

          {view === "Relationships" ? (
            <div className="cly-table-wrap">
              <table className="cly-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Relationship</th>
                    <th>Target</th>
                    <th>Confidence</th>
                    <th>Approval</th>
                  </tr>
                </thead>
                <tbody>
                  {edges.slice(0, 300).map((edge) => (
                    <tr key={edge.id}>
                      <td>
                        {nodes.find((node) => node.id === edge.source)?.label ??
                          edge.source}
                      </td>
                      <td>{edge.relation}</td>
                      <td>
                        {nodes.find((node) => node.id === edge.target)?.label ??
                          edge.target}
                      </td>
                      <td>
                        {edge.confidence === null
                          ? "Unrated"
                          : `${Math.round(edge.confidence * 100)}%`}
                      </td>
                      <td>
                        {edge.approved ? (
                          <Badge tone="success">Approved</Badge>
                        ) : (
                          <Button
                            onClick={() =>
                              void projectServices.graph.approveRelationship(
                                edge.id,
                              )
                            }
                          >
                            Approve
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {view === "Evidence chain" ? (
            <Panel className="cly-panel-body">
              <div className="cly-page-kicker">
                Primary claim · evidence chain
              </div>
              <div className="cly-evidence-chain">
                {[
                  "Source data",
                  "Experiment",
                  "Canonical run",
                  "Notebook",
                  "Figure 2",
                  "Primary claim",
                  "Decision",
                ].map((label, index) => (
                  <span style={{ display: "contents" }} key={label}>
                    <button
                      type="button"
                      className="cly-chain-node"
                      onClick={() => notify("Evidence object selected", label)}
                    >
                      <strong>{label}</strong>
                      <div className="cly-muted" style={{ marginTop: 3 }}>
                        {index < 5 ? "Confirmed link" : "Research conclusion"}
                      </div>
                    </button>
                    {index < 6 ? (
                      <ArrowRight className="cly-chain-arrow" size={13} />
                    ) : null}
                  </span>
                ))}
              </div>
              <div className="cly-callout" style={{ marginTop: 14 }}>
                The chain is complete, but the cost-normalized baseline remains
                a linked weakening source and required follow-up.
              </div>
            </Panel>
          ) : null}
        </>
      )}
      <Dialog
        open={editingSuggestionId !== null}
        onClose={() => setEditingSuggestionId(null)}
        title="Correct lineage suggestion"
        description="Saving this correction explicitly approves the edited inference and records reviewer provenance."
        footer={
          <>
            <Button onClick={() => setEditingSuggestionId(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!editedRationale.trim()}
              onClick={() => void saveEditedSuggestion()}
            >
              Save correction
            </Button>
          </>
        }
      >
        <div className="cly-field">
          <label htmlFor="lineage-rationale">Reviewer rationale</label>
          <textarea
            autoFocus
            className="cly-textarea"
            id="lineage-rationale"
            value={editedRationale}
            onChange={(event) => setEditedRationale(event.target.value)}
          />
        </div>
      </Dialog>
    </div>
  );
}
