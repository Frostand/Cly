import type { ResearchProject } from "../domain/types";
import { apiClient } from "../services/api-client";
import {
  chooseOnboardingProject,
  fetchOnboardingDiagnostics,
} from "../services/onboarding-projects";
import { useClyStore } from "../store/cly-store";
import { OnboardingScreen } from "./onboarding";

export function ClyOnboardingScreen({
  onCompleted,
}: {
  onCompleted?: () => void;
} = {}) {
  const activeProjectId = useClyStore((state) => state.activeProjectId);
  const onboardingRequested = useClyStore((state) => state.onboardingRequested);
  const setScreen = useClyStore((state) => state.setScreen);
  const draftProjectId =
    onboardingRequested === "new" ? null : activeProjectId || null;
  return (
    <OnboardingScreen
      key={draftProjectId || "new-project"}
      activeProjectId={draftProjectId}
      onChooseProject={chooseOnboardingProject}
      onProjectSelected={(project) => {
        useClyStore.setState((state) => ({
          data: {
            ...state.data,
            projects: [
              ...state.data.projects.filter((item) => item.id !== project.id),
              project,
            ],
          },
        }));
        useClyStore.getState().setOnboardingRequested("current");
        useClyStore.getState().selectOnboardingProject(project.id);
      }}
      onRunDiagnostics={async (projectId) => {
        const state = useClyStore.getState();
        const project = state.data.projects.find(
          (item) => item.id === projectId,
        );
        if (!project) throw new Error("The selected project is unavailable.");
        await apiClient.ensureProject(project);
        return fetchOnboardingDiagnostics(projectId);
      }}
      onComplete={async (draft) => {
        const state = useClyStore.getState();
        const existing = state.data.projects.find(
          (project) => project.id === draft.projectId,
        );
        if (!existing || !draft.starterPlan)
          throw new Error(
            "Review and generate the starter plan before finishing.",
          );
        const project: ResearchProject = {
          ...existing,
          question: draft.primaryQuestion,
          hypothesis: draft.starterPlan.hypothesis,
          description: draft.starterPlan.objective,
          localOnly: draft.privacyMode === "local-only",
          setup: {
            discipline: draft.discipline,
            expectedOutputs: draft.expectedOutputs,
            repositories: draft.repositories,
            datasets: draft.datasets,
            tools: draft.tools,
            collaborators: draft.collaborators,
            deadline: draft.deadline,
            providerPreferences: draft.providerPreferences,
            optionalIntegrations: draft.optionalIntegrations,
            reconstructLineage: draft.reconstructLineage,
            completed: true,
          },
          updatedAt: new Date().toISOString(),
        };
        await apiClient.ensureProject(project);
        useClyStore.setState((current) => ({
          data: {
            ...current.data,
            projects: current.data.projects.map((item) =>
              item.id === project.id ? project : item,
            ),
          },
        }));
      }}
      onOpenDestination={(screen) => {
        onCompleted?.();
        useClyStore.getState().setOnboardingRequested(null);
        setScreen(screen);
      }}
    />
  );
}
