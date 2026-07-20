// @vitest-environment node
import {
  access,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closePersistedStateDatabase,
  getStateDatabase,
} from "../../persisted-state.js";
import { createNotebookImporter } from "./notebook-importer.js";
import { registerNotebookRoutes } from "./notebook-routes.js";
import { scanNotebookDocument } from "./notebook-scanner.js";
import { createResearchRepository } from "./repository.js";

const directories: string[] = [];

const riskyNotebook = () => ({
  nbformat: 4,
  nbformat_minor: 5,
  metadata: {
    title: "Calibration review",
    kernelspec: { name: "python3" },
    language_info: { name: "python" },
    dependencies: ["numpy"],
  },
  cells: [
    {
      id: "purpose-cell",
      cell_type: "markdown",
      metadata: {},
      source: [
        "# Objective\n",
        "Compare the calibration pipeline.\n",
        "# Claim\n",
        "The calibrated model improves accuracy.\n",
      ],
    },
    {
      id: "training-cell",
      cell_type: "code",
      execution_count: 3,
      metadata: { source_hash: "0".repeat(64) },
      source: [
        "import numpy as np\n",
        "import pandas as pd\n",
        "from missing_package import train\n",
        "data = pd.read_csv('/Users/researcher/private/train.csv')\n",
        "def calibrate(model):\n    return model.fit(data)\n",
        "sample = np.random.rand(10)\n",
        "accuracy_score = 0.91\n",
        "require('node:fs').writeFileSync('/tmp/cly-cell-executed', 'bad')\n",
      ],
      outputs: [
        {
          output_type: "execute_result",
          execution_count: 2,
          data: {
            "text/plain": ["0.91"],
            "image/png": "a".repeat(256 * 1024 + 1),
          },
        },
      ],
    },
    {
      id: "error-cell",
      cell_type: "code",
      execution_count: 2,
      metadata: {},
      source: "evaluate_model()\n",
      outputs: [
        {
          output_type: "error",
          ename: "NameError",
          evalue: "evaluate_model is not defined",
          traceback: ["untrusted traceback"],
        },
      ],
    },
    {
      id: "stale-cell",
      cell_type: "code",
      execution_count: null,
      metadata: {},
      source: "print(accuracy_score)\n",
      outputs: [
        { output_type: "stream", name: "stdout", text: "0.91\n" },
        {
          output_type: "display_data",
          data: { "text/html": "<table><tr><td>0.91</td></tr></table>" },
        },
      ],
    },
  ],
});

afterEach(async () => {
  closePersistedStateDatabase();
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("static notebook scanner", () => {
  it("extracts research objects and deterministic evidence while detecting known risks", () => {
    const document = riskyNotebook();
    const options = {
      contentHash: "a".repeat(64),
      notebookPath: "notebooks/calibration.ipynb",
      projectId: "project-1",
    };
    const first = scanNotebookDocument(document, options);
    const second = scanNotebookDocument(document, options);
    const changed = scanNotebookDocument(
      {
        ...document,
        cells: document.cells.map((cell, index) =>
          index === 1
            ? { ...cell, source: [...cell.source, "# changed\n"] }
            : cell,
        ),
      },
      { ...options, contentHash: "b".repeat(64) },
    );

    expect(second).toEqual(first);
    expect(
      changed.objects
        .filter((object) => ["notebook", "notebook-cell"].includes(object.type))
        .map((object) => object.id),
    ).toEqual(
      first.objects
        .filter((object) => ["notebook", "notebook-cell"].includes(object.type))
        .map((object) => object.id),
    );
    expect(first.objects.map((object) => object.type)).toEqual(
      expect.arrayContaining([
        "notebook",
        "notebook-cell",
        "notebook-output",
        "dependency",
        "dataset",
        "metric",
        "figure",
        "table",
        "risk",
        "method",
        "experiment",
        "run",
        "objective",
        "claim",
      ]),
    );
    expect(first.summary.executedCells).toBe(false);
    expect(
      first.objects.find((object) => object.type === "notebook-cell")?.payload,
    ).toEqual(expect.objectContaining({ sourcePreview: expect.any(String) }));
    expect(
      first.objects.find(
        (object) =>
          object.type === "notebook-output" && object.payload.error !== null,
      )?.payload.error,
    ).toEqual(
      expect.objectContaining({
        name: "NameError",
        value: "evaluate_model is not defined",
        tracebackHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(first.summary.risks.map((risk) => risk.rule)).toEqual(
      expect.arrayContaining([
        "out-of-order-execution",
        "stale-output",
        "hidden-state",
        "unseeded-randomness",
        "hard-coded-path",
        "missing-dependency",
        "code-output-mismatch",
        "large-embedded-output",
        "execution-error",
      ]),
    );
    expect(first.relationships.length).toBeGreaterThan(0);
    expect(first.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          origin: "inferred",
          verificationState: "unverified",
          evidence: [
            expect.objectContaining({
              path: "notebooks/calibration.ipynb",
              locator: expect.stringContaining("cell"),
              contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
            }),
          ],
        }),
      ]),
    );
  });

  it("imports idempotently without executing cell content and rejects path escapes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "cly-notebook-project-"));
    const outside = await mkdtemp(path.join(tmpdir(), "cly-notebook-outside-"));
    directories.push(root, outside);
    await mkdir(path.join(root, "notebooks"));
    const notebookPath = path.join(root, "notebooks", "calibration.ipynb");
    const sentinel = path.join(root, "cell-was-executed");
    const notebook = riskyNotebook();
    notebook.cells[1].source = notebook.cells[1].source.map((line: string) =>
      line.replace("/tmp/cly-cell-executed", sentinel),
    );
    await writeFile(notebookPath, JSON.stringify(notebook));
    const outsideNotebook = path.join(outside, "outside.ipynb");
    await writeFile(outsideNotebook, JSON.stringify(riskyNotebook()));
    await symlink(
      outsideNotebook,
      path.join(root, "notebooks", "escape.ipynb"),
    );

    const database = getStateDatabase(path.join(root, "cly-test.sqlite"));
    const repository = createResearchRepository(database, {
      clock: () => "2026-07-19T12:00:00.000Z",
    });
    repository.upsertProject({
      id: "project-1",
      name: "Notebook project",
      path: await realpath(root),
      metadata: {},
    });
    const importer = createNotebookImporter(repository);
    const first = await importer.importNotebook(
      "project-1",
      "notebooks/calibration.ipynb",
    );
    const second = await importer.importNotebook(
      "project-1",
      "./notebooks/calibration.ipynb",
    );

    expect(first.imported.insertedObjects).toBeGreaterThan(0);
    expect(first.imported.insertedRelationships).toBeGreaterThan(0);
    expect(second.imported).toMatchObject({
      insertedObjects: 0,
      updatedObjects: 0,
      insertedRelationships: 0,
      updatedRelationships: 0,
      unchangedObjects: first.objectCount,
      unchangedRelationships: first.relationshipCount,
    });
    expect(second.imported.objectIds).toEqual(first.imported.objectIds);
    expect(second.imported.relationshipIds).toEqual(
      first.imported.relationshipIds,
    );
    await expect(access(sentinel)).rejects.toThrow();
    expect(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM research_relationships WHERE evidence <> '[]' AND verification_state = 'unverified'",
        )
        .get(),
    ).toEqual({ count: first.relationshipCount });
    expect(() =>
      database
        .prepare(
          "UPDATE research_relationships SET evidence = '{}' WHERE id = ?",
        )
        .run(first.imported.relationshipIds[0]),
    ).toThrow("Invalid research relationship evidence or verification state");
    expect(
      database
        .prepare(
          "SELECT metadata FROM provenance_events WHERE action = 'notebook.import.completed' ORDER BY sequence DESC LIMIT 1",
        )
        .get(),
    ).toEqual(
      expect.objectContaining({
        metadata: expect.stringContaining('"executedCells":false'),
      }),
    );
    await expect(
      importer.importNotebook("project-1", "notebooks/escape.ipynb"),
    ).rejects.toThrow("outside the registered project");
    await expect(
      importer.importNotebook("project-1", "../outside.ipynb"),
    ).rejects.toThrow("project-relative");
  });
});

describe("notebook import route", () => {
  it("validates requests and returns the static import result", async () => {
    const importNotebook = vi.fn().mockResolvedValue({
      notebookId: "notebook-1",
      executedCells: false,
    });
    const app = new Hono();
    registerNotebookRoutes(app, {
      getImporter: () => ({ importNotebook }),
    });
    const valid = await app.request(
      "/api/projects/project-1/notebooks/import",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: "notebooks/analysis.ipynb" }),
      },
    );
    const invalid = await app.request(
      "/api/projects/project-1/notebooks/import",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          path: "notebooks/analysis.ipynb",
          execute: true,
        }),
      },
    );

    expect(valid.status).toBe(201);
    expect(await valid.json()).toEqual({
      notebookId: "notebook-1",
      executedCells: false,
    });
    expect(importNotebook).toHaveBeenCalledWith(
      "project-1",
      "notebooks/analysis.ipynb",
    );
    expect(invalid.status).toBe(400);
  });
});
