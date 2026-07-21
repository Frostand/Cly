import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { scanNotebookDocument } from "./notebook-scanner.js";

const MAX_NOTEBOOK_BYTES = 8 * 1024 * 1024;
const PROJECT_ID_SCHEMA = z.string().trim().min(1).max(500);
const NOTEBOOK_PATH_SCHEMA = z
  .string()
  .trim()
  .min(1)
  .max(4_000)
  .refine((value) => value.toLowerCase().endsWith(".ipynb"), {
    message: "Notebook path must end in .ipynb.",
  });

const samePath = (left, right) =>
  process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;

const isInside = (root, target) => {
  const relative = path.relative(root, target);
  return (
    relative !== "" &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
};

const validateRelativeNotebookPath = (value) => {
  const rawPath = NOTEBOOK_PATH_SCHEMA.parse(value).replaceAll("\\", "/");
  const rawSegments = rawPath.split("/");
  const notebookPath = path.posix.normalize(rawPath);
  if (
    path.posix.isAbsolute(notebookPath) ||
    path.win32.isAbsolute(notebookPath) ||
    notebookPath.includes("\0") ||
    rawSegments.includes("..") ||
    notebookPath
      .split("/")
      .some((segment) => segment === ".." || segment === "")
  ) {
    throw new Error("Notebook path must be a project-relative file path.");
  }
  return notebookPath;
};

const parseNotebookJson = (contents) => {
  try {
    return JSON.parse(
      contents.charCodeAt(0) === 0xfeff ? contents.slice(1) : contents,
    );
  } catch {
    throw new Error("Notebook is not valid JSON.");
  }
};

export function createNotebookImporter(
  repository,
  { maxNotebookBytes = MAX_NOTEBOOK_BYTES } = {},
) {
  if (!Number.isSafeInteger(maxNotebookBytes) || maxNotebookBytes < 1) {
    throw new Error("Notebook import byte limit must be positive.");
  }

  return {
    async importNotebook(projectIdInput, notebookPathInput) {
      const projectId = PROJECT_ID_SCHEMA.parse(projectIdInput);
      const notebookPath = validateRelativeNotebookPath(notebookPathInput);
      const project = repository.getProject(projectId);
      const configuredRoot = path.resolve(project.path);
      let canonicalRoot;
      try {
        canonicalRoot = await realpath(configuredRoot);
      } catch {
        throw new Error("The registered project path is unavailable.");
      }
      if (!samePath(configuredRoot, canonicalRoot)) {
        throw new Error("The registered project path is not canonical.");
      }

      const requestedPath = path.resolve(
        canonicalRoot,
        ...notebookPath.split("/"),
      );
      let canonicalPath;
      try {
        canonicalPath = await realpath(requestedPath);
      } catch {
        throw new Error("Notebook file is unavailable.");
      }
      if (!isInside(canonicalRoot, canonicalPath)) {
        throw new Error(
          "Notebook path resolves outside the registered project.",
        );
      }

      let handle;
      try {
        try {
          handle = await open(
            canonicalPath,
            fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
          );
        } catch {
          throw new Error("Notebook file could not be opened safely.");
        }
        const stats = await handle.stat();
        if (!stats.isFile())
          throw new Error("Notebook path must identify a regular file.");
        if (stats.size > maxNotebookBytes) {
          throw new Error("Notebook exceeds the static import byte limit.");
        }
        const contents = await handle.readFile({ encoding: "utf8" });
        if (Buffer.byteLength(contents, "utf8") > maxNotebookBytes) {
          throw new Error("Notebook exceeds the static import byte limit.");
        }
        const contentHash = createHash("sha256").update(contents).digest("hex");
        const graph = scanNotebookDocument(parseNotebookJson(contents), {
          contentHash,
          notebookPath,
          projectId,
        });
        const persisted = repository.importNotebookGraph(graph);
        return {
          ...graph.summary,
          contentHash,
          notebookId: graph.notebookId,
          notebookPath,
          projectId,
          scannerVersion: graph.scannerVersion,
          imported: persisted,
        };
      } finally {
        await handle?.close();
      }
    },
  };
}
