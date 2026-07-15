import { describe, expect, it } from "vitest";
import { toneForStatus } from "./primitives";

describe("toneForStatus", () => {
  it("classifies negative compound statuses before positive substrings", () => {
    expect(toneForStatus("Not connected")).toBe("danger");
    expect(toneForStatus("Not reproducible")).toBe("danger");
    expect(toneForStatus("Unavailable")).toBe("danger");
    expect(toneForStatus("Unresolved")).toBe("warning");
    expect(toneForStatus("Incomplete")).toBe("warning");
  });

  it("retains success tones for affirmative statuses", () => {
    expect(toneForStatus("Connected")).toBe("success");
    expect(toneForStatus("Mostly reproducible")).toBe("success");
    expect(toneForStatus("Resolved")).toBe("success");
  });
});
