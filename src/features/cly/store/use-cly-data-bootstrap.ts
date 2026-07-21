import { useEffect, useState } from "react";
import { loadDesktopProjectCatalog } from "../services/onboarding-projects";
import { loadOnboardingDraft } from "../services/onboarding-storage";
import { isClyExplicitDemoRuntime } from "../services/runtime";
import { useClyStore } from "./cly-store";

/** Initializes the project-scoped repository for every Cly renderer root. */
export function useClyDataBootstrap() {
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  useEffect(() => {
    if (isClyExplicitDemoRuntime) {
      useClyStore.getState().setFixtureMode("active");
      setStatus("ready");
    } else {
      void loadDesktopProjectCatalog()
        .then(async (catalog) => {
          const state = useClyStore.getState();
          if (catalog) {
            const savedProjectId = state.activeProjectId;
            const activeProjectId = catalog.projects.some(
              (project) => project.id === savedProjectId,
            )
              ? savedProjectId
              : catalog.projects.some(
                    (project) => project.id === catalog.activeProjectId,
                  )
                ? (catalog.activeProjectId ?? "")
                : (catalog.projects[0]?.id ?? "");
            useClyStore.setState((current) => ({
              activeProjectId,
              data: { ...current.data, projects: catalog.projects },
            }));
            if (activeProjectId) {
              const onboarding = await loadOnboardingDraft(activeProjectId);
              if (onboarding.completed || onboarding.privacyReviewed)
                await useClyStore.getState().loadFromApi(activeProjectId);
            }
          } else if (state.data.projects.length > 0) {
            const activeProjectId =
              state.activeProjectId || state.data.projects[0]?.id || "";
            if (activeProjectId) {
              const onboarding = await loadOnboardingDraft(activeProjectId);
              if (onboarding.completed || onboarding.privacyReviewed)
                await state.loadFromApi(activeProjectId);
            }
          }
        })
        .catch(() => {
          // Project hydration is fail-closed when the durable privacy gate
          // cannot be read. The onboarding screen supplies the retry path.
        })
        .finally(() => setStatus("ready"));
    }
  }, []);
  return status;
}
