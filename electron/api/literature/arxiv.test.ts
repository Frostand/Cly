// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { searchArxiv } from "./arxiv.js";

describe("arXiv literature search", () => {
  it("normalizes Atom entries", async () => {
    const feed = `<feed><entry><id>https://arxiv.org/abs/2401.00001v2</id><title> Robust\nCalibration </title><summary>Under shift.</summary><published>2024-01-01T00:00:00Z</published><author><name>Ada Lovelace</name></author><category term="cs.LG" /></entry></feed>`;
    const papers = await searchArxiv("calibration", {
      fetchImpl: vi.fn().mockResolvedValue(new Response(feed)),
    });
    expect(papers).toEqual([
      expect.objectContaining({
        id: "arxiv:2401.00001",
        title: "Robust Calibration",
        authors: ["Ada Lovelace"],
        year: 2024,
      }),
    ]);
  });
});
