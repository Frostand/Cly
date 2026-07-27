import {
  mergePersistedState,
  normalizeProjectPathKey,
} from "../../../components/ide/ide-state";
import { getDesktopApi } from "../../../lib/electron";
import { createProjectConfig } from "../../../lib/ide-defaults";
import type { PersistedIdeState, ProjectConfig } from "../../../types/ide";
import type {
  OnboardingDiagnostics,
  OnboardingProjectMode,
  OnboardingProjectSelection,
} from "../domain/onboarding";
import type { ResearchProject } from "../domain/types";

const toResearchProject = (project: ProjectConfig): ResearchProject => ({
  id: project.id,
  name: project.name,
  path: project.path,
  question: "",
  hypothesis: "",
  phase: "Setup",
  description: "Project-scoped local research workspace.",
  localOnly: true,
  updatedAt: project.lastUsedAt ?? new Date().toISOString(),
});

export interface DesktopProjectCatalog {
  activeProjectId: string | null;
  projects: ResearchProject[];
}

export async function loadDesktopProjectCatalog(): Promise<DesktopProjectCatalog | null> {
  const desktop = getDesktopApi();
  if (!desktop) return null;
  const state = mergePersistedState(await desktop.loadState());
  return {
    activeProjectId: state.activeProjectId,
    projects: state.projects.map(toResearchProject),
  };
}

export async function chooseOnboardingProject(
  mode: OnboardingProjectMode,
): Promise<{
  project: ResearchProject;
  selection: OnboardingProjectSelection;
} | null> {
  const desktop = getDesktopApi();
  if (!desktop)
    throw new Error("Project folders can be selected in the Cly desktop app.");
  const selectedPath = await desktop.pickProjectDirectory(mode);
  if (!selectedPath) return null;
  const persisted = mergePersistedState(await desktop.loadState());
  const key = normalizeProjectPathKey(selectedPath);
  let projectConfig = [...persisted.projects, ...persisted.closedProjects].find(
    (project) => normalizeProjectPathKey(project.path) === key,
  );
  if (!projectConfig)
    projectConfig = createProjectConfig(selectedPath, persisted.settings);
  const nextState: PersistedIdeState = {
    ...persisted,
    activeProjectId: projectConfig.id,
    closedProjects: persisted.closedProjects.filter(
      (project) => project.id !== projectConfig?.id,
    ),
    projects: [
      ...persisted.projects.filter(
        (project) => project.id !== projectConfig?.id,
      ),
      projectConfig,
    ],
  };
  const saved = await desktop.saveState(nextState);
  if (!saved) throw new Error("The selected project could not be persisted.");
  const project = toResearchProject(projectConfig);
  return {
    project,
    selection: { ...project, mode },
  };
}

export async function fetchOnboardingDiagnostics(
  projectId: string,
): Promise<OnboardingDiagnostics> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/onboarding/diagnostics`,
  );
  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new Error(detail || "Project readiness checks could not run.");
  }
  return response.json() as Promise<OnboardingDiagnostics>;
}
