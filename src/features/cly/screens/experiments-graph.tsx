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
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Code2,
  Eye,
  FileOutput,
  FileText,
  Filter,
  GitBranch,
  Image,
  Link2,
  ListFilter,
  MoreHorizontal,
  Network,
  PanelRightOpen,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  PageHeader,
  SearchInput,
  Segmented,
  toneForStatus,
} from "../components/primitives";
import { ClyDataTable, ClyMenu } from "../components/toolkit";
import { Sparkline } from "../components/visuals";
import type {
  Experiment,
  ExperimentRun,
  ExperimentType,
  GraphNode,
} from "../domain/types";
import { mockServices } from "../services/mock-services";
import { useClyStore } from "../store/cly-store";
import "../redesign-core.css";

type ExperimentView =
  | "Experiments"
  | "Runs"
  | "Compare"
  | "Timeline"
  | "Outputs";
const experimentViews = [
  "Experiments",
  "Runs",
  "Compare",
  "Timeline",
  "Outputs",
] as const;

type ClyFlowNode = Node<
  {
    label: string;
    type: GraphNode["type"];
    status: string;
    recent: boolean;
  },
  "clyResearch"
>;

function ResearchTypeIcon({
  type,
  size = 13,
}: {
  type: GraphNode["type"];
  size?: number;
}) {
  if (type === "question") return <CircleHelp size={size} />;
  if (type === "source" || type === "dataset") return <BookOpen size={size} />;
  if (type === "experiment" || type === "run" || type === "method")
    return <Beaker size={size} />;
  if (type === "claim" || type === "hypothesis")
    return <CheckCircle2 size={size} />;
  if (type === "figure" || type === "table") return <Image size={size} />;
  if (type === "code" || type === "notebook") return <Code2 size={size} />;
  if (type === "decision") return <Target size={size} />;
  return <FileText size={size} />;
}

function ClyResearchNode({ data, selected }: NodeProps<ClyFlowNode>) {
  return (
    <div
      className="cly-core-flow-node"
      data-selected={selected}
      data-status={data.status}
      data-type={data.type}
      data-recent={data.recent}
    >
      <Handle type="target" position={Position.Left} />
      <span className="cly-core-flow-icon">
        <ResearchTypeIcon type={data.type} />
      </span>
      <span>
        <small>{data.type}</small>
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
  const inspectorOpen = useClyStore((s) => s.inspectorOpen);
  const toggleInspector = useClyStore((s) => s.toggleInspector);
  const [view, setView] = useState<ExperimentView>("Experiments");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [claimFilter, setClaimFilter] = useState("All");
  const [experimentTypeFilter, setExperimentTypeFilter] = useState("All");
  const [compareIds, setCompareIds] = useState<string[]>(["run-01", "run-02"]);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [type, setType] = useState<ExperimentType>("Simulation");
  const experiments = data.experiments.filter(
    (item) =>
      (!query ||
        `${item.name} ${item.goal} ${item.type}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (filter === "All" || item.status === filter) &&
      (claimFilter === "All" || item.claimIds.includes(claimFilter)) &&
      (experimentTypeFilter === "All" || item.type === experimentTypeFilter),
  );
  const selectedRun = data.runs.find((run) => run.id === selectedId);
  const selectedExperiment =
    data.experiments.find((item) => item.id === selectedId) ??
    data.experiments.find((item) => item.id === selectedRun?.experimentId) ??
    experiments[0] ??
    data.experiments[0] ??
    null;
  const selectedRuns = selectedExperiment
    ? data.runs.filter((run) => run.experimentId === selectedExperiment.id)
    : [];
  const canonicalRun =
    selectedRuns.find((run) => run.canonical) ?? selectedRuns[0] ?? null;
  const compareRuns = compareIds
    .map((id) => data.runs.find((item) => item.id === id))
    .filter((item): item is ExperimentRun => Boolean(item));
  const experimentColumns = useMemo<ColumnDef<Experiment, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Experiment",
        cell: ({ row }) => (
          <div className="cly-core-experiment-name">
            <strong>{row.original.name}</strong>
            <small>{row.original.goal}</small>
          </div>
        ),
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
      {
        id: "metric",
        header: "Primary metric",
        accessorFn: (experiment) => {
          const runs = data.runs.filter(
            (run) => run.experimentId === experiment.id,
          );
          const values = runs.flatMap((run) => Object.values(run.metrics));
          return values.length ? values[0] : null;
        },
        cell: ({ row }) => {
          const runs = data.runs.filter(
            (run) => run.experimentId === row.original.id,
          );
          const values = runs.flatMap((run) => Object.values(run.metrics));
          return values.length ? (
            <span className="cly-core-table-metric">
              <strong>{formatMetric(values[0])}</strong>
              <Sparkline
                values={values}
                label={`${row.original.name} primary metric`}
                tone="success"
              />
            </span>
          ) : (
            <span className="cly-faint">—</span>
          );
        },
      },
      {
        id: "claim",
        header: "Linked claim",
        accessorFn: (row) => row.claimIds[0] ?? "—",
        cell: ({ row }) => (
          <span className="cly-mono">{row.original.claimIds[0] ?? "—"}</span>
        ),
      },
      { id: "runs", header: "Runs", accessorFn: (row) => row.runIds.length },
      {
        accessorKey: "updatedAt",
        header: "Last updated",
        cell: ({ row }) =>
          new Date(row.original.updatedAt).toLocaleDateString(),
      },
    ],
    [data.runs],
  );
  const runColumns = useMemo<ColumnDef<ExperimentRun, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Run",
        cell: ({ row }) => (
          <div className="cly-core-experiment-name">
            <strong>{row.original.name}</strong>
            <small>
              {row.original.canonical
                ? "Canonical evidence run"
                : row.original.codeVersion}
            </small>
          </div>
        ),
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
    const experiment = await mockServices.experiments.create({
      name: name.trim(),
      goal: goal.trim() || "Define research goal",
      type,
    });
    setCreateOpen(false);
    setName("");
    setGoal("");
    setSelected(experiment.id);
    notify(
      "Experiment created",
      "The planned experiment is available across claims, graph, and next steps.",
    );
  };

  return (
    <div className="cly-page cly-page-wide cly-route-experiments cly-core-experiments">
      <PageHeader
        kicker="Research"
        title="Experiment Manager"
        description="Compare runs, inspect evidence, and verify the path from configuration to claim."
        actions={
          <>
            <Segmented
              value={view}
              options={experimentViews}
              onChange={setView}
              label="Experiment view"
            />
            {!inspectorOpen ? (
              <Button onClick={toggleInspector}>
                <PanelRightOpen size={13} /> Show details
              </Button>
            ) : null}
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus size={13} /> New experiment
            </Button>
          </>
        }
      />

      <div
        className="cly-core-experiment-toolbar"
        role="toolbar"
        aria-label="Experiment filters"
      >
        <label>
          <span>Status</span>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option>All</option>
            <option>Complete</option>
            <option>Running</option>
            <option>Failed</option>
            <option>Planned</option>
          </select>
        </label>
        <label>
          <span>Linked claim</span>
          <select
            aria-label="Filter linked claim"
            value={claimFilter}
            onChange={(event) => setClaimFilter(event.target.value)}
          >
            <option>All</option>
            {Array.from(
              new Set(data.experiments.flatMap((item) => item.claimIds)),
            ).map((id) => (
              <option key={id}>{id}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Type</span>
          <select
            aria-label="Filter experiment type"
            value={experimentTypeFilter}
            onChange={(event) => setExperimentTypeFilter(event.target.value)}
          >
            <option>All</option>
            {Array.from(new Set(data.experiments.map((item) => item.type))).map(
              (value) => (
                <option key={value}>{value}</option>
              ),
            )}
          </select>
        </label>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search experiments and goals…"
        />
        <div className="cly-core-experiment-counts">
          <span>
            <i data-tone="success" />{" "}
            {
              data.experiments.filter((item) => item.status === "Complete")
                .length
            }{" "}
            complete
          </span>
          <span>
            <i data-tone="warning" />{" "}
            {
              data.experiments.filter((item) => item.status === "Running")
                .length
            }{" "}
            running
          </span>
          <span>
            <i data-tone="danger" />{" "}
            {data.experiments.filter((item) => item.status === "Failed").length}{" "}
            failed
          </span>
        </div>
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
      ) : (
        <div
          className="cly-core-experiment-workspace"
          data-inspector={inspectorOpen ? "open" : "closed"}
        >
          <main className="cly-core-experiment-main">
            {view === "Experiments" ? (
              <ClyDataTable
                id="experiments"
                data={experiments}
                columns={experimentColumns}
                getRowId={(row) => row.id}
                selectedId={selectedExperiment?.id}
                onSelect={(row) => setSelected(row.id)}
              />
            ) : null}
            {view === "Runs" ? (
              <ClyDataTable
                id="experiment-runs"
                data={data.runs}
                columns={runColumns}
                getRowId={(row) => row.id}
                selectedId={selectedRun?.id}
                onSelect={(row) => setSelected(row.id)}
              />
            ) : null}
            {view === "Compare" ? (
              <ExperimentCompare
                runs={data.runs}
                experiments={data.experiments}
                selectedIds={compareIds}
                selectedRuns={compareRuns}
                onChange={setCompareIds}
                onReport={() =>
                  notify(
                    "Comparison report generated",
                    "Configuration, metrics, outputs, claims, reproducibility, and reviewer concerns are included.",
                  )
                }
              />
            ) : null}
            {view === "Timeline" ? (
              <ol className="cly-core-experiment-timeline">
                {data.runs.slice(0, 40).map((run) => (
                  <li key={run.id}>
                    <button type="button" onClick={() => setSelected(run.id)}>
                      <span
                        className="cly-core-timeline-dot"
                        data-tone={toneForStatus(run.status)}
                      />
                      <span>
                        <strong>{run.name}</strong>
                        <small>
                          {run.startedAt} · {run.duration} · {run.environment}
                        </small>
                      </span>
                      <Badge tone={toneForStatus(run.status)}>
                        {run.status}
                      </Badge>
                    </button>
                  </li>
                ))}
              </ol>
            ) : null}
            {view === "Outputs" ? (
              <div className="cly-core-experiment-outputs">
                {data.artifacts.map((artifact) => (
                  <button
                    type="button"
                    key={artifact.id}
                    onClick={() => setSelected(artifact.experimentId)}
                  >
                    <span>
                      <FileOutput size={24} />
                    </span>
                    <strong>{artifact.name}</strong>
                    <small>
                      {artifact.kind} · {artifact.preview}
                    </small>
                    <Badge tone={toneForStatus(artifact.regeneration)}>
                      {artifact.regeneration}
                    </Badge>
                  </button>
                ))}
              </div>
            ) : null}
          </main>

          {inspectorOpen && selectedExperiment ? (
            <ExperimentInspector
              experiment={selectedExperiment}
              runs={selectedRuns}
              canonicalRun={canonicalRun}
              artifacts={data.artifacts.filter(
                (artifact) => artifact.experimentId === selectedExperiment.id,
              )}
              onClose={toggleInspector}
              onNotify={notify}
            />
          ) : null}
        </div>
      )}

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New experiment"
        description="Create a fixture-backed research experiment. Execution remains disabled in this phase."
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
    </div>
  );
}

function ExperimentInspector({
  experiment,
  runs,
  canonicalRun,
  artifacts,
  onClose,
  onNotify,
}: {
  experiment: Experiment;
  runs: ExperimentRun[];
  canonicalRun: ExperimentRun | null;
  artifacts: Array<{
    id: string;
    name: string;
    kind: string;
    regeneration: string;
  }>;
  onClose: () => void;
  onNotify: (title: string, detail?: string) => void;
}) {
  const metricEntries = canonicalRun
    ? Object.entries(canonicalRun.metrics)
    : [];
  const firstMetric = metricEntries[0];
  const secondMetric = metricEntries[1] ?? metricEntries[0];
  const valuesFor = (metric: string | undefined) =>
    metric
      ? runs
          .map((run) => run.metrics[metric])
          .filter((value): value is number => typeof value === "number")
      : [];
  return (
    <aside
      className="cly-core-experiment-inspector"
      data-inline-inspector
      aria-label="Selected experiment details"
    >
      <header>
        <div>
          <Badge tone={toneForStatus(experiment.status)}>
            {experiment.status}
          </Badge>
          <h2>{experiment.name}</h2>
          <p>
            {experiment.type} ·{" "}
            {experiment.claimIds.join(", ") || "No linked claim"}
          </p>
        </div>
        <Button
          iconOnly
          variant="ghost"
          aria-label="Close experiment details"
          onClick={onClose}
        >
          <X size={14} />
        </Button>
      </header>
      <div className="cly-core-experiment-inspector-actions">
        <Button
          onClick={() =>
            onNotify(
              "Notebook opened",
              experiment.notebookId ?? "No notebook linked",
            )
          }
        >
          Open notebook
        </Button>
        <Button
          onClick={() =>
            onNotify("Outputs opened", `${artifacts.length} linked artifacts`)
          }
        >
          View outputs
        </Button>
        <Button
          onClick={() =>
            onNotify("Claim linkage traced", experiment.claimIds.join(", "))
          }
        >
          <GitBranch size={12} /> Trace claim linkage
        </Button>
      </div>
      <section className="cly-core-experiment-primary-metrics">
        <div>
          <span>Primary metric</span>
          <strong>{firstMetric ? formatMetric(firstMetric[1]) : "—"}</strong>
          <small>{firstMetric?.[0] ?? "No completed run"}</small>
        </div>
        <div>
          <span>Runs</span>
          <strong>{runs.length}</strong>
          <small>
            {runs.filter((run) => run.status === "Complete").length} complete
          </small>
        </div>
        <div>
          <span>Dataset</span>
          <strong>{experiment.dataset}</strong>
          <small>{canonicalRun?.environment ?? experiment.environment}</small>
        </div>
        <div>
          <span>Last updated</span>
          <strong>{new Date(experiment.updatedAt).toLocaleDateString()}</strong>
          <small>{canonicalRun?.codeVersion ?? "No code version"}</small>
        </div>
      </section>
      <section className="cly-core-experiment-charts">
        <MetricChart
          title={firstMetric?.[0] ?? "Primary metric"}
          values={valuesFor(firstMetric?.[0])}
          tone="accent"
        />
        <MetricChart
          title={secondMetric?.[0] ?? "Secondary metric"}
          values={valuesFor(secondMetric?.[0])}
          tone="success"
        />
      </section>
      <section className="cly-core-experiment-detail-grid">
        <div>
          <header>
            <strong>Parameters</strong>
            <span>canonical run</span>
          </header>
          <dl>
            {Object.entries(canonicalRun?.config ?? {}).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{String(value)}</dd>
              </div>
            ))}
            {!canonicalRun ? (
              <div>
                <dt>Configuration</dt>
                <dd>Not captured</dd>
              </div>
            ) : null}
          </dl>
          <button type="button" onClick={() => onNotify("Parameters opened")}>
            View all parameters <ArrowRight size={11} />
          </button>
        </div>
        <div>
          <header>
            <strong>Key outputs</strong>
            <span>{artifacts.length}</span>
          </header>
          <div className="cly-core-output-thumbs">
            {artifacts.slice(0, 4).map((artifact) => (
              <button
                type="button"
                key={artifact.id}
                onClick={() => onNotify("Output opened", artifact.name)}
              >
                <FileOutput size={18} />
                <span>{artifact.name}</span>
              </button>
            ))}
            {!artifacts.length ? <span>No outputs linked yet.</span> : null}
          </div>
        </div>
        <div>
          <header>
            <strong>Reproducibility</strong>
            <span>{canonicalRun?.reproducibility ?? "Pending"}</span>
          </header>
          <ul>
            <li>
              <Check size={11} /> Deterministic seed{" "}
              <strong>{canonicalRun?.config.seed ? "Yes" : "Unknown"}</strong>
            </li>
            <li>
              <Check size={11} /> Code version{" "}
              <strong>{canonicalRun?.codeVersion ?? "Missing"}</strong>
            </li>
            <li>
              <Check size={11} /> Environment{" "}
              <strong>{canonicalRun?.environment ?? "Not captured"}</strong>
            </li>
            <li>
              <ShieldCheck size={11} /> Canonical{" "}
              <strong>{canonicalRun?.canonical ? "Yes" : "No"}</strong>
            </li>
          </ul>
        </div>
      </section>
      <section className="cly-core-experiment-rationale">
        <div>
          <span>Objective</span>
          <p>{experiment.goal}</p>
        </div>
        <div>
          <span>Hypothesis</span>
          <p>{experiment.hypothesis}</p>
        </div>
        {experiment.limitations.length ? (
          <div data-tone="warning">
            <span>Known limitations</span>
            <p>{experiment.limitations.join(" · ")}</p>
          </div>
        ) : null}
      </section>
    </aside>
  );
}

function MetricChart({
  title,
  values,
  tone,
}: {
  title: string;
  values: number[];
  tone: "accent" | "success";
}) {
  const safeValues = values.length ? values : [0, 0, 0];
  const min = Math.min(...safeValues);
  const max = Math.max(...safeValues);
  const range = Math.max(1, max - min);
  const points = safeValues
    .map((value, index) => {
      const x = 8 + (index / Math.max(1, safeValues.length - 1)) * 224;
      const y = 90 - ((value - min) / range) * 66;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <div className="cly-core-metric-chart" data-tone={tone}>
      <header>
        <strong>{title}</strong>
        <span>{formatMetric(safeValues.at(-1) ?? 0)}</span>
      </header>
      <svg
        viewBox="0 0 240 100"
        role="img"
        aria-label={`${title}: ${safeValues.join(", ")}`}
      >
        <line x1="8" y1="90" x2="232" y2="90" />
        <line x1="8" y1="20" x2="8" y2="90" />
        <polyline points={points} />
      </svg>
    </div>
  );
}

function ExperimentCompare({
  runs,
  experiments,
  selectedIds,
  selectedRuns,
  onChange,
  onReport,
}: {
  runs: ExperimentRun[];
  experiments: Experiment[];
  selectedIds: string[];
  selectedRuns: ExperimentRun[];
  onChange: (ids: string[]) => void;
  onReport: () => void;
}) {
  return (
    <div className="cly-core-compare-workspace">
      <aside>
        <header>
          <strong>Comparison selection</strong>
          <span>Choose up to three runs</span>
        </header>
        {runs.slice(0, 12).map((run) => (
          <label key={run.id}>
            <span>{run.name}</span>
            <input
              type="checkbox"
              checked={selectedIds.includes(run.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selectedIds, run.id].slice(-3)
                    : selectedIds.filter((id) => id !== run.id),
                )
              }
            />
          </label>
        ))}
        <Button onClick={onReport}>
          <Sparkles size={12} /> Generate report
        </Button>
      </aside>
      <div className="cly-core-compare-columns">
        {selectedRuns.map((run) => (
          <section key={run.id}>
            <header>
              <div>
                <strong>{run.name}</strong>
                <span>
                  {
                    experiments.find((item) => item.id === run.experimentId)
                      ?.name
                  }
                </span>
              </div>
              <Badge tone={toneForStatus(run.reproducibility)}>
                {run.reproducibility}
              </Badge>
            </header>
            <dl>
              {Object.entries(run.metrics).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{formatMetric(value)}</dd>
                </div>
              ))}
              {Object.entries(run.config).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{String(value)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}

function formatMetric(value: number) {
  if (Math.abs(value) < 1) return value.toFixed(3);
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
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
  const inspectorOpen = useClyStore((s) => s.inspectorOpen);
  const toggleInspector = useClyStore((s) => s.toggleInspector);
  const [view, setView] = useState<GraphView>("Graph");
  const [query, setQuery] = useState("");
  const [focusType, setFocusType] = useState("All");
  const [hiddenTypes, setHiddenTypes] = useState<Set<GraphNode["type"]>>(
    () => new Set(),
  );
  const [hideLow, setHideLow] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [highlightRecent, setHighlightRecent] = useState(true);
  const [onlyConfirmed, setOnlyConfirmed] = useState(false);
  const [showOrphaned, setShowOrphaned] = useState(false);
  const nodeTypes = useMemo(
    () => Array.from(new Set(nodes.map((node) => node.type))),
    [nodes],
  );
  const connectedNodeIds = useMemo(
    () => new Set(edges.flatMap((edge) => [edge.source, edge.target])),
    [edges],
  );
  const visibleNodes = useMemo(
    () =>
      nodes
        .filter(
          (node) =>
            (!query ||
              node.label.toLowerCase().includes(query.toLowerCase())) &&
            (focusType === "All" || node.type === focusType) &&
            !hiddenTypes.has(node.type) &&
            (!onlyConfirmed || node.status === "Confirmed") &&
            (showOrphaned || connectedNodeIds.has(node.id)),
        )
        .slice(0, 60),
    [
      connectedNodeIds,
      focusType,
      hiddenTypes,
      nodes,
      onlyConfirmed,
      query,
      showOrphaned,
    ],
  );
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = edges
    .filter(
      (edge) =>
        visibleNodeIds.has(edge.source) &&
        visibleNodeIds.has(edge.target) &&
        (!hideLow || edge.confidence >= 0.7),
    )
    .slice(0, 120);
  const selectedNode =
    nodes.find((node) => node.id === selectedId) ??
    visibleNodes[0] ??
    nodes[0] ??
    null;
  const connectedEdges = selectedNode
    ? edges.filter(
        (edge) =>
          edge.source === selectedNode.id || edge.target === selectedNode.id,
      )
    : [];
  const flowNodes = useMemo<ClyFlowNode[]>(
    () =>
      visibleNodes.map((node, index) => ({
        id: node.id,
        type: "clyResearch",
        position: {
          x: nodes.length > 100 ? 30 + (index % 6) * 190 : node.x,
          y: nodes.length > 100 ? 24 + Math.floor(index / 6) * 90 : node.y,
        },
        selected: node.id === selectedNode?.id,
        data: {
          label: node.label,
          type: node.type,
          status: node.status,
          recent:
            highlightRecent &&
            node.status !== "Stale" &&
            node.status !== "Broken",
        },
      })),
    [highlightRecent, nodes.length, selectedNode?.id, visibleNodes],
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
    const edge = await mockServices.graph.createRelationship({
      source: selectedNode?.id ?? nodes[0].id,
      target:
        nodes.find((node) => node.id !== selectedNode?.id)?.id ?? nodes[1].id,
      relation: "linked manually",
      confidence: 1,
      approved: true,
    });
    notify("Relationship created", `${edge.source} → ${edge.target}`);
  };

  return (
    <div className="cly-page cly-page-wide cly-route-graph cly-core-graph">
      <PageHeader
        kicker="Research"
        title="Research Object Graph"
        description="Explore how questions, evidence, experiments, outputs, and claims connect."
        actions={
          <>
            <Badge tone="info">
              {edges.filter((edge) => !edge.approved).length} suggested links
            </Badge>
            {!inspectorOpen ? (
              <Button onClick={toggleInspector}>
                <PanelRightOpen size={13} /> Show details
              </Button>
            ) : null}
            <Button onClick={() => void createLink()}>
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
      {nodes.length === 0 ? (
        <EmptyState
          title="The research graph is empty"
          description="Add claims, sources, or experiments to build an evidence trail."
          action={<Button variant="primary">Create research question</Button>}
        />
      ) : (
        <>
          <div
            className="cly-core-graph-toolbar"
            role="toolbar"
            aria-label="Research graph controls"
          >
            <Button
              aria-pressed={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <Filter size={12} /> Filters
            </Button>
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search graph…"
            />
            <select
              value={focusType}
              onChange={(event) => setFocusType(event.target.value)}
              aria-label="Filter node type"
            >
              <option>All</option>
              {nodeTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
            <Segmented
              value={view}
              options={graphViews}
              onChange={setView}
              label="Graph view"
            />
            <label>
              <input
                type="checkbox"
                checked={hideLow}
                onChange={(event) => setHideLow(event.target.checked)}
              />
              Hide low confidence
            </label>
            <span>
              {visibleNodes.length} of {nodes.length.toLocaleString()} objects
            </span>
          </div>

          <div
            className="cly-core-graph-workspace"
            data-inspector={inspectorOpen ? "open" : "closed"}
            data-filters={filtersOpen ? "open" : "closed"}
          >
            {filtersOpen ? (
              <aside
                className="cly-core-graph-filters"
                aria-label="Graph node filters"
              >
                <header>
                  <strong>Node types</strong>
                  <ListFilter size={13} />
                </header>
                <button
                  type="button"
                  data-selected={hiddenTypes.size === 0}
                  onClick={() => setHiddenTypes(new Set())}
                >
                  <span>
                    <Network size={12} /> All objects
                  </span>
                  <strong>{nodes.length}</strong>
                </button>
                {nodeTypes.map((type) => (
                  <button
                    type="button"
                    key={type}
                    aria-pressed={!hiddenTypes.has(type)}
                    onClick={() =>
                      setHiddenTypes((current) => {
                        const next = new Set(current);
                        if (next.has(type)) next.delete(type);
                        else next.add(type);
                        return next;
                      })
                    }
                  >
                    <span>
                      <ResearchTypeIcon type={type} /> {type}
                    </span>
                    <strong>
                      {nodes.filter((node) => node.type === type).length}
                    </strong>
                  </button>
                ))}
                <section>
                  <span>Show</span>
                  <label>
                    <input
                      type="checkbox"
                      checked={highlightRecent}
                      onChange={(event) =>
                        setHighlightRecent(event.target.checked)
                      }
                    />{" "}
                    Highlight active
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={onlyConfirmed}
                      onChange={(event) =>
                        setOnlyConfirmed(event.target.checked)
                      }
                    />{" "}
                    Only confirmed
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={showOrphaned}
                      onChange={(event) =>
                        setShowOrphaned(event.target.checked)
                      }
                    />{" "}
                    Orphaned objects
                  </label>
                </section>
                <section>
                  <span>Link semantics</span>
                  {[
                    "Confirmed",
                    "Suggested",
                    "Uncertain",
                    "Stale",
                    "Broken",
                  ].map((status) => (
                    <div key={status}>
                      <i data-tone={toneForStatus(status)} />
                      <span>{status}</span>
                      <strong>
                        {nodes.filter((node) => node.status === status).length}
                      </strong>
                    </div>
                  ))}
                </section>
              </aside>
            ) : null}

            <main className="cly-core-graph-main">
              {view === "Graph" ? (
                <div className="cly-core-graph-canvas cly-graph-canvas">
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
                    {flowNodes.length > 8 ? (
                      <MiniMap pannable zoomable />
                    ) : null}
                  </ReactFlow>
                  <ul
                    className="cly-core-graph-legend"
                    aria-label="Graph legend"
                  >
                    {nodeTypes.slice(0, 7).map((type) => (
                      <li key={type}>
                        <ResearchTypeIcon type={type} size={10} /> {type}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {view === "Outline" ? (
                <div className="cly-core-graph-outline">
                  {visibleNodes.map((node) => (
                    <button
                      type="button"
                      key={node.id}
                      data-selected={selectedNode?.id === node.id}
                      onClick={() => setSelected(node.id)}
                    >
                      <ResearchTypeIcon type={node.type} />
                      <span>
                        <strong>{node.label}</strong>
                        <small>
                          {node.type} · {node.status}
                        </small>
                      </span>
                      <Badge>
                        {
                          edges.filter(
                            (edge) =>
                              edge.source === node.id ||
                              edge.target === node.id,
                          ).length
                        }{" "}
                        links
                      </Badge>
                      <ChevronRight size={12} />
                    </button>
                  ))}
                </div>
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
                      {visibleEdges.map((edge) => (
                        <tr key={edge.id}>
                          <td>
                            {nodes.find((node) => node.id === edge.source)
                              ?.label ?? edge.source}
                          </td>
                          <td>{edge.relation}</td>
                          <td>
                            {nodes.find((node) => node.id === edge.target)
                              ?.label ?? edge.target}
                          </td>
                          <td>{Math.round(edge.confidence * 100)}%</td>
                          <td>
                            {edge.approved ? (
                              <Badge tone="success">Approved</Badge>
                            ) : (
                              <Button
                                onClick={() =>
                                  void mockServices.graph.approveRelationship(
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
                <div className="cly-core-evidence-chain-v2">
                  <header>
                    <span>Primary claim</span>
                    <strong>Evidence chain</strong>
                  </header>
                  {[
                    ["Source data", "Confirmed input"],
                    ["Experiment", "Validated method"],
                    ["Canonical run", "Reproducible output"],
                    ["Notebook", "Analysis trace"],
                    ["Figure 2", "Publication artifact"],
                    ["Primary claim", "Research conclusion"],
                  ].map(([label, detail], index) => (
                    <div key={label}>
                      <button
                        type="button"
                        onClick={() =>
                          notify("Evidence object selected", label)
                        }
                      >
                        <span>{index + 1}</span>
                        <span>
                          <strong>{label}</strong>
                          <small>{detail}</small>
                        </span>
                      </button>
                      {index < 5 ? <ArrowRight size={13} /> : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </main>

            {inspectorOpen && selectedNode ? (
              <GraphInspector
                node={selectedNode}
                edges={connectedEdges}
                nodes={nodes}
                onClose={toggleInspector}
                onSelect={setSelected}
                onNotify={notify}
              />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

function GraphInspector({
  node,
  edges,
  nodes,
  onClose,
  onSelect,
  onNotify,
}: {
  node: GraphNode;
  edges: ReturnType<typeof useClyStore.getState>["data"]["graphEdges"];
  nodes: GraphNode[];
  onClose: () => void;
  onSelect: (id: string | null) => void;
  onNotify: (title: string, detail?: string) => void;
}) {
  return (
    <aside
      className="cly-core-graph-inspector"
      data-inline-inspector
      aria-label="Selected graph object details"
    >
      <header>
        <div>
          <Badge tone="info">{node.type}</Badge>
          <h2>{node.label}</h2>
          <p>
            <Badge tone={toneForStatus(node.status)}>{node.status}</Badge> ·{" "}
            {edges.length} direct relationships
          </p>
        </div>
        <Button
          iconOnly
          variant="ghost"
          aria-label="Close graph object details"
          onClick={onClose}
        >
          <X size={14} />
        </Button>
      </header>
      <section>
        <span>Summary</span>
        <p>
          This {node.type} is part of the active evidence system. Its current{" "}
          {node.status.toLowerCase()} state reflects the confidence and approval
          status of {edges.length} connected relationships.
        </p>
      </section>
      <section>
        <span>Metadata</span>
        <dl>
          <dt>Object ID</dt>
          <dd className="cly-mono">{node.id}</dd>
          <dt>Type</dt>
          <dd>{node.type}</dd>
          <dt>Status</dt>
          <dd>{node.status}</dd>
          <dt>Updated</dt>
          <dd>Today</dd>
          <dt>Position</dt>
          <dd>
            {node.x}, {node.y}
          </dd>
        </dl>
      </section>
      <section>
        <span>Linked objects</span>
        <div className="cly-core-graph-links">
          {edges.map((edge) => {
            const relatedId =
              edge.source === node.id ? edge.target : edge.source;
            const related = nodes.find((item) => item.id === relatedId);
            return (
              <button
                type="button"
                key={edge.id}
                onClick={() => onSelect(relatedId)}
              >
                <ResearchTypeIcon type={related?.type ?? "report"} />
                <span>
                  <strong>{related?.label ?? relatedId}</strong>
                  <small>
                    {edge.relation} · {Math.round(edge.confidence * 100)}%
                  </small>
                </span>
                <ChevronRight size={12} />
              </button>
            );
          })}
          {!edges.length ? <p>No direct relationships in this view.</p> : null}
        </div>
      </section>
      <section>
        <span>Trace paths</span>
        <div className="cly-core-graph-actions">
          <Button onClick={() => onNotify("Evidence path traced", node.label)}>
            <Check size={12} /> Evidence
          </Button>
          <Button
            onClick={() => onNotify("Provenance path traced", node.label)}
          >
            <GitBranch size={12} /> Provenance
          </Button>
          <Button onClick={() => onNotify("Contradictions traced", node.label)}>
            <X size={12} /> Contradictions
          </Button>
          <Button onClick={() => onNotify("Neighborhood focused", node.label)}>
            <Search size={12} /> Neighborhood
          </Button>
        </div>
      </section>
      <footer>
        <Button onClick={() => onNotify("Object opened", node.label)}>
          <Eye size={12} /> Open object
        </Button>
        <Button onClick={() => onNotify("Provenance traced", node.label)}>
          <Network size={12} /> Trace provenance
        </Button>
        <Button
          variant="primary"
          onClick={() => onNotify("Primary relationship opened", node.label)}
        >
          <ArrowRight size={12} /> Follow strongest link
        </Button>
      </footer>
    </aside>
  );
}
