import { useEffect } from "react";
import { isClyExplicitDemoRuntime } from "../services/runtime";
import { useClyStore } from "./cly-store";

/** Initializes the project-scoped repository for every Cly renderer root. */
export function useClyDataBootstrap() {
  useEffect(() => {
    if (isClyExplicitDemoRuntime) {
      useClyStore.getState().setFixtureMode("active");
    } else {
      void useClyStore.getState().loadFromApi();
    }
  }, []);
}
