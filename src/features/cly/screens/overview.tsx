import {
  ArrowRight,
  Beaker,
  Bot,
  FileText,
  GitBranch,
  Lightbulb,
  type LucideIcon,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
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
import type { ScreenId, StatusTone } from "../domain/types";
import { useClyStore } from "../store/cly-store";

const LIFECYCLE_STEPS = [
  "Question",
  "Sources",
  "Method",
  "Experiment",
  "Evidence",
  "Claim",
];

const OVERVIEW_ACTIVITY: Array<{
  id: string;
  icon: LucideIcon;
  title: string;
  detail: string;
  time: string;
  screen: ScreenId;
}> = [
  {
    id: "exp-02",
    icon: Beaker,
    title: "OOD coverage stress test is running",
    detail: "Compound-shift grid · 68% complete",
    time: "Today · 08:36",
    screen: "experiments",
  },
  {
    id: "nb-02",
    icon: FileText,
    title: "Notebook scan found four integrity issues",
    detail: "Hidden state, seed, path, and stale outputs",
    time: "Today · 08:31",
    screen: "notebooks",
  },
  {
    id: "session-01",
    icon: Bot,
    title: "Claim audit entered adversarial review",
    detail: "Baseline fairness is the leading reviewer concern",
    time: "Today · 08:12",
    screen: "agents",
  },
  {
    id: "decision-04",
    icon: Lightbulb,
    title: "New baseline decision recorded",
    detail: "Compute-matched Gaussian process is proposed",
    time: "Yesterday",
    screen: "decisions",
  },
];

function EvidenceLedgerRow({
  tone,
  status,
  context,
  title,
  detail,
  icon,
  onClick,
}: {
  tone: StatusTone;
  status: string;
  context: string;
  title: string;
  detail: string;
  icon?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="cly-list-row cly-evidence-row"
      data-tone={tone}
      onClick={onClick}
    >
      <span className="cly-evidence-rail" aria-hidden="true" />
      <span className="cly-evidence-copy">
        <span className="cly-evidence-status">
          {icon}
          <Badge tone={tone}>{status}</Badge>
          <span>{context}</span>
        </span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <ArrowRight aria-hidden="true" />
    </button>
  );
}

function ResearchActivityItem({
  icon: Icon,
  title,
  detail,
  time,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  time: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="cly-timeline-item" onClick={onClick}>
      <span className="cly-timeline-dot" />
      <span className="cly-activity-copy">
        <span>
          <Icon aria-hidden="true" />
          <strong>{title}</strong>
        </span>
        <small>{detail}</small>
        <time>{time}</time>
      </span>
    </button>
  );
}

function GraphPreview() {
  const nodes = useClyStore((s) => s.data.graphNodes);
  const setScreen = useClyStore((s) => s.setScreen);
  const setSelected = useClyStore((s) => s.setSelected);

  return (
    <div className="cly-overview-graph">
      {nodes.slice(0, 8).map((node, index) => (
        <button
          key={node.id}
          type="button"
          aria-label={`Open ${node.label} in project graph`}
          onClick={() => {
            setScreen("graph");
            setSelected(node.id);
          }}
          style={
            {
              "--graph-column": (index % 3) + 1,
              "--graph-row": Math.floor(index / 3) + 1,
            } as CSSProperties
          }
        >
          <GitBranch aria-hidden="true" />
          <span>{node.label}</span>
        </button>
      ))}
    </div>
  );
}

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

  if (!project) {
    return (
      <div className="cly-page">
        <EmptyState
          title="Create your first research project"
          description="Cly will connect sources, code, experiments, outputs, claims, and decisions into one navigable evidence system."
          action={<Button variant="primary">New Project</Button>}
        />
      </div>
    );
  }

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
              <GitBranch aria-hidden="true" /> Open project graph
            </Button>
          </>
        }
      />
      <LocalStatusBanner />

      <ResearchLifecycle steps={LIFECYCLE_STEPS} current={4} />

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
          tone="warning"
        />
        <VisualMetric
          label="Experiments"
          value={data.experiments.length}
          detail={`${data.experiments.filter((item) => item.status === "Running").length} running`}
        />
        <VisualMetric
          label="Reproducibility"
          value={audit ? `${audit.score}%` : "—"}
          detail={audit?.status ?? "Not audited"}
          tone={audit && audit.score >= 80 ? "success" : "warning"}
        />
        <VisualMetric
          label="Evidence graph"
          value={data.graphNodes.length}
          detail={`${data.graphEdges.length} relationships`}
        />
      </section>

      <Section
        title="Research direction"
        subtitle="The question and hypothesis currently organizing this project"
        className="cly-direction-section"
      >
        <div className="cly-project-brief">
          <Panel className="cly-panel-body">
            <div className="cly-page-kicker">Research question</div>
            <strong>{project.question}</strong>
          </Panel>
          <Panel className="cly-panel-body">
            <div className="cly-page-kicker">Current hypothesis</div>
            <strong>{project.hypothesis}</strong>
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
          <div className="cly-overview-primary">
            <Section
              title="Claims and integrity"
              subtitle="What is strongest, what is weakest, and what could block publication"
            >
              <Panel className="cly-evidence-ledger">
                {strongClaim ? (
                  <EvidenceLedgerRow
                    tone={toneForStatus(strongClaim.status)}
                    status={strongClaim.status}
                    context="Strongest active claim"
                    title={strongClaim.text}
                    detail={`${strongClaim.supportingSourceIds.length} supporting sources · ${strongClaim.experimentIds.length} experiments · ${strongClaim.confidence}% confidence`}
                    onClick={() => {
                      setScreen("claims");
                      setSelected(strongClaim.id);
                    }}
                  />
                ) : null}
                {weakClaim ? (
                  <EvidenceLedgerRow
                    tone={toneForStatus(weakClaim.status)}
                    status={weakClaim.status}
                    context="Weakest active claim"
                    title={weakClaim.text}
                    detail={`Next evidence: ${weakClaim.nextExperiment}`}
                    onClick={() => {
                      setScreen("claims");
                      setSelected(weakClaim.id);
                    }}
                  />
                ) : null}
                {data.findings
                  .filter(
                    (item) =>
                      item.severity === "Blocking" || item.severity === "High",
                  )
                  .slice(0, 3)
                  .map((finding) => (
                    <EvidenceLedgerRow
                      key={finding.id}
                      tone={toneForStatus(finding.severity)}
                      status={finding.severity}
                      context={
                        finding.severity === "Blocking"
                          ? "Blocks publication"
                          : "Integrity issue"
                      }
                      title={finding.title}
                      detail={`${finding.category} · ${finding.status}`}
                      icon={<ShieldCheck aria-hidden="true" />}
                      onClick={() => {
                        setScreen("reproducibility");
                        setSelected(finding.id);
                      }}
                    />
                  ))}
              </Panel>
            </Section>

            <Section
              title="Recent research activity"
              subtitle="A linked timeline across experiments, notebooks, sources, and decisions"
            >
              <div className="cly-timeline">
                {OVERVIEW_ACTIVITY.map((item) => (
                  <ResearchActivityItem
                    key={item.id}
                    {...item}
                    onClick={() => {
                      setScreen(item.screen);
                      setSelected(item.id);
                    }}
                  />
                ))}
              </div>
            </Section>
          </div>

          <aside className="cly-overview-rail" aria-label="Project actions">
            <Section
              title="Recommended next action"
              subtitle="Derived from claims, failed runs, sources, and audit findings"
            >
              {next ? (
                <Panel className="cly-panel-body cly-next-action">
                  <div className="cly-row-between">
                    <Badge tone="warning">{next.urgency}</Badge>
                    <span className="cly-faint cly-small">
                      {next.effort} effort
                    </span>
                  </div>
                  <h3>{next.title}</h3>
                  <p>{next.rationale}</p>
                  <div className="cly-row cly-next-action-buttons">
                    <Button
                      variant="primary"
                      onClick={() => {
                        setScreen("next-steps");
                        setSelected(next.id);
                      }}
                    >
                      Review action <ArrowRight aria-hidden="true" />
                    </Button>
                    <Button onClick={() => setScreen("agents")}>
                      <Sparkles aria-hidden="true" /> Agent plan
                    </Button>
                  </div>
                </Panel>
              ) : (
                <div className="cly-overview-empty">
                  <EmptyState
                    title="No recommendations yet"
                    description="Cly will surface the next best action as evidence and risks are added."
                  />
                </div>
              )}
            </Section>

            <Section
              title="Project graph preview"
              subtitle={`${data.graphNodes.length} objects · ${data.graphEdges.length} links`}
              actions={
                <Button variant="ghost" onClick={() => setScreen("graph")}>
                  Open graph <ArrowRight aria-hidden="true" />
                </Button>
              }
            >
              <GraphPreview />
            </Section>

            <Section title="Recent reports">
              <Panel className="cly-report-list">
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
                          `${report.title} is available as a ${report.type.toLowerCase()} preview.`,
                        )
                    }
                  >
                    <span>
                      <span className="cly-list-title">{report.title}</span>
                      <span className="cly-list-detail">
                        {report.type} · {report.status}
                      </span>
                    </span>
                    <Badge tone={toneForStatus(report.status)}>
                      {report.status}
                    </Badge>
                  </button>
                ))}
              </Panel>
            </Section>
          </aside>
        </div>
      )}
    </div>
  );
}
