import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Download,
  FileCheck2,
  GitCompare,
  ListChecks,
  Plus,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
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
import { ClyVirtualList } from "../components/toolkit";
import {
  ImpactEffortMap,
  RelationshipChain,
  RiskDistribution,
} from "../components/visuals";
import { prioritizeNextSteps } from "../domain/logic";
import type {
  DecisionBrief,
  DecisionBriefFindingCategory,
  NextStep,
  ResearchDecision,
} from "../domain/types";
import {
  apiClient,
  type ProvenanceEvent,
  type ProvenanceIntegrity,
} from "../services/api-client";
import { projectServices } from "../services/project-services";
import { useClyStore } from "../store/cly-store";

function downloadJson(fileName: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([`${JSON.stringify(value, null, 2)}\n`], {
      type: "application/json;charset=utf-8",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

type ProvenanceView =
  | "Gallery"
  | "Table"
  | "Lineage"
  | "Broken"
  | "Stale"
  | "Unlinked";

export function ProvenanceScreen() {
  const artifacts = useClyStore((s) => s.data.artifacts);
  const data = useClyStore((s) => s.data);
  const setSelected = useClyStore((s) => s.setSelected);
  const notify = useClyStore((s) => s.notify);
  const activeProjectId = useClyStore((s) => s.activeProjectId);
  const fixtureMode = useClyStore((s) => s.fixtureMode);
  const [view, setView] = useState<ProvenanceView>("Lineage");
  const [query, setQuery] = useState("");
  const [events, setEvents] = useState<ProvenanceEvent[]>([]);
  const [integrity, setIntegrity] = useState<ProvenanceIntegrity | null>(null);

  useEffect(() => {
    const explicitTestRuntime =
      import.meta.env.DEV && import.meta.env.VITE_CLY_TEST_FIXTURES === "1";
    if (fixtureMode !== "empty" || explicitTestRuntime || !activeProjectId) {
      if (!activeProjectId) {
        setEvents([]);
        setIntegrity(null);
      }
      return;
    }
    let current = true;
    Promise.all([
      apiClient.fetchProvenance(activeProjectId),
      apiClient.verifyProvenance(activeProjectId),
    ])
      .then(([nextEvents, nextIntegrity]) => {
        if (!current) return;
        setEvents(nextEvents);
        setIntegrity(nextIntegrity);
      })
      .catch((error) => {
        if (!current) return;
        setEvents([]);
        setIntegrity({
          valid: false,
          reason:
            error instanceof Error
              ? error.message
              : "Provenance verification failed.",
        });
      });
    return () => {
      current = false;
    };
  }, [activeProjectId, fixtureMode]);
  const visible = artifacts.filter(
    (item) =>
      (!query ||
        `${item.name} ${item.path} ${item.generator}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (view !== "Broken" || item.regeneration === "Broken") &&
      (view !== "Stale" ||
        item.regeneration === "Stale" ||
        item.regeneration === "Manual") &&
      (view !== "Unlinked" || item.claimIds.length === 0),
  );
  return (
    <div className="cly-page cly-page-wide cly-route-provenance">
      <PageHeader
        kicker="Integrity"
        title="Figure & Table Provenance"
        description="Trace results back to data, code, runs, and claims."
        actions={
          <>
            <Segmented
              value={view}
              options={
                [
                  "Gallery",
                  "Table",
                  "Lineage",
                  "Broken",
                  "Stale",
                  "Unlinked",
                ] as const
              }
              onChange={setView}
              label="Provenance view"
            />
            <Button
              disabled={!activeProjectId}
              onClick={() => {
                downloadJson(`cly-provenance-${activeProjectId}.json`, {
                  projectId: activeProjectId,
                  integrity,
                  events,
                  artifacts,
                });
                notify(
                  "Provenance report downloaded",
                  `${events.length} ledger events and ${artifacts.length} artifacts.`,
                );
              }}
            >
              <Download size={13} /> Report
            </Button>
          </>
        }
      />
      {fixtureMode === "empty" ? (
        <Panel className="cly-panel-body cly-section">
          <div className="cly-row-between">
            <div>
              <strong>Project provenance ledger</strong>
              <div className="cly-muted cly-small">
                {events.length} immutable, ordered events from SQLite
              </div>
            </div>
            <Badge
              tone={
                !activeProjectId
                  ? "info"
                  : integrity?.valid
                    ? "success"
                    : "danger"
              }
            >
              {!activeProjectId
                ? "Choose a project"
                : integrity?.valid
                  ? "Chain verified"
                  : "Integrity warning"}
            </Badge>
          </div>
          {integrity?.reason ? (
            <div className="cly-callout" data-tone="danger" role="alert">
              {integrity.reason}
            </div>
          ) : null}
          {events.length > 0 ? (
            <div className="cly-table-wrap" style={{ marginTop: 12 }}>
              <table className="cly-table">
                <thead>
                  <tr>
                    <th>Sequence</th>
                    <th>Action</th>
                    <th>Actor</th>
                    <th>Object</th>
                    <th>Time</th>
                    <th>Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id}>
                      <td>{event.sequence ?? "Legacy"}</td>
                      <td>{event.action}</td>
                      <td>{event.actorId ?? event.actorType}</td>
                      <td>{event.objectId ?? "Project"}</td>
                      <td>{new Date(event.createdAt).toLocaleString()}</td>
                      <td className="cly-mono">
                        {event.eventHash?.slice(0, 12) ?? "Unchained"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Panel>
      ) : null}
      <div className="cly-metric-row">
        <Metric
          label="Artifacts"
          value={artifacts.length.toLocaleString()}
          detail="Figures, tables, outputs, reports"
        />
        <Metric
          label="Regenerable"
          value={
            artifacts.filter((item) => item.regeneration === "Ready").length
          }
          detail="Complete lineage"
        />
        <Metric
          label="Manual edit risk"
          value={
            artifacts.filter((item) => item.regeneration === "Manual").length
          }
          detail="Needs scripted replacement"
        />
        <Metric
          label="Broken"
          value={
            artifacts.filter((item) => item.regeneration === "Broken").length
          }
          detail="Cannot regenerate"
        />
      </div>
      {artifacts.length === 0 ? (
        <EmptyState
          title="No output artifacts indexed"
          description="Attach or import a figure, table, output, or report."
        />
      ) : (
        <>
          <div className="cly-filterbar cly-section">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search artifacts and generators…"
            />
            <Button
              onClick={() => {
                downloadJson(
                  `cly-artifact-comparison-${activeProjectId}.json`,
                  {
                    artifacts: visible.map(
                      ({
                        id,
                        name,
                        hash,
                        sourceData,
                        generator,
                        runId,
                        commit,
                        regeneration,
                      }) => ({
                        id,
                        name,
                        hash,
                        sourceData,
                        generator,
                        runId,
                        commit,
                        regeneration,
                      }),
                    ),
                  },
                );
                notify(
                  "Artifact comparison downloaded",
                  `${visible.length} visible artifact versions included.`,
                );
              }}
            >
              <GitCompare size={13} /> Compare versions
            </Button>
          </div>
          {view === "Gallery" ||
          view === "Broken" ||
          view === "Stale" ||
          view === "Unlinked" ? (
            <div className="cly-grid-3">
              {visible.slice(0, 120).map((artifact) => (
                <button
                  type="button"
                  className="cly-panel cly-interactive-panel"
                  key={artifact.id}
                  aria-label={`Open provenance for ${artifact.name}`}
                  onClick={() => setSelected(artifact.id)}
                >
                  <div className="cly-preview">
                    <div>
                      <FileCheck2 size={22} style={{ margin: "0 auto 9px" }} />
                      <div>{artifact.preview}</div>
                    </div>
                  </div>
                  <div className="cly-panel-body">
                    <div className="cly-row-between">
                      <strong className="cly-clamp-2">{artifact.name}</strong>
                      <Badge tone={toneForStatus(artifact.regeneration)}>
                        {artifact.regeneration}
                      </Badge>
                    </div>
                    <div className="cly-list-detail cly-mono">
                      {artifact.path}
                    </div>
                    <div className="cly-row-between" style={{ marginTop: 9 }}>
                      <span className="cly-faint cly-small">
                        {artifact.hash}
                      </span>
                      <span className="cly-faint cly-small">
                        {artifact.claimIds.length} claims
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
          {view === "Table" ? (
            <div className="cly-table-wrap">
              <table className="cly-table">
                <thead>
                  <tr>
                    <th>Artifact</th>
                    <th>Kind</th>
                    <th>Source data</th>
                    <th>Generator</th>
                    <th>Run</th>
                    <th>Commit</th>
                    <th>Regeneration</th>
                    <th>Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.slice(0, 250).map((artifact) => (
                    <tr
                      key={artifact.id}
                      onClick={() => setSelected(artifact.id)}
                    >
                      <td>{artifact.name}</td>
                      <td>{artifact.kind}</td>
                      <td>{artifact.sourceData}</td>
                      <td className="cly-mono">{artifact.generator}</td>
                      <td>{artifact.runId}</td>
                      <td className="cly-mono">{artifact.commit}</td>
                      <td>
                        <Badge tone={toneForStatus(artifact.regeneration)}>
                          {artifact.regeneration}
                        </Badge>
                      </td>
                      <td className="cly-mono">{artifact.hash}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {view === "Lineage" ? (
            <Panel className="cly-panel-body">
              {artifacts.slice(0, 4).map((artifact) => (
                <section key={artifact.id} style={{ marginBottom: 20 }}>
                  <div className="cly-row-between">
                    <strong>{artifact.name}</strong>
                    <Badge tone={toneForStatus(artifact.regeneration)}>
                      {artifact.regeneration}
                    </Badge>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <RelationshipChain
                      label={`Lineage for ${artifact.name}`}
                      alertAt={
                        artifact.regeneration === "Manual" ||
                        artifact.regeneration === "Broken"
                          ? 3
                          : undefined
                      }
                      steps={[
                        { label: "Input", detail: artifact.sourceData },
                        {
                          label: "Experiment",
                          detail:
                            data.experiments.find(
                              (item) => item.id === artifact.experimentId,
                            )?.name ?? artifact.experimentId,
                        },
                        {
                          label: "Run",
                          detail:
                            data.runs.find((item) => item.id === artifact.runId)
                              ?.name ?? artifact.runId,
                        },
                        { label: "Generator", detail: artifact.generator },
                        { label: "Artifact", detail: artifact.name },
                        {
                          label: "Evidence",
                          detail: `${artifact.claimIds.length} linked claim(s)`,
                        },
                      ]}
                    />
                  </div>
                </section>
              ))}
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}

const auditAreas = [
  "Code",
  "Data",
  "Environment",
  "Experiments",
  "Outputs",
  "Claims",
] as const;

export function ReproducibilityScreen() {
  const audits = useClyStore((s) => s.data.audits);
  const audit = audits[0];
  const findings = useClyStore((s) => s.data.findings);
  const setSelected = useClyStore((s) => s.setSelected);
  const notify = useClyStore((s) => s.notify);
  const [filter, setFilter] = useState("All");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingFindingId, setUpdatingFindingId] = useState<string | null>(
    null,
  );
  const visible = findings.filter(
    (item) =>
      filter === "All" ||
      item.severity === filter ||
      item.status === filter ||
      item.area === filter,
  );
  const runAudit = async () => {
    setRunning(true);
    setError(null);
    try {
      await projectServices.reproducibility.runAudit();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "The audit could not be saved.",
      );
    } finally {
      setRunning(false);
    }
  };
  const setDisposition = async (
    findingId: string,
    input: {
      status: "Open" | "Assigned" | "Resolved" | "Deferred";
      assignee?: string;
      reason?: string;
    },
  ) => {
    setUpdatingFindingId(findingId);
    setError(null);
    try {
      await projectServices.reproducibility.setFindingDisposition(
        findingId,
        input,
      );
      notify(
        "Finding updated",
        `Disposition changed to ${input.status.toLowerCase()}.`,
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "The finding could not be updated.",
      );
    } finally {
      setUpdatingFindingId(null);
    }
  };
  return (
    <div className="cly-page cly-route-reproducibility">
      <PageHeader
        kicker="Integrity"
        title="Reproducibility Auditor"
        description="Find and fix publication blockers."
        actions={
          <>
            <Button
              disabled={audits.length < 2}
              title={
                audits.length < 2
                  ? "Run at least two audits to compare them."
                  : undefined
              }
              onClick={() => {
                downloadJson("cly-reproducibility-audit-comparison.json", {
                  audits: audits.map((item, index) => ({
                    ...item,
                    scoreChangeFromPrevious: audits[index + 1]
                      ? item.score - audits[index + 1].score
                      : null,
                  })),
                });
                notify(
                  "Audit comparison downloaded",
                  `${audits.length} durable audits included.`,
                );
              }}
            >
              <GitCompare size={13} /> Compare audits
            </Button>
            <Button
              variant="primary"
              disabled={running}
              onClick={() => void runAudit()}
            >
              <RefreshCw size={13} className={running ? "animate-spin" : ""} />
              {running ? "Auditing…" : "Run audit"}
            </Button>
          </>
        }
      />
      {error ? (
        <div className="cly-callout" data-tone="danger" role="alert">
          {error}
        </div>
      ) : null}
      {!audit ? (
        <EmptyState
          title="No reproducibility audit"
          description="Run an audit across six reproducibility areas."
          action={
            <Button
              variant="primary"
              disabled={running}
              onClick={() => void runAudit()}
            >
              Run audit
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
                  onClick={() => {
                    downloadJson(`cly-reproducibility-${audit.id}.json`, {
                      audit,
                      findings,
                    });
                    notify(
                      "Checklist downloaded",
                      `${findings.length} findings and their durable dispositions.`,
                    );
                  }}
                >
                  <Download size={13} /> Export checklist
                </Button>
              </div>
            </Panel>
          </div>
          <Section
            title="Audit findings"
            subtitle={`${auditAreas.length} areas · evidence-linked and assignable`}
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
                <option>Assigned</option>
                <option>Deferred</option>
                {auditAreas.map((area) => (
                  <option key={area}>{area}</option>
                ))}
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
                    {finding.recommendedFix ? (
                      <div className="cly-list-detail">
                        Recommended fix: {finding.recommendedFix}
                        {finding.affectedClaimIds?.length
                          ? ` · ${finding.affectedClaimIds.length} affected claim${finding.affectedClaimIds.length === 1 ? "" : "s"}`
                          : ""}
                      </div>
                    ) : null}
                  </button>
                  <div className="cly-row">
                    <Badge tone={toneForStatus(finding.status)}>
                      {finding.status}
                    </Badge>
                    {finding.status !== "Resolved" ? (
                      <Button
                        disabled={updatingFindingId === finding.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          void setDisposition(finding.id, {
                            status: "Resolved",
                          });
                        }}
                      >
                        <Check size={12} /> Resolve
                      </Button>
                    ) : (
                      <Button
                        disabled={updatingFindingId === finding.id}
                        onClick={() =>
                          void setDisposition(finding.id, { status: "Open" })
                        }
                      >
                        Reopen
                      </Button>
                    )}
                    {finding.status !== "Assigned" &&
                    finding.status !== "Resolved" ? (
                      <Button
                        disabled={updatingFindingId === finding.id}
                        onClick={() =>
                          void setDisposition(finding.id, {
                            status: "Assigned",
                            assignee: "local-user",
                          })
                        }
                      >
                        Assign to me
                      </Button>
                    ) : null}
                    {finding.status !== "Deferred" &&
                    finding.status !== "Resolved" ? (
                      <Button
                        disabled={updatingFindingId === finding.id}
                        onClick={() =>
                          void setDisposition(finding.id, {
                            status: "Deferred",
                            reason: "Deferred for a later research review.",
                          })
                        }
                      >
                        Defer
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </Panel>
          </Section>
          <Section
            title="Audit coverage"
            subtitle="Code, data, environment, experiment, output, and claim checks"
          >
            <div className="cly-table-wrap">
              <table className="cly-table">
                <thead>
                  <tr>
                    <th>Area</th>
                    <th>Result</th>
                    <th>Open findings</th>
                  </tr>
                </thead>
                <tbody>
                  {auditAreas.map((area) => {
                    const coverage = audit.areas?.find(
                      (item) => item.area === area,
                    );
                    const count =
                      coverage?.findingCount ??
                      findings.filter(
                        (finding) =>
                          finding.area === area &&
                          finding.severity !== "Passed" &&
                          finding.status !== "Resolved",
                      ).length;
                    const passed = coverage?.passed ?? count === 0;
                    return (
                      <tr key={area}>
                        <td>
                          <span className="cly-row">
                            <CheckCircle2 size={13} className="cly-faint" />
                            {area}
                          </span>
                        </td>
                        <td>
                          <Badge tone={passed ? "success" : "warning"}>
                            {passed ? "Passed" : "Needs attention"}
                          </Badge>
                        </td>
                        <td>{count}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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

function NextStepRow({
  step,
  index,
  onSelect,
  onAccept,
  onDefer,
  onStart,
  onDismiss,
}: {
  step: NextStep;
  index: number;
  onSelect: () => void;
  onAccept: () => void;
  onDefer: () => void;
  onStart: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="cly-next-step-row" data-status={step.status}>
      <div className="cly-next-step-rank">{index + 1}</div>
      <button type="button" className="cly-next-step-main" onClick={onSelect}>
        <div className="cly-row">
          <Badge tone={toneForStatus(step.status)}>{step.status}</Badge>
          <span className="cly-faint cly-small">{step.category}</span>
        </div>
        <strong>{step.title}</strong>
        <span>{step.rationale}</span>
      </button>
      <div className="cly-next-step-attributes">
        <span>
          <small>Impact</small>
          <strong>{step.impact}</strong>
        </span>
        <span>
          <small>Effort</small>
          <strong>{step.effort}</strong>
        </span>
        <span>
          <small>When</small>
          <strong>{step.urgency}</strong>
        </span>
      </div>
      <div className="cly-next-step-routing">
        <span>{step.agentPreset}</span>
        <small>{step.contextPack}</small>
      </div>
      <div className="cly-next-step-actions">
        <Button onClick={onAccept}>
          <Check size={12} /> Accept
        </Button>
        <Button
          variant="ghost"
          iconOnly
          aria-label={`Defer ${step.title}`}
          onClick={onDefer}
        >
          <Clock size={12} />
        </Button>
        <Button
          variant="ghost"
          iconOnly
          aria-label={`Start ${step.title}`}
          onClick={onStart}
        >
          <Sparkles size={12} />
        </Button>
        <Button
          variant="ghost"
          iconOnly
          aria-label={`Dismiss ${step.title}`}
          onClick={onDismiss}
        >
          <X size={12} />
        </Button>
      </div>
    </div>
  );
}

export function NextStepsScreen() {
  const data = useClyStore((s) => s.data);
  const rawSteps = useClyStore((s) => s.data.nextSteps);
  const steps = prioritizeNextSteps(rawSteps);
  const setSelected = useClyStore((s) => s.setSelected);
  const notify = useClyStore((s) => s.notify);
  const [view, setView] = useState<PlannerView>("Prioritized");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const updateStatus = async (step: NextStep, status: NextStep["status"]) => {
    setBusy(true);
    setError(null);
    try {
      await projectServices.planner.setStatus(step.id, status);
      notify(
        `Recommendation ${status.toLowerCase()}`,
        `${step.title} is ${status.toLowerCase()}.`,
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "The recommendation could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  };
  const generate = async () => {
    setBusy(true);
    setError(null);
    const generated: NextStep[] = [
      ...data.findings
        .filter(
          (finding) =>
            finding.status !== "Resolved" && finding.severity !== "Passed",
        )
        .map(
          (finding): NextStep => ({
            id: `finding-${finding.id}`,
            title: finding.recommendedFix || `Resolve ${finding.title}`,
            category: "Integrity",
            rationale: finding.detail,
            impact:
              finding.severity === "Blocking" || finding.severity === "High"
                ? "High"
                : "Medium",
            effort: "Medium",
            urgency: finding.severity === "Blocking" ? "Now" : "Soon",
            evidenceIds: finding.objectIds,
            agentPreset: "Research integrity reviewer",
            contextPack: "Audit findings",
            status: "Recommended",
          }),
        ),
      ...data.claims
        .filter((claim) => claim.supportingSourceIds.length === 0)
        .map(
          (claim): NextStep => ({
            id: `claim-${claim.id}`,
            title: `Add evidence for ${claim.text}`,
            category: "Claim",
            rationale: "This claim has no linked supporting source.",
            impact: "High",
            effort: "Medium",
            urgency: "Soon",
            evidenceIds: [claim.id],
            claimId: claim.id,
            agentPreset: "Evidence reviewer",
            contextPack: "Claims and sources",
            status: "Recommended",
          }),
        ),
      ...data.experiments
        .filter((experiment) => experiment.runIds.length === 0)
        .map(
          (experiment): NextStep => ({
            id: `experiment-${experiment.id}`,
            title: `Run ${experiment.name}`,
            category: "Experiment",
            rationale: "The experiment has no recorded run.",
            impact: "Medium",
            effort: "Large",
            urgency: "Soon",
            evidenceIds: [experiment.id],
            experimentId: experiment.id,
            agentPreset: "Experiment runner",
            contextPack: "Experiment definition",
            status: "Recommended",
          }),
        ),
    ];
    try {
      const saved = await projectServices.planner.generate(generated);
      notify(
        "Recommendations generated",
        `${saved.length} durable next steps.`,
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Recommendations could not be generated.",
      );
    } finally {
      setBusy(false);
    }
  };
  const visible = steps.filter(
    (step) =>
      !query ||
      `${step.title} ${step.rationale} ${step.category}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const renderStep = (step: NextStep, index: number) => (
    <NextStepRow
      step={step}
      index={index}
      onSelect={() => setSelected(step.id)}
      onAccept={() => void updateStatus(step, "Accepted")}
      onDefer={() => void updateStatus(step, "Deferred")}
      onStart={() => void updateStatus(step, "In progress")}
      onDismiss={() => void updateStatus(step, "Dismissed")}
    />
  );
  return (
    <div className="cly-page cly-route-next-steps">
      <PageHeader
        kicker="Integrity"
        title="Next-Step Planner"
        description="Prioritize evidence gaps, failures, and research risks."
        actions={
          <>
            <Segmented
              value={view}
              options={
                [
                  "Prioritized",
                  "Roadmap",
                  "By claim",
                  "By experiment",
                  "By risk",
                  "By effort",
                ] as const
              }
              onChange={setView}
              label="Planner view"
            />
            <Button disabled={busy} onClick={() => void generate()}>
              <Sparkles size={13} /> Generate next steps
            </Button>
          </>
        }
      />
      {error ? (
        <div className="cly-callout" data-tone="danger" role="alert">
          {error}
        </div>
      ) : null}
      {view === "Prioritized" && steps.length ? (
        <section
          className="cly-next-step-visual"
          aria-label="Recommendation overview"
        >
          <div>
            <span className="cly-page-kicker">Priority field</span>
            <strong>High-impact work is concentrated at medium effort</strong>
            <small>
              Position reflects the current durable ranking; the list remains
              the actionable source of truth.
            </small>
          </div>
          <ImpactEffortMap
            items={steps.map((step) => ({ ...step, label: step.title }))}
          />
        </section>
      ) : null}
      <div className="cly-filterbar">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search recommendations…"
        />
        <span className="cly-muted cly-small">
          {steps.filter((step) => step.status === "Recommended").length}{" "}
          recommended ·{" "}
          {
            steps.filter(
              (step) =>
                step.status === "Accepted" || step.status === "In progress",
            ).length
          }{" "}
          active
        </span>
      </div>
      {steps.length === 0 ? (
        <EmptyState
          title="No next steps yet"
          description="Recommendations appear when risks or evidence gaps are linked."
        />
      ) : view === "Roadmap" ? (
        <div className="cly-grid-3">
          {["Now", "Soon", "Later"].map((urgency) => (
            <Panel key={urgency}>
              <div className="cly-panel-header">
                <strong>{urgency}</strong>
                <Badge>
                  {steps.filter((step) => step.urgency === urgency).length}
                </Badge>
              </div>
              {steps
                .filter((step) => step.urgency === urgency)
                .map((step) => (
                  <button
                    className="cly-list-row"
                    type="button"
                    key={step.id}
                    onClick={() => setSelected(step.id)}
                  >
                    <div>
                      <div className="cly-list-title">{step.title}</div>
                      <div className="cly-list-detail">
                        {step.category} · {step.effort} effort
                      </div>
                    </div>
                  </button>
                ))}
            </Panel>
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
          className="cly-next-step-list"
        />
      ) : (
        <ol className="cly-next-step-list">
          {visible.map((step, index) => (
            <li key={step.id}>{renderStep(step, index)}</li>
          ))}
        </ol>
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

type DecisionsMode = "Decisions" | "Briefs";

const briefSectionLabels: Array<{
  category: DecisionBriefFindingCategory;
  title: string;
}> = [
  { category: "unresolved-decision", title: "Decisions needing owners" },
  { category: "failed-run", title: "Failed experiments and runs" },
  {
    category: "stale-artifact-or-claim",
    title: "Newly stale artifacts and claims",
  },
  { category: "contradictory-evidence", title: "Contradictory evidence" },
  { category: "missing-provenance", title: "Missing provenance" },
  { category: "recommended-next-action", title: "Recommended next actions" },
];

function DecisionBriefPanel({ brief }: { brief: DecisionBrief }) {
  const setSelected = useClyStore((s) => s.setSelected);
  const setScreen = useClyStore((s) => s.setScreen);
  const transitionFinding = useClyStore(
    (s) => s.transitionDecisionBriefFinding,
  );
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const isLong = brief.findings.length > 12;
  return (
    <Panel className="cly-panel-body" data-testid="decision-brief-panel">
      <div className="cly-row-between">
        <div>
          <strong>
            Interval #{brief.startSequence + 1}–#{brief.cutoffSequence}
          </strong>
          <div className="cly-muted cly-small">
            Immutable provenance cutoff · generated{" "}
            {new Date(brief.createdAt).toLocaleString()}
          </div>
        </div>
        {brief.pilot ? (
          <Badge
            tone={
              brief.pilot.assignmentOrResolutionRate >= 0.5
                ? "success"
                : "warning"
            }
          >
            Meeting {brief.pilot.meetingNumber}/{brief.pilot.targetMeetings} ·{" "}
            {Math.round(brief.pilot.assignmentOrResolutionRate * 100)}% assigned
            or resolved
          </Badge>
        ) : null}
      </div>
      {isLong ? (
        <div className="cly-callout" style={{ marginTop: 12 }}>
          Long brief: {brief.findings.length} findings. Sections stay grouped so
          owner-needed decisions remain first.
        </div>
      ) : null}
      <div
        className="cly-stack"
        style={
          isLong
            ? { maxHeight: 620, overflow: "auto", marginTop: 12 }
            : { marginTop: 12 }
        }
      >
        {briefSectionLabels.map(({ category, title }) => {
          const findings = brief.findings.filter(
            (finding) => finding.category === category,
          );
          if (findings.length === 0) return null;
          return (
            <section key={category} aria-label={title}>
              <div className="cly-row-between" style={{ marginBottom: 8 }}>
                <strong>{title}</strong>
                <Badge
                  tone={
                    category === "unresolved-decision" ? "warning" : "neutral"
                  }
                >
                  {findings.length}
                </Badge>
              </div>
              <div className="cly-stack">
                {findings.map((finding) => (
                  <div className="cly-callout" key={finding.id}>
                    <div className="cly-row-between">
                      <strong>{finding.title}</strong>
                      <Badge
                        tone={toneForStatus(
                          finding.status === "resolved"
                            ? "Complete"
                            : finding.status === "deferred"
                              ? "Stale"
                              : finding.status === "assigned"
                                ? "Running"
                                : "Queued",
                        )}
                      >
                        {finding.status}
                      </Badge>
                    </div>
                    <div
                      className="cly-muted cly-small"
                      style={{ marginTop: 5 }}
                    >
                      {finding.detail}
                    </div>
                    <div
                      className="cly-muted cly-small"
                      style={{ marginTop: 5 }}
                    >
                      <strong>Next:</strong> {finding.recommendedAction}
                    </div>
                    <div
                      className="cly-row"
                      style={{ flexWrap: "wrap", marginTop: 9 }}
                    >
                      {finding.evidence.map((evidence) => (
                        <span
                          className="cly-row"
                          key={`${evidence.objectId}-${evidence.provenanceEventId}`}
                        >
                          <Button
                            onClick={() => setSelected(evidence.objectId)}
                          >
                            {evidence.objectType}: {evidence.objectTitle}
                          </Button>
                          <Button onClick={() => setScreen("provenance")}>
                            Event #{evidence.provenanceSequence}
                          </Button>
                        </span>
                      ))}
                    </div>
                    {finding.status !== "resolved" ? (
                      <div
                        className="cly-row"
                        style={{ flexWrap: "wrap", marginTop: 9 }}
                      >
                        <input
                          aria-label={`Owner for ${finding.title}`}
                          className="cly-input"
                          placeholder="Owner"
                          value={owners[finding.id] ?? finding.owner ?? ""}
                          onChange={(event) =>
                            setOwners((state) => ({
                              ...state,
                              [finding.id]: event.target.value,
                            }))
                          }
                        />
                        <Button
                          onClick={() =>
                            void transitionFinding(brief.id, finding.id, {
                              status: "assigned",
                              owner: owners[finding.id] ?? finding.owner,
                            })
                          }
                        >
                          Assign
                        </Button>
                        <Button
                          onClick={() =>
                            void transitionFinding(brief.id, finding.id, {
                              status: "resolved",
                              owner: owners[finding.id] ?? finding.owner,
                            })
                          }
                        >
                          Resolve
                        </Button>
                        <input
                          aria-label={`Deferral reason for ${finding.title}`}
                          className="cly-input"
                          placeholder="Required deferral reason"
                          value={reasons[finding.id] ?? ""}
                          onChange={(event) =>
                            setReasons((state) => ({
                              ...state,
                              [finding.id]: event.target.value,
                            }))
                          }
                        />
                        <Button
                          onClick={() =>
                            void transitionFinding(brief.id, finding.id, {
                              status: "deferred",
                              owner: owners[finding.id] ?? finding.owner,
                              reason: reasons[finding.id],
                            })
                          }
                        >
                          Defer
                        </Button>
                      </div>
                    ) : null}
                    {finding.deferredReason ? (
                      <div
                        className="cly-faint cly-small"
                        style={{ marginTop: 8 }}
                      >
                        Deferred: {finding.deferredReason}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </Panel>
  );
}

export function DecisionsScreen() {
  const decisions = useClyStore((s) => s.data.decisions);
  const setSelected = useClyStore((s) => s.setSelected);
  const notify = useClyStore((s) => s.notify);
  const decisionBriefs = useClyStore((s) => s.decisionBriefs);
  const decisionBriefsLoading = useClyStore((s) => s.decisionBriefsLoading);
  const decisionBriefsError = useClyStore((s) => s.decisionBriefsError);
  const loadDecisionBriefs = useClyStore((s) => s.loadDecisionBriefs);
  const generateDecisionBrief = useClyStore((s) => s.generateDecisionBrief);
  const [mode, setMode] = useState<DecisionsMode>("Decisions");
  const [view, setView] = useState<DecisionView>("Timeline");
  const [createOpen, setCreateOpen] = useState(false);
  const [operation, setOperation] = useState<{
    type: "create" | "edit" | "supersede";
    id?: string;
  }>({ type: "create" });
  const [actionDecisionId, setActionDecisionId] = useState("");
  const [title, setTitle] = useState("");
  const [decision, setDecision] = useState("");
  const [reason, setReason] = useState("");
  const [noChanges, setNoChanges] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (mode === "Briefs") void loadDecisionBriefs();
  }, [loadDecisionBriefs, mode]);
  const visible = decisions.filter(
    (item) =>
      view === "Timeline" ||
      view === "By claim" ||
      view === "By experiment" ||
      item.status === view,
  );
  const openDecisionDialog = (
    type: "create" | "edit" | "supersede",
    item?: ResearchDecision,
  ) => {
    setOperation({ type, id: item?.id });
    setTitle(
      type === "supersede"
        ? `Replace: ${item?.title ?? ""}`
        : (item?.title ?? ""),
    );
    setDecision(type === "supersede" ? "" : (item?.decision ?? ""));
    setReason(type === "supersede" ? "" : (item?.reason ?? ""));
    setError(null);
    setCreateOpen(true);
  };
  const submitDecision = async () => {
    if (!title.trim() || !decision.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const input = {
        title: title.trim(),
        decision: decision.trim(),
        reason: reason.trim() || "Reason not yet recorded",
      };
      const item =
        operation.type === "edit" && operation.id
          ? await projectServices.decisions.update(operation.id, input)
          : operation.type === "supersede" && operation.id
            ? await projectServices.decisions.supersede(operation.id, input)
            : await projectServices.decisions.create(input);
      setCreateOpen(false);
      setSelected(item.id);
      setActionDecisionId(item.id);
      setTitle("");
      setDecision("");
      setReason("");
      notify(
        operation.type === "edit"
          ? "Research decision updated"
          : operation.type === "supersede"
            ? "Research decision superseded"
            : "Research decision recorded",
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "The research decision could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cly-page cly-route-decisions">
      <PageHeader
        kicker="Integrity"
        title={
          mode === "Briefs"
            ? "Lab-meeting decision briefs"
            : "Research Decision Log"
        }
        description={
          mode === "Briefs"
            ? "A deterministic, evidence-linked meeting brief centered on unresolved decisions."
            : "Record what changed, why, and what it affected."
        }
        actions={
          <>
            <Segmented
              value={mode}
              options={["Decisions", "Briefs"] as const}
              onChange={setMode}
              label="Decision workspace mode"
            />
            {mode === "Briefs" ? (
              <Button
                variant="primary"
                disabled={decisionBriefsLoading}
                onClick={() =>
                  void generateDecisionBrief().then((result) =>
                    setNoChanges(Boolean(result?.noChanges)),
                  )
                }
              >
                <Sparkles size={13} /> Generate brief
              </Button>
            ) : null}
            {mode === "Decisions" ? (
              <Segmented
                value={view}
                options={
                  [
                    "Timeline",
                    "Active",
                    "Superseded",
                    "Unresolved",
                    "By claim",
                    "By experiment",
                  ] as const
                }
                onChange={setView}
                label="Decision view"
              />
            ) : null}
            {mode === "Decisions" ? (
              <Button
                variant="primary"
                onClick={() => openDecisionDialog("create")}
              >
                <Plus size={13} /> New decision
              </Button>
            ) : null}
          </>
        }
      />
      {error && !createOpen ? (
        <div className="cly-callout" data-tone="danger" role="alert">
          {error}
        </div>
      ) : null}
      {mode === "Briefs" ? (
        <div className="cly-stack">
          {decisionBriefsLoading ? (
            <Panel className="cly-panel-body" aria-busy="true">
              Generating or loading the evidence-linked brief…
            </Panel>
          ) : null}
          {decisionBriefsError ? (
            <div className="cly-callout" data-tone="danger" role="alert">
              {decisionBriefsError}{" "}
              <Button onClick={() => void loadDecisionBriefs()}>Retry</Button>
            </div>
          ) : null}
          {noChanges && !decisionBriefsLoading ? (
            <EmptyState
              title="No graph or provenance changes since the last immutable cutoff"
              description="The next brief will include only a later provenance sequence."
            />
          ) : null}
          {!decisionBriefsLoading &&
          !decisionBriefsError &&
          decisionBriefs.length === 0 &&
          !noChanges ? (
            <EmptyState
              title="No lab-meeting briefs yet"
              description="Generate the first brief from the persisted research graph and provenance ledger."
              action={
                <Button
                  variant="primary"
                  onClick={() => void generateDecisionBrief()}
                >
                  Generate first brief
                </Button>
              }
            />
          ) : null}
          {decisionBriefs.map((brief) => (
            <DecisionBriefPanel key={brief.id} brief={brief} />
          ))}
        </div>
      ) : null}
      {mode === "Decisions" ? (
        <>
          {decisions.length === 0 ? (
            <EmptyState
              title="No research decisions recorded"
              description="Record the choice and its rationale."
              action={
                <Button
                  variant="primary"
                  onClick={() => openDecisionDialog("create")}
                >
                  Record first decision
                </Button>
              }
            />
          ) : (
            <div className="cly-timeline">
              {visible.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className="cly-timeline-item"
                  onClick={() => setSelected(item.id)}
                  style={{
                    border: 0,
                    background: "transparent",
                    color: "inherit",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <span className="cly-timeline-dot" />
                  <Panel>
                    <div className="cly-panel-header">
                      <div>
                        <div className="cly-row">
                          <strong>{item.title}</strong>
                          <Badge tone={toneForStatus(item.status)}>
                            {item.status}
                          </Badge>
                        </div>
                        <div className="cly-muted cly-small">
                          {item.date} · {item.origin}
                        </div>
                      </div>
                      <ArrowRight size={13} />
                    </div>
                    <div className="cly-panel-body">
                      <p style={{ marginTop: 0 }}>{item.decision}</p>
                      <p className="cly-muted cly-small">{item.reason}</p>
                      <div className="cly-row-between">
                        <span className="cly-faint cly-small">
                          {item.alternatives.length} alternatives ·{" "}
                          {item.evidenceIds.length} evidence links ·{" "}
                          {item.affectedIds.length} affected objects
                        </span>
                        {item.supersededBy ? (
                          <Badge tone="warning">
                            Superseded by {item.supersededBy}
                          </Badge>
                        ) : null}
                      </div>
                      {item.outcome ? (
                        <div className="cly-callout" style={{ marginTop: 10 }}>
                          <strong>Outcome</strong>
                          <div
                            className="cly-muted cly-small"
                            style={{ marginTop: 3 }}
                          >
                            {item.outcome}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </Panel>
                </button>
              ))}
            </div>
          )}
          <Section title="Decision actions">
            <div className="cly-row">
              <select
                className="cly-select"
                aria-label="Decision to update"
                value={actionDecisionId}
                onChange={(event) => setActionDecisionId(event.target.value)}
              >
                <option value="">Select an active decision</option>
                {decisions
                  .filter((item) => item.status !== "Superseded")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
              </select>
              <Button
                disabled={!actionDecisionId}
                onClick={() => {
                  const item = decisions.find(
                    (candidate) => candidate.id === actionDecisionId,
                  );
                  if (item) openDecisionDialog("edit", item);
                }}
              >
                Edit decision
              </Button>
              <Button
                disabled={!actionDecisionId}
                onClick={() => {
                  const item = decisions.find(
                    (candidate) => candidate.id === actionDecisionId,
                  );
                  if (item) openDecisionDialog("supersede", item);
                }}
              >
                <ListChecks size={13} /> Supersede
              </Button>
              <Button
                disabled={decisions.length === 0}
                onClick={() => {
                  downloadJson("cly-research-decision-log.json", {
                    decisions,
                  });
                  notify(
                    "Decision log downloaded",
                    `${decisions.length} decisions with supersession links.`,
                  );
                }}
              >
                <Download size={13} /> Export log
              </Button>
            </div>
          </Section>
          <Dialog
            open={createOpen}
            onClose={() => setCreateOpen(false)}
            title={
              operation.type === "edit"
                ? "Edit research decision"
                : operation.type === "supersede"
                  ? "Supersede research decision"
                  : "Record research decision"
            }
            description={
              operation.type === "supersede"
                ? "Record the replacement direction. The earlier decision remains in immutable history."
                : "Capture the selected direction and why it was chosen."
            }
            footer={
              <>
                <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button
                  variant="primary"
                  disabled={busy || !title.trim() || !decision.trim()}
                  onClick={() => void submitDecision()}
                >
                  {busy
                    ? "Saving…"
                    : operation.type === "edit"
                      ? "Save changes"
                      : operation.type === "supersede"
                        ? "Supersede decision"
                        : "Record decision"}
                </Button>
              </>
            }
          >
            <div className="cly-stack">
              {error ? (
                <div className="cly-callout" data-tone="danger" role="alert">
                  {error}
                </div>
              ) : null}
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
        </>
      ) : null}
    </div>
  );
}
