import { describe, expect, it } from "vitest";
import { clyEasing, clyMotion, reducedFade } from "./motion";

describe("Cly motion system", () => {
  it("keeps feedback and structural motion within the documented timing bands", () => {
    expect(clyMotion.immediate.duration).toBeGreaterThanOrEqual(0.08);
    expect(clyMotion.immediate.duration).toBeLessThanOrEqual(0.14);
    expect(clyMotion.small.duration).toBeGreaterThanOrEqual(0.14);
    expect(clyMotion.small.duration).toBeLessThanOrEqual(0.22);
    expect(clyMotion.structural.duration).toBeGreaterThanOrEqual(0.2);
    expect(clyMotion.structural.duration).toBeLessThanOrEqual(0.32);
    expect(clyEasing.enter).toHaveLength(4);
  });

  it("uses opacity-only reduced-motion states", () => {
    expect(reducedFade.initial).toEqual({ opacity: 0 });
    expect(reducedFade.animate).toEqual({ opacity: 1 });
    expect(reducedFade.exit).toEqual({ opacity: 0 });
  });
});
