import {
  Activity,
  ArrowRight,
  Bot,
  CheckCircle2,
  FileText,
  GitBranch,
  Lightbulb,
  Network,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { LocalStatusBanner } from "../components/chrome";
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  toneForStatus,
} from "../components/primitives";
import { ResearchLifecycle, RiskDistribution } from "../components/visuals";
import { useClyStore } from "../store/cly-store";
import "../redesign-core.css";

const activityIcons = {
  agent: Bot,
  import: FileText,
  audit: ShieldCheck,
  system: Activity,
} as const;

export function OverviewScreen() {
  const data = useClyStore((s) => s.data);
  const activeProjectId = useClyStore((s) => s.activeProjectId);
  const setScreen = useClyStore((s) => s.setScreen);
  const setSelected = useClyStore((s) => s.setSelected);
  const project =
    data.projects.find((item) => item.id === activeProjectId) ??
    data.projects[0];
  const audit = data.audits[0];
  const attentionClaims = data.claims.filter(
    (item) =>
      item.status === "Weak" ||
      item.status === "Needs review" ||
      item.status === "Invalidated",
  );
  const activeSessions = data.agentSessions.filter(
    (session) =>
      session.status === "running" || session.status === "waiting_approval",
  );
  const nextSteps = data.nextSteps.filter(
    (item) => item.status === "Recommended" || item.status === "In progress",
  );
  const lifecycleCurrent = lifecycleIndexForPhase(project?.phase ?? "");

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

  const claimHealth = [
    {
      label: "Paper-ready",
      value: data.claims.filter((claim) => claim.status === "Paper-ready")
        .length,
      tone: "success" as const,
    },
    {
      label: "Strong",
      value: data.claims.filter((claim) => claim.status === "Strong").length,
      tone: "success" as const,
    },
    {
      label: "Needs attention",
      value: attentionClaims.length,
      tone: "warning" as const,
    },
    {
      label: "Unsupported",
      value: data.claims.filter((claim) => claim.status === "Unsupported")
        .length,
      tone: "danger" as const,
    },
  ];

  return (
    <div className="cly-page cly-page-wide cly-route-overview cly-core-overview">
      <PageHeader
        kicker={`${project.phase} · Project overview`}
        title={project.name}
        description={project.description}
        actions={
          <>
            <Badge tone={project.localOnly ? "success" : "info"}>
              {project.localOnly ? "Local workspace" : "Cloud linked"}
            </Badge>
            <Button onClick={() => setScreen("graph")}>
              <GitBranch size={13} /> Open research graph
            </Button>
          </>
        }
      />

      <LocalStatusBanner />

      <section
        className="cly-core-overview-direction"
        aria-label="Research direction"
      >
        <div>
          <span>Research question</span>
          <strong>{project.question}</strong>
        </div>
        <div>
          <span>Working hypothesis</span>
          <strong>{project.hypothesis}</strong>
        </div>
        <dl>
          <div>
            <dt>Claims</dt>
            <dd>{data.claims.length}</dd>
          </div>
          <div>
            <dt>Runs</dt>
            <dd>{data.runs.length}</dd>
          </div>
          <div>
            <dt>Audit</dt>
            <dd>{audit ? `${audit.score}%` : "—"}</dd>
          </div>
        </dl>
      </section>

      <div className="cly-core-overview-lifecycle">
        <ResearchLifecycle
          steps={[
            "Question",
            "Sources",
            "Experiments",
            "Evidence",
            "Claim",
            "Paper",
          ]}
          current={lifecycleCurrent}
        />
      </div>

      <div className="cly-core-overview-grid">
        <OverviewPanel
          title="Recent activity"
          icon={<Activity size={14} />}
          footer="Open activity"
          onFooter={() => setScreen("agents")}
        >
          <ol className="cly-core-activity-list">
            {data.activity.slice(0, 5).map((item) => {
              const Icon = activityIcons[item.type];
              return (
                <li key={item.id} data-status={item.status}>
                  <span className="cly-core-activity-mark">
                    <Icon size={11} aria-hidden="true" />
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setScreen(
                        item.type === "audit" ? "reproducibility" : "agents",
                      )
                    }
                  >
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </button>
                  <time>{item.time}</time>
                </li>
              );
            })}
          </ol>
        </OverviewPanel>

        <OverviewPanel
          title="Active research sessions"
          icon={<Bot size={14} />}
          footer="Open Agent Sessions"
          onFooter={() => setScreen("agents")}
        >
          <div className="cly-core-session-list">
            {(activeSessions.length ? activeSessions : data.agentSessions)
              .slice(0, 4)
              .map((session) => (
                <button
                  type="button"
                  key={session.id}
                  onClick={() => {
                    setScreen("agents");
                    setSelected(session.id);
                  }}
                >
                  <span className="cly-core-icon-tile">
                    <Bot size={12} />
                  </span>
                  <span>
                    <strong>{session.title}</strong>
                    <small>
                      {session.preset} · {session.delegatedAgents.length + 1}{" "}
                      agents
                    </small>
                  </span>
                  <span className="cly-core-session-progress">
                    <i style={{ width: `${session.progress}%` }} />
                  </span>
                  <Badge tone={toneForStatus(session.status)}>
                    {session.status.replace("_", " ")}
                  </Badge>
                </button>
              ))}
          </div>
        </OverviewPanel>

        <OverviewPanel
          title="Next steps"
          icon={<Target size={14} />}
          footer="Review prioritized actions"
          onFooter={() => setScreen("next-steps")}
        >
          {nextSteps.length ? (
            <ol className="cly-core-next-list">
              {nextSteps.slice(0, 4).map((item, index) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setScreen("next-steps");
                      setSelected(item.id);
                    }}
                  >
                    <span>{index + 1}</span>
                    <span>
                      <strong>{item.title}</strong>
                      <small>
                        {item.category} · {item.impact} impact · {item.effort}{" "}
                        effort
                      </small>
                    </span>
                    <Badge tone={toneForStatus(item.urgency)}>
                      {item.urgency}
                    </Badge>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <div className="cly-core-panel-empty">
              <CheckCircle2 size={18} />
              <strong>No recommendations</strong>
              <span>Cly will derive actions as evidence changes.</span>
            </div>
          )}
        </OverviewPanel>

        <OverviewPanel
          title="Claims health"
          icon={<ShieldCheck size={14} />}
          footer="Audit all claims"
          onFooter={() => setScreen("claims")}
        >
          {data.claims.length ? (
            <div className="cly-core-claims-health">
              <RiskDistribution values={claimHealth} />
              {claimHealth.map((item) => (
                <button
                  type="button"
                  key={item.label}
                  onClick={() => setScreen("claims")}
                >
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <i
                    data-tone={item.tone}
                    style={{
                      width: `${Math.max(
                        4,
                        (item.value / Math.max(1, data.claims.length)) * 100,
                      )}%`,
                    }}
                  />
                </button>
              ))}
            </div>
          ) : (
            <div className="cly-core-panel-empty">
              <ShieldCheck size={18} />
              <strong>No claims yet</strong>
              <span>Create a claim to begin an auditable evidence trail.</span>
              <Button variant="primary" onClick={() => setScreen("claims")}>
                Create first claim
              </Button>
            </div>
          )}
        </OverviewPanel>

        <OverviewPanel
          title="Research map"
          icon={<Network size={14} />}
          footer="Explore the full graph"
          onFooter={() => setScreen("graph")}
        >
          <section
            className="cly-core-map-preview"
            aria-label="Research map preview"
          >
            <svg viewBox="0 0 520 210" aria-hidden="true">
              {data.graphEdges.slice(0, 12).map((edge) => {
                const sourceIndex = data.graphNodes.findIndex(
                  (node) => node.id === edge.source,
                );
                const targetIndex = data.graphNodes.findIndex(
                  (node) => node.id === edge.target,
                );
                if (sourceIndex < 0 || targetIndex < 0) return null;
                const sourceX = 45 + (sourceIndex % 5) * 105;
                const sourceY = 32 + (Math.floor(sourceIndex / 5) % 3) * 70;
                const targetX = 45 + (targetIndex % 5) * 105;
                const targetY = 32 + (Math.floor(targetIndex / 5) % 3) * 70;
                return (
                  <line
                    key={edge.id}
                    x1={sourceX}
                    y1={sourceY}
                    x2={targetX}
                    y2={targetY}
                    data-suggested={!edge.approved}
                  />
                );
              })}
            </svg>
            {data.graphNodes.slice(0, 12).map((node, index) => (
              <button
                key={node.id}
                type="button"
                title={node.label}
                aria-label={`${node.type}: ${node.label}`}
                data-type={node.type}
                data-status={node.status}
                style={{
                  left: `${6 + (index % 5) * 20}%`,
                  top: `${8 + (Math.floor(index / 5) % 3) * 34}%`,
                }}
                onClick={() => {
                  setScreen("graph");
                  setSelected(node.id);
                }}
              >
                {node.type.slice(0, 1).toUpperCase()}
              </button>
            ))}
            <div>
              <span>{data.graphNodes.length} objects</span>
              <span>{data.graphEdges.length} relationships</span>
            </div>
          </section>
        </OverviewPanel>

        <OverviewPanel
          title="Recent outputs"
          icon={<FileText size={14} />}
          footer="View experiment outputs"
          onFooter={() => setScreen("experiments")}
        >
          <div className="cly-core-output-grid">
            {data.artifacts.slice(0, 4).map((artifact, index) => (
              <button
                key={artifact.id}
                type="button"
                onClick={() => {
                  setScreen("provenance");
                  setSelected(artifact.id);
                }}
              >
                <span
                  className="cly-core-output-preview"
                  data-kind={artifact.kind}
                >
                  {index % 3 === 0 ? (
                    <svg viewBox="0 0 80 52" aria-hidden="true">
                      <polyline points="3,42 17,31 28,34 41,18 55,23 76,8" />
                    </svg>
                  ) : index % 3 === 1 ? (
                    <span
                      className="cly-core-output-matrix"
                      aria-hidden="true"
                    />
                  ) : (
                    <FileText size={23} aria-hidden="true" />
                  )}
                </span>
                <strong>{artifact.name}</strong>
                <small>
                  {artifact.kind} · {artifact.regeneration}
                </small>
              </button>
            ))}
          </div>
        </OverviewPanel>
      </div>

      <footer className="cly-core-overview-footer">
        <div>
          <Lightbulb size={13} />
          <span>
            {attentionClaims.length
              ? `${attentionClaims.length} claims need attention before publication.`
              : "The evidence system has no open claim-health warnings."}
          </span>
        </div>
        <Button onClick={() => setScreen("agents")}>
          <Sparkles size={13} /> Ask Cly to plan the next move
        </Button>
      </footer>
    </div>
  );
}

function lifecycleIndexForPhase(phase: string) {
  const value = phase.toLowerCase();
  if (
    value.includes("paper") ||
    value.includes("publish") ||
    value.includes("writing")
  )
    return 5;
  if (value.includes("claim") || value.includes("synth")) return 4;
  if (value.includes("evidence") || value.includes("analysis")) return 3;
  if (value.includes("experiment") || value.includes("run")) return 2;
  if (value.includes("source") || value.includes("literature")) return 1;
  return 0;
}

function OverviewPanel({
  title,
  icon,
  footer,
  onFooter,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  footer: string;
  onFooter: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="cly-core-overview-panel">
      <header>
        <div>
          {icon}
          <h2>{title}</h2>
        </div>
      </header>
      <div className="cly-core-overview-panel-body">{children}</div>
      <button
        type="button"
        className="cly-core-panel-footer"
        onClick={onFooter}
      >
        {footer} <ArrowRight size={12} />
      </button>
    </section>
  );
}
