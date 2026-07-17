// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildCursorArgs } from "./cursor-stream.js";

describe("Cursor provider authority", () => {
  it("always starts Cursor in plan mode", () => {
    const args = buildCursorArgs({
      model: "cursor/test",
      modelSpeed: "standard",
      prompt: "Inspect the project",
      projectPath: "/trusted/project",
      remoteConversationId: null,
      remoteConversationModel: null,
      remoteConversationModelSpeed: null,
      remoteConversationProjectPath: null,
    });

    expect(args).toContain("--trust");
    expect(args).toContain("--force");
    expect(
      args.slice(args.indexOf("--mode"), args.indexOf("--mode") + 2),
    ).toEqual(["--mode", "plan"]);
  });
});
