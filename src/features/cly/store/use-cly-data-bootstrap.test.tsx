import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadFromApi: vi.fn(),
  setFixtureMode: vi.fn(),
}));

vi.mock("../services/runtime", () => ({
  isClyExplicitDemoRuntime: false,
}));
vi.mock("./cly-store", () => ({
  useClyStore: {
    getState: () => mocks,
  },
}));

import { useClyDataBootstrap } from "./use-cly-data-bootstrap";

function Harness() {
  useClyDataBootstrap();
  return null;
}

describe("Cly renderer bootstrap", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps loading until hydration settles and retries a failed hydration", async () => {
    let resolveFirst: (value: boolean) => void = () => {};
    mocks.loadFromApi
      .mockReturnValueOnce(
        new Promise<boolean>((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockResolvedValueOnce(true);
    const states: string[] = [];
    window.addEventListener("cly:bootstrap-state", (event) => {
      states.push((event as CustomEvent).detail.state);
    });

    render(<Harness />);
    expect(states.at(-1)).toBe("loading");
    await act(async () => resolveFirst(false));
    expect(states.at(-1)).toBe("failed");

    await act(async () => {
      window.dispatchEvent(new Event("cly:bootstrap-retry"));
    });
    expect(states).toEqual(
      expect.arrayContaining(["loading", "failed", "ready"]),
    );
    expect(mocks.loadFromApi).toHaveBeenCalledTimes(2);
  });
});
