import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  CloudOff,
  Code2,
  Database,
  FolderInput,
  FolderPlus,
  GitBranch,
  HardDrive,
  LoaderCircle,
  LockKeyhole,
  Network,
  RefreshCcw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import {
  ProgressIndicator,
  StatusIndicator,
} from "../components/design-system";
import { Button, ErrorState, LoadingState } from "../components/primitives";
import {
  canTransmitExternally,
  createOnboardingDraft,
  generateStarterPlan,
  nextOnboardingStep,
  type OnboardingDiagnostics,
  type OnboardingDraft,
  type OnboardingProjectMode,
  type OnboardingProjectSelection,
  type OnboardingStepId,
  onboardingCompletionChecklist,
  onboardingSteps,
  previousOnboardingStep,
  restartOnboarding,
  skipOnboardingStep,
  updateOnboardingDraft,
} from "../domain/onboarding";
import type { ResearchProject, ScreenId } from "../domain/types";
import {
  loadOnboardingDraft,
  saveOnboardingDraft,
  scopeOnboardingDraftToProject,
} from "../services/onboarding-storage";

const stepCopy: Record<OnboardingStepId, { label: string; detail: string }> = {
  welcome: { label: "Welcome", detail: "How Cly works" },
  project: { label: "Project", detail: "Create or import" },
  research: { label: "Research", detail: "Question and outputs" },
  resources: { label: "Resources", detail: "Code, data, and tools" },
  people: { label: "Planning", detail: "People and deadline" },
  privacy: { label: "Privacy", detail: "Before transmission" },
  readiness: { label: "Readiness", detail: "Local environment checks" },
  lineage: { label: "Lineage", detail: "Recover existing work" },
  review: { label: "Review", detail: "Confirm before generation" },
  finish: { label: "First chain", detail: "Guided next steps" },
};

const emptyDiagnostics: OnboardingDiagnostics = {
  state: "idle",
  checks: [],
  repositorySize: "unknown",
};

const splitLines = (value: string) =>
  value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  required?: boolean;
}) {
  const id = useId();

  return (
    <label className="cly-onboarding-field" htmlFor={id}>
      <span>{label}</span>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          placeholder={placeholder}
          required={required}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          id={id}
          value={value}
          placeholder={placeholder}
          required={required}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

function Choice({
  checked,
  title,
  detail,
  onChange,
  icon,
  name = "onboarding-choice",
}: {
  checked: boolean;
  title: string;
  detail: string;
  onChange: () => void;
  icon?: React.ReactNode;
  name?: string;
}) {
  return (
    <label className="cly-onboarding-choice" data-selected={checked}>
      <input
        className="cly-onboarding-choice-input"
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
      />
      {icon}
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      {checked ? (
        <CheckCircle2 aria-hidden="true" />
      ) : (
        <Circle aria-hidden="true" />
      )}
    </label>
  );
}

export interface OnboardingScreenProps {
  activeProjectId?: string | null;
  initialDraft?: OnboardingDraft;
  diagnostics?: OnboardingDiagnostics;
  onChooseProject: (mode: OnboardingProjectMode) => Promise<{
    project: ResearchProject;
    selection: OnboardingProjectSelection;
  } | null>;
  onProjectSelected?: (project: ResearchProject) => void;
  onRunDiagnostics: (projectId: string) => Promise<OnboardingDiagnostics>;
  onComplete: (draft: OnboardingDraft) => Promise<void> | void;
  onOpenDestination: (screen: ScreenId) => void;
}

export function OnboardingScreen({
  activeProjectId = null,
  initialDraft,
  diagnostics: initialDiagnostics = emptyDiagnostics,
  onChooseProject,
  onProjectSelected,
  onRunDiagnostics,
  onComplete,
  onOpenDestination,
}: OnboardingScreenProps) {
  const [draft, setDraft] = useState<OnboardingDraft>(
    () => initialDraft ?? createOnboardingDraft(activeProjectId),
  );
  const [draftLoaded, setDraftLoaded] = useState(initialDraft !== undefined);
  const [draftLoadError, setDraftLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [diagnostics, setDiagnostics] =
    useState<OnboardingDiagnostics>(initialDiagnostics);
  const [error, setError] = useState<string | null>(null);
  const [selectingProject, setSelectingProject] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const stepIndex = onboardingSteps.indexOf(draft.currentStep);
  const patch = (value: Partial<OnboardingDraft>) =>
    setDraft((current) => updateOnboardingDraft(current, value));

  useEffect(() => {
    if (initialDraft) return;
    // Incrementing loadAttempt is the explicit retry signal for this effect.
    void loadAttempt;
    let cancelled = false;
    setDraftLoaded(false);
    setDraftLoadError(null);
    void loadOnboardingDraft(activeProjectId)
      .then((loaded) => {
        if (cancelled) return;
        setDraft(loaded);
        setDraftLoaded(true);
      })
      .catch((cause) => {
        if (cancelled) return;
        setDraftLoadError(
          cause instanceof Error
            ? cause.message
            : "Saved setup could not be loaded.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, initialDraft, loadAttempt]);

  useEffect(() => {
    if (!draftLoaded) return;
    void saveOnboardingDraft(draft).catch((cause) => {
      setError(
        cause instanceof Error
          ? cause.message
          : "Setup changes could not be saved.",
      );
    });
  }, [draft, draftLoaded]);

  useEffect(() => setDiagnostics(initialDiagnostics), [initialDiagnostics]);

  const chooseProject = async (mode: OnboardingProjectMode) => {
    setSelectingProject(true);
    setError(null);
    try {
      const result = await onChooseProject(mode);
      if (!result) return;
      const next = updateOnboardingDraft(draft, {
        projectId: result.project.id,
        project: result.selection,
        repositories:
          mode === "import"
            ? Array.from(new Set([...draft.repositories, result.project.path]))
            : draft.repositories,
        currentStep: "research",
      });
      const scoped = await scopeOnboardingDraftToProject(
        next,
        result.project.id,
      );
      setDraft(scoped);
      onProjectSelected?.(result.project);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The project could not be opened.",
      );
    } finally {
      setSelectingProject(false);
    }
  };

  const runDiagnostics = async () => {
    if (!draft.projectId) return;
    setDiagnostics({ ...emptyDiagnostics, state: "loading" });
    setError(null);
    try {
      setDiagnostics(await onRunDiagnostics(draft.projectId));
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Readiness checks failed.";
      setDiagnostics({
        ...emptyDiagnostics,
        state: "error",
        error: message,
      });
    }
  };

  const goNext = () => {
    if (draft.currentStep === "privacy")
      patch({ privacyReviewed: true, currentStep: "readiness" });
    else if (draft.currentStep === "review") {
      const accepted = updateOnboardingDraft(draft, { reviewAccepted: true });
      setDraft(
        updateOnboardingDraft(accepted, {
          starterPlan: generateStarterPlan(accepted),
          currentStep: "finish",
        }),
      );
    } else patch({ currentStep: nextOnboardingStep(draft.currentStep) });
  };

  const complete = async (destination: ScreenId = "sources") => {
    setFinishing(true);
    setError(null);
    const incomplete = updateOnboardingDraft(draft, { completed: false });
    try {
      await onComplete(incomplete);
      const completed = updateOnboardingDraft(incomplete, { completed: true });
      await saveOnboardingDraft(completed);
      setDraft(completed);
      onOpenDestination(destination);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Setup could not finish.";
      setDraft(incomplete);
      try {
        await saveOnboardingDraft(incomplete);
        setError(message);
      } catch (saveCause) {
        setError(
          `${message} The incomplete setup also could not be saved: ${
            saveCause instanceof Error ? saveCause.message : "unknown error"
          }`,
        );
      }
    } finally {
      setFinishing(false);
    }
  };

  const canContinue =
    draft.currentStep === "project"
      ? !!draft.project
      : draft.currentStep === "research"
        ? draft.topic.trim().length > 0 &&
          draft.primaryQuestion.trim().length > 0
        : draft.currentStep === "privacy"
          ? draft.privacyMode === "local-only" ||
            (draft.privacyMode === "sync-eligible" &&
              draft.externalTransmissionApproved)
          : true;

  if (!draftLoaded) {
    return (
      <div className="cly-onboarding">
        {draftLoadError ? (
          <ErrorState
            title="Saved setup could not be loaded"
            description={`${draftLoadError} Your durable draft was not replaced. Retry after the local database is available.`}
            onRetry={() => setLoadAttempt((attempt) => attempt + 1)}
          />
        ) : (
          <LoadingState label="Loading saved setup" />
        )}
      </div>
    );
  }

  return (
    <div className="cly-onboarding" data-step={draft.currentStep}>
      <header className="cly-onboarding-header">
        <div>
          <span>First-run setup</span>
          <strong>{draft.project?.name ?? "Cly"}</strong>
        </div>
        <ProgressIndicator
          compact
          value={Math.round((stepIndex / (onboardingSteps.length - 1)) * 100)}
          label={`${stepCopy[draft.currentStep].label} · step ${stepIndex + 1} of ${onboardingSteps.length}`}
        />
        <Button
          variant="ghost"
          onClick={() => setDraft((current) => restartOnboarding(current))}
        >
          <RotateCcw size={13} /> Restart
        </Button>
      </header>

      <div className="cly-onboarding-layout">
        <nav aria-label="Setup progress" className="cly-onboarding-steps">
          <ol>
            {onboardingSteps.map((step, index) => (
              <li key={step} data-active={step === draft.currentStep}>
                <button
                  type="button"
                  disabled={index > stepIndex}
                  aria-current={step === draft.currentStep ? "step" : undefined}
                  onClick={() => patch({ currentStep: step })}
                >
                  <span>
                    {index < stepIndex ? <Check size={12} /> : index + 1}
                  </span>
                  <span>
                    <strong>{stepCopy[step].label}</strong>
                    <small>{stepCopy[step].detail}</small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <p>
            Setup saves automatically. Close Cly at any time and resume where
            you left off.
          </p>
        </nav>

        <section className="cly-onboarding-workspace">
          {error ? (
            <div className="cly-onboarding-alert" role="alert">
              <AlertTriangle size={14} /> {error}
            </div>
          ) : null}

          {draft.currentStep === "welcome" ? (
            <div className="cly-onboarding-content cly-onboarding-welcome">
              <span className="cly-onboarding-mark">
                <Sparkles />
              </span>
              <p className="cly-onboarding-eyebrow">
                Local-first research workspace
              </p>
              <h1>Build your first trustworthy evidence chain</h1>
              <p className="cly-onboarding-lede">
                Cly Research connects sources, claims, experiments, and
                provenance. Cly Dev connects that research context to
                coding-agent work. Your project stays on this device by default.
              </p>
              <div className="cly-onboarding-product-lines">
                <div>
                  <Search />
                  <span>
                    <strong>Cly Research</strong>
                    <small>
                      Turn sources into reviewable claims and evidence.
                    </small>
                  </span>
                </div>
                <div>
                  <Code2 />
                  <span>
                    <strong>Cly Dev</strong>
                    <small>
                      Build and test code with the project’s research context.
                    </small>
                  </span>
                </div>
                <div>
                  <HardDrive />
                  <span>
                    <strong>Local first</strong>
                    <small>
                      No account is required. Network use is opt-in and reviewed
                      later.
                    </small>
                  </span>
                </div>
              </div>
              <div
                role="radiogroup"
                aria-label="Account mode"
                className="cly-onboarding-choices"
              >
                <Choice
                  checked={draft.accountMode === "guest"}
                  title="Continue locally"
                  detail="Recommended · guest mode, no account or sync"
                  icon={<LockKeyhole />}
                  onChange={() => patch({ accountMode: "guest" })}
                />
                <Choice
                  checked={draft.accountMode === "optional-account"}
                  title="Consider account sync later"
                  detail="Optional · setup remains local until you approve transmission"
                  icon={<Network />}
                  onChange={() => patch({ accountMode: "optional-account" })}
                />
              </div>
            </div>
          ) : null}

          {draft.currentStep === "project" ? (
            <div className="cly-onboarding-content">
              <p className="cly-onboarding-eyebrow">Project</p>
              <h1>Where should this research live?</h1>
              <p className="cly-onboarding-lede">
                Each setup is stored with one project. Cly never starts you in
                example or fixture research.
              </p>
              <div className="cly-onboarding-project-actions">
                <button
                  type="button"
                  disabled={selectingProject}
                  onClick={() => void chooseProject("create")}
                >
                  <FolderPlus />
                  <span>
                    <strong>Create a new project</strong>
                    <small>Choose an empty or new folder for this work.</small>
                  </span>
                  <ArrowRight />
                </button>
                <button
                  type="button"
                  disabled={selectingProject}
                  onClick={() => void chooseProject("import")}
                >
                  <FolderInput />
                  <span>
                    <strong>Import an existing folder</strong>
                    <small>
                      Open a repository or research directory without moving it.
                    </small>
                  </span>
                  <ArrowRight />
                </button>
              </div>
              {selectingProject ? (
                <p role="status">
                  <LoaderCircle className="animate-spin" size={13} /> Waiting
                  for folder selection…
                </p>
              ) : null}
              {draft.project ? (
                <div className="cly-onboarding-selected">
                  <CheckCircle2 />
                  <span>
                    <strong>{draft.project.name}</strong>
                    <code>{draft.project.path}</code>
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          {draft.currentStep === "research" ? (
            <div className="cly-onboarding-content">
              <p className="cly-onboarding-eyebrow">Research direction</p>
              <h1>Define the question before the tooling</h1>
              <div className="cly-onboarding-form-grid">
                <Field
                  required
                  label="Research topic"
                  value={draft.topic}
                  placeholder="e.g. Calibration under distribution shift"
                  onChange={(topic) => patch({ topic })}
                />
                <Field
                  label="Discipline"
                  value={draft.discipline}
                  placeholder="e.g. Scientific machine learning"
                  onChange={(discipline) => patch({ discipline })}
                />
                <Field
                  required
                  multiline
                  label="Primary question"
                  value={draft.primaryQuestion}
                  placeholder="What must this project establish?"
                  onChange={(primaryQuestion) => patch({ primaryQuestion })}
                />
                <Field
                  multiline
                  label="Expected outputs"
                  value={draft.expectedOutputs.join("\n")}
                  placeholder="Paper\nDataset\nReproducible benchmark"
                  onChange={(value) =>
                    patch({ expectedOutputs: splitLines(value) })
                  }
                />
              </div>
            </div>
          ) : null}

          {draft.currentStep === "resources" ? (
            <div className="cly-onboarding-content">
              <p className="cly-onboarding-eyebrow">Resources</p>
              <h1>Connect what already exists</h1>
              <p className="cly-onboarding-lede">
                Paths are recorded locally. Nothing is uploaded during this
                step.
              </p>
              <div className="cly-onboarding-form-grid">
                <Field
                  multiline
                  label="Repositories"
                  value={draft.repositories.join("\n")}
                  placeholder="One local path or repository per line"
                  onChange={(value) =>
                    patch({ repositories: splitLines(value) })
                  }
                />
                <Field
                  multiline
                  label="Datasets"
                  value={draft.datasets.join("\n")}
                  placeholder="Local datasets, manifests, or approved URLs"
                  onChange={(value) => patch({ datasets: splitLines(value) })}
                />
                <Field
                  multiline
                  label="Tools"
                  value={draft.tools.join("\n")}
                  placeholder="Python, R, Jupyter, MATLAB…"
                  onChange={(value) => patch({ tools: splitLines(value) })}
                />
                <Field
                  multiline
                  label="Provider preferences"
                  value={draft.providerPreferences.join("\n")}
                  placeholder="Optional local/provider CLIs"
                  onChange={(value) =>
                    patch({ providerPreferences: splitLines(value) })
                  }
                />
              </div>
            </div>
          ) : null}

          {draft.currentStep === "people" ? (
            <div className="cly-onboarding-content">
              <p className="cly-onboarding-eyebrow">Planning</p>
              <h1>Capture collaborators and constraints</h1>
              <div className="cly-onboarding-form-grid">
                <Field
                  multiline
                  label="Collaborators"
                  value={draft.collaborators.join("\n")}
                  placeholder="Names, roles, or teams"
                  onChange={(value) =>
                    patch({ collaborators: splitLines(value) })
                  }
                />
                <label className="cly-onboarding-field">
                  <span>Deadline</span>
                  <input
                    type="date"
                    value={draft.deadline}
                    onChange={(event) =>
                      patch({ deadline: event.target.value })
                    }
                  />
                </label>
                <Field
                  multiline
                  label="Optional integrations"
                  value={draft.optionalIntegrations.join("\n")}
                  placeholder="GitHub, Zotero, cloud storage…"
                  onChange={(value) =>
                    patch({ optionalIntegrations: splitLines(value) })
                  }
                />
              </div>
            </div>
          ) : null}

          {draft.currentStep === "privacy" ? (
            <div className="cly-onboarding-content">
              <p className="cly-onboarding-eyebrow">Privacy checkpoint</p>
              <h1>Choose before any external request</h1>
              <p className="cly-onboarding-lede">
                Local filesystem checks do not transmit project content.
                Provider searches, account sync, and remote integrations remain
                blocked until explicitly approved.
              </p>
              <div
                role="radiogroup"
                aria-label="Project privacy"
                className="cly-onboarding-choices"
              >
                <Choice
                  checked={draft.privacyMode === "local-only"}
                  title="Local-only"
                  detail="Default · project content cannot be sent to external providers"
                  icon={<CloudOff />}
                  onChange={() =>
                    patch({
                      privacyMode: "local-only",
                      externalTransmissionApproved: false,
                    })
                  }
                />
                <Choice
                  checked={draft.privacyMode === "sync-eligible"}
                  title="Allow approved external requests"
                  detail="Each destination still requires explicit approval"
                  icon={<Network />}
                  onChange={() => patch({ privacyMode: "sync-eligible" })}
                />
              </div>
              {draft.privacyMode === "sync-eligible" ? (
                <label className="cly-onboarding-consent">
                  <input
                    type="checkbox"
                    checked={draft.externalTransmissionApproved}
                    onChange={(event) =>
                      patch({
                        externalTransmissionApproved: event.target.checked,
                      })
                    }
                  />
                  <span>
                    <strong>
                      I understand selected project data may leave this device
                    </strong>
                    <small>
                      External requests remain limited to the providers and
                      integrations I choose.
                    </small>
                  </span>
                </label>
              ) : null}
              <div className="cly-onboarding-privacy-status">
                <ShieldCheck />
                <span>
                  <strong>
                    {canTransmitExternally(draft)
                      ? "External transmission enabled"
                      : "External transmission blocked"}
                  </strong>
                  <small>
                    {canTransmitExternally(draft)
                      ? "Approved destinations may be contacted after setup."
                      : "Cly will remain local-only."}
                  </small>
                </span>
              </div>
            </div>
          ) : null}

          {draft.currentStep === "readiness" ? (
            <div className="cly-onboarding-content">
              <p className="cly-onboarding-eyebrow">Local readiness</p>
              <h1>Check the project environment</h1>
              <p className="cly-onboarding-lede">
                These checks inspect local executables and the selected folder.
                They do not contact external services.
              </p>
              {diagnostics.state === "idle" ? (
                <div className="cly-onboarding-empty">
                  <Database />
                  <h2>Ready to inspect this project</h2>
                  <p>
                    Check Git, Python, Jupyter, provider CLIs, filesystem
                    permission, and configured integrations.
                  </p>
                  <Button
                    variant="primary"
                    disabled={!draft.projectId}
                    onClick={() => void runDiagnostics()}
                  >
                    Run local checks
                  </Button>
                </div>
              ) : null}
              {diagnostics.state === "loading" ? (
                <LoadingState label="Checking the local project environment" />
              ) : null}
              {diagnostics.state === "error" ? (
                <ErrorState
                  title="Readiness checks failed"
                  description={
                    diagnostics.error ?? "Try the local checks again."
                  }
                  onRetry={() => void runDiagnostics()}
                />
              ) : null}
              {diagnostics.state === "ready" ? (
                <div className="cly-onboarding-diagnostics">
                  {diagnostics.repositorySize === "large" ? (
                    <div className="cly-onboarding-warning" role="status">
                      <AlertTriangle />
                      <span>
                        <strong>Large repository</strong>
                        <small>
                          {diagnostics.scannedFiles?.toLocaleString() ?? "Many"}{" "}
                          files detected. Initial scans will use limits and
                          ignore rules.
                        </small>
                      </span>
                    </div>
                  ) : null}
                  <ul>
                    {diagnostics.checks.map((check) => (
                      <li key={check.id} data-status={check.status}>
                        <StatusIndicator
                          tone={
                            check.status === "pass"
                              ? "success"
                              : check.status === "failed" ||
                                  check.status === "permission-denied"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {check.status.replace("-", " ")}
                        </StatusIndicator>
                        <span>
                          <strong>{check.label}</strong>
                          <small>{check.detail}</small>
                          {check.fix ? <code>{check.fix}</code> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Button onClick={() => void runDiagnostics()}>
                    <RefreshCcw size={13} /> Run again
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {draft.currentStep === "lineage" ? (
            <div className="cly-onboarding-content">
              <p className="cly-onboarding-eyebrow">Existing work</p>
              <h1>Reconstruct research lineage?</h1>
              <p className="cly-onboarding-lede">
                Cly can propose links among existing sources, notebooks, code,
                runs, figures, and claims. Every inferred link stays unapproved
                until you review it.
              </p>
              <div
                role="radiogroup"
                aria-label="Lineage reconstruction"
                className="cly-onboarding-choices"
              >
                <Choice
                  checked={draft.reconstructLineage}
                  title="Offer retrospective reconstruction"
                  detail="Scan locally and review every inferred relationship"
                  icon={<GitBranch />}
                  onChange={() => patch({ reconstructLineage: true })}
                />
                <Choice
                  checked={!draft.reconstructLineage}
                  title="Start with new evidence"
                  detail="Skip reconstruction for now; it remains available later"
                  icon={<Sparkles />}
                  onChange={() => patch({ reconstructLineage: false })}
                />
              </div>
            </div>
          ) : null}

          {draft.currentStep === "review" ? (
            <div className="cly-onboarding-content">
              <p className="cly-onboarding-eyebrow">Review</p>
              <h1>Confirm the project before Cly generates anything</h1>
              <dl className="cly-onboarding-review">
                <div>
                  <dt>Project</dt>
                  <dd>
                    {draft.project?.name ?? "Not selected"}
                    <small>{draft.project?.path}</small>
                  </dd>
                </div>
                <div>
                  <dt>Question</dt>
                  <dd>{draft.primaryQuestion || "Not provided"}</dd>
                </div>
                <div>
                  <dt>Output</dt>
                  <dd>
                    {draft.expectedOutputs.join(", ") || "Evidence summary"}
                  </dd>
                </div>
                <div>
                  <dt>Resources</dt>
                  <dd>
                    {draft.repositories.length} repositories ·{" "}
                    {draft.datasets.length} datasets · {draft.tools.length}{" "}
                    tools
                  </dd>
                </div>
                <div>
                  <dt>Privacy</dt>
                  <dd>
                    {draft.privacyMode === "local-only"
                      ? "Local-only; external transmission blocked"
                      : "Explicit external transmission approved"}
                  </dd>
                </div>
                <div>
                  <dt>Existing work</dt>
                  <dd>
                    {draft.reconstructLineage
                      ? "Offer retrospective lineage reconstruction"
                      : "Start with a new evidence chain"}
                  </dd>
                </div>
              </dl>
              <div className="cly-onboarding-generation-note">
                <Sparkles />
                <span>
                  <strong>
                    Next: generate a starter objective, hypothesis, and three
                    tasks
                  </strong>
                  <small>
                    Nothing has been generated yet. Continuing records this
                    review first.
                  </small>
                </span>
              </div>
            </div>
          ) : null}

          {draft.currentStep === "finish" ? (
            <div className="cly-onboarding-content">
              <p className="cly-onboarding-eyebrow">Setup checklist</p>
              <h1>Start the first evidence chain</h1>
              {draft.starterPlan ? (
                <div className="cly-onboarding-plan">
                  <div>
                    <span>Objective</span>
                    <strong>{draft.starterPlan.objective}</strong>
                  </div>
                  <div>
                    <span>Starter hypothesis</span>
                    <strong>{draft.starterPlan.hypothesis}</strong>
                  </div>
                </div>
              ) : null}
              <ol className="cly-onboarding-checklist">
                {onboardingCompletionChecklist(draft).map((item, index) => (
                  <li key={item.id} data-complete={item.complete}>
                    {item.complete ? <CheckCircle2 /> : <Circle />}
                    <span>{index + 1}</span>
                    <strong>{item.label}</strong>
                    {!item.complete && item.id === "source" ? (
                      <Button
                        variant="ghost"
                        disabled={finishing}
                        onClick={() => void complete("sources")}
                      >
                        Open sources
                      </Button>
                    ) : null}
                    {!item.complete && item.id === "claim" ? (
                      <Button
                        variant="ghost"
                        disabled={finishing}
                        onClick={() => void complete("claims")}
                      >
                        Open claims
                      </Button>
                    ) : null}
                    {!item.complete && item.id === "evidence" ? (
                      <Button
                        variant="ghost"
                        disabled={finishing}
                        onClick={() => void complete("graph")}
                      >
                        Inspect graph
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ol>
              <p className="cly-onboarding-lede">
                Your next action is to add or scan one source. Then create a
                claim, link an exact passage, and inspect the chain.
              </p>
            </div>
          ) : null}
        </section>
      </div>

      <footer className="cly-onboarding-footer">
        <Button
          variant="ghost"
          disabled={draft.currentStep === "welcome"}
          onClick={() =>
            patch({ currentStep: previousOnboardingStep(draft.currentStep) })
          }
        >
          <ArrowLeft size={13} /> Back
        </Button>
        <span>
          Saved{" "}
          {new Date(draft.updatedAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        {!(
          ["project", "privacy", "review", "finish"] as OnboardingStepId[]
        ).includes(draft.currentStep) ? (
          <Button
            variant="ghost"
            onClick={() => setDraft((current) => skipOnboardingStep(current))}
          >
            Skip for now
          </Button>
        ) : null}
        {draft.currentStep === "finish" ? (
          <Button
            variant="primary"
            disabled={finishing}
            onClick={() => void complete("sources")}
          >
            {finishing ? "Finishing…" : "Add the first source"}{" "}
            <ArrowRight size={13} />
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={!canContinue || selectingProject}
            onClick={goNext}
          >
            {draft.currentStep === "review"
              ? "Approve and generate"
              : "Continue"}{" "}
            <ArrowRight size={13} />
          </Button>
        )}
      </footer>
    </div>
  );
}

export const onboardingTestFixtures = {
  emptyDiagnostics,
  largeDiagnostics: {
    state: "ready",
    repositorySize: "large",
    scannedFiles: 125_000,
    checks: [
      {
        id: "filesystem",
        label: "Filesystem",
        status: "pass",
        detail: "Read/write access confirmed.",
      },
      {
        id: "git",
        label: "Git",
        status: "warning",
        detail: "Repository scan limited.",
        fix: "Add large outputs to .gitignore",
      },
    ],
  } satisfies OnboardingDiagnostics,
};
