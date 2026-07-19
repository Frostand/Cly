// @vitest-environment node
import { mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectAuthorityRegistry } from "./project-authority-registry.js";

const directories: string[] = [];
const temporaryDirectory = (prefix: string) => {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  directories.push(directory);
  return directory;
};

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("main-process project authority", () => {
  it("binds a project id to its startup root and rejects renderer rewrites", () => {
    const trusted = temporaryDirectory("cly-authority-trusted-");
    const attacker = temporaryDirectory("cly-authority-attacker-");
    const registry = new ProjectAuthorityRegistry();
    registry.hydrate({
      projects: [{ id: "project-1", path: trusted }],
      closedProjects: [],
    });

    expect(registry.resolveProjectPathById({ projectId: "project-1" })).toBe(
      realpathSync(trusted),
    );
    expect(() =>
      registry.validateState({
        projects: [{ id: "project-1", path: attacker }],
        closedProjects: [],
      }),
    ).toThrow("cannot change its authorized root");
  });

  it("registers a new id only after a main-owned path authorization", () => {
    const selected = temporaryDirectory("cly-authority-selected-");
    const unselected = temporaryDirectory("cly-authority-unselected-");
    const registry = new ProjectAuthorityRegistry();
    registry.hydrate({ projects: [], closedProjects: [] });

    expect(() =>
      registry.validateState({
        projects: [{ id: "untrusted", path: unselected }],
        closedProjects: [],
      }),
    ).toThrow("was not selected or created by Cly");

    registry.authorizePathForRegistration(selected);
    registry.validateState({
      projects: [{ id: "trusted", path: selected }],
      closedProjects: [],
    });
    expect(registry.resolveProjectPathById({ projectId: "trusted" })).toBe(
      realpathSync(selected),
    );
  });

  it("revokes a root after the project leaves persisted state", () => {
    const trusted = temporaryDirectory("cly-authority-revoked-");
    const registry = new ProjectAuthorityRegistry();
    registry.hydrate({
      projects: [{ id: "project-1", path: trusted }],
      closedProjects: [],
    });

    registry.validateState({ projects: [], closedProjects: [] });

    expect(
      registry.resolveProjectPathById({ projectId: "project-1" }),
    ).toBeNull();
  });

  it("returns the canonical root and fails closed after it is replaced", () => {
    const parent = temporaryDirectory("cly-authority-symlink-");
    const trusted = temporaryDirectory("cly-authority-target-");
    const attacker = temporaryDirectory("cly-authority-replacement-");
    const alias = path.join(parent, "project");
    symlinkSync(trusted, alias, "dir");
    const registry = new ProjectAuthorityRegistry();
    registry.hydrate({
      projects: [{ id: "project-1", path: alias }],
      closedProjects: [],
    });

    expect(registry.resolveProjectPathById({ projectId: "project-1" })).toBe(
      realpathSync(trusted),
    );
    rmSync(alias);
    symlinkSync(attacker, alias, "dir");

    // The canonical target remains the capability; replacing the renderer's
    // original alias cannot redirect it to the attacker-controlled directory.
    expect(registry.resolveProjectPathById({ projectId: "project-1" })).toBe(
      realpathSync(trusted),
    );
  });
});
