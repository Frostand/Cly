// @vitest-environment node
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Claude usage credential ownership", () => {
  it("does not read, refresh, write, or pass Claude OAuth secrets in argv", async () => {
    const source = await readFile(
      new URL("./usage-limits.js", import.meta.url),
      "utf8",
    );

    expect(source).not.toMatch(/claudeAiOauth|refresh_token/);
    expect(source).not.toMatch(/find-generic-password|add-generic-password/);
    expect(source).not.toMatch(/\.credentials\.json/);
  });
});
