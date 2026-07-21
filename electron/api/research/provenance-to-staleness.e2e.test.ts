// @vitest-environment node
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  closePersistedStateDatabase,
  getStateDatabase,
} from "../../persisted-state.js";
import { createNotebookImporter } from "./notebook-importer.js";
import { createResearchRepository } from "./repository.js";
import { createRepositoryWorkflowCoordinator } from "./repository-workflow-coordinator.js";
import { createReproducibilityAuditService } from "./reproducibility-audit.js";
import { createReviewerCapsuleService } from "./reviewer-capsule.js";

const directories: string[] = [];
const execFileAsync = promisify(execFile);
const hashFile = async (filePath: string) =>
  createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");

const readJsonFile = async <T>(filePath: string): Promise<T> =>
  JSON.parse(await readFile(filePath, "utf8")) as T;

afterEach(async () => {
  closePersistedStateDatabase();
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("production provenance-to-staleness loop", () => {
  it("connects a repository, imports a notebook, marks downstream research stale, reruns, and restores validity", async () => {
    const startedAt = performance.now();
    const projectRoot = await mkdtemp(path.join(tmpdir(), "cly-trust-loop-"));
    directories.push(projectRoot);
    await mkdir(path.join(projectRoot, ".git"));
    await mkdir(path.join(projectRoot, "notebooks"));
    await mkdir(path.join(projectRoot, "src"));
    await mkdir(path.join(projectRoot, "outputs"));
    await mkdir(path.join(projectRoot, "data"));
    const originalImplementation =
      "def calibrate(values):\n    return sum(values) / len(values)\n";
    await writeFile(
      path.join(projectRoot, "src", "calibrate.py"),
      originalImplementation,
    );
    await writeFile(
      path.join(projectRoot, "run_experiment.py"),
      [
        "import sys",
        "from pathlib import Path",
        "from src.calibrate import calibrate",
        'target = Path(sys.argv[1] if len(sys.argv) > 1 else "outputs/calibration.txt")',
        "target.write_text(f'{calibrate([0.02, 0.03, 0.04]):.6f}\\n')",
        "",
      ].join("\n"),
    );
    await writeFile(
      path.join(projectRoot, "data", "calibration.csv"),
      "value\n0.02\n0.03\n0.04\n",
    );
    await writeFile(
      path.join(projectRoot, "data", "calibration.metadata.json"),
      JSON.stringify({
        id: "dataset-loop",
        version: "v1",
        path: "data/calibration.csv",
      }),
    );
    await writeFile(
      path.join(projectRoot, "experiment-config.json"),
      JSON.stringify({
        command: "python3 run_experiment.py",
        testCommand: "python3 run_experiment.py outputs/calibration.txt",
        testStatus: "passed",
        dependencies: { python: "runtime" },
        lockfile: "dependencies.json",
        os: process.platform,
        hardware: process.arch,
        seed: 42,
        preprocessing: "none",
        datasetLicense: "CC-BY-4.0",
        logs: "outputs/calibration.txt",
      }),
    );
    await writeFile(
      path.join(projectRoot, "dependencies.json"),
      JSON.stringify([]),
    );
    await writeFile(
      path.join(projectRoot, "notebooks", "calibration.ipynb"),
      JSON.stringify({
        nbformat: 4,
        nbformat_minor: 5,
        metadata: {
          title: "Calibration evidence",
          kernelspec: { name: "python3" },
          language_info: { name: "python" },
        },
        cells: [
          {
            id: "objective",
            cell_type: "markdown",
            metadata: {},
            source: [
              "# Objective\n",
              "Validate the calibration experiment.\n",
              "# Claim\n",
              "Calibration improves reliability.\n",
            ],
          },
          {
            id: "experiment",
            cell_type: "code",
            execution_count: 1,
            metadata: {},
            source: [
              "from src.calibrate import calibrate\n",
              "seed = 42\n",
              "model.fit(calibrate(values))\n",
              "calibration_error = 0.03\n",
            ],
            outputs: [
              {
                output_type: "display_data",
                data: { "image/png": "fixture-image" },
              },
            ],
          },
        ],
      }),
    );

    await execFileAsync("git", ["init", "--initial-branch=main"], {
      cwd: projectRoot,
    });
    await execFileAsync("git", ["config", "user.name", "Cly trust test"], {
      cwd: projectRoot,
    });
    await execFileAsync(
      "git",
      ["config", "user.email", "trust-test@cly.local"],
      { cwd: projectRoot },
    );
    await execFileAsync("git", ["add", "."], { cwd: projectRoot });
    await execFileAsync("git", ["commit", "-m", "Baseline experiment"], {
      cwd: projectRoot,
    });
    const { stdout: originalCommitOutput } = await execFileAsync(
      "git",
      ["rev-parse", "HEAD"],
      { cwd: projectRoot },
    );
    const originalCommitSha = originalCommitOutput.trim();
    await execFileAsync(
      "python3",
      ["run_experiment.py", "outputs/calibration.txt"],
      { cwd: projectRoot },
    );
    const originalCodeHash = await hashFile(
      path.join(projectRoot, "src", "calibrate.py"),
    );
    const originalFigureHash = await hashFile(
      path.join(projectRoot, "outputs", "calibration.txt"),
    );
    const captureWorkspaceCheckpoint = async (artifactPaths: string[]) => {
      const [{ stdout: commitOutput }, { stdout, stderr }] = await Promise.all([
        execFileAsync("git", ["rev-parse", "HEAD"], { cwd: projectRoot }),
        execFileAsync("python3", ["--version"], { cwd: projectRoot }),
      ]);
      const pythonVersion = `${stdout}${stderr}`
        .trim()
        .replace(/^Python\s+/i, "");
      const dataset = await readJsonFile<{
        id: string;
        version: string;
        path: string;
      }>(path.join(projectRoot, "data", "calibration.metadata.json"));
      return {
        commitSha: commitOutput.trim(),
        code: [
          {
            path: "src/calibrate.py",
            symbol: "calibrate",
            kind: "function" as const,
            contentHash: await hashFile(
              path.join(projectRoot, "src", "calibrate.py"),
            ),
          },
        ],
        configuration: await readJsonFile<Record<string, unknown>>(
          path.join(projectRoot, "experiment-config.json"),
        ),
        datasets: [
          {
            id: dataset.id,
            version: dataset.version,
            contentHash: await hashFile(path.join(projectRoot, dataset.path)),
          },
        ],
        environment: {
          runtime: "python",
          runtimeVersion: pythonVersion,
          platform: process.platform,
          architecture: process.arch,
        },
        dependencies: await readJsonFile<
          Array<{ name: string; version: string }>
        >(path.join(projectRoot, "dependencies.json")),
        artifacts: await Promise.all(
          artifactPaths.map(async (artifactPath) => ({
            path: artifactPath,
            contentHash: await hashFile(path.join(projectRoot, artifactPath)),
          })),
        ),
      };
    };
    const baselineCheckpoint = await captureWorkspaceCheckpoint([
      "outputs/calibration.txt",
    ]);
    expect(baselineCheckpoint.commitSha).toBe(originalCommitSha);
    expect(baselineCheckpoint.code[0].contentHash).toBe(originalCodeHash);
    expect(baselineCheckpoint.artifacts[0].contentHash).toBe(
      originalFigureHash,
    );

    const canonicalRoot = await realpath(projectRoot);
    const databasePath = path.join(projectRoot, "cly.sqlite");
    const database = getStateDatabase(databasePath);
    let sequence = 0;
    let timestamp = Date.parse("2026-07-21T12:00:00.000Z");
    const repository = createResearchRepository(database, {
      createId: () => `loop-${++sequence}`,
      clock: () => new Date(timestamp++).toISOString(),
    });
    repository.upsertProject({
      id: "project-loop",
      name: "Calibration trust loop",
      path: canonicalRoot,
      metadata: {},
    });

    const coordinator = createRepositoryWorkflowCoordinator(repository, {
      createId: () => `approval-${++sequence}`,
      clock: () => new Date(timestamp++),
    });
    const observation = coordinator.requestApproval("project-loop", {
      type: "set-observation",
      enabled: true,
    });
    coordinator.approveAction("project-loop", observation.id, "reviewer-1");
    coordinator.setObservationEnabled("project-loop", {
      approvalId: observation.id,
      enabled: true,
    });

    const imported = await createNotebookImporter(repository).importNotebook(
      "project-loop",
      "notebooks/calibration.ipynb",
    );
    expect(imported.imported.insertedObjects).toBeGreaterThan(0);
    expect(
      repository
        .listProvenance("project-loop")
        .find((event) => event.action === "notebook.import.completed")
        ?.metadata,
    ).toMatchObject({ executedCells: false });
    expect(
      repository.listProject("project-loop").objects.map((item) => item.type),
    ).toEqual(
      expect.arrayContaining([
        "notebook",
        "notebook-cell",
        "experiment",
        "run",
      ]),
    );

    repository.createObject({
      id: "dataset-loop",
      projectId: "project-loop",
      type: "source",
      title: "Calibration benchmark v1",
      payload: {
        kind: "source",
        sourceType: "dataset",
        status: "resolved",
        citation: "Calibration benchmark v1",
      },
    });
    repository.createExperiment({
      id: "experiment-loop",
      projectId: "project-loop",
      title: "Calibration experiment",
      definition: {
        hypothesis: "Calibration improves reliability.",
        objective: "Measure calibration error with a deterministic seed.",
        configuration: baselineCheckpoint.configuration,
        datasets: baselineCheckpoint.datasets,
        declaredMetrics: ["calibration_error"],
      },
    });
    repository.createExperimentRun({
      id: "run-original",
      projectId: "project-loop",
      experimentId: "experiment-loop",
      title: "Original seed-42 run",
      status: "completed",
      commitSha: originalCommitSha,
      finishedAt: "2026-07-21T12:10:00.000Z",
      exitCode: 0,
      codeRefs: [
        {
          path: "src/calibrate.py",
          symbol: "calibrate",
          kind: "function",
          contentHash: originalCodeHash,
        },
      ],
      environment: baselineCheckpoint.environment,
      dependencies: baselineCheckpoint.dependencies,
    });
    repository.logRunMetrics({
      projectId: "project-loop",
      runId: "run-original",
      metrics: [{ name: "calibration_error", value: 0.03, unit: "ratio" }],
    });
    repository.registerRunArtifact({
      id: "figure-original",
      projectId: "project-loop",
      runId: "run-original",
      title: "Calibration curve",
      kind: "figure",
      path: "outputs/calibration.txt",
      mediaType: "text/plain",
      contentHash: originalFigureHash,
      generatorPath: "src/calibrate.py",
      generatorHash: originalCodeHash,
    });
    repository.createObject({
      id: "claim-loop",
      projectId: "project-loop",
      type: "claim",
      title: "Calibration improves reliability",
      payload: {
        kind: "claim",
        status: "supported",
        reviewStatus: "Strong",
        reproducibilityStatus: "passed",
        openRiskCount: 0,
      },
    });
    const support = repository.createRelationship({
      id: "figure-supports-claim",
      projectId: "project-loop",
      fromObjectId: "figure-original",
      toObjectId: "claim-loop",
      type: "supports",
    });
    repository.reviewRelationship({
      id: support.id,
      projectId: "project-loop",
      reviewState: "approved",
      reviewerId: "reviewer-1",
      confidence: 1,
    });

    const referenceAction = {
      type: "link-reference" as const,
      reference: {
        kind: "commit" as const,
        sha: originalCommitSha,
        title: "Baseline calibration implementation",
        url: `https://github.com/example/calibration/commit/${originalCommitSha}`,
      },
      researchObjectIds: ["experiment-loop", "claim-loop"],
    };
    const referenceApproval = coordinator.requestApproval(
      "project-loop",
      referenceAction,
    );
    coordinator.approveAction(
      "project-loop",
      referenceApproval.id,
      "reviewer-1",
    );
    coordinator.linkReference("project-loop", {
      ...referenceAction,
      approvalId: referenceApproval.id,
    });

    await writeFile(
      path.join(projectRoot, "src", "calibrate.py"),
      "def calibrate(values):\n    return sum(values) / len(values) + 0.10\n",
    );
    await execFileAsync(
      "python3",
      ["run_experiment.py", "outputs/calibration.txt"],
      { cwd: projectRoot },
    );
    const changedCodeHash = await hashFile(
      path.join(projectRoot, "src", "calibrate.py"),
    );
    expect(changedCodeHash).not.toBe(originalCodeHash);
    expect(
      await hashFile(path.join(projectRoot, "outputs", "calibration.txt")),
    ).not.toBe(originalFigureHash);
    await execFileAsync("git", ["add", "src/calibrate.py"], {
      cwd: projectRoot,
    });
    await execFileAsync(
      "git",
      ["commit", "-m", "Change calibration implementation"],
      { cwd: projectRoot },
    );
    const changedCheckpoint = await captureWorkspaceCheckpoint([
      "outputs/calibration.txt",
    ]);
    expect(changedCheckpoint.artifacts[0].contentHash).not.toBe(
      originalFigureHash,
    );
    const stale = repository.assessProjectStaleness({
      projectId: "project-loop",
      ...changedCheckpoint,
    });
    expect(stale.impacted.map((item) => item.object.id)).toEqual(
      expect.arrayContaining(["run-original", "figure-original", "claim-loop"]),
    );
    expect(
      stale.impacted.find((item) => item.object.id === "claim-loop"),
    ).toMatchObject({
      state: "needs-review",
      explanation: expect.stringContaining("Function calibrate"),
      dependencyPath: [
        expect.objectContaining({ type: "code" }),
        expect.objectContaining({ id: "run-original" }),
        expect.objectContaining({ id: "figure-original" }),
        expect.objectContaining({ id: "claim-loop" }),
      ],
      recommendations: [expect.stringContaining("Review the claim")],
    });

    const staleAudit = createReproducibilityAuditService(database, repository, {
      createId: () => `audit-${++sequence}`,
      clock: () => new Date(timestamp++).toISOString(),
    }).run("project-loop");
    expect(staleAudit.findings.length).toBeGreaterThan(0);
    expect(
      stale.impacted.find((item) => item.object.id === "figure-original"),
    ).toMatchObject({
      state: "stale",
      reasons: expect.arrayContaining([
        expect.objectContaining({ kind: "manual-artifact-edit" }),
      ]),
    });

    // The reviewed fix restores the original deterministic implementation and
    // is rerun as a new immutable run/artifact pair.
    await writeFile(
      path.join(projectRoot, "src", "calibrate.py"),
      originalImplementation,
    );
    await execFileAsync(
      "python3",
      ["run_experiment.py", "outputs/calibration-rerun.txt"],
      { cwd: projectRoot },
    );
    await execFileAsync("git", ["add", "src/calibrate.py"], {
      cwd: projectRoot,
    });
    await execFileAsync(
      "git",
      ["commit", "-m", "Repair calibration implementation"],
      { cwd: projectRoot },
    );
    const { stdout: repairedCommitOutput } = await execFileAsync(
      "git",
      ["rev-parse", "HEAD"],
      { cwd: projectRoot },
    );
    const repairedCommitSha = repairedCommitOutput.trim();
    const repairedCodeHash = await hashFile(
      path.join(projectRoot, "src", "calibrate.py"),
    );
    const rerunFigureHash = await hashFile(
      path.join(projectRoot, "outputs", "calibration-rerun.txt"),
    );
    expect(repairedCodeHash).toBe(originalCodeHash);
    repository.createExperimentRun({
      id: "run-repaired",
      projectId: "project-loop",
      experimentId: "experiment-loop",
      title: "Repaired seed-42 rerun",
      status: "completed",
      commitSha: repairedCommitSha,
      finishedAt: "2026-07-21T12:30:00.000Z",
      exitCode: 0,
      codeRefs: [
        {
          path: "src/calibrate.py",
          symbol: "calibrate",
          kind: "function",
          contentHash: repairedCodeHash,
        },
      ],
      environment: baselineCheckpoint.environment,
      dependencies: baselineCheckpoint.dependencies,
    });
    repository.registerRunArtifact({
      id: "figure-repaired",
      projectId: "project-loop",
      runId: "run-repaired",
      title: "Repaired calibration curve",
      kind: "figure",
      path: "outputs/calibration-rerun.txt",
      mediaType: "text/plain",
      contentHash: rerunFigureHash,
      generatorPath: "src/calibrate.py",
      generatorHash: repairedCodeHash,
    });
    const repairedSupport = repository.createRelationship({
      id: "repaired-figure-supports-claim",
      projectId: "project-loop",
      fromObjectId: "figure-repaired",
      toObjectId: "claim-loop",
      type: "supports",
    });
    repository.reviewRelationship({
      id: repairedSupport.id,
      projectId: "project-loop",
      reviewState: "approved",
      reviewerId: "reviewer-1",
      confidence: 1,
    });

    // Retire the superseded support edge before reassessing. The old file still
    // contains the mutated result, so its artifact must remain stale while the
    // independently generated rerun becomes the claim's reviewed support.
    repository.reviewRelationship({
      id: support.id,
      projectId: "project-loop",
      reviewState: "rejected",
      reviewerId: "reviewer-1",
      confidence: 0,
    });

    const repairedCheckpoint = await captureWorkspaceCheckpoint([
      "outputs/calibration.txt",
      "outputs/calibration-rerun.txt",
    ]);
    expect(repairedCheckpoint.commitSha).toBe(repairedCommitSha);
    expect(repairedCheckpoint.code[0].contentHash).toBe(repairedCodeHash);
    expect(
      repairedCheckpoint.artifacts.find(
        (artifact) => artifact.path === "outputs/calibration.txt",
      )?.contentHash,
    ).not.toBe(originalFigureHash);
    expect(
      repairedCheckpoint.artifacts.find(
        (artifact) => artifact.path === "outputs/calibration-rerun.txt",
      )?.contentHash,
    ).toBe(rerunFigureHash);
    const restored = repository.assessProjectStaleness({
      projectId: "project-loop",
      ...repairedCheckpoint,
    });
    expect(restored.impacted.map((item) => item.object.id)).toEqual(
      expect.arrayContaining(["run-original", "figure-original"]),
    );
    expect(restored.impacted.map((item) => item.object.id)).not.toEqual(
      expect.arrayContaining(["claim-loop", "run-repaired", "figure-repaired"]),
    );
    expect(
      restored.states.find((item) => item.object.id === "claim-loop"),
    ).toMatchObject({ state: "current" });
    expect(
      restored.states.find((item) => item.object.id === "figure-original"),
    ).toMatchObject({
      state: "stale",
      reasons: expect.arrayContaining([
        expect.objectContaining({ kind: "manual-artifact-edit" }),
      ]),
    });
    expect(
      restored.states.find((item) => item.object.id === "figure-repaired"),
    ).toMatchObject({ state: "current" });
    expect(
      repository
        .listStalenessTransitions("project-loop", "claim-loop")
        .map((transition) => [transition.fromState, transition.toState]),
    ).toEqual([
      ["current", "needs-review"],
      ["needs-review", "current"],
    ]);
    const originalArtifactTransitions = repository.listStalenessTransitions(
      "project-loop",
      "figure-original",
    );
    expect(
      originalArtifactTransitions.map((transition) => [
        transition.fromState,
        transition.toState,
      ]),
    ).toEqual([
      ["current", "stale"],
      ["stale", "stale"],
    ]);
    expect(originalArtifactTransitions.at(-1)?.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "manual-artifact-edit" }),
      ]),
    );
    expect(repository.listProject("project-loop").relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: support.id, reviewState: "rejected" }),
        expect.objectContaining({
          id: repairedSupport.id,
          reviewState: "approved",
        }),
      ]),
    );

    closePersistedStateDatabase();
    const reopenedDatabase = getStateDatabase(databasePath);
    const reopenedRepository = createResearchRepository(reopenedDatabase);
    expect(
      reopenedRepository.listStaleness("project-loop", {
        includeCurrent: true,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          object: expect.objectContaining({ id: "claim-loop" }),
          state: "current",
        }),
        expect.objectContaining({
          object: expect.objectContaining({ id: "figure-original" }),
          state: "stale",
        }),
        expect.objectContaining({
          object: expect.objectContaining({ id: "figure-repaired" }),
          state: "current",
        }),
      ]),
    );
    expect(
      reopenedRepository
        .listStalenessTransitions("project-loop", "claim-loop")
        .map((transition) => [transition.fromState, transition.toState]),
    ).toEqual([
      ["current", "needs-review"],
      ["needs-review", "current"],
    ]);
    const actions = reopenedRepository
      .listProvenance("project-loop")
      .map((event) => event.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "repository.observation.enabled",
        "notebook.import.completed",
        "run.created",
        "artifact.registered",
        "repository.commit.linked",
        "staleness.marked-stale",
        "staleness.marked-current",
        "relationship.reviewed",
      ]),
    );
    const capsule = createReviewerCapsuleService(reopenedRepository, {
      now: () => "2026-07-21T13:00:00.000Z",
    }).preview("project-loop", ["claim-loop"]);
    expect(capsule.manifest.included).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "claim-loop",
          currentness: "current",
          reproducibility: "reproducible",
        }),
        expect.objectContaining({
          id: support.id,
          kind: "relationship",
          currentness: "stale",
          verification: "inferred",
        }),
        expect.objectContaining({
          id: repairedSupport.id,
          kind: "relationship",
          currentness: "current",
          verification: "verified",
        }),
      ]),
    );
    expect(performance.now() - startedAt).toBeLessThan(10_000);
  });
});
