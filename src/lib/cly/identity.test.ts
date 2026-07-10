import { describe, expect, it } from "vitest";

import { CLY_IDENTITY } from "./identity";

describe("Cly identity", () => {
  it("keeps product and release coordinates independent from Dream", () => {
    expect(CLY_IDENTITY).toEqual({
      appId: "ai.cly.cly",
      name: "Cly",
      packageName: "cly",
      repository: "Frostand/Cly",
      upstreamRepository: "dreamide/dream",
    });
  });

  it("is immutable", () => {
    expect(Object.isFrozen(CLY_IDENTITY)).toBe(true);
  });
});
