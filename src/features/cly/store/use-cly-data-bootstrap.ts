import { useCallback, useEffect, useState } from "react";
import { loadDesktopProjectCatalog } from "../services/onboarding-projects";
import { loadOnboardingDraft } from "../services/onboarding-storage";
import { isClyExplicitTestFixtureRuntime } from "../services/runtime";
import { useClyStore } from "./cly-store";

/** Initializes the project-scoped repository for every Cly renderer root. */
export function useClyDataBootstrap() {
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const hydrate = useCallback(async () => {
    if (isClyExplicitTestFixtureRuntime) {
      useClyStore.getState().setFixtureMode("active");
      return true;
    }
    const catalog = await loadDesktopProjectCatalog();
    const state = useClyStore.getState();
    if (!catalog) return state.loadFromApi();

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
    if (!activeProjectId) return true;
    const onboarding = await loadOnboardingDraft(activeProjectId);
    return onboarding.completed || onboarding.privacyReviewed
      ? useClyStore.getState().loadFromApi(activeProjectId)
      : true;
  }, []);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      setStatus("loading");
      window.dispatchEvent(
        new CustomEvent("cly:bootstrap-state", {
          detail: { state: "loading" },
        }),
      );
      let ready = false;
      try {
        ready = await hydrate();
      } catch {
        ready = false;
      }
      if (!mounted) return;
      const next = ready ? "ready" : "failed";
      setStatus(next);
      window.dispatchEvent(
        new CustomEvent("cly:bootstrap-state", { detail: { state: next } }),
      );
    };
    const retry = () => void run();
    window.addEventListener("cly:bootstrap-retry", retry);
    void run();
    return () => {
      mounted = false;
      window.removeEventListener("cly:bootstrap-retry", retry);
    };
  }, [hydrate]);
  return status;
}
