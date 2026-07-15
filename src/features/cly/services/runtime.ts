/** True only for the explicit deterministic demo runtime. */
export const isClyExplicitDemoRuntime =
  __CLY_INCLUDE_DEMOS__ &&
  import.meta.env.DEV &&
  import.meta.env.VITE_CLY_DEMO_MODE === "1";

export const isClyDemoRuntime =
  __CLY_INCLUDE_DEMOS__ &&
  (isClyExplicitDemoRuntime || import.meta.env.MODE === "test");
