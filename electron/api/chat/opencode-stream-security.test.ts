// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getOpenCodeServerConfig } from "./opencode-permissions.js";

describe("OpenCode provider authority", () => {
  it("denies every side effect in plan mode", () => {
    expect(getOpenCodeServerConfig("plan", "default").permission).toMatchObject(
      {
        bash: "deny",
        edit: "deny",
        external_directory: "deny",
        skill: "deny",
        task: "deny",
        webfetch: "deny",
        websearch: "deny",
      },
    );
  });

  it("limits build auto-approval to project edits", () => {
    expect(
      getOpenCodeServerConfig("build", "auto-accept-edits").permission,
    ).toMatchObject({
      bash: "ask",
      edit: "allow",
      external_directory: "deny",
      skill: "ask",
      task: "ask",
      webfetch: "ask",
      websearch: "ask",
    });
  });
});
