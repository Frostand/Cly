import {
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDot,
  Clock3,
  Code2,
  Copy,
  FileCheck2,
  GitBranch,
  Laptop,
  Link2,
  LockKeyhole,
  PackageCheck,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  TestTube2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  InlineMetadata,
  PaneHeader,
  ProgressIndicator,
  StatusIndicator,
  Toolbar,
} from "../components/design-system";
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Metric,
  PageHeader,
  SearchInput,
  toneForStatus,
} from "../components/primitives";
import { ClySplitPane } from "../components/toolkit";
import type { DevSection } from "../domain/types";
import { capabilityUnavailableMessage } from "../services/capabilities";
import { isClyDemoRuntime } from "../services/runtime";
import { useClyStore } from "../store/cly-store";
import { ReviewerCapsuleDialog } from "./research-workspaces";

interface ObjectiveRecord {
  id: string;
  title: string;
  description: string;
  status: "Active" | "At risk" | "Planned";
  progress: number;
  owner: string;
  method: string;
  success: string;
  linked: string[];
  nextAction: string;
}

export function ObjectivesScreen() {
  const data = useClyStore((state) => state.data);
  const activeProjectId = useClyStore((state) => state.activeProjectId);
  const notify = useClyStore((state) => state.notify);
  const project =
    data.projects.find((item) => item.id === activeProjectId) ??
    data.projects[0];
  const objectives = useMemo<ObjectiveRecord[]>(
    () =>
      project
        ? [
            {
              id: "O-01",
              title: "Test whether basic data flag LDL-C discordance",
              description: project.question,
              status: "Active",
              progress: 82,
              owner: "Research lead",
              method: "Survey-weighted five-fold prediction benchmark",
              success:
                "A reproducible model improves meaningfully over LDL-C alone without clinical overclaiming.",
              linked: [
                `${data.claims.length} claims`,
                `${data.experiments.length} experiments`,
                `${data.sources.length} sources`,
              ],
              nextAction: "Complete alternate discordance definitions.",
            },
            {
              id: "O-02",
              title: "Validate the result beyond one survey cycle",
              description:
                "Repeat the analysis in later NHANES cycles and quantify transportability.",
              status: "At risk",
              progress: 28,
              owner: "Methods team",
              method: "Temporal external validation",
              success:
                "Direction, discrimination, and calibration hold in a separated cohort.",
              linked: ["1 planned experiment", "2 sources", "2 open findings"],
              nextAction: "Approve the official CDC data download.",
            },
            {
              id: "O-03",
              title: "Produce a reviewer-ready evidence package",
              description:
                "Package current claims, exact passages, lineage, and limitations for independent review.",
              status: "Planned",
              progress: 18,
              owner: "Project lead",
              method: "Reviewer capsule and reproducibility audit",
              success:
                "A reviewer can audit the conclusion without the original author.",
              linked: ["1 audit", "4 artifacts", "0 exported capsules"],
              nextAction:
                "Select publication claims and preview the capsule manifest.",
            },
          ]
        : [],
    [data.claims.length, data.experiments.length, data.sources.length, project],
  );
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("O-01");
  const visible = objectives.filter((objective) =>
    `${objective.id} ${objective.title} ${objective.description}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const selected =
    objectives.find((objective) => objective.id === selectedId) ??
    objectives[0];

  if (!project) {
    return (
      <div className="cly-page">
        <EmptyState
          title="No objectives yet"
          description="Create a project question before planning research objectives."
        />
      </div>
    );
  }

  return (
    <div className="cly-page cly-page-wide cly-route-objectives">
      <PageHeader
        kicker="Cly Research"
        title="Objectives"
        description="Connect research intent to methods, computation, evidence, and review."
        actions={
          <Button
            variant="primary"
            onClick={() =>
              notify(
                "Objective draft created",
                "Define success criteria before linking methods and execution work.",
              )
            }
          >
            <Plus /> New objective
          </Button>
        }
      />
      <div className="cly-metric-row">
        <Metric label="Active" value="1" detail="Primary project direction" />
        <Metric label="At risk" value="1" detail="Missing baseline evidence" />
        <Metric label="Linked claims" value={data.claims.length} />
        <Metric label="Linked experiments" value={data.experiments.length} />
      </div>
      <ClySplitPane
        id="objectives-workspace"
        className="cly-platform-split"
        secondarySize={38}
        primary={
          <div className="cly-platform-list-pane">
            <Toolbar label="Objective controls">
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Search objectives…"
              />
              <span className="cly-platform-count">
                {visible.length} objectives
              </span>
            </Toolbar>
            <div className="cly-objective-list">
              {visible.map((objective) => (
                <button
                  type="button"
                  key={objective.id}
                  className="cly-objective-row"
                  data-selected={objective.id === selected?.id}
                  onClick={() => setSelectedId(objective.id)}
                >
                  <span className="cly-objective-index">{objective.id}</span>
                  <span className="cly-objective-copy">
                    <strong>{objective.title}</strong>
                    <small>{objective.description}</small>
                    <ProgressIndicator value={objective.progress} compact />
                  </span>
                  <StatusIndicator tone={toneForStatus(objective.status)}>
                    {objective.status}
                  </StatusIndicator>
                </button>
              ))}
            </div>
          </div>
        }
        secondary={
          selected ? (
            <article className="cly-platform-inspector">
              <PaneHeader
                title={`${selected.id} · ${selected.title}`}
                detail={selected.description}
                actions={
                  <StatusIndicator tone={toneForStatus(selected.status)}>
                    {selected.status}
                  </StatusIndicator>
                }
              />
              <div className="cly-platform-inspector-body">
                <section>
                  <h3>Definition of success</h3>
                  <p>{selected.success}</p>
                </section>
                <dl className="cly-platform-details">
                  <div>
                    <dt>Owner</dt>
                    <dd>{selected.owner}</dd>
                  </div>
                  <div>
                    <dt>Method</dt>
                    <dd>{selected.method}</dd>
                  </div>
                  <div>
                    <dt>Progress</dt>
                    <dd>{selected.progress}%</dd>
                  </div>
                </dl>
                <section>
                  <h3>Connected research</h3>
                  <div className="cly-platform-link-row">
                    {selected.linked.map((link) => (
                      <span key={link}>
                        <Link2 /> {link}
                      </span>
                    ))}
                  </div>
                </section>
                <section>
                  <h3>Next action</h3>
                  <button
                    type="button"
                    className="cly-platform-next-action"
                    onClick={() =>
                      useClyStore.getState().setScreen("next-steps")
                    }
                  >
                    <span>
                      <strong>{selected.nextAction}</strong>
                      <small>Open the prioritized action plan</small>
                    </span>
                    <ArrowRight />
                  </button>
                </section>
              </div>
            </article>
          ) : null
        }
      />
    </div>
  );
}

export function ReviewerCapsulesScreen() {
  const data = useClyStore((state) => state.data);
  const activeProjectId = useClyStore((state) => state.activeProjectId);
  const notify = useClyStore((state) => state.notify);
  const [selectedClaimId, setSelectedClaimId] = useState(
    data.claims[0]?.id ?? null,
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const selected = data.claims.find((claim) => claim.id === selectedClaimId);

  return (
    <div className="cly-page cly-page-wide cly-route-capsules">
      <PageHeader
        kicker="Cly Research"
        title="Reviewer Capsules"
        description="Create safe, read-only evidence packages that remain useful outside Cly."
        actions={
          <Button variant="primary" onClick={() => setDialogOpen(true)}>
            <PackageCheck /> Build capsule
          </Button>
        }
      />
      <div className="cly-capsule-readiness" role="status">
        <ShieldCheck />
        <span>
          <strong>Export boundary enforced</strong>
          Private paths, credentials, agent chat, and restricted data are
          omitted or block export.
        </span>
        <Badge tone="success">Local preview</Badge>
      </div>
      {data.claims.length ? (
        <ClySplitPane
          id="reviewer-capsules"
          className="cly-platform-split"
          secondarySize={38}
          primary={
            <div className="cly-platform-list-pane">
              <PaneHeader
                title="Claim packages"
                detail="Select the conclusion a reviewer should be able to audit."
              />
              <div className="cly-capsule-claim-list">
                {data.claims.map((claim) => (
                  <button
                    type="button"
                    key={claim.id}
                    data-selected={claim.id === selectedClaimId}
                    onClick={() => setSelectedClaimId(claim.id)}
                  >
                    <span>
                      <strong>{claim.text}</strong>
                      <small>
                        {claim.supportingSourceIds.length} supporting ·{" "}
                        {claim.contradictingSourceIds.length} contradicting ·{" "}
                        {claim.confidence}% confidence
                      </small>
                    </span>
                    <StatusIndicator tone={toneForStatus(claim.status)}>
                      {claim.status}
                    </StatusIndicator>
                  </button>
                ))}
              </div>
            </div>
          }
          secondary={
            selected ? (
              <article className="cly-platform-inspector">
                <PaneHeader
                  title="Manifest preview"
                  detail="Canonical project data only"
                  actions={<FileCheck2 />}
                />
                <div className="cly-platform-inspector-body">
                  <section>
                    <h3>Selected claim</h3>
                    <p>{selected.text}</p>
                  </section>
                  <dl className="cly-platform-details">
                    <div>
                      <dt>Evidence</dt>
                      <dd>
                        {selected.supportingSourceIds.length} supporting sources
                      </dd>
                    </div>
                    <div>
                      <dt>Contradictions</dt>
                      <dd>{selected.contradictingSourceIds.length} sources</dd>
                    </div>
                    <div>
                      <dt>Experiments</dt>
                      <dd>{selected.experimentIds.length} linked runs</dd>
                    </div>
                    <div>
                      <dt>Verification</dt>
                      <dd>{selected.status}</dd>
                    </div>
                  </dl>
                  <section>
                    <h3>Package contract</h3>
                    <ul className="cly-platform-checks">
                      <li>
                        <CheckCircle2 /> Exact source passages and citations
                      </li>
                      <li>
                        <CheckCircle2 /> Current lineage and reproducibility
                        state
                      </li>
                      <li>
                        <CheckCircle2 /> Limitations and contradictory evidence
                      </li>
                      <li>
                        <LockKeyhole /> Restricted objects evaluated before
                        export
                      </li>
                    </ul>
                  </section>
                  <Button variant="primary" onClick={() => setDialogOpen(true)}>
                    Configure and preview <ArrowRight />
                  </Button>
                </div>
              </article>
            ) : null
          }
        />
      ) : (
        <EmptyState
          title="No claims are ready to package"
          description="Create a claim and connect its evidence before building a reviewer capsule."
          action={
            <Button onClick={() => useClyStore.getState().setScreen("claims")}>
              Open claims
            </Button>
          }
        />
      )}
      <ReviewerCapsuleDialog
        activeProjectId={activeProjectId}
        claims={data.claims}
        initialClaimId={selectedClaimId}
        notify={notify}
        onClose={() => setDialogOpen(false)}
        open={dialogOpen}
      />
    </div>
  );
}

interface DevRecord {
  id: string;
  title: string;
  detail: string;
  status: string;
  meta: string;
  owner: string;
  impact: string;
}

const DEV_SECTION_META: Record<
  DevSection,
  { title: string; description: string; action: string }
> = {
  projects: {
    title: "Projects",
    description:
      "Development workspaces connected to research intent and evidence.",
    action: "Open research workspace",
  },
  repositories: {
    title: "Repositories",
    description:
      "Local repositories, branches, worktrees, and synchronization state.",
    action: "Open repository",
  },
  features: {
    title: "Features",
    description:
      "Issue-to-branch workspaces with agents, tests, and research impact.",
    action: "Open feature",
  },
  issues: {
    title: "Issues",
    description: "GitHub and Linear work organized around active objectives.",
    action: "Open issue",
  },
  sessions: {
    title: "Sessions",
    description:
      "Provider-neutral coding sessions that can continue across machines.",
    action: "Open Agent Workspace",
  },
  agents: {
    title: "Agents",
    description:
      "Provider, model, context, tool, permission, and budget policies.",
    action: "Configure agents",
  },
  machines: {
    title: "Machines",
    description:
      "Local and remote execution targets with explicit sync boundaries.",
    action: "Inspect machine",
  },
  "pull-requests": {
    title: "Pull Requests",
    description:
      "Software review and scientific-impact review in one delivery gate.",
    action: "Open impact review",
  },
  tests: {
    title: "Tests",
    description:
      "Unit, integration, UI, and research validation for active work.",
    action: "Open test run",
  },
  context: {
    title: "Context",
    description:
      "Inspect exactly what coding agents know and what leaves the device.",
    action: "Open context composer",
  },
  settings: {
    title: "Settings",
    description:
      "Development sync, execution, provider, and approval preferences.",
    action: "Open system settings",
  },
};

function useDevRecords(section: DevSection): DevRecord[] {
  const data = useClyStore((state) => state.data);
  const project = data.projects[0];
  return useMemo(() => {
    if (section === "projects") {
      return data.projects.map((item) => ({
        id: item.id,
        title: item.name,
        detail: item.description,
        status: "Active",
        meta: `${item.phase} · ${item.path}`,
        owner: "Research team",
        impact: `${data.claims.length} claims · ${data.experiments.length} experiments`,
      }));
    }
    if (section === "sessions") {
      return data.agentSessions.map((session) => ({
        id: session.id,
        title: session.title,
        detail: session.objective,
        status: session.status.replace("_", " "),
        meta: `${session.branch} · ${session.elapsed}`,
        owner: session.orchestrator.name,
        impact: session.relatedResearchObject,
      }));
    }
    if (section === "agents") {
      return data.agentPresets.map((preset) => ({
        id: preset.id,
        title: preset.name,
        detail: preset.description,
        status: "Ready",
        meta: `${preset.nodes.length} agents · ${preset.usage} usage`,
        owner: "Project policy",
        impact: "Context and permissions are explicit",
      }));
    }
    if (section === "context") {
      return data.contextItems.slice(0, 12).map((item) => ({
        id: item.id,
        title: item.name,
        detail: `${item.category} · ${item.source}`,
        status: item.included ? "Included" : "Excluded",
        meta: `${item.tokens.toLocaleString()} tokens · ${item.freshness}`,
        owner: item.pinned ? "Pinned by researcher" : "Context policy",
        impact: `${item.linkedIds.length} linked research objects`,
      }));
    }
    const staticRecords: Record<
      Exclude<DevSection, "projects" | "sessions" | "agents" | "context">,
      DevRecord[]
    > = {
      repositories: [
        {
          id: "repo-core",
          title: "Frostand/Cly",
          detail: "Desktop application, research core, and local service",
          status: "Clean",
          meta: "main · local and origin synchronized",
          owner: "Core team",
          impact: `${data.graphNodes.length} indexed research objects`,
        },
        {
          id: "repo-eval",
          title: "ldl-apob-discordance",
          detail: "NHANES source files, analysis code, notebooks, and reports",
          status: "3 changes",
          meta: "research/O-02-external-validation",
          owner: "Methods team",
          impact: "Claims C-01 through C-04 may require reruns",
        },
      ],
      features: [
        {
          id: "feature-01",
          title: "Discordance sensitivity audit",
          detail: "Compare thresholds, residual definitions, and non–HDL-C",
          status: "Active",
          meta: "CLY-244 · research/O-01-sensitivity",
          owner: "Codex + methods team",
          impact: "Objective O-01 · Claims C-01 and C-04",
        },
        {
          id: "feature-02",
          title: "Provider-neutral session handoff",
          detail: "Resume work across Codex, Claude Code, and local agents",
          status: "In review",
          meta: "CLY-251 · feature/context-handoff",
          owner: "Platform team",
          impact: "No direct scientific impact",
        },
      ],
      issues: [
        {
          id: "CLY-244",
          title: "Validate discordance across later NHANES cycles",
          detail:
            "Missing temporal validation for the primary discordance claim",
          status: "In progress",
          meta: "High priority · linked objective O-02",
          owner: "Evaluation team",
          impact: "Blocks reviewer-ready evidence",
        },
        {
          id: "CLY-247",
          title: "Add survey-design confidence intervals",
          detail:
            "Account for fasting weights, strata, and primary sampling units",
          status: "Ready",
          meta: "Integrity finding · 1 dependency",
          owner: "Implementation agent",
          impact: "Tables T-01 and T-02 · Claims C-02 and C-03",
        },
      ],
      machines: [
        {
          id: "machine-local",
          title: "Local Mac",
          detail: "Apple silicon · local repositories · private execution",
          status: "Connected",
          meta: "Current device · last seen now",
          owner: "You",
          impact: "Code and research data remain local",
        },
        {
          id: "machine-gpu",
          title: "Lab analysis runner",
          detail: "Approved public data and analysis artifacts only",
          status: "Idle",
          meta: "Remote · encrypted transport",
          owner: "Lab infrastructure",
          impact: "Dataset restrictions enforced before sync",
        },
      ],
      "pull-requests": [
        {
          id: "pr-84",
          title: "PR #84 · Add threshold sensitivity and survey checks",
          detail:
            "12 files changed · software review passed · research review open",
          status: "Needs research review",
          meta: "3 checks passed · 2 reruns required",
          owner: "Implementation agent",
          impact:
            "Runs R-03–R-06 · Tables T-01 and T-02 · Claims C-01 and C-04",
        },
      ],
      tests: [
        {
          id: "tests-unit",
          title: "Unit and integration",
          detail:
            "Research graph, persistence, provider adapters, and permissions",
          status: "482 passed",
          meta: "Completed 4 minutes ago · 42s",
          owner: "Local Mac",
          impact: "Software validation",
        },
        {
          id: "tests-research",
          title: "Research validation",
          detail:
            "Cohort eligibility, data leakage, deterministic output, and claim impact",
          status: "2 required",
          meta: "Waiting for threshold sensitivity rerun",
          owner: "Lab GPU runner",
          impact: "Objective O-02 · reviewer capsule blocked",
        },
      ],
      settings: [
        {
          id: "setting-sync",
          title: "Session synchronization",
          detail: "Sync summaries, decisions, diffs, and approvals",
          status: "Local only",
          meta: "Code and raw data excluded",
          owner: "Project policy",
          impact: "No external transmission",
        },
        {
          id: "setting-approval",
          title: "Approval policy",
          detail:
            "Require approval for writes, network, push, merge, and external models",
          status: "Enforced",
          meta: "Applies to every provider",
          owner: "Organization policy",
          impact: "Scientific claims cannot be changed silently",
        },
      ],
    };
    return (
      staticRecords[section] ?? [
        {
          id: "empty",
          title: project?.name ?? "Development workspace",
          detail: "No records are available for this section.",
          status: "Ready",
          meta: "Local",
          owner: "You",
          impact: "No linked research impact",
        },
      ]
    );
  }, [data, project, section]);
}

export function DevWorkspaceScreen() {
  const section = useClyStore((state) => state.activeDevSection);
  const setScreen = useClyStore((state) => state.setScreen);
  const data = useClyStore((state) => state.data);
  const records = useDevRecords(section);
  const meta = DEV_SECTION_META[section];
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(records[0]?.id ?? "");
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [handoffCopyState, setHandoffCopyState] = useState<
    "idle" | "copied" | "error"
  >("idle");
  useEffect(() => {
    setQuery("");
    setSelectedId(records[0]?.id ?? "");
  }, [records]);
  const visible = records.filter((record) =>
    `${record.title} ${record.detail} ${record.meta}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const selected =
    records.find((record) => record.id === selectedId) ?? records[0];
  const activeSessions = data.agentSessions.filter((session) =>
    ["running", "waiting_approval"].includes(session.status),
  ).length;
  const supportsPrimaryAction = [
    "projects",
    "sessions",
    "agents",
    "pull-requests",
    "context",
    "settings",
  ].includes(section);
  const handoffSummary = selected
    ? [
        `Goal: ${selected.title}`,
        `Status: ${selected.status}`,
        `Owner: ${selected.owner}`,
        `Context: Explicit project pack`,
        `Research impact: ${selected.impact}`,
        `Next review: One research review remains open`,
      ].join("\n")
    : "No development record is selected.";

  const openNewSession = () => {
    if (!isClyDemoRuntime) return;
    const store = useClyStore.getState();
    store.setDevSection("sessions");
    store.setAgentSessionsMode("overview");
    store.setNewAgentSessionOpen(true);
  };

  const runPrimaryAction = () => {
    if (section === "projects") {
      setScreen("overview");
      return;
    }
    if (section === "sessions") {
      useClyStore.setState({
        activeProduct: "dev",
        activeScreen: "agents",
        agentSessionsMode: "overview",
      });
      return;
    }
    if (section === "agents") {
      setScreen("models");
      return;
    }
    if (section === "pull-requests") {
      setScreen("impact-review");
      return;
    }
    if (section === "context") {
      setScreen("context");
      return;
    }
    if (section === "settings") {
      setScreen("settings");
      return;
    }
  };

  const copyHandoffSummary = async () => {
    try {
      await navigator.clipboard.writeText(handoffSummary);
      setHandoffCopyState("copied");
    } catch {
      setHandoffCopyState("error");
    }
  };

  return (
    <div className="cly-page cly-page-wide cly-route-dev">
      <PageHeader
        kicker="Cly Dev"
        title={meta.title}
        description={meta.description}
        actions={
          <>
            <StatusIndicator tone="success">
              <Laptop /> Local Mac connected
            </StatusIndicator>
            <Button
              variant="primary"
              disabled={!isClyDemoRuntime}
              title={
                isClyDemoRuntime
                  ? "Create a new agent session"
                  : capabilityUnavailableMessage("agents.execute")
              }
              onClick={openNewSession}
            >
              <Plus /> New session
            </Button>
          </>
        }
      />
      <div className="cly-dev-statebar">
        <span>
          <CircleDot /> {activeSessions} active sessions
        </span>
        <span>
          <GitBranch /> main · clean
        </span>
        <span>
          <FileCheck2 /> 12 open changes
        </span>
        <span>
          <ShieldCheck /> 1 approval waiting · 4 research links
        </span>
      </div>
      <ClySplitPane
        id={`dev-${section}`}
        className="cly-platform-split cly-dev-split"
        secondarySize={39}
        primary={
          <div className="cly-platform-list-pane">
            <Toolbar label={`${meta.title} controls`}>
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder={`Search ${meta.title.toLowerCase()}…`}
              />
              <InlineMetadata>
                <span>{visible.length} records</span>
                <span>Local-first</span>
              </InlineMetadata>
            </Toolbar>
            <div className="cly-dev-record-list">
              {visible.map((record) => (
                <button
                  type="button"
                  key={record.id}
                  data-selected={record.id === selected?.id}
                  onClick={() => setSelectedId(record.id)}
                >
                  <span className="cly-dev-record-icon">
                    {section === "machines" ? (
                      <Laptop />
                    ) : section === "tests" ? (
                      <TestTube2 />
                    ) : section === "sessions" ? (
                      <Bot />
                    ) : (
                      <Code2 />
                    )}
                  </span>
                  <span className="cly-dev-record-copy">
                    <strong>{record.title}</strong>
                    <small>{record.detail}</small>
                    <em>{record.meta}</em>
                  </span>
                  <StatusIndicator tone={toneForStatus(record.status)}>
                    {record.status}
                  </StatusIndicator>
                </button>
              ))}
            </div>
          </div>
        }
        secondary={
          selected ? (
            <article className="cly-platform-inspector cly-dev-inspector">
              <PaneHeader
                title={selected.title}
                detail={selected.detail}
                actions={
                  <StatusIndicator tone={toneForStatus(selected.status)}>
                    {selected.status}
                  </StatusIndicator>
                }
              />
              <div className="cly-platform-inspector-body">
                {!supportsPrimaryAction ? (
                  <div className="cly-dev-preview-note" role="note">
                    <LockKeyhole aria-hidden="true" />
                    <span>
                      <strong>Preview only</strong>
                      Actions for {meta.title.toLowerCase()} are not connected
                      yet. The available details below are read-only.
                    </span>
                  </div>
                ) : null}
                <section>
                  <h3>Execution state</h3>
                  <dl className="cly-platform-details">
                    <div>
                      <dt>Owner</dt>
                      <dd>{selected.owner}</dd>
                    </div>
                    <div>
                      <dt>Location</dt>
                      <dd>Local Mac</dd>
                    </div>
                    <div>
                      <dt>Context</dt>
                      <dd>Explicit project pack</dd>
                    </div>
                    <div>
                      <dt>Approval</dt>
                      <dd>Writes and network require review</dd>
                    </div>
                  </dl>
                </section>
                <section>
                  <h3>Research impact</h3>
                  <div className="cly-dev-impact-chain">
                    <span>
                      <CircleDot /> Objective O-02
                    </span>
                    <ArrowRight />
                    <span>
                      <Code2 /> {selected.title}
                    </span>
                    <ArrowRight />
                    <span>
                      <ShieldCheck /> {selected.impact}
                    </span>
                  </div>
                </section>
                <section>
                  <h3>Provider-neutral handoff</h3>
                  <ul className="cly-platform-checks">
                    <li>
                      <CheckCircle2 /> Goal and current status captured
                    </li>
                    <li>
                      <CheckCircle2 /> Relevant files and symbols selected
                    </li>
                    <li>
                      <CheckCircle2 /> Changes and tests summarized
                    </li>
                    <li>
                      <Clock3 /> One research review remains open
                    </li>
                  </ul>
                </section>
              </div>
              <div className="cly-dev-inspector-actions">
                {supportsPrimaryAction ? (
                  <Button variant="primary" onClick={runPrimaryAction}>
                    <Play /> {meta.action}
                  </Button>
                ) : (
                  <Button
                    disabled
                    title={`${meta.title} actions are not connected yet.`}
                  >
                    <LockKeyhole /> Not connected yet
                  </Button>
                )}
                <Button
                  onClick={() => {
                    setHandoffCopyState("idle");
                    setHandoffOpen(true);
                  }}
                >
                  <RefreshCw /> Prepare handoff
                </Button>
              </div>
            </article>
          ) : null
        }
      />
      <Dialog
        open={handoffOpen}
        title="Handoff summary"
        description="Review the exact local context before copying it to another provider."
        onClose={() => setHandoffOpen(false)}
        footer={
          <>
            <Button onClick={() => setHandoffOpen(false)}>Close</Button>
            <Button variant="primary" onClick={() => void copyHandoffSummary()}>
              <Copy /> Copy summary
            </Button>
          </>
        }
      >
        <div className="cly-dev-handoff-dialog">
          <div>
            <span>Selected record</span>
            <strong>{selected?.title ?? "No selection"}</strong>
          </div>
          <pre>{handoffSummary}</pre>
          {handoffCopyState !== "idle" ? (
            <p
              role="status"
              data-tone={handoffCopyState === "copied" ? "success" : "danger"}
            >
              {handoffCopyState === "copied"
                ? "Summary copied to the clipboard."
                : "The summary could not be copied. Select the text and copy it manually."}
            </p>
          ) : null}
        </div>
      </Dialog>
    </div>
  );
}
