import { describe, expect, it } from "vitest";
import { screens } from "./components/app-shell";
import type { ScreenId } from "./domain/types";
import routeManifest from "./route-manifest.json";

describe("Cly route manifest", () => {
  it("is unique and covers every renderer route", () => {
    const ids = routeManifest.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    const productionScreens = (Object.keys(screens) as ScreenId[]).filter(
      (id) => id !== "notebooks" && id !== "code",
    );
    expect([...ids].sort()).toEqual(productionScreens.sort());
  });
});
