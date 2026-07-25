export const onboardingSteps = [
  "welcome",
  "project",
  "research",
  "resources",
  "people",
  "privacy",
  "readiness",
  "lineage",
  "review",
  "finish",
] as const;

export type OnboardingStepId = (typeof onboardingSteps)[number];
export type OnboardingProjectMode = "create" | "import";
export type OnboardingPrivacyMode = "local-only" | "sync-eligible";
export type OnboardingDiagnosticStatus =
  | "pending"
  | "pass"
  | "warning"
  | "failed"
  | "permission-denied"
  | "offline";

export interface OnboardingProjectSelection {
  id: string;
  name: string;
  path: string;
  mode: OnboardingProjectMode;
}

export interface OnboardingStarterPlan {
  objective: string;
  hypothesis: string;
  tasks: string[];
  generatedAt: string;
}

export interface OnboardingDraft {
  version: 1;
  projectId: string | null;
  currentStep: OnboardingStepId;
  completed: boolean;
  skippedSteps: OnboardingStepId[];
  project: OnboardingProjectSelection | null;
  accountMode: "guest" | "optional-account";
  topic: string;
  primaryQuestion: string;
  expectedOutputs: string[];
  discipline: string;
  repositories: string[];
  datasets: string[];
  tools: string[];
  collaborators: string[];
  deadline: string;
  privacyMode: OnboardingPrivacyMode;
  externalTransmissionApproved: boolean;
  providerPreferences: string[];
  optionalIntegrations: string[];
  privacyReviewed: boolean;
  reconstructLineage: boolean;
  reviewAccepted: boolean;
  starterPlan: OnboardingStarterPlan | null;
  updatedAt: string;
}

export interface OnboardingDiagnostic {
  id:
    | "filesystem"
    | "git"
    | "python"
    | "jupyter"
    | "provider-cli"
    | "integrations";
  label: string;
  status: OnboardingDiagnosticStatus;
  detail: string;
  fix?: string;
}

export interface OnboardingDiagnostics {
  state: "idle" | "loading" | "ready" | "error";
  checks: OnboardingDiagnostic[];
  repositorySize: "unknown" | "normal" | "large";
  scannedFiles?: number;
  error?: string;
}

const now = () => new Date().toISOString();

export function createOnboardingDraft(
  projectId: string | null = null,
): OnboardingDraft {
  return {
    version: 1,
    projectId,
    currentStep: projectId ? "research" : "welcome",
    completed: false,
    skippedSteps: [],
    project: null,
    accountMode: "guest",
    topic: "",
    primaryQuestion: "",
    expectedOutputs: [],
    discipline: "",
    repositories: [],
    datasets: [],
    tools: [],
    collaborators: [],
    deadline: "",
    privacyMode: "local-only",
    externalTransmissionApproved: false,
    providerPreferences: [],
    optionalIntegrations: [],
    privacyReviewed: false,
    reconstructLineage: false,
    reviewAccepted: false,
    starterPlan: null,
    updatedAt: now(),
  };
}

export function isOnboardingStep(value: unknown): value is OnboardingStepId {
  return onboardingSteps.includes(value as OnboardingStepId);
}

export function restoreOnboardingDraft(
  value: unknown,
  projectId: string | null = null,
): OnboardingDraft {
  const fallback = createOnboardingDraft(projectId);
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Partial<OnboardingDraft>;
  if (candidate.version !== 1) return fallback;
  const arrays = (input: unknown) =>
    Array.isArray(input)
      ? input.filter((item): item is string => typeof item === "string")
      : [];
  const project =
    candidate.project &&
    typeof candidate.project.id === "string" &&
    typeof candidate.project.name === "string" &&
    typeof candidate.project.path === "string" &&
    (candidate.project.mode === "create" || candidate.project.mode === "import")
      ? candidate.project
      : null;
  const resolvedProjectId =
    projectId ??
    (typeof candidate.projectId === "string" ? candidate.projectId : null);
  return {
    ...fallback,
    projectId: resolvedProjectId,
    currentStep: isOnboardingStep(candidate.currentStep)
      ? candidate.currentStep
      : fallback.currentStep,
    completed: candidate.completed === true,
    skippedSteps: arrays(candidate.skippedSteps).filter(isOnboardingStep),
    project,
    accountMode:
      candidate.accountMode === "optional-account"
        ? "optional-account"
        : "guest",
    topic: typeof candidate.topic === "string" ? candidate.topic : "",
    primaryQuestion:
      typeof candidate.primaryQuestion === "string"
        ? candidate.primaryQuestion
        : "",
    expectedOutputs: arrays(candidate.expectedOutputs),
    discipline:
      typeof candidate.discipline === "string" ? candidate.discipline : "",
    repositories: arrays(candidate.repositories),
    datasets: arrays(candidate.datasets),
    tools: arrays(candidate.tools),
    collaborators: arrays(candidate.collaborators),
    deadline: typeof candidate.deadline === "string" ? candidate.deadline : "",
    privacyMode:
      candidate.privacyMode === "sync-eligible"
        ? "sync-eligible"
        : "local-only",
    externalTransmissionApproved:
      candidate.externalTransmissionApproved === true,
    providerPreferences: arrays(candidate.providerPreferences),
    optionalIntegrations: arrays(candidate.optionalIntegrations),
    privacyReviewed: candidate.privacyReviewed === true,
    reconstructLineage: candidate.reconstructLineage === true,
    reviewAccepted: candidate.reviewAccepted === true,
    starterPlan:
      candidate.starterPlan &&
      typeof candidate.starterPlan.objective === "string" &&
      typeof candidate.starterPlan.hypothesis === "string" &&
      Array.isArray(candidate.starterPlan.tasks) &&
      typeof candidate.starterPlan.generatedAt === "string"
        ? {
            objective: candidate.starterPlan.objective,
            hypothesis: candidate.starterPlan.hypothesis,
            tasks: arrays(candidate.starterPlan.tasks),
            generatedAt: candidate.starterPlan.generatedAt,
          }
        : null,
    updatedAt:
      typeof candidate.updatedAt === "string" ? candidate.updatedAt : now(),
  };
}

export function updateOnboardingDraft(
  draft: OnboardingDraft,
  patch: Partial<OnboardingDraft>,
): OnboardingDraft {
  const invalidatesReview = [
    "topic",
    "primaryQuestion",
    "expectedOutputs",
    "discipline",
    "repositories",
    "datasets",
    "tools",
    "collaborators",
    "deadline",
    "privacyMode",
    "externalTransmissionApproved",
    "providerPreferences",
  ].some((key) => key in patch);
  return {
    ...draft,
    ...patch,
    ...(invalidatesReview
      ? { reviewAccepted: false, starterPlan: null }
      : null),
    updatedAt: now(),
  };
}

export function nextOnboardingStep(step: OnboardingStepId): OnboardingStepId {
  const index = onboardingSteps.indexOf(step);
  return onboardingSteps[Math.min(onboardingSteps.length - 1, index + 1)];
}

export function previousOnboardingStep(
  step: OnboardingStepId,
): OnboardingStepId {
  const index = onboardingSteps.indexOf(step);
  return onboardingSteps[Math.max(0, index - 1)];
}

export function skipOnboardingStep(draft: OnboardingDraft): OnboardingDraft {
  if (["project", "privacy", "review", "finish"].includes(draft.currentStep))
    return draft;
  return updateOnboardingDraft(draft, {
    currentStep: nextOnboardingStep(draft.currentStep),
    skippedSteps: Array.from(
      new Set([...draft.skippedSteps, draft.currentStep]),
    ),
  });
}

export function restartOnboarding(draft: OnboardingDraft): OnboardingDraft {
  return updateOnboardingDraft(draft, {
    currentStep: "welcome",
    completed: false,
    skippedSteps: [],
    reviewAccepted: false,
    starterPlan: null,
  });
}

export function canTransmitExternally(draft: OnboardingDraft): boolean {
  return (
    draft.privacyReviewed &&
    draft.privacyMode === "sync-eligible" &&
    draft.externalTransmissionApproved
  );
}

export function generateStarterPlan(
  draft: OnboardingDraft,
  generatedAt = now(),
): OnboardingStarterPlan {
  if (!draft.reviewAccepted)
    throw new Error(
      "Review the project setup before generating a starter plan.",
    );
  const topic = draft.topic.trim() || draft.project?.name || "this project";
  const question =
    draft.primaryQuestion.trim() || `What should we establish about ${topic}?`;
  const outputs = draft.expectedOutputs.length
    ? draft.expectedOutputs.join(", ")
    : "a traceable evidence summary";
  return {
    objective: `Answer “${question}” and produce ${outputs}.`,
    hypothesis: `A focused evidence review will identify a defensible answer to ${question}`,
    tasks: [
      "Add or scan the first source",
      "Create a claim that answers the primary question",
      "Link an exact evidence passage and inspect the chain",
    ],
    generatedAt,
  };
}

export function onboardingCompletionChecklist(draft: OnboardingDraft) {
  return [
    {
      id: "project",
      label: "Project folder selected",
      complete: !!draft.project,
    },
    {
      id: "question",
      label: "Primary question recorded",
      complete: draft.primaryQuestion.trim().length > 0,
    },
    {
      id: "privacy",
      label: "Privacy and transmission reviewed",
      complete: draft.privacyReviewed,
    },
    {
      id: "plan",
      label: "Starter plan generated after review",
      complete: !!draft.starterPlan,
    },
    { id: "source", label: "Add or scan one source", complete: false },
    { id: "claim", label: "Create one claim", complete: false },
    {
      id: "evidence",
      label: "Link evidence and inspect the chain",
      complete: false,
    },
  ];
}
