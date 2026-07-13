import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

const execFileAsync = promisify(execFile);
const PROJECT_ID_SCHEMA = z.string().trim().min(1).max(500);
const DEFAULT_MAX_FILES = 500;
const DEFAULT_MAX_FILE_BYTES = 1024 * 1024;
const DEFAULT_MAX_TOTAL_READ_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_GIT_OUTPUT_BYTES = 512 * 1024;
const DEFAULT_MAX_GIT_COMMITS = 120;
const CONTROL_COMMAND_OUTPUT_BYTES = 64 * 1024;
const NULL_DEVICE = process.platform === "win32" ? "NUL" : "/dev/null";
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
  if (process.platform === "win32")
    environment.SystemRoot = process.env.SystemRoot;
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
  { allowFailure = false } = {},
) {
  try {
    const { stdout } = await execFileAsync(
      "git",
      fixedGitArguments(operationArguments),
      {
        cwd: root,
        encoding: "utf8",
        env: gitEnvironment(),
        maxBuffer,
        windowsHide: true,
      },
    );
    return stdout;
  } catch (error) {
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

async function collectProjectFiles(root, { maxFiles }) {
  const files = [];
  const visit = async (directory) => {
    if (files.length >= maxFiles) return;
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      if (files.length >= maxFiles) return;
      if (entry.isSymbolicLink()) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) await visit(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const canonicalPath = await realpath(absolutePath);
      const relativePath = safeRelative(root, canonicalPath);
      if (!relativePath) continue;
      const fileStat = await stat(canonicalPath);
      files.push({
        absolutePath: canonicalPath,
        byteLength: fileStat.size,
        mtimeMs: Math.trunc(fileStat.mtimeMs),
        path: relativePath,
      });
    }
  };
  await visit(root);
  return files;
}

async function readBoundedText(file, maxFileBytes, remainingReadBytes) {
  if (file.byteLength > maxFileBytes || file.byteLength > remainingReadBytes)
    return null;
  const extension = path.extname(file.path).toLowerCase();
  if (!TEXT_EXTENSIONS.has(extension) && extension !== NOTEBOOK_EXTENSION)
    return null;
  return readFile(file.absolutePath, "utf8");
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

function parseCommits(output) {
  if (!output) return [];
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, committedAt, subject] = line.split("\u001f");
      if (!/^[a-f0-9]{40}$/i.test(sha ?? "") || !committedAt || !subject)
        return null;
      return { committedAt, sha, subject };
    })
    .filter(Boolean)
    .sort((left, right) => left.sha.localeCompare(right.sha));
}

function reportCitation(text) {
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const citation = line.match(
      /\[@?[^\]]+\]|\bdoi:\s*10\.\d{4,9}\/[\w.()/:;-]+/i,
    );
    if (citation)
      return {
        citation: citation[0],
        line: index + 1,
        text: line.trim().slice(0, 500),
      };
  }
  return null;
}

/**
 * Builds bounded, project-local proposals. It deliberately creates no graph
 * records and never changes a proposal's review state; reviewers own that
 * transition through reviewLineageSuggestions.
 */
export function createLineageReconstructor(repository, options = {}) {
  const config = {
    maxFileBytes: options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
    maxTotalReadBytes:
      options.maxTotalReadBytes ?? DEFAULT_MAX_TOTAL_READ_BYTES,
    maxFiles: options.maxFiles ?? DEFAULT_MAX_FILES,
    maxGitCommits: options.maxGitCommits ?? DEFAULT_MAX_GIT_COMMITS,
    maxGitOutputBytes:
      options.maxGitOutputBytes ?? DEFAULT_MAX_GIT_OUTPUT_BYTES,
  };
  for (const [key, value] of Object.entries(config)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`Lineage reconstruction ${key} must be positive.`);
    }
  }

  return {
    async scanLineage(projectIdInput) {
      const startedAt = Date.now();
      const projectId = PROJECT_ID_SCHEMA.parse(projectIdInput);
      const project = repository.getProject(projectId);
      const configuredRoot = path.resolve(project.path);
      const canonicalRoot = await realpath(configuredRoot);
      if (!samePath(configuredRoot, canonicalRoot)) {
        throw new Error("The registered project path is not canonical.");
      }
      const reportedGitRoot = (
        await runGit(
          canonicalRoot,
          ["rev-parse", "--show-toplevel"],
          CONTROL_COMMAND_OUTPUT_BYTES,
        )
      ).trim();
      const canonicalGitRoot = await realpath(reportedGitRoot);
      if (!samePath(canonicalRoot, canonicalGitRoot)) {
        throw new Error(
          "The registered project root must be the Git repository root.",
        );
      }

      const [files, rawCommits] = await Promise.all([
        collectProjectFiles(canonicalRoot, config),
        runGit(
          canonicalRoot,
          [
            "log",
            `--max-count=${config.maxGitCommits}`,
            "--format=%H%x1f%cI%x1f%s",
          ],
          config.maxGitOutputBytes,
          { allowFailure: true },
        ),
      ]);
      const filesByPath = new Map(files.map((file) => [file.path, file]));
      const notebooks = [];
      const reports = [];
      let remainingReadBytes = config.maxTotalReadBytes;
      for (const file of files) {
        const lowerPath = file.path.toLowerCase();
        if (lowerPath.endsWith(NOTEBOOK_EXTENSION)) {
          const text = await readBoundedText(
            file,
            config.maxFileBytes,
            remainingReadBytes,
          );
          if (!text) continue;
          remainingReadBytes -= file.byteLength;
          try {
            const notebook = JSON.parse(text);
            const title =
              typeof notebook?.metadata?.title === "string"
                ? notebook.metadata.title.trim()
                : "";
            notebooks.push({
              file,
              title:
                title || path.posix.basename(file.path, NOTEBOOK_EXTENSION),
            });
          } catch {
            // A malformed notebook is not evidence and is never retried unbounded.
          }
        }
        if (
          pathHasSegment(
            file.path,
            new Set(["report", "reports", "paper", "manuscript"]),
          )
        ) {
          const text = await readBoundedText(
            file,
            config.maxFileBytes,
            remainingReadBytes,
          );
          if (!text) continue;
          remainingReadBytes -= file.byteLength;
          const citation = reportCitation(text);
          if (citation) reports.push({ citation, file });
        }
      }
      notebooks.sort((left, right) =>
        left.file.path.localeCompare(right.file.path, "en"),
      );
      reports.sort((left, right) =>
        left.file.path.localeCompare(right.file.path, "en"),
      );
      const experiments = files
        .filter(
          (file) =>
            pathHasSegment(
              file.path,
              new Set(["experiment", "experiments", "config", "configs"]),
            ) &&
            [".json", ".toml", ".yaml", ".yml"].includes(
              path.extname(file.path).toLowerCase(),
            ),
        )
        .sort((left, right) => left.path.localeCompare(right.path, "en"));
      const artifacts = files
        .filter((file) =>
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
        )
        .sort((left, right) => left.path.localeCompare(right.path, "en"));
      const environmentFiles = files
        .filter((file) =>
          ENVIRONMENT_NAMES.has(path.posix.basename(file.path).toLowerCase()),
        )
        .sort((left, right) => left.path.localeCompare(right.path, "en"));
      const commits = parseCommits(rawCommits);
      const notebook = notebooks[0];
      const commit = commits[0];
      const experiment = experiments[0];
      const artifact = artifacts[0];
      const report = reports[0];
      const proposals = [];
      let timeToFirstChainMs = null;
      if (notebook && commit && experiment && artifact && report) {
        const objective =
          typeof project.metadata?.question === "string" &&
          project.metadata.question.trim()
            ? project.metadata.question.trim()
            : typeof project.metadata?.hypothesis === "string" &&
                project.metadata.hypothesis.trim()
              ? project.metadata.hypothesis.trim()
              : project.name;
        const chain = [
          {
            kind: "objective",
            id: `objective:${hash(objective).slice(0, 16)}`,
            label: objective,
            coordinates: { source: "project.metadata" },
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
            coordinates: { committedAt: commit.committedAt, sha: commit.sha },
          },
          {
            kind: "experiment",
            id: `file:${experiment.path}`,
            label: experiment.path,
            coordinates: fileCoordinates(experiment),
          },
          {
            kind: "artifact",
            id: `file:${artifact.path}`,
            label: artifact.path,
            coordinates: fileCoordinates(artifact),
          },
          {
            kind: "claim",
            id: `report:${report.file.path}:${report.citation.line}`,
            label: report.citation.text || report.citation.citation,
            coordinates: {
              lineEnd: report.citation.line,
              lineStart: report.citation.line,
            },
          },
        ];
        const evidence = [
          makeEvidence({
            evidenceType: "objective",
            coordinates: {
              source: "project.metadata",
              valueHash: hash(objective),
            },
          }),
          makeEvidence({
            evidenceType: "notebook",
            file: notebook.file,
            coordinates: fileCoordinates(notebook.file),
            excerpt: notebook.title,
          }),
          makeEvidence({
            evidenceType: "git-commit",
            coordinates: { committedAt: commit.committedAt, sha: commit.sha },
            excerpt: commit.subject,
          }),
          makeEvidence({
            evidenceType: "experiment-config",
            file: experiment,
            coordinates: fileCoordinates(experiment),
          }),
          makeEvidence({
            evidenceType: "artifact",
            file: artifact,
            coordinates: fileCoordinates(artifact),
          }),
          makeEvidence({
            evidenceType: "report-citation",
            file: report.file,
            coordinates: {
              lineEnd: report.citation.line,
              lineStart: report.citation.line,
            },
            excerpt: report.citation.citation,
          }),
          ...environmentFiles.map((file) =>
            makeEvidence({
              evidenceType: "environment",
              file,
              coordinates: fileCoordinates(file),
            }),
          ),
        ];
        const fingerprint = hash(
          JSON.stringify({
            chain,
            evidence: evidence.map((item) => item.contentHash).sort(),
          }),
        );
        proposals.push({
          chain,
          confidence: 0.78,
          evidence,
          fingerprint,
          rationale:
            "A deterministic, bounded project-local scan found a notebook, Git commit, experiment configuration, output artifact, and cited report claim.",
        });
        timeToFirstChainMs = Date.now() - startedAt;
      }

      const suggestions = repository.upsertLineageSuggestions(
        projectId,
        proposals,
      );
      const scanDurationMs = Date.now() - startedAt;
      const measurement = repository.recordLineageScanMeasurement(projectId, {
        manualConfig: {
          maxFileBytes: config.maxFileBytes,
          maxTotalReadBytes: config.maxTotalReadBytes,
          maxFiles: config.maxFiles,
          maxGitCommits: config.maxGitCommits,
          maxGitOutputBytes: config.maxGitOutputBytes,
          observedEnvironmentFiles: environmentFiles.map((file) => file.path),
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
