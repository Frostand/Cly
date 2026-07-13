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
  MoreHorizontal,
  Plus,
  Sparkles,
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
import type {
  Experiment,
  ExperimentRun,
  ExperimentType,
} from "../domain/types";
import { mockServices } from "../services/mock-services";
import { useClyStore } from "../store/cly-store";

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
  const [view, setView] = useState<ExperimentView>("Experiments");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
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
      (filter === "All" || item.status === filter),
  );
  const compareRuns = compareIds
    .map((id) => data.runs.find((item) => item.id === id))
    .filter(Boolean);
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
    } catch (error) {
      notify(
        "Experiment was not saved",
        error instanceof Error
          ? error.message
          : "Unable to save the experiment.",
      );
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
          label="Coverage trend"
          value={`${Math.round(
            (data.runs
              .map((item) => item.metrics.coverage)
              .filter((value): value is number => typeof value === "number")
              .at(-1) ?? 0) * 100,
          )}%`}
          detail="Across comparable runs"
          values={data.runs
            .map((item) => item.metrics.coverage)
            .filter((value): value is number => typeof value === "number")
            .map((value) => value * 100)}
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
              onClick={() =>
                notify(
                  "Comparison report generated",
                  "Config, metrics, outputs, claims, reproducibility, and reviewer concerns are included.",
                )
              }
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
              <Panel
                key={artifact.id}
                onClick={() => setSelected(artifact.id)}
                style={{ cursor: "pointer" }}
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
                    {artifact.preview}
                  </p>
                </div>
              </Panel>
            ))}
          </div>
        ) : null}
      </div>

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
  const [view, setView] = useState<GraphView>("Graph");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [hideLow, setHideLow] = useState(true);
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
        (!hideLow || edge.confidence >= 0.7),
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
    const edge = await mockServices.graph.createRelationship({
      source:
        selectedId && nodes.some((node) => node.id === selectedId)
          ? selectedId
          : nodes[0].id,
      target: nodes.find((node) => node.id !== selectedId)?.id ?? nodes[1].id,
      relation: "linked manually",
      confidence: 1,
      approved: true,
    });
    notify("Relationship created", `${edge.source} → ${edge.target}`);
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
    </div>
  );
}
