import { describe, expect, it } from "vitest";
import { getCapability } from "./capabilities";

describe("production Cly capability boundaries", () => {
  it.each([
    "context.edit",
    "notebooks.import",
    "reproducibility.audit",
    "integrations.configure",
    "planner.update",
    "decisions.create",
  ])("classifies %s as unavailable with an explanation", (id) => {
    expect(getCapability(id)).toMatchObject({
      state: "unavailable",
      reason: expect.any(String),
      service: null,
      api: null,
    });
  });
});
