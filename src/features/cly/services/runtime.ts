/** True only when automated tests explicitly request deterministic fixtures. */
export const isClyExplicitTestFixtureRuntime =
  __CLY_INCLUDE_TEST_FIXTURES__ &&
  import.meta.env.DEV &&
  import.meta.env.VITE_CLY_TEST_FIXTURES === "1";

export const isClyTestFixtureRuntime =
  __CLY_INCLUDE_TEST_FIXTURES__ &&
  (isClyExplicitTestFixtureRuntime || import.meta.env.MODE === "test");
