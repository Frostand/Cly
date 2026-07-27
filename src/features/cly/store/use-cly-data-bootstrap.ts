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
      return { projectCount: 0, ready: true };
    }
    const catalog = await loadDesktopProjectCatalog();
    const state = useClyStore.getState();
    if (!catalog) {
      window.dispatchEvent(
        new CustomEvent("cly:bootstrap-state", {
          detail: { stage: "workspace", state: "loading" },
        }),
      );
      return { projectCount: 0, ready: await state.loadFromApi() };
    }

    window.dispatchEvent(
      new CustomEvent("cly:bootstrap-state", {
        detail: {
          projectCount: catalog.projects.length,
          stage: "projects",
          state: "loading",
        },
      }),
    );

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
    window.dispatchEvent(
      new CustomEvent("cly:bootstrap-state", {
        detail: {
          projectCount: catalog.projects.length,
          stage: "workspace",
          state: "loading",
        },
      }),
    );
    if (!activeProjectId)
      return { projectCount: catalog.projects.length, ready: true };
    const onboarding = await loadOnboardingDraft(activeProjectId);
    const ready =
      onboarding.completed || onboarding.privacyReviewed
        ? await useClyStore.getState().loadFromApi(activeProjectId)
        : true;
    return { projectCount: catalog.projects.length, ready };
  }, []);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      setStatus("loading");
      window.dispatchEvent(
        new CustomEvent("cly:bootstrap-state", {
          detail: { stage: "local", state: "loading" },
        }),
      );
      let result = { projectCount: 0, ready: false };
      try {
        result = await hydrate();
      } catch {
        result.ready = false;
      }
      if (!mounted) return;
      const next = result.ready ? "ready" : "failed";
      setStatus(next);
      window.dispatchEvent(
        new CustomEvent("cly:bootstrap-state", {
          detail: {
            firstRun: result.projectCount === 0,
            projectCount: result.projectCount,
            state: next,
          },
        }),
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
