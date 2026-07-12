import {
  Archive,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Download,
  FileCheck2,
  GitCompare,
  Link2,
  ListChecks,
  Plus,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";
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
import type { NextStep } from "../domain/types";
import { mockServices } from "../services/mock-services";
import { useClyStore } from "../store/cly-store";

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
  const [view, setView] = useState<ProvenanceView>("Lineage");
  const [query, setQuery] = useState("");
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
              onClick={() =>
                notify(
                  "Provenance report generated",
                  "The report includes hashes, lineage gaps, manual-edit risks, and regeneration status.",
                )
              }
            >
              <Download size={13} /> Report
            </Button>
          </>
        }
      />
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
              onClick={() =>
                notify(
                  "Version comparison",
                  "Select two artifact versions to compare hashes, source data, code, and visual changes.",
                )
              }
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
                <Panel
                  key={artifact.id}
                  onClick={() => setSelected(artifact.id)}
                  style={{ cursor: "pointer" }}
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
                </Panel>
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

function NextStepRow({
  step,
  index,
  onSelect,
  onAccept,
  onDefer,
  onCreateSession,
  onDismiss,
}: {
  step: NextStep;
  index: number;
  onSelect: () => void;
  onAccept: () => void;
  onDefer: () => void;
  onCreateSession: () => void;
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
          aria-label={`Create agent session for ${step.title}`}
          onClick={onCreateSession}
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
  const rawSteps = useClyStore((s) => s.data.nextSteps);
  const steps = prioritizeNextSteps(rawSteps);
  const setSelected = useClyStore((s) => s.setSelected);
  const setScreen = useClyStore((s) => s.setScreen);
  const notify = useClyStore((s) => s.notify);
  const [view, setView] = useState<PlannerView>("Prioritized");
  const [query, setQuery] = useState("");
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
      onAccept={() => {
        void mockServices.planner.setStatus(step.id, "Accepted");
        notify("Recommendation accepted", step.title);
      }}
      onDefer={() => void mockServices.planner.setStatus(step.id, "Deferred")}
      onCreateSession={() => {
        setScreen("agents");
        notify(
          "Converted to agent session",
          `${step.agentPreset} with ${step.contextPack}.`,
        );
      }}
      onDismiss={() =>
        void mockServices.planner.setStatus(step.id, "Dismissed")
      }
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
          </>
        }
      />
      {view === "Prioritized" && steps.length ? (
        <section
          className="cly-next-step-visual"
          aria-label="Recommendation overview"
        >
          <div>
            <span className="cly-page-kicker">Priority field</span>
            <strong>High-impact work is concentrated at medium effort</strong>
            <small>
              Position reflects the current fixture ranking; the list remains
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

export function DecisionsScreen() {
  const decisions = useClyStore((s) => s.data.decisions);
  const setSelected = useClyStore((s) => s.setSelected);
  const notify = useClyStore((s) => s.notify);
  const [view, setView] = useState<DecisionView>("Timeline");
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [decision, setDecision] = useState("");
  const [reason, setReason] = useState("");
  const visible = decisions.filter(
    (item) =>
      view === "Timeline" ||
      view === "By claim" ||
      view === "By experiment" ||
      item.status === view,
  );
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
  return (
    <div className="cly-page cly-route-decisions">
      <PageHeader
        kicker="Integrity"
        title="Research Decision Log"
        description="Record what changed, why, and what it affected."
        actions={
          <>
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
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus size={13} /> New decision
            </Button>
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
          <Button
            onClick={() =>
              notify(
                "Evidence linker opened",
                "Link a source, claim, experiment, code file, or agent session.",
              )
            }
          >
            <Link2 size={13} /> Link evidence
          </Button>
          <Button
            onClick={() =>
              notify(
                "Alternative comparison opened",
                "The comparison includes evidence, risks, cost, and affected project objects.",
              )
            }
          >
            <GitCompare size={13} /> Compare alternatives
          </Button>
          <Button
            onClick={() =>
              notify(
                "Decision branch created",
                "A fixture alternative branch was recorded without replacing the active decision.",
              )
            }
          >
            <ListChecks size={13} /> Branch decision
          </Button>
          <Button
            onClick={() =>
              notify(
                "Decision log exported",
                `${decisions.length} decisions with evidence and supersession chains.`,
              )
            }
          >
            <Download size={13} /> Export log
          </Button>
        </div>
      </Section>
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
