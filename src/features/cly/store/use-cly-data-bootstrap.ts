import { useEffect } from "react";
import { isClyExplicitTestFixtureRuntime } from "../services/runtime";
import { useClyStore } from "./cly-store";

type BootstrapState = "loading" | "ready" | "failed";
let activeBootstrap: Promise<boolean> | null = null;

const dispatchBootstrapState = (state: BootstrapState) => {
  window.dispatchEvent(
    new CustomEvent("cly:bootstrap-state", { detail: { state } }),
  );
};

const bootstrap = () => {
  if (activeBootstrap) return activeBootstrap;
  activeBootstrap = (async () => {
    if (isClyExplicitTestFixtureRuntime) {
      useClyStore.getState().setFixtureMode("active");
      return true;
    }
    return useClyStore.getState().loadFromApi();
  })().finally(() => {
    activeBootstrap = null;
  });
  return activeBootstrap;
};

/** Initializes the project-scoped repository for every Cly renderer root. */
export function useClyDataBootstrap() {
  useEffect(() => {
    let mounted = true;
    const run = async () => {
      dispatchBootstrapState("loading");
      const ready = await bootstrap();
      if (mounted) dispatchBootstrapState(ready ? "ready" : "failed");
    };
    const retry = () => void run();
    window.addEventListener("cly:bootstrap-retry", retry);
    void run();
    return () => {
      mounted = false;
      window.removeEventListener("cly:bootstrap-retry", retry);
    };
  }, []);
}
