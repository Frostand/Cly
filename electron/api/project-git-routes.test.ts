// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electronPaths = vi.hoisted(() => ({ userData: "" }));

vi.mock("electron", () => ({
  app: {
    getPath: () => electronPaths.userData,
  },
}));

import { registerProjectGitRoutes } from "./project-git-routes.js";

const tempDirectories: string[] = [];

const createTempDirectory = (prefix: string) => {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
};

const postJson = (app: Hono, route: string, body: Record<string, unknown>) =>
  app.request(route, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

const createApp = (projects: Map<string, string>) => {
  const app = new Hono();
  const resolveProjectPathById = vi.fn(
    ({ projectId }: { projectId?: string }) =>
      projectId ? (projects.get(projectId) ?? null) : null,
  );
  registerProjectGitRoutes(app, { resolveProjectPathById });
  return { app, resolveProjectPathById };
};

describe("project file and Git route authority", () => {
  beforeEach(() => {
    electronPaths.userData = createTempDirectory("cly-route-user-data-");
  });

  afterEach(() => {
    for (const directory of tempDirectories.splice(0)) {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it.each([
    ["/api/project-files", {}],
    ["/api/project-file", { filePath: "project.txt" }],
    ["/api/project-icon", {}],
    ["/api/project-git-status", {}],
    ["/api/project-git-branches", {}],
    ["/api/project-git-checkout", { branchName: "main" }],
    ["/api/project-git-worktrees", {}],
    ["/api/project-git-worktree-create", { branchName: "feature/test" }],
    ["/api/project-git-worktree-remove", { worktreePath: "/tmp/tree" }],
    ["/api/project-git-commit", {}],
    ["/api/project-git-commit-message", {}],
    ["/api/project-git-push", {}],
    ["/api/project-git-push-preview", {}],
    ["/api/project-git-create-pr", {}],
    ["/api/project-git-pull-request-details", {}],
    [
      "/api/project-git-diff",
      { filePath: "project.txt", previousPath: null, status: "modified" },
    ],
    [
      "/api/project-git-revert-file",
      { filePath: "project.txt", previousPath: null, status: "modified" },
    ],
  ])("requires projectId for %s", async (route, body) => {
    const { app, resolveProjectPathById } = createApp(new Map());

    const response = await postJson(app, route, body);

    expect(response.status).toBe(400);
    expect(resolveProjectPathById).not.toHaveBeenCalled();
  });

  it("does not authorize an arbitrary existing directory for an unknown id", async () => {
    const arbitraryDirectory = createTempDirectory("cly-arbitrary-project-");
    writeFileSync(
      path.join(arbitraryDirectory, "secret.txt"),
      "not authorized",
    );
    const { app } = createApp(new Map());

    const response = await postJson(app, "/api/project-file", {
      filePath: "secret.txt",
      projectId: "unknown-project",
      projectPath: arbitraryDirectory,
    });

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Unknown projectId.");
  });

  it("rejects a legacy path that does not match the id's persisted root", async () => {
    const registeredDirectory = createTempDirectory("cly-registered-project-");
    const arbitraryDirectory = createTempDirectory("cly-mismatched-project-");
    writeFileSync(
      path.join(arbitraryDirectory, "secret.txt"),
      "not authorized",
    );
    const { app } = createApp(
      new Map([["opaque:registered/project", registeredDirectory]]),
    );

    const response = await postJson(app, "/api/project-file", {
      filePath: "secret.txt",
      projectId: "opaque:registered/project",
      projectPath: arbitraryDirectory,
    });

    expect(response.status).toBe(409);
    expect(await response.text()).toBe(
      "projectPath does not match the persisted project.",
    );
  });

  it("accepts a legacy symlink spelling of the registered canonical root", async () => {
    const registeredDirectory = createTempDirectory("cly-canonical-project-");
    const aliasParent = createTempDirectory("cly-project-alias-");
    const alias = path.join(aliasParent, "project-link");
    symlinkSync(
      registeredDirectory,
      alias,
      process.platform === "win32" ? "junction" : "dir",
    );
    writeFileSync(path.join(registeredDirectory, "project.txt"), "registered");
    const projectId = "opaque:canonical/project";
    const { app } = createApp(new Map([[projectId, registeredDirectory]]));

    const response = await postJson(app, "/api/project-file", {
      filePath: "project.txt",
      projectId,
      projectPath: alias,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      content: "registered",
      filePath: "project.txt",
    });
  });

  it("reads files and raw content from the root resolved by projectId", async () => {
    const registeredDirectory = createTempDirectory("cly-registered-project-");
    writeFileSync(path.join(registeredDirectory, "project.txt"), "registered");
    const projectId = "opaque:registered/project";
    const { app } = createApp(new Map([[projectId, registeredDirectory]]));

    const listResponse = await postJson(app, "/api/project-files", {
      directory: ".",
      maxResults: 10,
      projectId,
    });
    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual({
      count: 1,
      files: ["project.txt"],
    });

    const rawResponse = await app.request(
      `/api/project-file-raw?projectId=${encodeURIComponent(projectId)}&filePath=project.txt`,
    );
    expect(rawResponse.status).toBe(200);
    expect(await rawResponse.text()).toBe("registered");
  });

  it("creates and removes a worktree through the registered parent id", async () => {
    const registeredDirectory = createTempDirectory("cly-worktree-project-");
    execFileSync("git", ["init", "--initial-branch=main"], {
      cwd: registeredDirectory,
    });
    execFileSync("git", ["config", "user.email", "cly-test@example.com"], {
      cwd: registeredDirectory,
    });
    execFileSync("git", ["config", "user.name", "Cly Test"], {
      cwd: registeredDirectory,
    });
    writeFileSync(path.join(registeredDirectory, "README.md"), "# Test\n");
    execFileSync("git", ["add", "README.md"], { cwd: registeredDirectory });
    execFileSync("git", ["commit", "-m", "Initial commit"], {
      cwd: registeredDirectory,
    });
    const projectId = "registered-worktree-parent";
    const { app } = createApp(new Map([[projectId, registeredDirectory]]));

    const createResponse = await postJson(
      app,
      "/api/project-git-worktree-create",
      {
        baseRef: "HEAD",
        branchName: "feature/authority-test",
        projectId,
      },
    );
    expect(createResponse.status).toBe(200);

    const listResponse = await postJson(app, "/api/project-git-worktrees", {
      projectId,
    });
    const listBody = await listResponse.text();
    expect(listResponse.status, listBody).toBe(200);
    const listed = JSON.parse(listBody) as {
      worktrees: Array<{ branch: string | null; path: string }>;
    };
    const createdWorktree = listed.worktrees.find(
      (worktree) => worktree.branch === "feature/authority-test",
    );
    expect(createdWorktree?.path).toBeTruthy();

    const worktreeFileResponse = await postJson(app, "/api/project-file", {
      filePath: "README.md",
      projectId,
      projectPath: createdWorktree?.path,
    });
    const worktreeFileBody = await worktreeFileResponse.text();
    expect(worktreeFileResponse.status, worktreeFileBody).toBe(200);
    expect(JSON.parse(worktreeFileBody)).toEqual({
      content: "# Test\n",
      filePath: "README.md",
    });

    const unrelatedDirectory = createTempDirectory("cly-unrelated-worktree-");
    writeFileSync(path.join(unrelatedDirectory, "README.md"), "unrelated\n");
    const unrelatedResponse = await postJson(app, "/api/project-file", {
      filePath: "README.md",
      projectId,
      projectPath: unrelatedDirectory,
    });
    expect(unrelatedResponse.status).toBe(409);

    const removeResponse = await postJson(
      app,
      "/api/project-git-worktree-remove",
      {
        force: false,
        projectId,
        worktreePath: createdWorktree?.path,
      },
    );
    const removeBody = await removeResponse.text();
    expect(removeResponse.status, removeBody).toBe(200);
    expect(JSON.parse(removeBody)).toEqual({
      path: createdWorktree?.path,
      removed: true,
    });
  });
});
