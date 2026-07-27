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
  HardDrive,
  LoaderCircle,
  LogIn,
  Network,
  RefreshCcw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useIdeStore } from "../../../components/ide/ide-store";
import type { ProviderModelState } from "../../../components/ide/ide-types";
import type { AiProvider } from "../../../types/ide";
import {
  ProgressIndicator,
  StatusIndicator,
} from "../components/design-system";
import {
  Badge,
  Button,
  ErrorState,
  LoadingState,
  Panel,
} from "../components/primitives";
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
  getLocalProviderStatus,
  localIntegrationService,
  localProviderDefinitions,
} from "../services/local-integrations";
import {
  loadOnboardingDraft,
  saveOnboardingDraft,
  scopeOnboardingDraftToProject,
} from "../services/onboarding-storage";

const stepCopy: Record<OnboardingStepId, { label: string; detail: string }> = {
  welcome: { label: "Welcome", detail: "A clean local workspace" },
  access: { label: "AI access", detail: "Local-only or provider sign-in" },
  project: { label: "Project", detail: "Create new or open existing" },
  research: { label: "Research", detail: "Name the first question" },
  privacy: { label: "Privacy", detail: "Set the local boundary" },
  readiness: { label: "Readiness", detail: "Optional local checks" },
  review: { label: "Review", detail: "Confirm your workspace" },
  finish: { label: "Ready", detail: "Open the empty project" },
};

const emptyDiagnostics: OnboardingDiagnostics = {
  state: "idle",
  checks: [],
  repositorySize: "unknown",
};

type ProviderStateMap = Record<AiProvider, ProviderModelState>;

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
  const [providerLoginErrors, setProviderLoginErrors] = useState<
    Partial<Record<AiProvider, string>>
  >({});
  const providerModels = useIdeStore((state) => state.providerModels);
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

  useEffect(() => {
    if (draft.currentStep !== "access") return;
    void localIntegrationService.refreshProvider();
  }, [draft.currentStep]);

  const launchProviderLogin = async (provider: AiProvider, name: string) => {
    setProviderLoginErrors((current) => ({
      ...current,
      [provider]: undefined,
    }));
    patch({
      accountMode: "optional-account",
      providerPreferences: Array.from(
        new Set([...draft.providerPreferences, provider]),
      ),
    });
    try {
      await localIntegrationService.launchProviderLogin(provider);
    } catch (cause) {
      setProviderLoginErrors((current) => ({
        ...current,
        [provider]:
          cause instanceof Error
            ? cause.message
            : `Cly could not open ${name} sign-in.`,
      }));
    }
  };

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
              <p className="cly-onboarding-eyebrow">Your first launch</p>
              <h1>Your Cly workspace starts empty</h1>
              <p className="cly-onboarding-lede">
                There is no sample project and no test research to clean up.
                Create a new folder or open work you already have; Cly restores
                it the next time you launch the app.
              </p>
              <div className="cly-onboarding-product-lines">
                <div>
                  <FolderPlus />
                  <span>
                    <strong>No preloaded project</strong>
                    <small>
                      Begin with a blank workspace that belongs to you.
                    </small>
                  </span>
                </div>
                <div>
                  <HardDrive />
                  <span>
                    <strong>Saved on this Mac</strong>
                    <small>
                      Projects and setup return when Cly is reopened.
                    </small>
                  </span>
                </div>
                <div>
                  <ShieldCheck />
                  <span>
                    <strong>Local by default</strong>
                    <small>
                      No account or external connection is required.
                    </small>
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          {draft.currentStep === "access" ? (
            <div className="cly-onboarding-content">
              <p className="cly-onboarding-eyebrow">AI access</p>
              <h1>Choose local-only use or connect an AI provider</h1>
              <p className="cly-onboarding-lede">
                Cly does not require a cloud account. If you want agent
                features, Cly uses an authenticated local Codex, Claude Code,
                OpenCode, or Cursor installation and never stores provider API
                keys.
              </p>
              <div
                role="radiogroup"
                aria-label="Cly access mode"
                className="cly-onboarding-choices"
              >
                <Choice
                  name="access-mode"
                  checked={draft.accountMode === "guest"}
                  title="Use Cly locally"
                  detail="No sign-in required · connect a provider later in Settings"
                  icon={<HardDrive />}
                  onChange={() =>
                    patch({
                      accountMode: "guest",
                      providerPreferences: [],
                    })
                  }
                />
                <Choice
                  name="access-mode"
                  checked={draft.accountMode === "optional-account"}
                  title="Connect an AI provider"
                  detail="Use an existing local provider account for agent features"
                  icon={<Code2 />}
                  onChange={() => patch({ accountMode: "optional-account" })}
                />
              </div>
              {draft.accountMode === "optional-account" ? (
                <Panel className="cly-local-integration-list cly-onboarding-provider-list">
                  {localProviderDefinitions.map((definition) => {
                    const state = (providerModels as ProviderStateMap)[
                      definition.provider
                    ];
                    const status = getLocalProviderStatus(
                      state,
                      providerModels.fetchedAt !== null,
                    );
                    return (
                      <div
                        className="cly-local-integration-row"
                        key={definition.provider}
                      >
                        <div className="cly-local-integration-identity">
                          <Code2 size={14} aria-hidden="true" />
                          <div>
                            <strong>{definition.name}</strong>
                            <span>{definition.runtime}</span>
                          </div>
                        </div>
                        <div className="cly-local-integration-status">
                          <Badge tone={status.tone}>{status.label}</Badge>
                          <span>{status.detail}</span>
                          {providerLoginErrors[definition.provider] ? (
                            <small
                              className="cly-local-integration-error"
                              role="alert"
                            >
                              {providerLoginErrors[definition.provider]}
                            </small>
                          ) : null}
                        </div>
                        <code className="cly-local-integration-command">
                          {definition.loginCommand}
                        </code>
                        <div className="cly-local-integration-actions">
                          {status.kind === "signed-out" ? (
                            <Button
                              variant="primary"
                              onClick={() =>
                                void launchProviderLogin(
                                  definition.provider,
                                  definition.name,
                                )
                              }
                            >
                              <LogIn size={13} aria-hidden="true" /> Sign in
                            </Button>
                          ) : null}
                          {status.kind === "not-installed" ? (
                            <Button
                              onClick={() =>
                                void localIntegrationService.openDocumentation(
                                  definition.docsUrl,
                                )
                              }
                            >
                              Install
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            disabled={state.loading}
                            onClick={() =>
                              void localIntegrationService.refreshProvider(
                                definition.provider,
                              )
                            }
                          >
                            <RefreshCcw size={13} aria-hidden="true" /> Refresh
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </Panel>
              ) : null}
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
                    <small>
                      Name a new empty folder. Cly creates it and remembers it.
                    </small>
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
                    <strong>Open an existing folder</strong>
                    <small>
                      Open a repository or research directory without moving or
                      copying it.
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

          {draft.currentStep === "review" ? (
            <div className="cly-onboarding-content">
              <p className="cly-onboarding-eyebrow">Review</p>
              <h1>Confirm your new workspace</h1>
              <dl className="cly-onboarding-review">
                <div>
                  <dt>AI access</dt>
                  <dd>
                    {draft.accountMode === "guest"
                      ? "Local-only; no provider connected"
                      : draft.providerPreferences.length
                        ? draft.providerPreferences.join(", ")
                        : "Provider sign-in selected"}
                  </dd>
                </div>
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
                  <dt>Privacy</dt>
                  <dd>
                    {draft.privacyMode === "local-only"
                      ? "Local-only; external transmission blocked"
                      : "Explicit external transmission approved"}
                  </dd>
                </div>
                <div>
                  <dt>Starting state</dt>
                  <dd>Empty project; no sample sources, claims, or runs</dd>
                </div>
              </dl>
              <div className="cly-onboarding-generation-note">
                <Sparkles />
                <span>
                  <strong>
                    Next: prepare a private starter plan for this project
                  </strong>
                  <small>
                    Cly records this review before creating the local plan.
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
        {draft.currentStep === "readiness" ? (
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
            {draft.currentStep === "review" ? "Prepare workspace" : "Continue"}{" "}
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
