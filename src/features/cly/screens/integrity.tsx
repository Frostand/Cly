import {
  Archive,
  ArrowRight,
  Beaker,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Code2,
  Database,
  Download,
  ExternalLink,
  FileChartColumn,
  FileOutput,
  FileText,
  GitCompare,
  Link2,
  Maximize2,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RefreshCw,
  Share2,
  ShieldCheck,
  Sparkles,
  Table2,
  UserRound,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useMemo, useState } from "react";
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
import { ClySplitPane, ClyVirtualList } from "../components/toolkit";
import { ImpactEffortMap, RiskDistribution } from "../components/visuals";
import { prioritizeNextSteps } from "../domain/logic";
import type { Artifact, NextStep, ResearchDecision } from "../domain/types";
import { mockServices } from "../services/mock-services";
import { useClyStore } from "../store/cly-store";
import "../redesign-integrity.css";

type ProvenanceView =
  | "Gallery"
  | "Table"
  | "Lineage"
  | "Broken"
  | "Stale"
  | "Unlinked";

function ArtifactGlyph({
  artifact,
  size = 15,
}: {
  artifact: Artifact;
  size?: number;
}) {
  if (artifact.kind === "Figure") return <FileChartColumn size={size} />;
  if (artifact.kind === "Table") return <Table2 size={size} />;
  if (artifact.kind === "Output") return <FileOutput size={size} />;
  return <FileText size={size} />;
}

const artifactKinds: Artifact["kind"][] = [
  "Figure",
  "Table",
  "Output",
  "Report",
];

export function ProvenanceScreen() {
  const artifacts = useClyStore((s) => s.data.artifacts);
  const data = useClyStore((s) => s.data);
  const setSelected = useClyStore((s) => s.setSelected);
  const notify = useClyStore((s) => s.notify);
  const inspectorOpen = useClyStore((s) => s.inspectorOpen);
  const toggleInspector = useClyStore((s) => s.toggleInspector);
  const [view, setView] = useState<ProvenanceView>("Lineage");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [selectedArtifactId, setSelectedArtifactId] = useState(
    artifacts[0]?.id ?? "",
  );
  const visible = artifacts.filter(
    (item) =>
      (!query ||
        `${item.name} ${item.path} ${item.generator}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (statusFilter === "All statuses" || item.regeneration === statusFilter) &&
      (view !== "Broken" || item.regeneration === "Broken") &&
      (view !== "Stale" ||
        item.regeneration === "Stale" ||
        item.regeneration === "Manual") &&
      (view !== "Unlinked" || item.claimIds.length === 0),
  );
  const selectedArtifact =
    visible.find((item) => item.id === selectedArtifactId) ??
    artifacts.find((item) => item.id === selectedArtifactId) ??
    visible[0] ??
    artifacts[0];
  const selectedExperiment = data.experiments.find(
    (item) => item.id === selectedArtifact?.experimentId,
  );
  const selectedRun = data.runs.find(
    (item) => item.id === selectedArtifact?.runId,
  );
  const selectArtifact = (artifact: Artifact) => {
    setSelectedArtifactId(artifact.id);
    setSelected(artifact.id);
  };

  const artifactRail = (
    <aside className="cly-provenance-rail" aria-label="Artifacts">
      <div className="cly-integrity-pane-heading">
        <div>
          <strong>Artifacts</strong>
          <span>{visible.length} in view</span>
        </div>
      </div>
      <div className="cly-provenance-rail-tools">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search artifacts…"
        />
        <select
          className="cly-select"
          aria-label="Filter artifacts by regeneration status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option>All statuses</option>
          <option>Ready</option>
          <option>Manual</option>
          <option>Stale</option>
          <option>Broken</option>
        </select>
      </div>
      <div className="cly-provenance-groups">
        {artifactKinds.map((kind) => {
          const members = visible.filter((artifact) => artifact.kind === kind);
          if (!members.length) return null;
          return (
            <section key={kind}>
              <div className="cly-provenance-group-label">
                <span>{kind === "Output" ? "Outputs" : `${kind}s`}</span>
                <small>{members.length}</small>
              </div>
              {members.map((artifact) => (
                <button
                  type="button"
                  key={artifact.id}
                  className="cly-provenance-artifact"
                  data-selected={artifact.id === selectedArtifact?.id}
                  data-status={artifact.regeneration}
                  onClick={() => selectArtifact(artifact)}
                >
                  <ArtifactGlyph artifact={artifact} />
                  <span>
                    <strong>{artifact.name}</strong>
                    <small>{artifact.preview}</small>
                  </span>
                  <i aria-hidden="true" />
                  <span className="cly-sr-only">{artifact.regeneration}</span>
                </button>
              ))}
            </section>
          );
        })}
        {!visible.length ? (
          <div className="cly-integrity-inline-empty">
            <span>No artifacts match this view.</span>
            <Button
              variant="ghost"
              onClick={() => {
                setQuery("");
                setStatusFilter("All statuses");
                setView("Lineage");
              }}
            >
              Clear filters
            </Button>
          </div>
        ) : null}
      </div>
      <div className="cly-provenance-rail-footer">
        <Button
          onClick={() =>
            notify(
              "Artifact import opened",
              "Attach a figure, table, output, or report to its producing run.",
            )
          }
        >
          <Plus size={13} /> Add artifact
        </Button>
      </div>
    </aside>
  );

  const lineageCanvas = selectedArtifact ? (
    <section className="cly-provenance-canvas" aria-label="Lineage graph">
      <div className="cly-lineage-toolbar">
        <div>
          <span className="cly-integrity-eyebrow">Lineage graph</span>
          <strong>Selected path</strong>
          <small>Upstream and downstream dependencies</small>
        </div>
        <div className="cly-row">
          <Button
            iconOnly
            aria-label="Fit lineage to view"
            onClick={() => notify("Lineage fitted to view")}
          >
            <Maximize2 size={13} />
          </Button>
          <Button
            iconOnly
            aria-label="Zoom out"
            onClick={() => notify("Lineage zoomed out")}
          >
            <ZoomOut size={13} />
          </Button>
          <Button
            iconOnly
            aria-label="Zoom in"
            onClick={() => notify("Lineage zoomed in")}
          >
            <ZoomIn size={13} />
          </Button>
        </div>
      </div>
      <div className="cly-lineage-stage">
        <div className="cly-lineage-selected-key">
          <span>
            <i /> Selected path
          </span>
          <span>
            <i /> Upstream / downstream
          </span>
        </div>
        <ol className="cly-lineage-path">
          {[
            {
              key: "source",
              eyebrow: "Source data",
              title: selectedArtifact.sourceData,
              detail: "Versioned project input",
              version: "v1",
              icon: <Database size={17} />,
            },
            {
              key: "generator",
              eyebrow: "Generator",
              title: selectedArtifact.generator,
              detail: "Deterministic export entrypoint",
              version: selectedArtifact.commit,
              icon: <Code2 size={17} />,
            },
            {
              key: "experiment",
              eyebrow: "Experiment",
              title: selectedExperiment?.name ?? selectedArtifact.experimentId,
              detail: selectedExperiment?.goal ?? "Linked experiment",
              version: "active",
              icon: <Beaker size={17} />,
            },
            {
              key: "run",
              eyebrow: "Run",
              title: selectedRun?.name ?? selectedArtifact.runId,
              detail: selectedRun?.status ?? "Recorded run",
              version: selectedArtifact.runId,
              icon: <RefreshCw size={17} />,
            },
            {
              key: "artifact",
              eyebrow: selectedArtifact.kind,
              title: selectedArtifact.name,
              detail: selectedArtifact.path,
              version: selectedArtifact.hash.split(":").at(-1) ?? "current",
              icon: <ArtifactGlyph artifact={selectedArtifact} size={18} />,
              selected: true,
            },
            {
              key: "claims",
              eyebrow: "Claims / reports",
              title:
                selectedArtifact.claimIds.length > 0
                  ? `${selectedArtifact.claimIds.length} linked claim${selectedArtifact.claimIds.length === 1 ? "" : "s"}`
                  : "No linked claims",
              detail:
                selectedArtifact.claimIds.join(" · ") ||
                "Add a claim to complete downstream lineage",
              version: selectedArtifact.claimIds.length ? "linked" : "gap",
              icon: <ShieldCheck size={17} />,
            },
          ].map((node) => (
            <li
              className="cly-lineage-node-wrap"
              key={node.key}
              data-selected={node.selected}
            >
              <div className="cly-lineage-node">
                <span className="cly-lineage-node-icon">{node.icon}</span>
                <span>
                  <small>{node.eyebrow}</small>
                  <strong>{node.title}</strong>
                  <em>{node.detail}</em>
                </span>
                <code>{node.version}</code>
              </div>
            </li>
          ))}
        </ol>
        <div className="cly-lineage-minimap" aria-hidden="true">
          {["a", "b", "c", "d", "e", "f"].map((item) => (
            <i key={item} />
          ))}
          <span />
        </div>
      </div>
    </section>
  ) : (
    <EmptyState
      title="No artifact selected"
      description="Choose an artifact to inspect its upstream and downstream lineage."
    />
  );

  const centerWorkspace =
    view === "Table" ? (
      <section className="cly-provenance-center cly-provenance-table-view">
        <div className="cly-integrity-pane-heading">
          <div>
            <strong>Artifact register</strong>
            <span>{visible.length} records</span>
          </div>
        </div>
        <div className="cly-table-wrap">
          <table className="cly-table">
            <thead>
              <tr>
                <th>Artifact</th>
                <th>Kind</th>
                <th>Generator</th>
                <th>Run</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((artifact) => (
                <tr
                  key={artifact.id}
                  data-selected={artifact.id === selectedArtifact?.id}
                  tabIndex={0}
                  onClick={() => selectArtifact(artifact)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ")
                      selectArtifact(artifact);
                  }}
                >
                  <td>{artifact.name}</td>
                  <td>{artifact.kind}</td>
                  <td className="cly-mono">{artifact.generator}</td>
                  <td>{artifact.runId}</td>
                  <td>
                    <Badge tone={toneForStatus(artifact.regeneration)}>
                      {artifact.regeneration}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    ) : view === "Gallery" ||
      view === "Broken" ||
      view === "Stale" ||
      view === "Unlinked" ? (
      <section className="cly-provenance-center cly-provenance-gallery-view">
        <div className="cly-integrity-pane-heading">
          <div>
            <strong>Artifact preview</strong>
            <span>{visible.length} records</span>
          </div>
        </div>
        <div className="cly-provenance-gallery">
          {visible.map((artifact) => (
            <button
              type="button"
              key={artifact.id}
              data-selected={artifact.id === selectedArtifact?.id}
              onClick={() => selectArtifact(artifact)}
            >
              <span>
                <ArtifactGlyph artifact={artifact} size={22} />
              </span>
              <strong>{artifact.name}</strong>
              <small>{artifact.preview}</small>
              <Badge tone={toneForStatus(artifact.regeneration)}>
                {artifact.regeneration}
              </Badge>
            </button>
          ))}
        </div>
      </section>
    ) : (
      lineageCanvas
    );

  const provenancePrimary = (
    <div className="cly-provenance-primary">
      {artifactRail}
      {centerWorkspace}
    </div>
  );

  const provenanceInspector = selectedArtifact ? (
    <aside
      className="cly-integrity-inspector cly-provenance-inspector"
      data-inline-inspector
      aria-label="Artifact details"
    >
      <header>
        <div className="cly-integrity-inspector-title">
          <span className="cly-integrity-object-icon">
            <ArtifactGlyph artifact={selectedArtifact} size={18} />
          </span>
          <div>
            <span>{selectedArtifact.kind}</span>
            <h2>{selectedArtifact.name}</h2>
            <p>{selectedArtifact.preview}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          iconOnly
          aria-label="Close artifact details"
          onClick={toggleInspector}
        >
          <PanelRightClose size={14} />
        </Button>
      </header>
      <div className="cly-integrity-inspector-scroll">
        <div
          className="cly-inspector-tabs"
          role="tablist"
          aria-label="Artifact information"
        >
          <button type="button" role="tab" aria-selected="true">
            Details
          </button>
          <button
            type="button"
            role="tab"
            aria-selected="false"
            onClick={() => notify("Artifact metadata", selectedArtifact.hash)}
          >
            Metadata
          </button>
        </div>
        <section>
          <div className="cly-integrity-section-label">Details</div>
          <dl className="cly-integrity-detail-list">
            <div>
              <dt>Type</dt>
              <dd>{selectedArtifact.kind}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{new Date(selectedArtifact.updatedAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <Badge tone={toneForStatus(selectedArtifact.regeneration)}>
                  {selectedArtifact.regeneration}
                </Badge>
              </dd>
            </div>
            <div>
              <dt>Path</dt>
              <dd className="cly-mono">{selectedArtifact.path}</dd>
            </div>
          </dl>
        </section>
        <section>
          <div className="cly-integrity-section-label">Lineage</div>
          <dl className="cly-integrity-detail-list">
            <div>
              <dt>Run</dt>
              <dd>{selectedRun?.name ?? selectedArtifact.runId}</dd>
            </div>
            <div>
              <dt>Experiment</dt>
              <dd>
                {selectedExperiment?.name ?? selectedArtifact.experimentId}
              </dd>
            </div>
            <div>
              <dt>Generator</dt>
              <dd className="cly-mono">{selectedArtifact.generator}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd className="cly-mono">{selectedArtifact.sourceData}</dd>
            </div>
          </dl>
        </section>
        <section>
          <div className="cly-integrity-section-label">Code & environment</div>
          <dl className="cly-integrity-detail-list">
            <div>
              <dt>Commit</dt>
              <dd className="cly-mono">{selectedArtifact.commit}</dd>
            </div>
            <div>
              <dt>Hash</dt>
              <dd className="cly-mono">{selectedArtifact.hash}</dd>
            </div>
            <div>
              <dt>Claims</dt>
              <dd>
                {selectedArtifact.claimIds.join(", ") || "No linked claims"}
              </dd>
            </div>
          </dl>
        </section>
      </div>
      <footer className="cly-integrity-inspector-actions">
        <Button
          variant="primary"
          onClick={() => notify("Artifact opened", selectedArtifact.path)}
        >
          <ExternalLink size={13} /> Open artifact
        </Button>
        <Button
          onClick={() =>
            notify("Tracing upstream", selectedArtifact.sourceData)
          }
        >
          <RefreshCw size={13} /> Trace upstream
        </Button>
        <Button
          onClick={() =>
            notify(
              "Tracing downstream",
              `${selectedArtifact.claimIds.length} claims linked`,
            )
          }
        >
          <ArrowRight size={13} /> Trace downstream
        </Button>
        <Button
          onClick={() =>
            notify("Regeneration queued", selectedArtifact.generator)
          }
        >
          <Sparkles size={13} /> Regenerate
        </Button>
      </footer>
    </aside>
  ) : null;

  return (
    <div className="cly-page cly-page-wide cly-route-provenance cly-integrity-page">
      <PageHeader
        title="Provenance"
        description="Understand how research artifacts are derived and connected."
        actions={
          <>
            <Segmented
              value={view}
              options={
                [
                  "Lineage",
                  "Gallery",
                  "Table",
                  "Broken",
                  "Stale",
                  "Unlinked",
                ] as const
              }
              onChange={setView}
              label="Provenance view"
            />
            <Button
              onClick={() =>
                notify(
                  "Provenance report generated",
                  "The report includes hashes, lineage gaps, manual-edit risks, and regeneration status.",
                )
              }
            >
              <Share2 size={13} /> Share lineage
            </Button>
            {!inspectorOpen && selectedArtifact ? (
              <Button
                iconOnly
                aria-label="Open artifact details"
                onClick={toggleInspector}
              >
                <PanelRightOpen size={14} />
              </Button>
            ) : null}
          </>
        }
      />
      {artifacts.length === 0 ? (
        <EmptyState
          title="No output artifacts indexed"
          description="Attach or import a figure, table, output, or report."
        />
      ) : inspectorOpen && provenanceInspector ? (
        <ClySplitPane
          id="provenance-inline-inspector"
          className="cly-integrity-split cly-provenance-split"
          secondarySize={31}
          primaryMin="620px"
          secondaryMin="288px"
          secondaryMax="40%"
          primary={provenancePrimary}
          secondary={provenanceInspector}
          label="Resize provenance details"
        />
      ) : (
        provenancePrimary
      )}
    </div>
  );
}

const auditCategories = [
  "dependencies",
  "environment",
  "datasets",
  "random seeds",
  "commands",
  "configuration",
  "notebooks",
  "outputs",
  "figure regeneration",
  "table regeneration",
  "code/result consistency",
  "claim/evidence consistency",
  "paths and portability",
  "Git state",
  "artifact tracking",
  "documentation",
];

export function ReproducibilityScreen() {
  const audit = useClyStore((s) => s.data.audits[0]);
  const findings = useClyStore((s) => s.data.findings);
  const setSelected = useClyStore((s) => s.setSelected);
  const notify = useClyStore((s) => s.notify);
  const [filter, setFilter] = useState("All");
  const visible = findings.filter(
    (item) =>
      filter === "All" || item.severity === filter || item.status === filter,
  );
  return (
    <div className="cly-page cly-route-reproducibility">
      <PageHeader
        kicker="Integrity"
        title="Reproducibility Auditor"
        description="Find and fix publication blockers."
        actions={
          <>
            <Button
              onClick={() =>
                notify(
                  "Audit comparison",
                  "The current audit improved 8 points; one new figure-regeneration blocker was introduced.",
                )
              }
            >
              <GitCompare size={13} /> Compare audits
            </Button>
            <Button
              variant="primary"
              onClick={() => void mockServices.reproducibility.runAudit()}
            >
              <RefreshCw size={13} /> Run audit
            </Button>
          </>
        }
      />
      {!audit ? (
        <EmptyState
          title="No reproducibility audit"
          description="Run an audit to check 16 integrity categories."
          action={
            <Button
              variant="primary"
              onClick={() => void mockServices.reproducibility.runAudit()}
            >
              Run mock audit
            </Button>
          }
        />
      ) : (
        <>
          <div className="cly-overview-grid">
            <Panel className="cly-panel-body">
              <div className="cly-row-between">
                <div>
                  <div className="cly-page-kicker">Overall status</div>
                  <h2 style={{ margin: "5px 0", fontSize: 22 }}>
                    {audit.status}
                  </h2>
                  <p className="cly-muted cly-small">
                    Audit {audit.id} ·{" "}
                    {new Date(audit.createdAt).toLocaleString()}
                  </p>
                </div>
                <div
                  className="cly-budget-ring"
                  style={{ "--value": audit.score } as React.CSSProperties}
                >
                  <div>
                    <strong>{audit.score}</strong>
                    <span>of 100</span>
                  </div>
                </div>
              </div>
              <div className="cly-progress" style={{ marginTop: 15 }}>
                <span style={{ width: `${audit.score}%` }} />
              </div>
            </Panel>
            <Panel className="cly-panel-body">
              <div className="cly-inspector-label">Finding summary</div>
              <RiskDistribution
                values={[
                  {
                    label: "Blocking",
                    value: findings.filter(
                      (item) =>
                        item.severity === "Blocking" &&
                        item.status !== "Resolved",
                    ).length,
                    tone: "danger",
                  },
                  {
                    label: "High",
                    value: findings.filter(
                      (item) =>
                        item.severity === "High" && item.status !== "Resolved",
                    ).length,
                    tone: "warning",
                  },
                  {
                    label: "Warnings",
                    value: findings.filter(
                      (item) =>
                        item.severity === "Warning" &&
                        item.status !== "Resolved",
                    ).length,
                    tone: "neutral",
                  },
                  {
                    label: "Passed",
                    value: findings.filter((item) => item.severity === "Passed")
                      .length,
                    tone: "success",
                  },
                ]}
              />
              <div className="cly-metric-row">
                <Metric
                  label="Blocking"
                  value={
                    findings.filter(
                      (item) =>
                        item.severity === "Blocking" &&
                        item.status !== "Resolved",
                    ).length
                  }
                />
                <Metric
                  label="High risk"
                  value={
                    findings.filter(
                      (item) =>
                        item.severity === "High" && item.status !== "Resolved",
                    ).length
                  }
                />
                <Metric
                  label="Warnings"
                  value={
                    findings.filter(
                      (item) =>
                        item.severity === "Warning" &&
                        item.status !== "Resolved",
                    ).length
                  }
                />
                <Metric
                  label="Passed"
                  value={
                    findings.filter((item) => item.severity === "Passed").length
                  }
                />
              </div>
              <div className="cly-row" style={{ marginTop: 12 }}>
                <Button
                  onClick={() =>
                    notify(
                      "Checklist exported",
                      "The publication checklist contains all 16 categories and finding dispositions.",
                    )
                  }
                >
                  <Download size={13} /> Export checklist
                </Button>
                <Button
                  onClick={() =>
                    notify(
                      "Publication package preview",
                      "Blocked by Figure 4 manual edit and the unpinned solver environment.",
                    )
                  }
                >
                  <Archive size={13} /> Publication package
                </Button>
              </div>
            </Panel>
          </div>
          <Section
            title="Audit findings"
            subtitle={`${auditCategories.length} categories · evidence-linked and assignable`}
            actions={
              <select
                className="cly-select"
                style={{ width: 130 }}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                aria-label="Filter audit findings"
              >
                <option>All</option>
                <option>Blocking</option>
                <option>High</option>
                <option>Warning</option>
                <option>Passed</option>
                <option>Open</option>
                <option>Resolved</option>
              </select>
            }
          >
            <Panel>
              {visible.map((finding) => (
                <div className="cly-list-row" key={finding.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(finding.id)}
                    style={{
                      minWidth: 0,
                      border: 0,
                      background: "transparent",
                      color: "inherit",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <div className="cly-row">
                      <Badge tone={toneForStatus(finding.severity)}>
                        {finding.severity}
                      </Badge>
                      <strong>{finding.title}</strong>
                    </div>
                    <div className="cly-list-detail">
                      {finding.category} · {finding.detail}
                    </div>
                  </button>
                  <div className="cly-row">
                    <Badge tone={toneForStatus(finding.status)}>
                      {finding.status}
                    </Badge>
                    {finding.status !== "Resolved" ? (
                      <Button
                        onClick={(event) => {
                          event.stopPropagation();
                          void mockServices.reproducibility.resolveFinding(
                            finding.id,
                          );
                          notify("Finding resolved", finding.title);
                        }}
                      >
                        <Check size={12} /> Resolve
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </Panel>
          </Section>
          <Section
            title="Audit coverage"
            subtitle="Every category has a defined future service boundary"
          >
            <div className="cly-grid-3">
              {auditCategories.map((category) => (
                <div className="cly-row" key={category}>
                  <CheckCircle2 size={13} className="cly-faint" />
                  <span className="cly-small">{category}</span>
                </div>
              ))}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

type PlannerView =
  | "Prioritized"
  | "Roadmap"
  | "By claim"
  | "By experiment"
  | "By risk"
  | "By effort";

const signalCells = ["one", "two", "three", "four", "five"];

function SignalMeter({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "danger";
}) {
  const level =
    value === "High" || value === "Now" || value === "Large"
      ? 5
      : value === "Medium" || value === "Soon"
        ? 3
        : 2;
  return (
    <div className="cly-signal-meter" data-tone={tone}>
      <span className="cly-sr-only">
        {label}: {value}
      </span>
      <div aria-hidden="true">
        {signalCells.map((cell, index) => (
          <i key={cell} data-active={index < level} />
        ))}
      </div>
      <small>{value}</small>
    </div>
  );
}

function nextStepBucket(step: NextStep) {
  if (step.status === "Deferred") return "Waiting";
  if (step.status === "Dismissed") return "Completed";
  return "Ready";
}

function NextStepRow({
  step,
  index,
  onSelect,
  selected,
}: {
  step: NextStep;
  index: number;
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <div
      className="cly-next-step-row cly-priority-row"
      data-status={step.status}
      data-selected={selected}
    >
      <div className="cly-next-step-rank">
        <strong>{index + 1}</strong>
        {index === 0 ? <small>↑ 2</small> : <small>—</small>}
      </div>
      <button type="button" className="cly-next-step-main" onClick={onSelect}>
        <strong>{step.title}</strong>
        <span>{step.rationale}</span>
        <small>
          <Link2 size={10} />{" "}
          {step.experimentId ?? step.claimId ?? step.category}
        </small>
      </button>
      <SignalMeter label="Impact" value={step.impact} tone="success" />
      <SignalMeter label="Effort" value={step.effort} tone="warning" />
      <SignalMeter label="Urgency" value={step.urgency} tone="danger" />
      <div className="cly-priority-dependencies">
        <strong>{step.evidenceIds.length}</strong>
        <Link2 size={11} />
      </div>
      <div className="cly-priority-agent">
        <span>
          <Users size={13} />
        </span>
        <div>
          <strong>{step.agentPreset}</strong>
          <small>{step.contextPack}</small>
        </div>
      </div>
      <ChevronRight size={14} className="cly-priority-chevron" />
    </div>
  );
}

export function NextStepsScreen() {
  const rawSteps = useClyStore((s) => s.data.nextSteps);
  const steps = prioritizeNextSteps(rawSteps);
  const setSelected = useClyStore((s) => s.setSelected);
  const setScreen = useClyStore((s) => s.setScreen);
  const notify = useClyStore((s) => s.notify);
  const inspectorOpen = useClyStore((s) => s.inspectorOpen);
  const toggleInspector = useClyStore((s) => s.toggleInspector);
  const [view, setView] = useState<PlannerView>("Prioritized");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedStepId, setSelectedStepId] = useState(steps[0]?.id ?? "");
  const visible = steps.filter(
    (step) =>
      (statusFilter === "All" || nextStepBucket(step) === statusFilter) &&
      (!query ||
        `${step.title} ${step.rationale} ${step.category}`
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  const selectedStep =
    steps.find((step) => step.id === selectedStepId) ?? visible[0] ?? steps[0];
  const selectStep = (step: NextStep) => {
    setSelectedStepId(step.id);
    setSelected(step.id);
  };
  const renderStep = (step: NextStep, index: number) => (
    <NextStepRow
      step={step}
      index={index}
      selected={step.id === selectedStep?.id}
      onSelect={() => selectStep(step)}
    />
  );

  const nextStepList =
    view === "Roadmap" ? (
      <div className="cly-next-step-roadmap">
        {["Now", "Soon", "Later"].map((urgency) => (
          <section key={urgency}>
            <header>
              <strong>{urgency}</strong>
              <span>
                {visible.filter((step) => step.urgency === urgency).length}
              </span>
            </header>
            {visible
              .filter((step) => step.urgency === urgency)
              .map((step) => (
                <button
                  type="button"
                  key={step.id}
                  data-selected={step.id === selectedStep?.id}
                  onClick={() => selectStep(step)}
                >
                  <span>
                    <strong>{step.title}</strong>
                    <small>{step.rationale}</small>
                  </span>
                  <Badge tone={toneForStatus(step.status)}>{step.status}</Badge>
                </button>
              ))}
          </section>
        ))}
      </div>
    ) : visible.length > 100 ? (
      <ClyVirtualList
        items={visible}
        height={620}
        estimateSize={82}
        renderItem={renderStep}
        getKey={(step) => step.id}
        label="Prioritized next-step recommendations"
        className="cly-next-step-list cly-priority-list"
      />
    ) : (
      <ol className="cly-next-step-list cly-priority-list">
        {visible.map((step, index) => (
          <li key={step.id}>{renderStep(step, index)}</li>
        ))}
      </ol>
    );

  const nextStepsPrimary = (
    <section className="cly-priority-workspace">
      <div
        className="cly-priority-tabs"
        role="tablist"
        aria-label="Next-step status"
      >
        {["All", "Ready", "Waiting", "Completed"].map((status) => (
          <button
            type="button"
            role="tab"
            key={status}
            aria-selected={statusFilter === status}
            onClick={() => setStatusFilter(status)}
          >
            {status}
            <span>
              {status === "All"
                ? steps.length
                : steps.filter((step) => nextStepBucket(step) === status)
                    .length}
            </span>
          </button>
        ))}
        <div className="cly-priority-toolbar">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search next steps…"
          />
          <select
            className="cly-select"
            value={view}
            onChange={(event) => setView(event.target.value as PlannerView)}
            aria-label="Next-step organization"
          >
            <option>Prioritized</option>
            <option>Roadmap</option>
            <option>By claim</option>
            <option>By experiment</option>
            <option>By risk</option>
            <option>By effort</option>
          </select>
        </div>
      </div>
      {visible.length ? (
        <>
          <div className="cly-priority-columns" aria-hidden="true">
            <span>Priority</span>
            <span>Next step</span>
            <span>Impact</span>
            <span>Effort</span>
            <span>Urgency</span>
            <span>Deps</span>
            <span>Agent</span>
            <span />
          </div>
          {nextStepList}
        </>
      ) : (
        <EmptyState
          title="No matching next steps"
          description="Clear the active filters or generate updated recommendations."
        />
      )}
    </section>
  );

  const nextStepInspector = selectedStep ? (
    <aside
      className="cly-integrity-inspector cly-next-step-inspector"
      data-inline-inspector
      aria-label="Selected next step"
    >
      <header>
        <div>
          <div className="cly-row-between">
            <span className="cly-priority-label">
              Priority{" "}
              {steps.findIndex((step) => step.id === selectedStep.id) + 1}
            </span>
            <Badge tone={toneForStatus(selectedStep.status)}>
              {selectedStep.status}
            </Badge>
          </div>
          <h2>{selectedStep.title}</h2>
          <p>{selectedStep.rationale}</p>
        </div>
        <Button
          variant="ghost"
          iconOnly
          aria-label="Close next-step details"
          onClick={toggleInspector}
        >
          <PanelRightClose size={14} />
        </Button>
      </header>
      <div className="cly-integrity-inspector-scroll">
        <section>
          <div className="cly-integrity-section-label">Full rationale</div>
          <p className="cly-integrity-body-copy">
            {selectedStep.rationale} Completing this work addresses the most
            consequential open gap while preserving the current evidence and
            provenance chain.
          </p>
        </section>
        <section>
          <div className="cly-integrity-section-label">Dependencies</div>
          <div className="cly-dependency-list">
            {selectedStep.evidenceIds.slice(0, 3).map((evidenceId, index) => (
              <div key={evidenceId}>
                <FileText size={13} />
                <span>{evidenceId}</span>
                <Badge
                  tone={
                    index === selectedStep.evidenceIds.length - 1
                      ? "warning"
                      : "success"
                  }
                >
                  {index === selectedStep.evidenceIds.length - 1
                    ? "Waiting"
                    : "Ready"}
                </Badge>
              </div>
            ))}
          </div>
        </section>
        <section>
          <div className="cly-integrity-section-label">Linked objects</div>
          <div className="cly-integrity-link-list">
            {selectedStep.experimentId ? (
              <button
                type="button"
                onClick={() =>
                  notify("Experiment opened", selectedStep.experimentId)
                }
              >
                <Beaker size={14} />
                <span>
                  <strong>{selectedStep.experimentId}</strong>
                  <small>Linked experiment</small>
                </span>
                <ChevronRight size={13} />
              </button>
            ) : null}
            {selectedStep.claimId ? (
              <button
                type="button"
                onClick={() => notify("Claim opened", selectedStep.claimId)}
              >
                <ShieldCheck size={14} />
                <span>
                  <strong>{selectedStep.claimId}</strong>
                  <small>Evidence target</small>
                </span>
                <ChevronRight size={13} />
              </button>
            ) : null}
          </div>
        </section>
        <section>
          <div className="cly-integrity-section-label">Impact / effort</div>
          <ImpactEffortMap
            items={[{ ...selectedStep, label: selectedStep.title }]}
          />
          <div className="cly-impact-summary">
            <span>
              <strong>{selectedStep.impact}</strong> impact
            </span>
            <span>
              <strong>{selectedStep.effort}</strong> effort
            </span>
            <span>
              <strong>{selectedStep.urgency}</strong> urgency
            </span>
          </div>
        </section>
      </div>
      <footer className="cly-integrity-inspector-actions cly-next-step-actions-grid">
        <Button
          variant="primary"
          onClick={() => {
            void mockServices.planner.setStatus(selectedStep.id, "Accepted");
            notify("Recommendation accepted", selectedStep.title);
          }}
        >
          <Check size={13} /> Accept
        </Button>
        <Button
          onClick={() => {
            setScreen("agents");
            notify(
              "Converted to agent session",
              `${selectedStep.agentPreset} with ${selectedStep.contextPack}.`,
            );
          }}
        >
          <Users size={13} /> Delegate
        </Button>
        <Button
          onClick={() => {
            void mockServices.planner.setStatus(selectedStep.id, "Deferred");
            notify("Next step scheduled", selectedStep.title);
          }}
        >
          <CalendarDays size={13} /> Schedule
        </Button>
        <Button
          onClick={() =>
            void mockServices.planner.setStatus(selectedStep.id, "Deferred")
          }
        >
          <Clock size={13} /> Defer
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            void mockServices.planner.setStatus(selectedStep.id, "Dismissed")
          }
        >
          <X size={13} /> Dismiss
        </Button>
      </footer>
    </aside>
  ) : null;

  return (
    <div className="cly-page cly-page-wide cly-route-next-steps cly-integrity-page">
      <PageHeader
        title="Next Steps"
        description="Prioritized actions to move your research forward."
        actions={
          <>
            <Button
              onClick={() =>
                notify(
                  "Recommendations refreshed",
                  "Five fixture recommendations were re-ranked using impact, urgency, effort, and dependency evidence.",
                )
              }
            >
              <Sparkles size={13} /> Generate next steps
            </Button>
            <Button
              variant="primary"
              onClick={() =>
                notify(
                  "Next-step composer opened",
                  "Create a manual action and link its dependencies.",
                )
              }
            >
              <Plus size={13} /> Add next step
            </Button>
            {!inspectorOpen && selectedStep ? (
              <Button
                iconOnly
                aria-label="Open next-step details"
                onClick={toggleInspector}
              >
                <PanelRightOpen size={14} />
              </Button>
            ) : null}
          </>
        }
      />
      {steps.length === 0 ? (
        <EmptyState
          title="No next steps yet"
          description="Recommendations appear when risks or evidence gaps are linked."
        />
      ) : inspectorOpen && nextStepInspector ? (
        <ClySplitPane
          id="next-steps-inline-inspector"
          className="cly-integrity-split cly-next-steps-split"
          secondarySize={31}
          primaryMin="620px"
          secondaryMin="290px"
          secondaryMax="42%"
          primary={nextStepsPrimary}
          secondary={nextStepInspector}
          label="Resize next-step details"
        />
      ) : (
        nextStepsPrimary
      )}
    </div>
  );
}

type DecisionView =
  | "Timeline"
  | "Active"
  | "Superseded"
  | "Unresolved"
  | "By claim"
  | "By experiment";

function decisionGroup(decision: ResearchDecision) {
  const content = `${decision.title} ${decision.decision}`.toLowerCase();
  if (content.includes("baseline") || content.includes("configuration"))
    return "Model & baseline strategy";
  if (content.includes("report") || content.includes("coverage"))
    return "Evaluation & reporting";
  return "Research direction";
}

function decisionOwner(decision: ResearchDecision) {
  if (decision.origin === "Agent-assisted") return "Cly + researcher";
  if (decision.origin === "Team") return "Research team";
  return "Project lead";
}

export function DecisionsScreen() {
  const decisions = useClyStore((s) => s.data.decisions);
  const setSelected = useClyStore((s) => s.setSelected);
  const notify = useClyStore((s) => s.notify);
  const inspectorOpen = useClyStore((s) => s.inspectorOpen);
  const toggleInspector = useClyStore((s) => s.toggleInspector);
  const [view, setView] = useState<DecisionView>("Timeline");
  const [query, setQuery] = useState("");
  const [selectedDecisionId, setSelectedDecisionId] = useState(
    decisions[0]?.id ?? "",
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [decision, setDecision] = useState("");
  const [reason, setReason] = useState("");
  const visible = decisions.filter(
    (item) =>
      (view === "Timeline" ||
        view === "By claim" ||
        view === "By experiment" ||
        item.status === view) &&
      (!query ||
        `${item.title} ${item.decision} ${item.reason}`
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  const selectedDecision =
    decisions.find((item) => item.id === selectedDecisionId) ??
    visible[0] ??
    decisions[0];
  const groupedDecisions = useMemo(() => {
    const groups = new Map<string, ResearchDecision[]>();
    for (const item of visible) {
      const group = decisionGroup(item);
      groups.set(group, [...(groups.get(group) ?? []), item]);
    }
    return [...groups.entries()].map(([group, items]) => ({
      group,
      items: [...items].sort((a, b) => b.date.localeCompare(a.date)),
    }));
  }, [visible]);
  const selectDecision = (item: ResearchDecision) => {
    setSelectedDecisionId(item.id);
    setSelected(item.id);
  };
  const create = async () => {
    if (!title.trim() || !decision.trim()) return;
    const item = await mockServices.decisions.create({
      title,
      decision,
      reason: reason || "Reason not yet recorded",
    });
    setCreateOpen(false);
    setSelected(item.id);
    setTitle("");
    setDecision("");
    setReason("");
    notify("Research decision recorded");
  };

  const decisionTimeline = (
    <section className="cly-decision-workspace">
      <div className="cly-decision-toolbar">
        <select
          className="cly-select"
          value={view}
          onChange={(event) => setView(event.target.value as DecisionView)}
          aria-label="Filter decision log"
        >
          <option>Timeline</option>
          <option>Active</option>
          <option>Superseded</option>
          <option>Unresolved</option>
          <option>By claim</option>
          <option>By experiment</option>
        </select>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search decisions…"
        />
        <span>
          {visible.length} decision{visible.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="cly-decision-groups">
        {groupedDecisions.map(({ group, items }) => (
          <section key={group} className="cly-decision-group">
            <header>
              <span>
                <i />
                {group}
              </span>
              <small>
                {items.length} decision{items.length === 1 ? "" : "s"}
              </small>
            </header>
            <div className="cly-decision-timeline-list">
              {items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className="cly-decision-row"
                  data-selected={item.id === selectedDecision?.id}
                  onClick={() => selectDecision(item)}
                >
                  <i className="cly-decision-dot" />
                  <span className="cly-decision-row-main">
                    <small>
                      {new Date(`${item.date}T00:00:00`).toLocaleDateString(
                        undefined,
                        { month: "short", day: "numeric", year: "numeric" },
                      )}
                    </small>
                    <strong>{item.title}</strong>
                    <em>{item.decision}</em>
                  </span>
                  <span className="cly-decision-owner">
                    <span>
                      <UserRound size={12} />
                    </span>
                    {decisionOwner(item)}
                  </span>
                  <Badge tone={toneForStatus(item.status)}>{item.status}</Badge>
                </button>
              ))}
            </div>
          </section>
        ))}
        {!visible.length ? (
          <EmptyState
            title="No matching decisions"
            description="Change the status filter or search terms to see the decision history."
          />
        ) : null}
      </div>
    </section>
  );

  const relatedDecisions = selectedDecision
    ? decisions.filter(
        (item) =>
          item.id !== selectedDecision.id &&
          item.affectedIds.some((id) =>
            selectedDecision.affectedIds.includes(id),
          ),
      )
    : [];
  const decisionInspector = selectedDecision ? (
    <aside
      className="cly-integrity-inspector cly-decision-inspector"
      data-inline-inspector
      aria-label="Selected decision details"
    >
      <header>
        <div>
          <div className="cly-row-between">
            <span>
              {new Date(`${selectedDecision.date}T00:00:00`).toLocaleDateString(
                undefined,
                { month: "short", day: "numeric", year: "numeric" },
              )}
            </span>
            <Badge tone={toneForStatus(selectedDecision.status)}>
              {selectedDecision.status}
            </Badge>
          </div>
          <h2>{selectedDecision.title}</h2>
          <p>{selectedDecision.decision}</p>
        </div>
        <Button
          variant="ghost"
          iconOnly
          aria-label="Close decision details"
          onClick={toggleInspector}
        >
          <PanelRightClose size={14} />
        </Button>
      </header>
      <div className="cly-integrity-inspector-scroll">
        <div className="cly-decision-attribution">
          <span>
            <UserRound size={13} />
          </span>
          <div>
            <small>Owner</small>
            <strong>{decisionOwner(selectedDecision)}</strong>
          </div>
          <span>
            <Users size={13} />
          </span>
          <div>
            <small>Origin</small>
            <strong>{selectedDecision.origin}</strong>
          </div>
        </div>
        <details open className="cly-decision-detail-section">
          <summary>
            <strong>Rationale</strong>
            <ChevronRight size={13} />
          </summary>
          <p>{selectedDecision.reason}</p>
        </details>
        <details open className="cly-decision-detail-section">
          <summary>
            <strong>Alternatives considered</strong>
            <ChevronRight size={13} />
          </summary>
          {selectedDecision.alternatives.length ? (
            <ul>
              {selectedDecision.alternatives.map((alternative) => (
                <li key={alternative}>{alternative}</li>
              ))}
            </ul>
          ) : (
            <p>No alternatives have been recorded.</p>
          )}
          <button
            type="button"
            className="cly-integrity-text-action"
            onClick={() =>
              notify(
                "Alternative comparison opened",
                `${selectedDecision.alternatives.length} alternatives available`,
              )
            }
          >
            View full comparison
          </button>
        </details>
        <details open className="cly-decision-detail-section">
          <summary>
            <strong>Linked evidence</strong>
            <ChevronRight size={13} />
          </summary>
          <div className="cly-integrity-link-list">
            {selectedDecision.evidenceIds.map((id, index) => (
              <button
                type="button"
                key={id}
                onClick={() => notify("Evidence opened", id)}
              >
                {index % 3 === 0 ? (
                  <Beaker size={14} />
                ) : index % 3 === 1 ? (
                  <ShieldCheck size={14} />
                ) : (
                  <FileText size={14} />
                )}
                <span>
                  <strong>{id}</strong>
                  <small>
                    {index % 3 === 0
                      ? "Experiment or run"
                      : index % 3 === 1
                        ? "Claim"
                        : "Source or artifact"}
                  </small>
                </span>
                <ChevronRight size={13} />
              </button>
            ))}
            {!selectedDecision.evidenceIds.length ? (
              <p className="cly-integrity-body-copy">
                No evidence has been linked yet.
              </p>
            ) : null}
          </div>
        </details>
        <details open className="cly-decision-detail-section">
          <summary>
            <strong>Supersession</strong>
            <ChevronRight size={13} />
          </summary>
          <p>
            {selectedDecision.supersededBy
              ? `This decision was superseded by ${selectedDecision.supersededBy}.`
              : "This decision is current and has not been superseded."}
          </p>
        </details>
        {selectedDecision.outcome ? (
          <details open className="cly-decision-detail-section">
            <summary>
              <strong>Outcome</strong>
              <ChevronRight size={13} />
            </summary>
            <p>{selectedDecision.outcome}</p>
          </details>
        ) : null}
        <section>
          <div className="cly-row-between">
            <div className="cly-integrity-section-label">Related decisions</div>
            <button
              type="button"
              className="cly-integrity-text-action"
              onClick={() =>
                notify("Decision timeline focused", selectedDecision.title)
              }
            >
              View timeline
            </button>
          </div>
          <div className="cly-integrity-link-list">
            {relatedDecisions.slice(0, 3).map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => selectDecision(item)}
              >
                <CheckCircle2 size={14} />
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.date}</small>
                </span>
                <ChevronRight size={13} />
              </button>
            ))}
            {!relatedDecisions.length ? (
              <p className="cly-integrity-body-copy">
                No related decisions share affected research objects.
              </p>
            ) : null}
          </div>
        </section>
      </div>
      <footer className="cly-integrity-inspector-actions cly-decision-actions">
        <Button
          onClick={() => notify("Evidence linker opened", selectedDecision.id)}
        >
          <ExternalLink size={13} /> Open evidence
        </Button>
        <Button
          onClick={() => {
            const replacement = decisions.find(
              (item) =>
                item.id !== selectedDecision.id && item.status === "Unresolved",
            );
            if (replacement) {
              void mockServices.decisions.supersede(
                selectedDecision.id,
                replacement.id,
              );
              notify(
                "Decision superseded",
                `${selectedDecision.title} → ${replacement.title}`,
              );
            } else
              notify(
                "No replacement selected",
                "Create or select a replacement decision first.",
              );
          }}
        >
          <CheckCircle2 size={13} /> Supersede
        </Button>
        <Button
          variant="primary"
          onClick={() => notify("Follow-up created", selectedDecision.title)}
        >
          <CalendarDays size={13} /> Create follow-up
        </Button>
      </footer>
    </aside>
  ) : null;

  return (
    <div className="cly-page cly-page-wide cly-route-decisions cly-integrity-page">
      <PageHeader
        title="Decisions"
        description="A timeline of key research decisions and their outcomes."
        actions={
          <>
            <Button
              iconOnly
              aria-label="Export decision log"
              onClick={() =>
                notify(
                  "Decision log exported",
                  `${decisions.length} decisions with evidence and supersession chains.`,
                )
              }
            >
              <Download size={13} />
            </Button>
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus size={13} /> New decision
            </Button>
            {!inspectorOpen && selectedDecision ? (
              <Button
                iconOnly
                aria-label="Open decision details"
                onClick={toggleInspector}
              >
                <PanelRightOpen size={14} />
              </Button>
            ) : null}
          </>
        }
      />
      {decisions.length === 0 ? (
        <EmptyState
          title="No research decisions recorded"
          description="Record the choice and its rationale."
          action={
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              Record first decision
            </Button>
          }
        />
      ) : inspectorOpen && decisionInspector ? (
        <ClySplitPane
          id="decisions-inline-inspector"
          className="cly-integrity-split cly-decisions-split"
          secondarySize={36}
          primaryMin="560px"
          secondaryMin="310px"
          secondaryMax="46%"
          primary={decisionTimeline}
          secondary={decisionInspector}
          label="Resize decision details"
        />
      ) : (
        decisionTimeline
      )}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Record research decision"
        description="Capture the selected direction and why it was chosen."
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!title.trim() || !decision.trim()}
              onClick={() => void create()}
            >
              Record decision
            </Button>
          </>
        }
      >
        <div className="cly-stack">
          <div className="cly-field">
            <label htmlFor="decision-title">Title</label>
            <input
              id="decision-title"
              className="cly-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="cly-field">
            <label htmlFor="decision-text">Decision</label>
            <textarea
              id="decision-text"
              className="cly-textarea"
              value={decision}
              onChange={(event) => setDecision(event.target.value)}
            />
          </div>
          <div className="cly-field">
            <label htmlFor="decision-reason">Reason and evidence</label>
            <textarea
              id="decision-reason"
              className="cly-textarea"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
