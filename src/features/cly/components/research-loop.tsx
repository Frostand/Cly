import {
  ArrowRight,
  Bot,
  Check,
  Circle,
  CircleDot,
  GitBranch,
  LockKeyhole,
  TriangleAlert,
} from "lucide-react";
import type { ScreenId } from "../domain/types";
import { Button } from "./primitives";

export type ResearchLoopStageId =
  | "question"
  | "sources"
  | "method"
  | "experiment"
  | "evidence"
  | "claim"
  | "review";

export type ResearchLoopStageState =
  | "complete"
  | "current"
  | "out-of-order"
  | "blocked";

export interface ResearchLoopInput {
  hasQuestion: boolean;
  hasHypothesis: boolean;
  reviewedSourceCount: number;
  preregistrationCount: number;
  completedRunCount: number;
  reproducibleRunCount: number;
  evidenceLinkCount: number;
  claimCount: number;
  supportedClaimCount: number;
  auditScore: number | null;
  openIntegrityFindingCount: number;
}

export interface ResearchLoopStage {
  id: ResearchLoopStageId;
  label: string;
  detail: string;
  state: ResearchLoopStageState;
  actionTitle: string;
  actionLabel: string;
  rationale: string;
  screen: ScreenId | null;
}

export interface ResearchLoopSnapshot {
  stages: ResearchLoopStage[];
  currentStage: ResearchLoopStage | null;
  completeCount: number;
  outOfOrderCount: number;
  checks: {
    questionAnchored: boolean;
    methodFrozen: boolean;
    evidenceLinked: boolean;
    integrityReviewed: boolean;
  };
}

const plural = (count: number, singular: string, pluralForm = `${singular}s`) =>
  `${count} ${count === 1 ? singular : pluralForm}`;

export function hasSubstantiveResearchText(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return ![
    "define the research question for this project.",
    "define the working hypothesis for this project.",
    "no research question yet",
    "no working hypothesis yet",
    "no working hypothesis recorded yet.",
  ].includes(normalized);
}

export function deriveResearchLoop(
  input: ResearchLoopInput,
): ResearchLoopSnapshot {
  const intrinsicComplete = [
    input.hasQuestion && input.hasHypothesis,
    input.reviewedSourceCount > 0,
    input.preregistrationCount > 0,
    input.completedRunCount > 0,
    input.reproducibleRunCount > 0 && input.evidenceLinkCount > 0,
    input.supportedClaimCount > 0,
    input.auditScore !== null &&
      input.auditScore >= 80 &&
      input.openIntegrityFindingCount === 0,
  ];
  const firstIncomplete = intrinsicComplete.findIndex((complete) => !complete);
  const stageState = (index: number): ResearchLoopStageState => {
    if (firstIncomplete < 0 || index < firstIncomplete) return "complete";
    if (index === firstIncomplete) return "current";
    return intrinsicComplete[index] ? "out-of-order" : "blocked";
  };

  const stages: ResearchLoopStage[] = [
    {
      id: "question",
      label: "Question",
      detail:
        input.hasQuestion && input.hasHypothesis
          ? "Question and hypothesis defined"
          : input.hasQuestion
            ? "Working hypothesis missing"
            : "Research question missing",
      state: stageState(0),
      actionTitle: "Anchor the study",
      actionLabel: "Define question",
      rationale:
        "Write the question and expected pattern before sources or results shape the story.",
      screen: null,
    },
    {
      id: "sources",
      label: "Sources",
      detail: `${plural(input.reviewedSourceCount, "reviewed source")}`,
      state: stageState(1),
      actionTitle: "Build the source set",
      actionLabel: "Review sources",
      rationale:
        "Add the literature and datasets that define the study population, variables, and known limitations.",
      screen: "sources",
    },
    {
      id: "method",
      label: "Method",
      detail: `${plural(input.preregistrationCount, "frozen plan")}`,
      state: stageState(2),
      actionTitle: "Freeze the analysis plan",
      actionLabel: "Plan experiment",
      rationale:
        "Record the hypothesis, metrics, exclusions, and success rule before evaluating the outcome.",
      screen: "experiments",
    },
    {
      id: "experiment",
      label: "Experiment",
      detail: `${plural(input.completedRunCount, "completed run")}`,
      state: stageState(3),
      actionTitle: "Run the planned analysis",
      actionLabel: "Open experiments",
      rationale:
        "Execute the frozen method and retain configuration, environment, metrics, and failures.",
      screen: "experiments",
    },
    {
      id: "evidence",
      label: "Evidence",
      detail: `${plural(input.reproducibleRunCount, "reproducible run")} · ${plural(input.evidenceLinkCount, "link")}`,
      state: stageState(4),
      actionTitle: "Connect outputs to evidence",
      actionLabel: "Link evidence",
      rationale:
        "Connect sources, runs, figures, and limitations so every result has a traceable basis.",
      screen: "graph",
    },
    {
      id: "claim",
      label: "Claim",
      detail: `${input.supportedClaimCount} supported of ${input.claimCount}`,
      state: stageState(5),
      actionTitle: "Write the supported claim",
      actionLabel: "Review claims",
      rationale:
        "State only what the linked evidence supports and keep uncertainty and contradictions visible.",
      screen: "claims",
    },
    {
      id: "review",
      label: "Review",
      detail:
        input.auditScore === null
          ? "Integrity audit not run"
          : `${input.auditScore}% audit score · ${plural(input.openIntegrityFindingCount, "open finding")}`,
      state: stageState(6),
      actionTitle: "Stress-test reproducibility",
      actionLabel: "Run integrity review",
      rationale:
        "Audit the code, data, environment, evidence links, and unresolved findings before sharing the result.",
      screen: "reproducibility",
    },
  ];

  return {
    stages,
    currentStage: stages.find((stage) => stage.state === "current") ?? null,
    completeCount: intrinsicComplete.filter(Boolean).length,
    outOfOrderCount: stages.filter((stage) => stage.state === "out-of-order")
      .length,
    checks: {
      questionAnchored: intrinsicComplete[0],
      methodFrozen: intrinsicComplete[2],
      evidenceLinked: intrinsicComplete[4],
      integrityReviewed: intrinsicComplete[6],
    },
  };
}

const stageStateLabel: Record<ResearchLoopStageState, string> = {
  complete: "Complete",
  current: "Now",
  "out-of-order": "Needs anchor",
  blocked: "Waiting",
};

function StageIcon({ state }: { state: ResearchLoopStageState }) {
  if (state === "complete") return <Check aria-hidden="true" />;
  if (state === "current") return <CircleDot aria-hidden="true" />;
  if (state === "out-of-order") return <TriangleAlert aria-hidden="true" />;
  return <LockKeyhole aria-hidden="true" />;
}

function TrustCheck({ label, pass }: { label: string; pass: boolean }) {
  return (
    <li data-pass={pass}>
      {pass ? <Check aria-hidden="true" /> : <Circle aria-hidden="true" />}
      <span>{label}</span>
      <strong>{pass ? "Ready" : "Open"}</strong>
    </li>
  );
}

export function ResearchLoopWorkspace({
  snapshot,
  question,
  hypothesis,
  recommendedNext,
  onOpenBrief,
  onOpenScreen,
}: {
  snapshot: ResearchLoopSnapshot;
  question: string;
  hypothesis: string;
  recommendedNext?: { title: string; rationale: string } | null;
  onOpenBrief: (trigger?: HTMLElement) => void;
  onOpenScreen: (screen: ScreenId) => void;
}) {
  const active = snapshot.currentStage;
  const loopComplete = active === null;
  const actionTitle = loopComplete
    ? (recommendedNext?.title ?? "Research record is review-ready")
    : active.actionTitle;
  const rationale = loopComplete
    ? (recommendedNext?.rationale ??
      "The core research loop is complete. Review the record, export it, or define the next experiment.")
    : snapshot.outOfOrderCount > 0 && active.id === "question"
      ? `${snapshot.outOfOrderCount} downstream stages contain records without an anchored question. Define the study contract before continuing.`
      : active.rationale;
  const actionLabel = loopComplete
    ? recommendedNext
      ? "Review next step"
      : "Open integrity review"
    : active.actionLabel;

  const runAction = (
    stage: ResearchLoopStage | null,
    trigger?: HTMLElement,
  ) => {
    if (!stage) {
      onOpenScreen(recommendedNext ? "next-steps" : "reproducibility");
      return;
    }
    if (stage.id === "question") onOpenBrief(trigger);
    else if (stage.screen) onOpenScreen(stage.screen);
  };

  return (
    <section
      className="cly-research-loop"
      aria-labelledby="research-loop-title"
    >
      <div className="cly-research-loop-main">
        <header>
          <div>
            <span className="cly-page-kicker">Research loop</span>
            <h2 id="research-loop-title">From question to defensible result</h2>
          </div>
          <span className="cly-loop-progress">
            {snapshot.completeCount} of {snapshot.stages.length} complete
          </span>
        </header>
        <ol className="cly-loop-stages">
          {snapshot.stages.map((stage, index) => (
            <li key={stage.id} data-state={stage.state}>
              <button
                type="button"
                aria-current={stage.state === "current" ? "step" : undefined}
                onClick={(event) => runAction(stage, event.currentTarget)}
                data-testid={`research-loop-${stage.id}`}
              >
                <span className="cly-loop-stage-index">
                  <StageIcon state={stage.state} />
                  <span className="cly-sr-only">Step {index + 1}</span>
                </span>
                <span className="cly-loop-stage-copy">
                  <strong>{stage.label}</strong>
                  <small>{stage.detail}</small>
                </span>
                <span className="cly-loop-stage-state">
                  {stageStateLabel[stage.state]}
                </span>
                <ArrowRight aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      </div>

      <aside className="cly-loop-control" aria-label="Current research action">
        <div className="cly-loop-now">
          <span className="cly-page-kicker">
            {loopComplete ? "Next" : "Now"}
          </span>
          <h2>{actionTitle}</h2>
          <p>{rationale}</p>
          <div className="cly-loop-actions">
            <Button
              variant="primary"
              onClick={(event) => runAction(active, event.currentTarget)}
            >
              {actionLabel} <ArrowRight aria-hidden="true" />
            </Button>
            <Button onClick={() => onOpenScreen("agents")}>
              <Bot aria-hidden="true" /> Open agent
            </Button>
            <Button variant="ghost" onClick={() => onOpenScreen("graph")}>
              <GitBranch aria-hidden="true" /> Inspect graph
            </Button>
          </div>
        </div>

        <div className="cly-loop-contract">
          <div>
            <span>Question</span>
            <p>
              {hasSubstantiveResearchText(question) ? question : "Not defined"}
            </p>
          </div>
          <div>
            <span>Hypothesis</span>
            <p>
              {hasSubstantiveResearchText(hypothesis)
                ? hypothesis
                : "Not defined"}
            </p>
          </div>
        </div>

        <div className="cly-loop-trust">
          <h3>Release gates</h3>
          <ul>
            <TrustCheck
              label="Question anchored"
              pass={snapshot.checks.questionAnchored}
            />
            <TrustCheck
              label="Method frozen"
              pass={snapshot.checks.methodFrozen}
            />
            <TrustCheck
              label="Evidence linked"
              pass={snapshot.checks.evidenceLinked}
            />
            <TrustCheck
              label="Integrity reviewed"
              pass={snapshot.checks.integrityReviewed}
            />
          </ul>
        </div>
      </aside>
    </section>
  );
}
