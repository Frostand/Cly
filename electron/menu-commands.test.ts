import { describe, expect, it } from "vitest";
import { CLY_MENU_COMMANDS, isClyMenuCommand } from "./menu-commands.js";

describe("Cly application menu commands", () => {
  it("contains only unique, registered renderer commands", () => {
    expect(new Set(CLY_MENU_COMMANDS).size).toBe(CLY_MENU_COMMANDS.length);
    for (const command of CLY_MENU_COMMANDS) {
      expect(isClyMenuCommand(command)).toBe(true);
    }
    expect(isClyMenuCommand("new-project")).toBe(false);
    expect(isClyMenuCommand("import-github")).toBe(false);
  });
});
