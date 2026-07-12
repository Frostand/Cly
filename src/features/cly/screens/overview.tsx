import {
  ArrowRight,
  Beaker,
  Bot,
  FileText,
  GitBranch,
  Lightbulb,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { LocalStatusBanner } from "../components/chrome";
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Panel,
  Section,
  toneForStatus,
} from "../components/primitives";
import { ResearchLifecycle, VisualMetric } from "../components/visuals";
import { useClyStore } from "../store/cly-store";

export function OverviewScreen() {
  const data = useClyStore((s) => s.data);
  const activeProjectId = useClyStore((s) => s.activeProjectId);
  const setScreen = useClyStore((s) => s.setScreen);
  const setSelected = useClyStore((s) => s.setSelected);
  const project =
    data.projects.find((item) => item.id === activeProjectId) ??
    data.projects[0];
  const strongClaim = [...data.claims].sort(
    (a, b) => b.confidence - a.confidence,
  )[0];
  const weakClaim = [...data.claims].sort(
    (a, b) => a.confidence - b.confidence,
  )[0];
  const audit = data.audits[0];
  const next = data.nextSteps.find((item) => item.status === "Recommended");

  if (!project)
    return (
      <div className="cly-page">
        <EmptyState
          title="Create your first research project"
          description="Cly will connect sources, code, experiments, outputs, claims, and decisions into one navigable evidence system."
          action={<Button variant="primary">New Project</Button>}
        />
      </div>
    );

  return (
    <div className="cly-page cly-route-overview">
      <PageHeader
        kicker="Project overview"
        title={project.name}
        description={project.description}
        actions={
          <>
            <Badge tone={project.localOnly ? "success" : "info"}>
              {project.localOnly ? "Local only" : "Cloud linked"}
            </Badge>
            <Button onClick={() => setScreen("graph")}>
              <GitBranch size={13} /> Open project graph
            </Button>
          </>
        }
      />
      <LocalStatusBanner />

      <ResearchLifecycle
        steps={[
          "Question",
          "Sources",
          "Method",
          "Experiment",
          "Evidence",
          "Claim",
        ]}
        current={4}
      />

      <section className="cly-visual-metrics" aria-label="Project summary">
        <VisualMetric
          label="Research phase"
          value={project.phase}
          detail="Updated today"
        />
        <VisualMetric
          label="Active claims"
          value={data.claims.length}
          detail={`${data.claims.filter((item) => item.status === "Weak" || item.status === "Needs review").length} need attention`}
          values={data.claims.map((item) => item.confidence)}
          tone="warning"
        />
        <VisualMetric
          label="Experiments"
          value={data.experiments.length}
          detail={`${data.experiments.filter((item) => item.status === "Running").length} running`}
          values={data.experiments.map((item) => item.runIds.length)}
        />
        <VisualMetric
          label="Reproducibility"
          value={audit ? `${audit.score}%` : "—"}
          detail={audit?.status ?? "Not audited"}
          values={
            audit
              ? [
                  Math.max(0, audit.score - 8),
                  Math.max(0, audit.score - 3),
                  audit.score,
                ]
              : undefined
          }
          tone={audit && audit.score >= 80 ? "success" : "warning"}
        />
        <VisualMetric
          label="Evidence graph"
          value={data.graphNodes.length}
          detail={`${data.graphEdges.length} relationships`}
          values={[
            data.sources.length,
            data.claims.length,
            data.graphNodes.length,
          ]}
        />
      </section>

      <Section
        title="Research direction"
        subtitle="The question and hypothesis currently organizing this project"
      >
        <div className="cly-project-brief">
          <Panel className="cly-panel-body">
            <div className="cly-page-kicker">Research question</div>
            <div style={{ fontSize: 17, lineHeight: 1.45, fontWeight: 590 }}>
              {project.question}
            </div>
          </Panel>
          <Panel className="cly-panel-body">
            <div className="cly-page-kicker">Current hypothesis</div>
            <div style={{ fontSize: 17, lineHeight: 1.45, fontWeight: 590 }}>
              {project.hypothesis}
            </div>
          </Panel>
        </div>
      </Section>

      {data.claims.length === 0 ? (
        <Section title="Build the evidence trail">
          <EmptyState
            title="No claims yet"
            description="Start with a precise claim, then link sources, experiments, and outputs as evidence."
            action={
              <Button variant="primary" onClick={() => setScreen("claims")}>
                Create first claim
              </Button>
            }
          />
        </Section>
      ) : (
        <div className="cly-overview-grid">
          <div>
            <Section
              title="Claims and integrity"
              subtitle="What is strongest, what is weakest, and what could block publication"
            >
              <Panel>
                {strongClaim ? (
                  <button
                    type="button"
                    className="cly-list-row"
                    onClick={() => {
                      setScreen("claims");
                      setSelected(strongClaim.id);
                    }}
                  >
                    <div>
                      <div className="cly-row">
                        <Badge tone={toneForStatus(strongClaim.status)}>
                          {strongClaim.status}
                        </Badge>
                        <span className="cly-faint cly-small">
                          Strongest active claim
                        </span>
                      </div>
                      <div
                        className="cly-list-title cly-clamp-2"
                        style={{ whiteSpace: "normal", marginTop: 7 }}
                      >
                        {strongClaim.text}
                      </div>
                      <div className="cly-list-detail">
                        {strongClaim.supportingSourceIds.length} supporting
                        sources · {strongClaim.experimentIds.length} experiments
                        · {strongClaim.confidence}% confidence
                      </div>
                    </div>
                    <ArrowRight size={14} />
                  </button>
                ) : null}
                {weakClaim ? (
                  <button
                    type="button"
                    className="cly-list-row"
                    onClick={() => {
                      setScreen("claims");
                      setSelected(weakClaim.id);
                    }}
                  >
                    <div>
                      <div className="cly-row">
                        <Badge tone={toneForStatus(weakClaim.status)}>
                          {weakClaim.status}
                        </Badge>
                        <span className="cly-faint cly-small">
                          Weakest active claim
                        </span>
                      </div>
                      <div
                        className="cly-list-title cly-clamp-2"
                        style={{ whiteSpace: "normal", marginTop: 7 }}
                      >
                        {weakClaim.text}
                      </div>
                      <div className="cly-list-detail">
                        Next evidence: {weakClaim.nextExperiment}
                      </div>
                    </div>
                    <ArrowRight size={14} />
                  </button>
                ) : null}
                {data.findings
                  .filter(
                    (item) =>
                      item.severity === "Blocking" || item.severity === "High",
                  )
                  .slice(0, 3)
                  .map((finding) => (
                    <button
                      type="button"
                      className="cly-list-row"
                      key={finding.id}
                      onClick={() => {
                        setScreen("reproducibility");
                        setSelected(finding.id);
                      }}
                    >
                      <div>
                        <div className="cly-row">
                          <ShieldCheck size={14} className="cly-faint" />
                          <Badge tone={toneForStatus(finding.severity)}>
                            {finding.severity}
                          </Badge>
                        </div>
                        <div
                          className="cly-list-title"
                          style={{ marginTop: 6 }}
                        >
                          {finding.title}
                        </div>
                        <div className="cly-list-detail">
                          {finding.category} · {finding.status}
                        </div>
                      </div>
                      <ArrowRight size={14} />
                    </button>
                  ))}
              </Panel>
            </Section>

            <Section
              title="Recent research activity"
              subtitle="A linked timeline across experiments, notebooks, sources, and decisions"
            >
              <div className="cly-timeline">
                {[
                  {
                    id: "exp-02",
                    icon: Beaker,
                    title: "OOD coverage stress test is running",
                    detail: "Compound-shift grid · 68% complete",
                    time: "Today · 08:36",
                    screen: "experiments" as const,
                  },
                  {
                    id: "nb-02",
                    icon: FileText,
                    title: "Notebook scan found four integrity issues",
                    detail: "Hidden state, seed, path, and stale outputs",
                    time: "Today · 08:31",
                    screen: "notebooks" as const,
                  },
                  {
                    id: "session-01",
                    icon: Bot,
                    title: "Claim audit entered adversarial review",
                    detail: "Baseline fairness is the leading reviewer concern",
                    time: "Today · 08:12",
                    screen: "agents" as const,
                  },
                  {
                    id: "decision-04",
                    icon: Lightbulb,
                    title: "New baseline decision recorded",
                    detail: "Compute-matched Gaussian process is proposed",
                    time: "Yesterday",
                    screen: "decisions" as const,
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className="cly-timeline-item"
                      style={{
                        border: 0,
                        background: "transparent",
                        color: "inherit",
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                      onClick={() => {
                        setScreen(item.screen);
                        setSelected(item.id);
                      }}
                    >
                      <span className="cly-timeline-dot" />
                      <span>
                        <span className="cly-row">
                          <Icon size={13} />
                          <strong className="cly-small">{item.title}</strong>
                        </span>
                        <span className="cly-muted cly-small">
                          {item.detail}
                        </span>
                        <span
                          className="cly-faint"
                          style={{
                            display: "block",
                            marginTop: 3,
                            fontSize: 9,
                          }}
                        >
                          {item.time}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Section>
          </div>

          <div>
            <Section
              title="Recommended next action"
              subtitle="Derived from claims, failed runs, sources, and audit findings"
            >
              {next ? (
                <Panel className="cly-panel-body">
                  <div className="cly-row-between">
                    <Badge tone="warning">{next.urgency}</Badge>
                    <span className="cly-faint cly-small">
                      {next.effort} effort
                    </span>
                  </div>
                  <h3 style={{ margin: "11px 0 7px", fontSize: 15 }}>
                    {next.title}
                  </h3>
                  <p
                    className="cly-muted cly-small"
                    style={{ lineHeight: 1.55 }}
                  >
                    {next.rationale}
                  </p>
                  <div className="cly-row" style={{ marginTop: 12 }}>
                    <Button
                      variant="primary"
                      onClick={() => {
                        setScreen("next-steps");
                        setSelected(next.id);
                      }}
                    >
                      Review action <ArrowRight size={13} />
                    </Button>
                    <Button onClick={() => setScreen("agents")}>
                      <Sparkles size={13} /> Agent plan
                    </Button>
                  </div>
                </Panel>
              ) : (
                <EmptyState
                  title="No recommendations"
                  description="Cly will derive next steps as research objects and risks are added."
                />
              )}
            </Section>

            <Section
              title="Project graph preview"
              subtitle={`${data.graphNodes.length} objects · ${data.graphEdges.length} links`}
              actions={
                <Button variant="ghost" onClick={() => setScreen("graph")}>
                  Open graph <ArrowRight size={13} />
                </Button>
              }
            >
              <Panel className="cly-panel-body">
                <div
                  style={{
                    height: 180,
                    position: "relative",
                    overflow: "hidden",
                    borderRadius: 7,
                    background:
                      "radial-gradient(var(--cly-border) 1px, transparent 1px)",
                    backgroundSize: "16px 16px",
                  }}
                >
                  {data.graphNodes.slice(0, 8).map((node, index) => (
                    <button
                      key={node.id}
                      type="button"
                      aria-label={node.label}
                      onClick={() => {
                        setScreen("graph");
                        setSelected(node.id);
                      }}
                      style={{
                        position: "absolute",
                        left: `${10 + (index % 3) * 31}%`,
                        top: `${10 + Math.floor(index / 3) * 31}%`,
                        width: 78,
                        height: 27,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        border: "1px solid var(--cly-border)",
                        borderRadius: 6,
                        background: "var(--cly-surface)",
                        color: "var(--cly-text-muted)",
                        fontSize: 8,
                        padding: "0 5px",
                        cursor: "pointer",
                      }}
                    >
                      {node.label}
                    </button>
                  ))}
                </div>
              </Panel>
            </Section>

            <Section title="Recent reports">
              <Panel>
                {data.reports.map((report) => (
                  <button
                    type="button"
                    className="cly-list-row"
                    key={report.id}
                    onClick={() =>
                      useClyStore
                        .getState()
                        .notify(
                          "Report preview",
                          `${report.title} is available as a fixture-backed ${report.type.toLowerCase()}.`,
                        )
                    }
                  >
                    <div>
                      <div className="cly-list-title">{report.title}</div>
                      <div className="cly-list-detail">
                        {report.type} · {report.status}
                      </div>
                    </div>
                    <Badge tone={toneForStatus(report.status)}>
                      {report.status}
                    </Badge>
                  </button>
                ))}
              </Panel>
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}
