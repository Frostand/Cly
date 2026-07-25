const SAFE_STARTUP_MESSAGE =
  "Cly could not start its local services. Your projects were not changed.";

export function createSafeStartupDiagnostic(error, stage, now = new Date()) {
  return {
    code: "CLY_STARTUP_FAILED",
    errorName: error instanceof Error ? error.name : "UnknownError",
    message: SAFE_STARTUP_MESSAGE,
    stage,
    timestamp: now.toISOString(),
  };
}

export function createStartupController({
  boot,
  cleanup,
  onFailure,
  onProgress,
}) {
  let state = "idle";

  const start = async () => {
    if (state === "starting" || state === "ready") return false;
    state = "starting";
    let stage = "initializing";
    const report = (nextStage, message) => {
      stage = nextStage;
      onProgress({ message, stage });
    };
    try {
      await boot(report);
      state = "ready";
      return true;
    } catch (error) {
      await cleanup?.();
      state = "failed";
      onFailure(createSafeStartupDiagnostic(error, stage));
      return false;
    }
  };

  return { getState: () => state, start };
}
