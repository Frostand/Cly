import {
  ArrowRight,
  Beaker,
  Bot,
  FileText,
  GitBranch,
  Lightbulb,
  type LucideIcon,
  ShieldCheck,
} from "lucide-react";
import { type CSSProperties, type ReactNode, useRef, useState } from "react";
import { LocalStatusBanner } from "../components/chrome";
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  PageHeader,
  Panel,
  Section,
  toneForStatus,
} from "../components/primitives";
import {
  deriveResearchLoop,
  hasSubstantiveResearchText,
  ResearchLoopWorkspace,
} from "../components/research-loop";
import type { ScreenId, StatusTone } from "../domain/types";
import { useClyStore } from "../store/cly-store";

type OverviewActivity = {
  id: string;
  icon: LucideIcon;
  title: string;
  detail: string;
  time: string;
  screen: ScreenId;
};

const formatActivityTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
};

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
  const updateActiveProject = useClyStore((s) => s.updateActiveProject);
  const notify = useClyStore((s) => s.notify);
  const setProjectSwitcherOpen = useClyStore((s) => s.setProjectSwitcherOpen);
  const preregistrations = useClyStore((s) => s.preregistrations);
  const [briefOpen, setBriefOpen] = useState(false);
  const [briefName, setBriefName] = useState("");
  const [briefQuestion, setBriefQuestion] = useState("");
  const [briefHypothesis, setBriefHypothesis] = useState("");
  const [briefDescription, setBriefDescription] = useState("");
  const [savingBrief, setSavingBrief] = useState(false);
  const briefTriggerRef = useRef<HTMLElement | null>(null);
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
  const researchLoop = deriveResearchLoop({
    hasQuestion: hasSubstantiveResearchText(project?.question ?? ""),
    hasHypothesis: hasSubstantiveResearchText(project?.hypothesis ?? ""),
    reviewedSourceCount: data.sources.filter(
      (source) => source.status === "Reviewed",
    ).length,
    preregistrationCount: preregistrations.length,
    completedRunCount: data.runs.filter((run) => run.status === "Complete")
      .length,
    reproducibleRunCount: data.runs.filter(
      (run) => run.status === "Complete" && run.reproducibility === "Verified",
    ).length,
    evidenceLinkCount: data.graphEdges.length,
    claimCount: data.claims.length,
    supportedClaimCount: data.claims.filter(
      (claim) =>
        ["Medium", "Strong", "Paper-ready"].includes(claim.status) &&
        claim.supportingSourceIds.length + claim.experimentIds.length > 0,
    ).length,
    auditScore: audit?.score ?? null,
    openIntegrityFindingCount: data.findings.filter(
      (finding) => finding.status === "Open",
    ).length,
  });
  const recentActivity: OverviewActivity[] = [
    ...data.activity.map((item) => ({
      id: item.id,
      icon:
        item.type === "agent"
          ? Bot
          : item.type === "audit"
            ? ShieldCheck
            : FileText,
      title: item.title,
      detail: item.detail,
      time: formatActivityTime(item.time),
      screen:
        item.type === "agent"
          ? ("agents" as const)
          : item.type === "audit"
            ? ("reproducibility" as const)
            : ("sources" as const),
    })),
    ...data.runs.map((run) => ({
      id: run.id,
      icon: Beaker,
      title: `${run.name} is ${run.status.toLowerCase()}`,
      detail: `${Object.keys(run.metrics).length} recorded metrics · ${run.reproducibility} reproducibility`,
      time: formatActivityTime(run.startedAt),
      screen: "experiments" as const,
    })),
    ...data.sources.map((source) => ({
      id: source.id,
      icon: FileText,
      title: `${source.title} added to sources`,
      detail: `${source.type} · ${source.status}`,
      time: formatActivityTime(source.updatedAt),
      screen: "sources" as const,
    })),
    ...data.claims.map((claim) => ({
      id: claim.id,
      icon: Lightbulb,
      title: "Research claim updated",
      detail: `${claim.status} · ${claim.text}`,
      time: formatActivityTime(claim.updatedAt),
      screen: "claims" as const,
    })),
  ].slice(0, 4);

  const openBrief = (trigger?: HTMLElement) => {
    if (!project) return;
    if (trigger) briefTriggerRef.current = trigger;
    setBriefName(
      project.name === "Untitled research project" ? "" : project.name,
    );
    setBriefQuestion(project.question);
    setBriefHypothesis(project.hypothesis);
    setBriefDescription(
      project.description ===
        "Define the project brief, then connect data and evidence."
        ? ""
        : project.description,
    );
    setBriefOpen(true);
  };

  const closeBrief = () => {
    setBriefOpen(false);
    window.requestAnimationFrame(() => briefTriggerRef.current?.focus());
  };

  const saveBrief = async () => {
    if (!briefName.trim() || !briefQuestion.trim()) return;
    setSavingBrief(true);
    try {
      await updateActiveProject({
        name: briefName.trim(),
        question: briefQuestion.trim(),
        hypothesis:
          briefHypothesis.trim() || "No working hypothesis recorded yet.",
        description:
          briefDescription.trim() || "Local research project in Cly.",
      });
      closeBrief();
      notify(
        "Research brief saved",
        "The question now anchors sources, experiments, evidence, and claims.",
      );
    } catch (error) {
      notify(
        "Research brief was not saved",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setSavingBrief(false);
    }
  };

  if (!project) {
    return (
      <div className="cly-page">
        <EmptyState
          title="Create your first research project"
          description="Choose a local folder to connect sources, code, experiments, outputs, claims, and decisions without inventing a workspace on your computer."
          action={
            <Button
              variant="primary"
              onClick={() => setProjectSwitcherOpen(true)}
            >
              Choose local folder
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="cly-page cly-route-overview">
      <PageHeader
        kicker="Research workspace"
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
            <Button
              data-testid="edit-project-brief"
              onClick={(event) => openBrief(event.currentTarget)}
            >
              Edit brief
            </Button>
          </>
        }
      />
      <LocalStatusBanner />

      <ResearchLoopWorkspace
        snapshot={researchLoop}
        question={project.question}
        hypothesis={project.hypothesis}
        recommendedNext={
          next ? { title: next.title, rationale: next.rationale } : null
        }
        onOpenBrief={openBrief}
        onOpenScreen={setScreen}
      />

      <div className="cly-overview-grid">
        <div className="cly-overview-primary">
          <Section
            title="Claims and integrity"
            subtitle="The strongest result, the weakest link, and anything that blocks sharing"
          >
            {data.claims.length ? (
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
                {weakClaim && weakClaim.id !== strongClaim?.id ? (
                  <EvidenceLedgerRow
                    tone={toneForStatus(weakClaim.status)}
                    status={weakClaim.status}
                    context={
                      weakClaim.type === "Limitation"
                        ? "Key limitation"
                        : "Weakest active claim"
                    }
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
            ) : (
              <EmptyState
                title="No claims yet"
                description="Complete the earlier research stages, then state the result the evidence supports."
                action={
                  <Button
                    variant="primary"
                    onClick={(event) =>
                      researchLoop.currentStage?.id === "question"
                        ? openBrief(event.currentTarget)
                        : setScreen("claims")
                    }
                  >
                    {researchLoop.currentStage?.id === "question"
                      ? "Define question"
                      : "Draft claim"}
                  </Button>
                }
              />
            )}
          </Section>

          <Section
            title="Recent research activity"
            subtitle="Sources, experiments, outputs, claims, and audits in one timeline"
          >
            {recentActivity.length ? (
              <div className="cly-timeline">
                {recentActivity.map((item) => (
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
            ) : (
              <EmptyState
                title="No research activity yet"
                description="Add a source or run an experiment to begin the project timeline."
                icon={<Beaker aria-hidden="true" />}
              />
            )}
          </Section>
        </div>

        <aside className="cly-overview-rail" aria-label="Project context">
          <Section
            title="Project graph"
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
            {data.reports.length ? (
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
            ) : (
              <EmptyState
                title="No reports yet"
                description="Reports appear after evidence and integrity review are complete."
              />
            )}
          </Section>
        </aside>
      </div>
      <Dialog
        open={briefOpen}
        onClose={closeBrief}
        title="Research project brief"
        description="Define the question before adding sources or planning an experiment."
        footer={
          <>
            <Button onClick={closeBrief}>Cancel</Button>
            <Button
              variant="primary"
              disabled={
                savingBrief || !briefName.trim() || !briefQuestion.trim()
              }
              onClick={() => void saveBrief()}
            >
              {savingBrief ? "Saving…" : "Save brief"}
            </Button>
          </>
        }
      >
        <div className="cly-stack">
          <div className="cly-field">
            <label htmlFor="project-brief-name">Project name</label>
            <input
              autoFocus
              className="cly-input"
              id="project-brief-name"
              value={briefName}
              onChange={(event) => setBriefName(event.target.value)}
              placeholder="Short, specific project name"
            />
          </div>
          <div className="cly-field">
            <label htmlFor="project-brief-question">Research question</label>
            <textarea
              className="cly-textarea"
              id="project-brief-question"
              rows={3}
              value={briefQuestion}
              onChange={(event) => setBriefQuestion(event.target.value)}
              placeholder="What are you trying to learn?"
            />
          </div>
          <div className="cly-field">
            <label htmlFor="project-brief-hypothesis">Working hypothesis</label>
            <textarea
              className="cly-textarea"
              id="project-brief-hypothesis"
              rows={3}
              value={briefHypothesis}
              onChange={(event) => setBriefHypothesis(event.target.value)}
              placeholder="What pattern do you expect, and why?"
            />
          </div>
          <div className="cly-field">
            <label htmlFor="project-brief-description">Scope note</label>
            <textarea
              className="cly-textarea"
              id="project-brief-description"
              rows={2}
              value={briefDescription}
              onChange={(event) => setBriefDescription(event.target.value)}
              placeholder="Population, data boundaries, or intended use"
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
