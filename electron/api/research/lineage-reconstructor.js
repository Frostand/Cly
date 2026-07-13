import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, opendir, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

const execFileAsync = promisify(execFile);
const PROJECT_ID_SCHEMA = z.string().trim().min(1).max(500);
const DEFAULT_MAX_FILES = 500;
const DEFAULT_MAX_DIRECTORIES = 256;
const DEFAULT_MAX_ENTRIES = 5_000;
const DEFAULT_MAX_DEPTH = 32;
const DEFAULT_MAX_FILE_BYTES = 1024 * 1024;
const DEFAULT_MAX_TOTAL_READ_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_GIT_OUTPUT_BYTES = 512 * 1024;
const DEFAULT_MAX_GIT_COMMITS = 120;
const DEFAULT_GIT_TIMEOUT_MS = 5_000;
const DEFAULT_SCAN_TIMEOUT_MS = 10_000;
const CONTROL_COMMAND_OUTPUT_BYTES = 64 * 1024;
const NULL_DEVICE = process.platform === "win32" ? "NUL" : "/dev/null";
const NO_FOLLOW_FLAG = constants.O_NOFOLLOW ?? 0;
const TEXT_EXTENSIONS = new Set([
  ".json",
  ".md",
  ".rst",
  ".tex",
  ".toml",
  ".yaml",
  ".yml",
  ".txt",
]);
const NOTEBOOK_EXTENSION = ".ipynb";
const ENVIRONMENT_NAMES = new Set([
  ".env",
  ".env.example",
  "package-lock.json",
  "pnpm-lock.yaml",
  "poetry.lock",
  "requirements.txt",
  "environment.yml",
  "environment.yaml",
  "conda-lock.yml",
  "dockerfile",
]);
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
]);
const CITATION_PATTERN = /\[@?[^\]]+\]|\bdoi:\s*10\.\d{4,9}\/[\w.()/:;-]+/i;

const gitEnvironment = () => {
  const environment = {
    GIT_CONFIG_GLOBAL: NULL_DEVICE,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_PAGER: "cat",
    GIT_TERMINAL_PROMPT: "0",
    LANG: "C",
    LC_ALL: "C",
    PATH: process.env.PATH,
  };
  if (process.platform === "win32") {
    environment.SystemRoot = process.env.SystemRoot;
  }
  return environment;
};

const fixedGitArguments = (operationArguments) => [
  "--no-optional-locks",
  "-c",
  `core.hooksPath=${NULL_DEVICE}`,
  "-c",
  "core.fsmonitor=false",
  "-c",
  "core.pager=cat",
  "-c",
  "credential.helper=",
  "-c",
  "diff.external=",
  ...operationArguments,
];

async function runGit(
  root,
  operationArguments,
  maxBuffer,
  {
    allowFailure = false,
    executor = execFileAsync,
    timeoutMs = DEFAULT_GIT_TIMEOUT_MS,
  } = {},
) {
  try {
    const { stdout } = await executor(
      "git",
      fixedGitArguments(operationArguments),
      {
        cwd: root,
        encoding: "utf8",
        env: gitEnvironment(),
        killSignal: "SIGKILL",
        maxBuffer,
        timeout: timeoutMs,
        windowsHide: true,
      },
    );
    return stdout;
  } catch (error) {
    if (
      error?.killed ||
      error?.code === "ETIMEDOUT" ||
      (error?.signal === "SIGKILL" && String(error?.message).includes("timed"))
    ) {
      throw new Error("Lineage reconstruction Git command timed out.");
    }
    if (
      error?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" ||
      String(error?.message).includes("maxBuffer")
    ) {
      throw new Error("Lineage reconstruction exceeded its Git history limit.");
    }
    if (allowFailure) return null;
    throw new Error("Registered project is not an observable Git repository.");
  }
}

const hash = (value) => createHash("sha256").update(value).digest("hex");
const samePath = (left, right) =>
  process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;

function safeRelative(root, candidate) {
  const relative = path.relative(root, candidate);
  if (!relative || relative === ".") return "";
  if (path.isAbsolute(relative) || relative.split(path.sep).includes("..")) {
    return null;
  }
  return relative.split(path.sep).join("/");
}

function normalizeReference(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replaceAll("\\", "/").replace(/^\.\//, "");
  if (
    !normalized ||
    normalized.length > 4_000 ||
    path.posix.isAbsolute(normalized) ||
    path.win32.isAbsolute(normalized) ||
    normalized.split("/").includes("..")
  ) {
    return null;
  }
  return normalized;
}

async function collectProjectFiles(root, config, assertWithinTime) {
  const files = [];
  let directoryCount = 0;
  let entryCount = 0;

  const visit = async (directory, depth) => {
    assertWithinTime();
    if (depth > config.maxDepth) {
      throw new Error(
        "Lineage reconstruction exceeded its directory depth limit.",
      );
    }
    directoryCount += 1;
    if (directoryCount > config.maxDirectories) {
      throw new Error("Lineage reconstruction exceeded its directory limit.");
    }
    const canonicalDirectory = await realpath(directory);
    const relativeDirectory = safeRelative(root, canonicalDirectory);
    if (relativeDirectory === null) {
      throw new Error(
        "Lineage reconstruction encountered a directory outside the project.",
      );
    }
    const handle = await opendir(canonicalDirectory);
    const entries = [];
    try {
      for await (const entry of handle) {
        assertWithinTime();
        entryCount += 1;
        if (entryCount > config.maxEntries) {
          throw new Error("Lineage reconstruction exceeded its entry limit.");
        }
        entries.push(entry);
      }
    } finally {
      await handle.close().catch(() => {});
    }
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      assertWithinTime();
      if (entry.isSymbolicLink()) continue;
      const absolutePath = path.join(canonicalDirectory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) {
          await visit(absolutePath, depth + 1);
        }
        continue;
      }
      if (!entry.isFile()) continue;
      if (files.length >= config.maxFiles) {
        throw new Error("Lineage reconstruction exceeded its file limit.");
      }
      const relativePath = safeRelative(root, absolutePath);
      if (!relativePath) continue;
      const descriptor = await open(
        absolutePath,
        constants.O_RDONLY | NO_FOLLOW_FLAG,
      ).catch(() => null);
      if (!descriptor) continue;
      try {
        const fileStat = await descriptor.stat();
        if (!fileStat.isFile()) continue;
        files.push({
          absolutePath,
          byteLength: fileStat.size,
          dev: fileStat.dev,
          ino: fileStat.ino,
          mtimeMs: Math.trunc(fileStat.mtimeMs),
          path: relativePath,
        });
      } finally {
        await descriptor.close();
      }
    }
  };

  await visit(root, 0);
  return { directoryCount, entryCount, files };
}

async function openStableDescriptor(file, beforeFileRead) {
  await beforeFileRead?.(file.absolutePath);
  const descriptor = await open(
    file.absolutePath,
    constants.O_RDONLY | NO_FOLLOW_FLAG,
  ).catch(() => null);
  if (!descriptor) return null;
  const fileStat = await descriptor.stat();
  if (
    !fileStat.isFile() ||
    fileStat.dev !== file.dev ||
    fileStat.ino !== file.ino
  ) {
    await descriptor.close();
    return null;
  }
  return { descriptor, fileStat };
}

async function readBoundedText(
  file,
  { beforeFileRead, maxFileBytes, remainingReadBytes },
) {
  const extension = path.extname(file.path).toLowerCase();
  if (!TEXT_EXTENSIONS.has(extension) && extension !== NOTEBOOK_EXTENSION) {
    return null;
  }
  const opened = await openStableDescriptor(file, beforeFileRead);
  if (!opened) return null;
  const { descriptor, fileStat } = opened;
  const hardCap = Math.min(maxFileBytes, remainingReadBytes);
  try {
    if (hardCap < 1 || fileStat.size > hardCap) return null;
    const buffer = Buffer.alloc(hardCap + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await descriptor.read(
        buffer,
        offset,
        buffer.length - offset,
        offset,
      );
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset > hardCap) return { bytesRead: offset, text: null };
    return {
      bytesRead: offset,
      text: buffer.subarray(0, offset).toString("utf8"),
    };
  } finally {
    await descriptor.close();
  }
}

async function verifyDiscoveredFile(file, beforeFileRead) {
  const opened = await openStableDescriptor(file, beforeFileRead);
  if (!opened) return false;
  await opened.descriptor.close();
  return opened.fileStat.size === file.byteLength;
}

function pathHasSegment(filePath, segments) {
  const pathSegments = filePath.toLowerCase().split("/");
  return pathSegments.some((segment) => segments.has(segment));
}

function fileCoordinates(file) {
  return {
    byteLength: file.byteLength,
    mtimeMs: file.mtimeMs,
    lineEnd: 1,
    lineStart: 1,
  };
}

function makeEvidence({ evidenceType, file, coordinates, excerpt = null }) {
  const entry = {
    evidenceType,
    path: file?.path ?? null,
    coordinates,
    excerpt,
  };
  return { ...entry, contentHash: hash(JSON.stringify(entry)) };
}

function validateGitPath(value) {
  return normalizeReference(value);
}

function parseCommits(output) {
  if (!output) return [];
  const commits = [];
  for (const record of output.split("\u001e")) {
    const lines = record.trim().split(/\r?\n/).filter(Boolean);
    const header = lines.shift();
    if (!header) continue;
    const [sha, committedAt, subject] = header.split("\u001f");
    if (!/^[a-f0-9]{40}$/i.test(sha ?? "") || !committedAt || !subject) {
      continue;
    }
    const paths = lines.map(validateGitPath).filter(Boolean);
    commits.push({ committedAt, paths, sha, subject });
  }
  return commits;
}

function lineReferencing(text, reference, { citation = false } = {}) {
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (
      line.includes(reference) &&
      (!citation || CITATION_PATTERN.test(line))
    ) {
      return { line: index + 1, text: line.trim().slice(0, 1_000) };
    }
  }
  return null;
}

function configuredObjective(project, declaredObjective) {
  const value =
    typeof project.metadata?.question === "string" &&
    project.metadata.question.trim()
      ? project.metadata.question.trim()
      : typeof project.metadata?.hypothesis === "string" &&
          project.metadata.hypothesis.trim()
        ? project.metadata.hypothesis.trim()
        : declaredObjective;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function createLineageReconstructor(repository, options = {}) {
  const config = {
    gitTimeoutMs: options.gitTimeoutMs ?? DEFAULT_GIT_TIMEOUT_MS,
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    maxDirectories: options.maxDirectories ?? DEFAULT_MAX_DIRECTORIES,
    maxEntries: options.maxEntries ?? DEFAULT_MAX_ENTRIES,
    maxFileBytes: options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
    maxFiles: options.maxFiles ?? DEFAULT_MAX_FILES,
    maxGitCommits: options.maxGitCommits ?? DEFAULT_MAX_GIT_COMMITS,
    maxGitOutputBytes:
      options.maxGitOutputBytes ?? DEFAULT_MAX_GIT_OUTPUT_BYTES,
    maxScanDurationMs: options.maxScanDurationMs ?? DEFAULT_SCAN_TIMEOUT_MS,
    maxTotalReadBytes:
      options.maxTotalReadBytes ?? DEFAULT_MAX_TOTAL_READ_BYTES,
  };
  for (const [key, value] of Object.entries(config)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`Lineage reconstruction ${key} must be positive.`);
    }
  }
  const now = options.now ?? Date.now;
  const gitExecutor = options.gitExecutor ?? execFileAsync;
  const beforeFileRead = options.beforeFileRead;

  return {
    async scanLineage(projectIdInput) {
      const startedAt = now();
      const assertWithinTime = () => {
        if (now() - startedAt > config.maxScanDurationMs) {
          throw new Error("Lineage reconstruction exceeded its time limit.");
        }
      };
      const projectId = PROJECT_ID_SCHEMA.parse(projectIdInput);
      const project = repository.getProject(projectId);
      const configuredRoot = path.resolve(project.path);
      const canonicalRoot = await realpath(configuredRoot);
      if (!samePath(configuredRoot, canonicalRoot)) {
        throw new Error("The registered project path is not canonical.");
      }
      assertWithinTime();
      const reportedGitRoot = (
        await runGit(
          canonicalRoot,
          ["rev-parse", "--show-toplevel"],
          CONTROL_COMMAND_OUTPUT_BYTES,
          {
            executor: gitExecutor,
            timeoutMs: config.gitTimeoutMs,
          },
        )
      ).trim();
      const canonicalGitRoot = await realpath(reportedGitRoot);
      if (!samePath(canonicalRoot, canonicalGitRoot)) {
        throw new Error(
          "The registered project root must be the Git repository root.",
        );
      }
      assertWithinTime();

      const inventory = await collectProjectFiles(
        canonicalRoot,
        config,
        assertWithinTime,
      );
      const rawCommits = await runGit(
        canonicalRoot,
        [
          "log",
          `--max-count=${config.maxGitCommits}`,
          "--format=%x1e%H%x1f%cI%x1f%s",
          "--name-only",
          "--no-renames",
        ],
        config.maxGitOutputBytes,
        {
          allowFailure: true,
          executor: gitExecutor,
          timeoutMs: config.gitTimeoutMs,
        },
      );
      assertWithinTime();
      const commits = parseCommits(rawCommits);
      const files = inventory.files.sort((left, right) =>
        left.path.localeCompare(right.path, "en"),
      );
      const filesByPath = new Map(files.map((file) => [file.path, file]));
      let remainingReadBytes = config.maxTotalReadBytes;
      const textCache = new Map();
      const readText = async (file) => {
        if (textCache.has(file.path)) return textCache.get(file.path);
        assertWithinTime();
        const result = await readBoundedText(file, {
          beforeFileRead,
          maxFileBytes: config.maxFileBytes,
          remainingReadBytes,
        });
        remainingReadBytes -= result?.bytesRead ?? 0;
        const text = result?.text ?? null;
        textCache.set(file.path, text);
        return text;
      };

      const notebooks = [];
      for (const file of files.filter((item) =>
        item.path.toLowerCase().endsWith(NOTEBOOK_EXTENSION),
      )) {
        const text = await readText(file);
        if (!text) continue;
        try {
          const notebook = JSON.parse(text);
          const cly = notebook?.metadata?.cly;
          const declaredObjective =
            typeof cly?.objective === "string" ? cly.objective.trim() : "";
          const experimentPath = normalizeReference(cly?.experiment);
          const objective = configuredObjective(project, declaredObjective);
          if (
            !objective ||
            objective !== declaredObjective ||
            !experimentPath
          ) {
            continue;
          }
          const title =
            typeof notebook?.metadata?.title === "string"
              ? notebook.metadata.title.trim()
              : "";
          notebooks.push({
            experimentPath,
            file,
            objective,
            title: title || path.posix.basename(file.path, NOTEBOOK_EXTENSION),
          });
        } catch {
          // Malformed notebooks are excluded after one bounded descriptor read.
        }
      }

      const experiments = new Map();
      for (const file of files.filter(
        (item) =>
          pathHasSegment(
            item.path,
            new Set(["experiment", "experiments", "config", "configs"]),
          ) &&
          [".json", ".toml", ".yaml", ".yml"].includes(
            path.extname(item.path).toLowerCase(),
          ),
      )) {
        const text = await readText(file);
        if (text) experiments.set(file.path, { file, text });
      }

      const reports = [];
      for (const file of files.filter((item) =>
        pathHasSegment(
          item.path,
          new Set(["report", "reports", "paper", "manuscript"]),
        ),
      )) {
        const text = await readText(file);
        if (text) reports.push({ file, text });
      }

      const artifacts = files.filter((file) =>
        pathHasSegment(
          file.path,
          new Set([
            "output",
            "outputs",
            "figure",
            "figures",
            "table",
            "tables",
          ]),
        ),
      );
      const environmentEvidence = [];
      for (const file of files.filter((item) =>
        ENVIRONMENT_NAMES.has(path.posix.basename(item.path).toLowerCase()),
      )) {
        const text = await readText(file);
        if (text !== null) {
          environmentEvidence.push(
            makeEvidence({
              evidenceType: "environment-capture",
              file,
              coordinates: {
                ...fileCoordinates(file),
                sha256: hash(text),
              },
            }),
          );
        }
      }

      const proposals = [];
      let timeToFirstChainMs = null;
      for (const notebook of notebooks) {
        const experiment = experiments.get(notebook.experimentPath);
        if (!experiment) continue;
        const notebookConfigLink = lineReferencing(
          experiment.text,
          notebook.file.path,
        );
        if (!notebookConfigLink) continue;
        const commit = commits.find(
          (item) =>
            item.paths.includes(notebook.file.path) &&
            item.paths.includes(experiment.file.path),
        );
        if (!commit) continue;
        for (const artifact of artifacts) {
          const artifactLink = lineReferencing(experiment.text, artifact.path);
          if (!artifactLink) continue;
          if (!(await verifyDiscoveredFile(artifact, beforeFileRead))) continue;
          for (const report of reports) {
            const claimLink = lineReferencing(report.text, artifact.path, {
              citation: true,
            });
            if (!claimLink) continue;
            const chain = [
              {
                kind: "objective",
                id: `objective:${hash(notebook.objective).slice(0, 16)}`,
                label: notebook.objective,
                coordinates: { source: "project.metadata-or-notebook" },
              },
              {
                kind: "notebook",
                id: `file:${notebook.file.path}`,
                label: notebook.title,
                coordinates: fileCoordinates(notebook.file),
              },
              {
                kind: "commit",
                id: `git:${commit.sha}`,
                label: commit.subject,
                coordinates: {
                  committedAt: commit.committedAt,
                  sha: commit.sha,
                },
              },
              {
                kind: "experiment",
                id: `file:${experiment.file.path}`,
                label: experiment.file.path,
                coordinates: fileCoordinates(experiment.file),
              },
              {
                kind: "artifact",
                id: `file:${artifact.path}`,
                label: artifact.path,
                coordinates: fileCoordinates(artifact),
              },
              {
                kind: "claim",
                id: `report:${report.file.path}:${claimLink.line}`,
                label: claimLink.text,
                coordinates: {
                  lineEnd: claimLink.line,
                  lineStart: claimLink.line,
                },
              },
            ];
            const evidence = [
              makeEvidence({
                evidenceType: "objective-notebook-link",
                file: notebook.file,
                coordinates: {
                  jsonPointer: "/metadata/cly/objective",
                  lineEnd: 1,
                  lineStart: 1,
                  valueHash: hash(notebook.objective),
                },
                excerpt: notebook.objective,
              }),
              makeEvidence({
                evidenceType: "notebook-commit-link",
                file: notebook.file,
                coordinates: {
                  committedAt: commit.committedAt,
                  sha: commit.sha,
                },
                excerpt: commit.subject,
              }),
              makeEvidence({
                evidenceType: "commit-experiment-link",
                file: experiment.file,
                coordinates: {
                  committedAt: commit.committedAt,
                  sha: commit.sha,
                },
                excerpt: notebookConfigLink.text,
              }),
              makeEvidence({
                evidenceType: "experiment-artifact-link",
                file: experiment.file,
                coordinates: {
                  lineEnd: artifactLink.line,
                  lineStart: artifactLink.line,
                },
                excerpt: artifactLink.text,
              }),
              makeEvidence({
                evidenceType: "artifact-claim-link",
                file: report.file,
                coordinates: {
                  artifactMtimeMs: artifact.mtimeMs,
                  lineEnd: claimLink.line,
                  lineStart: claimLink.line,
                },
                excerpt: claimLink.text,
              }),
              ...environmentEvidence,
            ];
            const logicalKey = hash(
              JSON.stringify({
                artifact: artifact.path,
                experiment: experiment.file.path,
                notebook: notebook.file.path,
                objective: hash(notebook.objective),
                report: report.file.path,
              }),
            );
            const fingerprint = hash(
              JSON.stringify({
                evidence: evidence
                  .map((item) => item.contentHash)
                  .sort((left, right) => left.localeCompare(right, "en")),
                nodes: chain.map(({ id, label }) => ({ id, label })),
              }),
            );
            proposals.push({
              chain,
              confidence: 0.9,
              evidence,
              fingerprint,
              logicalKey,
              rationale:
                "A deterministic, bounded scan found explicit linkage evidence for every objective-to-claim edge.",
            });
            if (timeToFirstChainMs === null) {
              timeToFirstChainMs = now() - startedAt;
            }
          }
        }
      }
      proposals.sort((left, right) =>
        left.logicalKey.localeCompare(right.logicalKey, "en"),
      );
      assertWithinTime();
      const suggestions = repository.upsertLineageSuggestions(
        projectId,
        proposals,
      );
      const scanDurationMs = now() - startedAt;
      const measurement = repository.recordLineageScanMeasurement(projectId, {
        manualConfig: {
          gitTimeoutMs: config.gitTimeoutMs,
          maxDepth: config.maxDepth,
          maxDirectories: config.maxDirectories,
          maxEntries: config.maxEntries,
          maxFileBytes: config.maxFileBytes,
          maxFiles: config.maxFiles,
          maxGitCommits: config.maxGitCommits,
          maxGitOutputBytes: config.maxGitOutputBytes,
          maxScanDurationMs: config.maxScanDurationMs,
          maxTotalReadBytes: config.maxTotalReadBytes,
          observedDirectoryCount: inventory.directoryCount,
          observedEntryCount: inventory.entryCount,
          observedEnvironmentFiles: environmentEvidence
            .map((item) => item.path)
            .filter(Boolean),
          observedFileCount: filesByPath.size,
        },
        scanDurationMs,
        suggestionCount: suggestions.length,
        timeToFirstChainMs,
      });
      return { measurement, projectId, suggestions };
    },

    reviewLineageSuggestions(projectIdInput, decisions, actor) {
      const projectId = PROJECT_ID_SCHEMA.parse(projectIdInput);
      return repository.reviewLineageSuggestions({
        actor,
        decisions,
        projectId,
      });
    },
  };
}
