import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const enabled = process.env.CLY_RELEASE_PROVIDER_SMOKE === "1";
test.skip(
  !enabled,
  "Requires the protected release runner with an authenticated Claude Code CLI.",
);

const root = process.cwd();
const viteCli = path.join(root, "node_modules", "vite", "bin", "vite.js");
const electronArgs = process.platform === "linux" ? ["--no-sandbox"] : [];

test("signed-in Claude produces an approved diff and passing durable test result", async () => {
  test.setTimeout(300_000);
  const userDataPath = mkdtempSync(path.join(tmpdir(), "cly-provider-smoke-"));
  const projectPath = path.join(userDataPath, "provider-smoke-repository");
  mkdirSync(projectPath, { recursive: true });
  writeFileSync(path.join(projectPath, "README.md"), "# Cly provider smoke\n");
  // Keep the target in the baseline commit. A real diff against a tracked file
  // proves that the provider changed the registered worktree rather than merely
  // leaving an untracked by-product behind.
  writeFileSync(path.join(projectPath, "provider-smoke.txt"), "baseline\n");
  writeFileSync(
    path.join(projectPath, "provider-smoke.test.mjs"),
    [
      'import assert from "node:assert/strict";',
      'import { readFileSync } from "node:fs";',
      'assert.equal(readFileSync("provider-smoke.txt", "utf8"), "cly-provider-smoke\\n");',
      "",
    ].join("\n"),
  );
  execFileSync("git", ["init", "--initial-branch=main"], { cwd: projectPath });
  execFileSync("git", ["config", "user.name", "Cly release provider smoke"], {
    cwd: projectPath,
  });
  execFileSync("git", ["config", "user.email", "provider-smoke@cly.local"], {
    cwd: projectPath,
  });
  execFileSync("git", ["add", "."], { cwd: projectPath });
  execFileSync("git", ["commit", "-m", "Provider smoke baseline"], {
    cwd: projectPath,
  });
  const canonicalProjectPath = realpathSync(projectPath);

  execFileSync(process.execPath, [viteCli, "build"], {
    cwd: root,
    env: { ...process.env, VITE_CLY_DEMO_MODE: "0" },
    stdio: "ignore",
  });
  const launch = () =>
    electron.launch({
      args: [...electronArgs, path.join(root, "electron/main.js")],
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: "production",
        CLY_E2E: "1",
        CLY_E2E_USER_DATA_PATH: userDataPath,
        CLY_E2E_PROJECT_PATH: canonicalProjectPath,
        ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
        VITE_CLY_DEMO_MODE: "0",
      },
    });

  let app = await launch();
  try {
    let window = await app.firstWindow();
    await window.getByRole("button", { name: /Continue/ }).click();
    await window
      .getByRole("button", { name: /Import an existing folder/ })
      .click();
    await window.getByLabel("Research topic").fill("Provider smoke");
    await window
      .getByLabel("Primary question")
      .fill("Can an approved provider produce a tested diff?");
    await window.getByRole("button", { name: /Continue/ }).click();
    await window.getByRole("button", { name: /Continue/ }).click();
    await window.getByRole("button", { name: /Continue/ }).click();
    await window.getByRole("button", { name: /Continue/ }).click();
    await window.getByRole("button", { name: "Skip for now" }).click();
    await window.getByRole("button", { name: "Skip for now" }).click();
    await window.getByRole("button", { name: /Approve and generate/ }).click();
    await window.getByRole("button", { name: /Add the first source/ }).click();

    const projectId = await window.evaluate(async () => {
      const desktop = (
        globalThis as typeof globalThis & {
          dream?: { loadState(): Promise<{ activeProjectId?: string | null }> };
        }
      ).dream;
      return (await desktop?.loadState())?.activeProjectId ?? null;
    });
    expect(projectId).toBeTruthy();
    const projectApi = `/api/projects/${encodeURIComponent(String(projectId))}`;
    const claim = await window.evaluate(
      async ({ url }) => {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type: "claim",
            title: "The signed-in provider can produce an approved tested diff",
            payload: {
              kind: "claim",
              status: "draft",
              reviewStatus: "Needs review",
            },
            origin: "human",
          }),
        });
        if (!response.ok) throw new Error(await response.text());
        return response.json() as Promise<{ id: string }>;
      },
      { url: `${projectApi}/research/objects` },
    );

    await window.getByTestId("nav-agents").click();
    await window.getByRole("button", { name: "Start task" }).click();
    const dialog = window.getByRole("dialog", { name: "Start a Cly Dev task" });
    await dialog
      .getByLabel("Task title")
      .fill("Protected release provider smoke");
    await dialog
      .getByLabel("Objective")
      .fill(
        [
          "Replace the contents of the tracked provider-smoke.txt with exactly `cly-provider-smoke` followed by one newline.",
          "Then run `node --test provider-smoke.test.mjs`.",
          "Do not edit any other file and do not commit.",
        ].join(" "),
      );
    await dialog.getByLabel("Additional research object IDs").fill(claim.id);
    const startResponsePromise = window.waitForResponse(
      (response) =>
        response.url().endsWith(`${projectApi}/cly-dev/session-starts`) &&
        response.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: "Start provider run" }).click();
    const startResponse = await startResponsePromise;
    expect(startResponse.status()).toBe(202);
    const started = (await startResponse.json()) as {
      session: { id: string };
      task: { researchObjectIds: string[] };
    };
    expect(started.task.researchObjectIds).toEqual([claim.id]);

    const deadline = Date.now() + 180_000;
    let events: Array<{ type: string; payload: Record<string, unknown> }> = [];
    while (Date.now() < deadline) {
      const approve = window.getByRole("button", { name: "Approve once" });
      if (await approve.isVisible().catch(() => false)) await approve.click();
      events = await window.evaluate(
        async ({ url }) => {
          const response = await fetch(url);
          if (!response.ok) throw new Error(await response.text());
          return response.json() as Promise<
            Array<{ type: string; payload: Record<string, unknown> }>
          >;
        },
        {
          url: `${projectApi}/cly-dev/sessions/${started.session.id}/events?afterSequence=0&limit=500`,
        },
      );
      const completed = events.some(
        (event) =>
          event.type === "session.state.changed" &&
          event.payload.state === "completed",
      );
      const completedRunCommand = events.some(
        (event) =>
          event.type === "tool.recorded" &&
          event.payload.tool === "runCommand" &&
          event.payload.status === "completed" &&
          event.payload.exitCode === 0,
      );
      if (
        completed &&
        completedRunCommand &&
        existsSync(path.join(projectPath, "provider-smoke.txt"))
      )
        break;
      await window.waitForTimeout(500);
    }

    expect(events.some((event) => event.type === "approval.requested")).toBe(
      true,
    );
    expect(events.some((event) => event.type === "approval.resolved")).toBe(
      true,
    );
    expect(
      events.some(
        (event) =>
          event.type === "tool.recorded" &&
          event.payload.tool === "writeFile" &&
          event.payload.status === "completed",
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === "tool.recorded" &&
          event.payload.tool === "runCommand" &&
          event.payload.status === "completed" &&
          event.payload.exitCode === 0,
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === "session.state.changed" &&
          event.payload.state === "completed",
      ),
    ).toBe(true);
    expect(
      readFileSync(path.join(projectPath, "provider-smoke.txt"), "utf8"),
    ).toBe("cly-provider-smoke\n");
    expect(
      execFileSync("git", ["diff", "--", "provider-smoke.txt"], {
        cwd: projectPath,
        encoding: "utf8",
      }),
    ).toContain("-baseline");
    expect(
      execFileSync("git", ["diff", "--", "provider-smoke.txt"], {
        cwd: projectPath,
        encoding: "utf8",
      }),
    ).toContain("+cly-provider-smoke");

    await app.close();
    app = await launch();
    window = await app.firstWindow();
    const persisted = await window.evaluate(
      async ({ url }) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(await response.text());
        return response.json() as Promise<
          Array<{ type: string; payload: Record<string, unknown> }>
        >;
      },
      {
        url: `${projectApi}/cly-dev/sessions/${started.session.id}/events?afterSequence=0&limit=500`,
      },
    );
    expect(persisted.length).toBe(events.length);
    expect(
      persisted.some(
        (event) =>
          event.type === "tool.recorded" &&
          event.payload.tool === "runCommand" &&
          event.payload.exitCode === 0,
      ),
    ).toBe(true);
  } finally {
    await app.close().catch(() => undefined);
    rmSync(userDataPath, { recursive: true, force: true });
  }
});
