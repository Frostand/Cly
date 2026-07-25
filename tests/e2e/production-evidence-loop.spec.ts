import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  _electron as electron,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { navigateToResearch } from "./navigation-helpers";

const root = process.cwd();
const viteCli = path.join(root, "node_modules", "vite", "bin", "vite.js");
const electronArgs = process.platform === "linux" ? ["--no-sandbox"] : [];
const packagedExecutable = process.env.CLY_PACKAGED_APP_EXECUTABLE?.trim();
const pythonExecutable = process.platform === "win32" ? "python" : "python3";

type ResearchObject = {
  id: string;
  type: string;
  title: string;
  version: number;
  payload: Record<string, unknown>;
};

type ResearchGraph = {
  objects: ResearchObject[];
  relationships: Array<{
    id: string;
    fromObjectId: string;
    toObjectId: string;
    type: string;
  }>;
};

type StalenessAssessment = {
  impacted: Array<{
    object: { id: string; type: string; title: string };
    state: string;
    dependencyPath: Array<{ id?: string; type: string; title?: string }>;
  }>;
};

type Capsule = {
  sha256: string;
  manifest: {
    included: Array<{
      id: string;
      kind: string;
      currentness: string;
      verification: string;
      reproducibility: string;
    }>;
  };
};

type StartedAgentSession = {
  workspace: {
    repository: { id: string; remoteUrl?: string };
    worktree: { branch: string };
    localOnly: { repositoryPath: string; worktreePath: string };
  };
  contextManifest: {
    transferable: {
      entries: Array<{ kind: string; researchObjectId?: string }>;
    };
  };
  task: { researchObjectIds: string[] };
  session: {
    commit: { sha: string };
    provider: { id: string; model: string };
  };
  execution: { status: string };
};

const sha256 = (filePath: string) =>
  createHash("sha256").update(readFileSync(filePath)).digest("hex");

const git = (cwd: string, args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

const python = (cwd: string, outputPath: string) =>
  execFileSync(pythonExecutable, ["run_experiment.py", outputPath], {
    cwd,
    encoding: "utf8",
  }).trim();

function required<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}

async function api<T>(
  page: Page,
  url: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const result = await page.evaluate(
    async ({ requestUrl, requestInit }) => {
      const response = await fetch(requestUrl, {
        method: requestInit.method,
        headers:
          requestInit.body === undefined
            ? undefined
            : { "content-type": "application/json" },
        body:
          requestInit.body === undefined
            ? undefined
            : JSON.stringify(requestInit.body),
      });
      const text = await response.text();
      return { ok: response.ok, status: response.status, text };
    },
    { requestUrl: url, requestInit: init },
  );
  expect(
    result.ok,
    `${init.method ?? "GET"} ${url} failed (${result.status}): ${result.text}`,
  ).toBe(true);
  return JSON.parse(result.text) as T;
}

test("fresh production profile records, invalidates, repairs, and reviews a real evidence loop", async () => {
  test.setTimeout(150_000);
  const userDataPath = mkdtempSync(path.join(tmpdir(), "cly-production-e2e-"));
  const projectPath = path.join(userDataPath, "calibration-repository");
  const sourcePath = path.join(projectPath, "src", "calibrate.py");
  const notebookPath = path.join(projectPath, "notebooks", "calibration.ipynb");
  const originalOutputPath = path.join(
    projectPath,
    "outputs",
    "calibration.txt",
  );
  const repairedOutputPath = path.join(
    projectPath,
    "outputs",
    "calibration-repaired.txt",
  );
  const originalImplementation = [
    "def calibrate(values):",
    "    return sum(values) / len(values)",
    "",
  ].join("\n");
  const changedImplementation = [
    "def calibrate(values):",
    "    return sum(values) / len(values) + 0.10",
    "",
  ].join("\n");
  const claimTitle = "Calibration error remains below four percent";

  mkdirSync(path.join(projectPath, "src"), { recursive: true });
  mkdirSync(path.join(projectPath, "notebooks"), { recursive: true });
  mkdirSync(path.join(projectPath, "outputs"), { recursive: true });
  writeFileSync(sourcePath, originalImplementation);
  writeFileSync(
    path.join(projectPath, "run_experiment.py"),
    [
      "import sys",
      "from pathlib import Path",
      "from src.calibrate import calibrate",
      "target = Path(sys.argv[1])",
      "target.write_text(f'{calibrate([0.02, 0.03, 0.04]):.6f}\\n')",
      "print(target.read_text().strip())",
      "",
    ].join("\n"),
  );
  writeFileSync(
    notebookPath,
    JSON.stringify({
      nbformat: 4,
      nbformat_minor: 5,
      metadata: {
        title: "Calibration release evidence",
        kernelspec: { name: "python3", display_name: "Python 3" },
        language_info: { name: "python" },
      },
      cells: [
        {
          id: "research-intent",
          cell_type: "markdown",
          metadata: {},
          source: [
            "# Objective\n",
            "Validate deterministic calibration error.\n",
            "# Claim\n",
            `${claimTitle}\n`,
          ],
        },
        {
          id: "calibration-experiment",
          cell_type: "code",
          execution_count: null,
          metadata: {},
          source: [
            "from src.calibrate import calibrate\n",
            "values = [0.02, 0.03, 0.04]\n",
            "model.fit(calibrate(values))  # statically identifies the experiment\n",
            "calibration_score = calibrate(values)\n",
          ],
          outputs: [],
        },
      ],
    }),
  );
  expect(python(projectPath, "outputs/calibration.txt")).toBe("0.030000");

  git(projectPath, ["init", "--initial-branch=main"]);
  git(projectPath, ["config", "user.name", "Cly release test"]);
  git(projectPath, ["config", "user.email", "release-test@cly.local"]);
  git(projectPath, ["add", "."]);
  git(projectPath, ["commit", "-m", "Baseline deterministic experiment"]);
  const originalCommitSha = git(projectPath, ["rev-parse", "HEAD"]);
  const originalCodeHash = sha256(sourcePath);
  const originalArtifactHash = sha256(originalOutputPath);
  const pythonVersion = execFileSync(pythonExecutable, ["--version"], {
    encoding: "utf8",
  }).trim();
  const canonicalProjectPath = realpathSync(projectPath);

  if (!packagedExecutable) {
    execFileSync(process.execPath, [viteCli, "build"], {
      cwd: root,
      env: { ...process.env, VITE_CLY_TEST_FIXTURES: "0" },
      stdio: "ignore",
    });
  }

  const launch = () =>
    electron.launch({
      ...(packagedExecutable
        ? { executablePath: path.resolve(packagedExecutable) }
        : {}),
      args: packagedExecutable
        ? electronArgs
        : [...electronArgs, path.join(root, "electron/main.js")],
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: "production",
        CLY_E2E: "1",
        CLY_E2E_USER_DATA_PATH: userDataPath,
        CLY_E2E_PROJECT_PATH: canonicalProjectPath,
        ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
        VITE_CLY_TEST_FIXTURES: "0",
      },
    });

  let app = await launch();
  try {
    let window = await app.firstWindow();
    await expect(
      window.getByRole("heading", {
        name: "Build your first trustworthy evidence chain",
        level: 1,
      }),
    ).toBeVisible();
    await expect(window.getByTestId("fixture-selector")).toHaveCount(0);

    await window.getByRole("button", { name: /Continue/ }).click();
    await window
      .getByRole("button", { name: /Import an existing folder/ })
      .click();
    await window.getByLabel("Research topic").fill("Calibration reliability");
    await window
      .getByLabel("Primary question")
      .fill("Does deterministic calibration stay below four percent?");
    await window.getByRole("button", { name: /Continue/ }).click();
    await expect(window.getByLabel("Repositories")).toHaveValue(
      canonicalProjectPath,
    );
    await window.getByRole("button", { name: /Continue/ }).click();
    await window.getByRole("button", { name: /Continue/ }).click();
    await expect(
      window.getByRole("radio", { name: /^Local-only/ }),
    ).toBeChecked();
    await window.getByRole("button", { name: /Continue/ }).click();
    await window.getByRole("button", { name: "Skip for now" }).click();
    await window.getByRole("button", { name: "Skip for now" }).click();
    await window.getByRole("button", { name: /Approve and generate/ }).click();
    await window.getByRole("button", { name: /Add the first source/ }).click();
    await expect(
      window.getByRole("heading", { name: "Source Manager", level: 1 }),
    ).toBeVisible();

    const projectId = await window.evaluate(async () => {
      const desktop = (
        globalThis as typeof globalThis & {
          dream?: { loadState(): Promise<{ activeProjectId?: string | null }> };
        }
      ).dream;
      const state = await desktop?.loadState();
      return state?.activeProjectId as string | null;
    });
    expect(projectId).toMatch(/^[0-9a-f-]{20,}$/i);
    const projectApi = `/api/projects/${encodeURIComponent(
      required(projectId, "Onboarding did not select a persisted project."),
    )}`;

    const imported = await api<{
      notebookId: string;
      imported: { insertedObjects: number };
    }>(window, `${projectApi}/notebooks/import`, {
      method: "POST",
      body: { path: "notebooks/calibration.ipynb" },
    });
    expect(imported.imported.insertedObjects).toBeGreaterThan(0);

    let graph = await api<ResearchGraph>(window, `${projectApi}/research`);
    const claim = graph.objects.find(
      (object) => object.type === "claim" && object.title === claimTitle,
    );
    const experiment = graph.objects.find(
      (object) =>
        object.type === "experiment" &&
        object.payload.notebookId === imported.notebookId,
    );
    expect(
      claim,
      "notebook import should create its labeled claim",
    ).toBeTruthy();
    expect(
      experiment,
      "notebook import should create its inferred experiment",
    ).toBeTruthy();
    const importedClaim = required(
      claim,
      "Notebook import did not create its labeled claim.",
    );
    const importedExperiment = required(
      experiment,
      "Notebook import did not create its inferred experiment.",
    );

    const definition = {
      hypothesis: claimTitle,
      objective: "Measure a deterministic calibration score.",
      configuration: {
        command: "python3 run_experiment.py outputs/calibration.txt",
        deterministic: true,
      },
      datasets: [],
      declaredMetrics: ["calibration_score"],
    };
    await api(
      window,
      `${projectApi}/experiments/${importedExperiment.id}/definitions`,
      {
        method: "POST",
        body: { definition },
      },
    );

    const originalRun = await api<{ id: string }>(
      window,
      `${projectApi}/experiments/${importedExperiment.id}/runs`,
      {
        method: "POST",
        body: {
          title: "Baseline deterministic Python run",
          status: "completed",
          commitSha: originalCommitSha,
          codeRefs: [
            {
              path: "src/calibrate.py",
              symbol: "calibrate",
              kind: "function",
              contentHash: originalCodeHash,
            },
          ],
          environment: { runtime: "python", runtimeVersion: pythonVersion },
          dependencies: [],
          finishedAt: new Date().toISOString(),
          exitCode: 0,
        },
      },
    );
    await api(window, `${projectApi}/runs/${originalRun.id}/metrics`, {
      method: "POST",
      body: {
        metrics: [{ name: "calibration_score", value: 0.03, unit: "ratio" }],
      },
    });
    const originalArtifact = await api<{ id: string }>(
      window,
      `${projectApi}/runs/${originalRun.id}/artifacts`,
      {
        method: "POST",
        body: {
          title: "Baseline calibration result",
          kind: "file",
          path: "outputs/calibration.txt",
          mediaType: "text/plain",
          contentHash: originalArtifactHash,
          generatorPath: "src/calibrate.py",
          generatorHash: originalCodeHash,
        },
      },
    );
    const originalSupport = await api<{ id: string }>(
      window,
      `${projectApi}/research/relationships`,
      {
        method: "POST",
        body: {
          fromObjectId: originalArtifact.id,
          toObjectId: importedClaim.id,
          type: "supports",
          origin: "human",
        },
      },
    );
    await api(
      window,
      `${projectApi}/research/relationships/${originalSupport.id}/review`,
      { method: "PATCH", body: { reviewState: "approved", confidence: 1 } },
    );
    await api(window, `${projectApi}/research/objects/${importedClaim.id}`, {
      method: "PATCH",
      body: {
        expectedVersion: importedClaim.version,
        payload: {
          ...importedClaim.payload,
          status: "supported",
          reviewStatus: "Strong",
          reproducibilityStatus: "passed",
          openRiskCount: 0,
        },
      },
    });

    writeFileSync(sourcePath, changedImplementation);
    expect(python(projectPath, "outputs/calibration.txt")).toBe("0.130000");
    git(projectPath, ["add", "src/calibrate.py", "outputs/calibration.txt"]);
    git(projectPath, ["commit", "-m", "Mutate calibration implementation"]);
    const changedCommitSha = git(projectPath, ["rev-parse", "HEAD"]);
    const changedCodeHash = sha256(sourcePath);
    const changedArtifactHash = sha256(originalOutputPath);
    expect(changedCodeHash).not.toBe(originalCodeHash);
    expect(changedArtifactHash).not.toBe(originalArtifactHash);

    const stale = await api<StalenessAssessment>(
      window,
      `${projectApi}/staleness/assessments`,
      {
        method: "POST",
        body: {
          commitSha: changedCommitSha,
          code: [
            {
              path: "src/calibrate.py",
              symbol: "calibrate",
              kind: "function",
              contentHash: changedCodeHash,
            },
          ],
          artifacts: [
            {
              path: "outputs/calibration.txt",
              contentHash: changedArtifactHash,
            },
          ],
        },
      },
    );
    expect(stale.impacted.map((item) => item.object.id)).toEqual(
      expect.arrayContaining([
        originalRun.id,
        originalArtifact.id,
        importedClaim.id,
      ]),
    );
    const staleClaim = stale.impacted.find(
      (item) => item.object.id === importedClaim.id,
    );
    expect(staleClaim?.state).toBe("needs-review");
    expect(staleClaim?.dependencyPath.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        originalRun.id,
        originalArtifact.id,
        importedClaim.id,
      ]),
    );
    expect(staleClaim?.dependencyPath.map((item) => item.type)).toContain(
      "code",
    );

    writeFileSync(sourcePath, originalImplementation);
    expect(python(projectPath, "outputs/calibration.txt")).toBe("0.030000");
    expect(python(projectPath, "outputs/calibration-repaired.txt")).toBe(
      "0.030000",
    );
    git(projectPath, [
      "add",
      "src/calibrate.py",
      "outputs/calibration.txt",
      "outputs/calibration-repaired.txt",
    ]);
    git(projectPath, ["commit", "-m", "Repair and rerun calibration"]);
    const repairedCommitSha = git(projectPath, ["rev-parse", "HEAD"]);
    const repairedCodeHash = sha256(sourcePath);
    const repairedArtifactHash = sha256(repairedOutputPath);
    expect(repairedCodeHash).toBe(originalCodeHash);

    const repairedRun = await api<{ id: string }>(
      window,
      `${projectApi}/experiments/${importedExperiment.id}/runs`,
      {
        method: "POST",
        body: {
          title: "Repaired deterministic Python rerun",
          status: "completed",
          commitSha: repairedCommitSha,
          codeRefs: [
            {
              path: "src/calibrate.py",
              symbol: "calibrate",
              kind: "function",
              contentHash: repairedCodeHash,
            },
          ],
          environment: { runtime: "python", runtimeVersion: pythonVersion },
          dependencies: [],
          finishedAt: new Date().toISOString(),
          exitCode: 0,
        },
      },
    );
    const repairedArtifact = await api<{ id: string }>(
      window,
      `${projectApi}/runs/${repairedRun.id}/artifacts`,
      {
        method: "POST",
        body: {
          title: "Repaired calibration result",
          kind: "file",
          path: "outputs/calibration-repaired.txt",
          mediaType: "text/plain",
          contentHash: repairedArtifactHash,
          generatorPath: "src/calibrate.py",
          generatorHash: repairedCodeHash,
        },
      },
    );
    const repairedSupport = await api<{ id: string }>(
      window,
      `${projectApi}/research/relationships`,
      {
        method: "POST",
        body: {
          fromObjectId: repairedArtifact.id,
          toObjectId: importedClaim.id,
          type: "supports",
          origin: "human",
        },
      },
    );
    await api(
      window,
      `${projectApi}/research/relationships/${repairedSupport.id}/review`,
      { method: "PATCH", body: { reviewState: "approved", confidence: 1 } },
    );
    await api(
      window,
      `${projectApi}/research/relationships/${originalSupport.id}/review`,
      { method: "PATCH", body: { reviewState: "rejected", confidence: 1 } },
    );

    const restored = await api<StalenessAssessment>(
      window,
      `${projectApi}/staleness/assessments`,
      {
        method: "POST",
        body: {
          commitSha: repairedCommitSha,
          code: [
            {
              path: "src/calibrate.py",
              symbol: "calibrate",
              kind: "function",
              contentHash: repairedCodeHash,
            },
          ],
          artifacts: [
            {
              path: "outputs/calibration.txt",
              contentHash: sha256(originalOutputPath),
            },
            {
              path: "outputs/calibration-repaired.txt",
              contentHash: repairedArtifactHash,
            },
          ],
        },
      },
    );
    expect(restored.impacted.map((item) => item.object.id)).toEqual(
      expect.arrayContaining([originalRun.id, originalArtifact.id]),
    );
    expect(restored.impacted.map((item) => item.object.id)).not.toEqual(
      expect.arrayContaining([
        repairedRun.id,
        repairedArtifact.id,
        importedClaim.id,
      ]),
    );

    await app.close();
    app = await launch();
    window = await app.firstWindow();
    const rendererErrors: string[] = [];
    window.on("pageerror", (error) => rendererErrors.push(error.message));
    await window.getByRole("heading", { level: 1 }).first().waitFor();

    graph = await api<ResearchGraph>(window, `${projectApi}/research`);
    expect(graph.objects.map((object) => object.id)).toEqual(
      expect.arrayContaining([
        importedClaim.id,
        importedExperiment.id,
        originalRun.id,
        originalArtifact.id,
        repairedRun.id,
        repairedArtifact.id,
      ]),
    );
    const persistedStaleness = await api<
      Array<{ object: { id: string }; state: string }>
    >(window, `${projectApi}/staleness?includeCurrent=true`);
    expect(persistedStaleness).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          object: expect.objectContaining({ id: originalRun.id }),
          state: "stale",
        }),
        expect.objectContaining({
          object: expect.objectContaining({ id: repairedRun.id }),
          state: "current",
        }),
        expect.objectContaining({
          object: expect.objectContaining({ id: importedClaim.id }),
          state: "current",
        }),
      ]),
    );
    const transitions = await api<
      Array<{ fromState: string; toState: string }>
    >(window, `${projectApi}/staleness/${importedClaim.id}/transitions`);
    expect(transitions.map((item) => [item.fromState, item.toState])).toEqual([
      ["current", "needs-review"],
      ["needs-review", "current"],
    ]);

    const capsule = await api<Capsule>(
      window,
      `${projectApi}/reviewer-capsule/preview`,
      { method: "POST", body: { claimIds: [importedClaim.id] } },
    );
    expect(capsule.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(capsule.manifest.included).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: importedClaim.id,
          currentness: "current",
          reproducibility: "reproducible",
        }),
        expect.objectContaining({
          id: originalArtifact.id,
          currentness: "current",
          verification: "verified",
          reproducibility: "documented-only",
        }),
        expect.objectContaining({
          id: repairedArtifact.id,
          currentness: "current",
          verification: "verified",
          reproducibility: "documented-only",
        }),
        expect.objectContaining({
          id: repairedSupport.id,
          currentness: "current",
          verification: "verified",
        }),
        expect.objectContaining({
          id: originalSupport.id,
          currentness: "stale",
          verification: "inferred",
        }),
      ]),
    );

    await navigateToResearch(window, "agents");
    await window.waitForTimeout(500);
    if (
      (await window
        .getByRole("heading", { name: "Agent Sessions", level: 1 })
        .count()) === 0
    ) {
      throw new Error(
        `Agent Sessions route did not render. Renderer errors: ${rendererErrors.join(" | ") || "none"}. Body: ${(await window.locator("body").innerText()).slice(0, 2_000)}`,
      );
    }
    await expect(
      window.getByRole("heading", { name: "Agent Sessions", level: 1 }),
    ).toBeVisible({ timeout: 15_000 });
    await window.getByRole("button", { name: "Start task" }).click();
    const startTask = window.getByRole("dialog", {
      name: "Start a Cly Dev task",
    });
    await expect(startTask).toContainText(
      /derives the registered .* worktree and Git commit locally/i,
    );
    await startTask
      .getByLabel("Objective")
      .fill("Audit the repaired calibration evidence without changing files.");
    await startTask.getByLabel("Linear issue (optional)").fill("CLY-71");
    await startTask.getByLabel("Local provider").selectOption("openai-codex");
    await expect(startTask.getByLabel("Installed model ID")).toHaveValue(
      "gpt-5",
    );
    await startTask
      .getByLabel("Additional research object IDs")
      .fill("not-owned-by-this-project");
    await startTask.getByRole("button", { name: "Start provider run" }).click();
    await expect(startTask.getByRole("alert")).toContainText(
      "Research object not-owned-by-this-project was not found in this project.",
    );

    await startTask.getByLabel("Additional research object IDs").fill("");
    await startTask.getByLabel(new RegExp(claimTitle)).check();
    await startTask.getByLabel(new RegExp(importedExperiment.title)).check();
    const sessionStartResponse = window.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith(`${projectApi}/cly-dev/session-starts`),
    );
    await startTask.getByRole("button", { name: "Start provider run" }).click();
    const startResponse = await sessionStartResponse;
    expect(startResponse.status()).toBe(202);
    const started = (await startResponse.json()) as StartedAgentSession;
    expect(started.workspace.localOnly).toEqual({
      repositoryPath: canonicalProjectPath,
      worktreePath: canonicalProjectPath,
    });
    expect(started.workspace.worktree.branch).toBe("main");
    expect(started.session.commit.sha).toBe(repairedCommitSha);
    expect(started.session.provider).toEqual({
      id: "openai-codex",
      model: "gpt-5",
    });
    expect(started.task.researchObjectIds).toEqual([
      importedClaim.id,
      importedExperiment.id,
    ]);
    expect(started.contextManifest.transferable.entries).toEqual(
      expect.arrayContaining([
        { kind: "research_object", researchObjectId: importedClaim.id },
        { kind: "research_object", researchObjectId: importedExperiment.id },
      ]),
    );
    expect(started.execution.status).toBe("queued");

    await navigateToResearch(window, "notebooks");
    await expect(
      window.getByText("calibration.ipynb", { exact: false }).first(),
    ).toBeVisible();
    await window.getByTestId("nav-claims").click();
    await window.getByPlaceholder("Search claims…").fill(claimTitle);
    await expect(
      window
        .locator("#main-workspace")
        .getByText(claimTitle, { exact: true })
        .first(),
    ).toBeVisible();
    await window
      .locator("#main-workspace")
      .getByText(claimTitle, { exact: true })
      .first()
      .click();
    await window.getByRole("radio", { name: "Detail" }).click();
    await window.getByRole("button", { name: "Reviewer capsule" }).click();
    await window.getByRole("button", { name: "Preview capsule" }).click();
    await expect(window.getByText("Safe static preview")).toBeVisible();
    await expect(window.getByText(/SHA-256 [a-f0-9]{64}/)).toBeVisible();
  } finally {
    await app.close().catch(() => undefined);
    rmSync(userDataPath, { recursive: true, force: true });
  }
});
