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
  "core.quotePath=false",
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
    acceptedExitCodes = [],
    executor = execFileAsync,
    failureMessage = "Registered project is not an observable Git repository.",
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
    if (acceptedExitCodes.includes(error?.code)) return null;
    throw new Error(failureMessage);
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
  let normalized = value.trim().normalize("NFC").replaceAll("\\", "/");
  while (normalized.startsWith("./")) normalized = normalized.slice(2);
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

function structuredScalar(value) {
  let scalar = value.trim();
  let quote = null;
  for (let index = 0; index < scalar.length; index += 1) {
    const character = scalar[index];
    if (
      (character === '"' || character === "'") &&
      scalar[index - 1] !== "\\"
    ) {
      quote = quote === character ? null : (quote ?? character);
    }
    if (
      character === "#" &&
      quote === null &&
      /\s/.test(scalar[index - 1] ?? "")
    ) {
      scalar = scalar.slice(0, index).trimEnd();
      break;
    }
  }
  const first = scalar[0];
  if ((first === '"' || first === "'") && scalar.at(-1) === first) {
    if (first === '"') {
      try {
        return JSON.parse(scalar);
      } catch {
        return null;
      }
    }
    return scalar.slice(1, -1).replaceAll("''", "'");
  }
  return scalar;
}

function structuredValueFragments(
  value,
  assertWithinTime,
  inCollection = false,
) {
  const collection = inCollection || value.trimStart().startsWith("[");
  if (!collection) return [value];
  const fragments = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    assertWithinTime?.();
    const character = value[index];
    if (quote) {
      if (character === quote && value[index - 1] !== "\\") quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "[") {
      depth += 1;
      if (depth === 1) start = index + 1;
      continue;
    }
    if (character === "]") {
      if (depth === 1) {
        fragments.push(value.slice(start, index));
        start = index + 1;
      }
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (character === "," && depth <= 1) {
      const next = value.slice(index + 1).trimStart();
      if (
        depth === 1 &&
        next.startsWith("]") &&
        !value.slice(start, index).trimStart().startsWith('"') &&
        !value.slice(start, index).trimStart().startsWith("'")
      ) {
        continue;
      }
      fragments.push(value.slice(start, index));
      start = index + 1;
    }
  }
  if (start < value.length && depth === 0) fragments.push(value.slice(start));
  return fragments;
}

function structuredCollectionDepthDelta(
  value,
  assertWithinTime,
  inCollection = false,
) {
  if (!inCollection && !value.trimStart().startsWith("[")) return 0;
  let delta = 0;
  let quote = null;
  for (let index = 0; index < value.length; index += 1) {
    assertWithinTime?.();
    const character = value[index];
    if (quote) {
      if (character === quote && value[index - 1] !== "\\") quote = null;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    if (character === "[") delta += 1;
    if (character === "]") delta -= 1;
  }
  return delta;
}

function structuredLineValue(line, inCollection) {
  const sequence = line.match(/^\s*-\s+(.+)$/u);
  if (sequence) return sequence[1];
  let quote = null;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote) {
      if (character === quote && line[index - 1] !== "\\") quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (
      character === "=" ||
      (character === ":" && /\s/u.test(line[index + 1] ?? ""))
    ) {
      return line.slice(index + 1);
    }
  }
  return inCollection ? line.trim() : null;
}

function jsonContainsReference(value, reference, assertWithinTime) {
  assertWithinTime?.();
  if (typeof value === "string") return normalizeReference(value) === reference;
  if (Array.isArray(value)) {
    return value.some((item) =>
      jsonContainsReference(item, reference, assertWithinTime),
    );
  }
  if (value && typeof value === "object") {
    return Object.values(value).some((item) =>
      jsonContainsReference(item, reference, assertWithinTime),
    );
  }
  return false;
}

function structuredValueReferencing(
  text,
  reference,
  { assertWithinTime, beforeReferenceScan } = {},
) {
  const normalizedReference = normalizeReference(reference);
  if (!normalizedReference) return null;
  beforeReferenceScan?.();
  assertWithinTime?.();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // YAML and TOML are parsed as complete scalar values below.
  }
  if (
    json !== null &&
    jsonContainsReference(json, normalizedReference, assertWithinTime)
  ) {
    return { line: 1, text: text.trim().slice(0, 1_000) };
  }
  const lines = text.split(/\r?\n/);
  let collectionDepth = 0;
  for (let index = 0; index < lines.length; index += 1) {
    beforeReferenceScan?.();
    assertWithinTime?.();
    const line = lines[index];
    const value = structuredLineValue(line, collectionDepth > 0);
    if (value !== null) {
      for (const fragment of structuredValueFragments(
        value,
        assertWithinTime,
        collectionDepth > 0,
      )) {
        assertWithinTime?.();
        if (
          normalizeReference(structuredScalar(fragment)) === normalizedReference
        ) {
          return { line: index + 1, text: line.trim().slice(0, 1_000) };
        }
      }
    }
    collectionDepth = Math.max(
      0,
      collectionDepth +
        structuredCollectionDepthDelta(
          value ?? line,
          assertWithinTime,
          collectionDepth > 0,
        ),
    );
  }
  return null;
}

function reportReferenceTokens(line, assertWithinTime) {
  const tokens = [];
  const delimited = /`([^`]+)`|"([^"]+)"|'([^']+)'|<([^>]+)>/gu;
  for (const match of line.matchAll(delimited)) {
    assertWithinTime?.();
    tokens.push(match[1] ?? match[2] ?? match[3] ?? match[4]);
  }
  for (const token of line.matchAll(/\S+/gu)) {
    assertWithinTime?.();
    tokens.push(token[0]);
  }
  return tokens;
}

function reportTokenReference(token, references) {
  const normalizedToken = normalizeReference(token);
  if (normalizedToken && references.has(normalizedToken))
    return normalizedToken;
  let punctuated = token;
  while (/[,:;!?.]$/u.test(punctuated)) {
    punctuated = punctuated.slice(0, -1);
    const normalizedPunctuationFreeToken = normalizeReference(punctuated);
    if (
      normalizedPunctuationFreeToken &&
      references.has(normalizedPunctuationFreeToken)
    ) {
      return normalizedPunctuationFreeToken;
    }
  }
  return null;
}

function reportTokenReferencing(
  text,
  reference,
  { assertWithinTime, beforeReferenceScan, knownReferences = [] } = {},
) {
  const normalizedReference = normalizeReference(reference);
  if (!normalizedReference) return null;
  const knownReferenceSet = new Set(
    [normalizedReference, ...knownReferences]
      .map(normalizeReference)
      .filter(Boolean),
  );
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    beforeReferenceScan?.();
    assertWithinTime?.();
    const line = lines[index];
    if (!CITATION_PATTERN.test(line)) continue;
    const tokens = reportReferenceTokens(line, assertWithinTime);
    if (
      tokens.some(
        (token) =>
          reportTokenReference(token, knownReferenceSet) ===
          normalizedReference,
      )
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
  const beforeReferenceScan = options.beforeReferenceScan;

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
      const historyProbe = await runGit(
        canonicalRoot,
        ["show-ref", "--head", "--verify", "--quiet", "HEAD"],
        CONTROL_COMMAND_OUTPUT_BYTES,
        {
          acceptedExitCodes: [1],
          executor: gitExecutor,
          failureMessage: "Git history could not be observed.",
          timeoutMs: config.gitTimeoutMs,
        },
      );
      const rawCommits =
        historyProbe === null
          ? ""
          : await runGit(
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
                executor: gitExecutor,
                failureMessage: "Git history could not be observed.",
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
          const configuredProjectObjective = configuredObjective(project, "");
          if (
            declaredObjective &&
            configuredProjectObjective &&
            configuredProjectObjective !== declaredObjective
          ) {
            continue;
          }
          const objective = declaredObjective || configuredProjectObjective;
          if (!objective) continue;
          const title =
            typeof notebook?.metadata?.title === "string"
              ? notebook.metadata.title.trim()
              : "";
          notebooks.push({
            experimentPath: normalizeReference(cly?.experiment),
            file,
            objective,
            objectiveSource: declaredObjective
              ? "notebook-metadata"
              : "project-metadata",
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
      let discoveredExperimentLinkSuggestionCount = 0;
      let explicitNotebookMetadataSuggestionCount = 0;
      let projectContextSuggestionCount = 0;
      for (const notebook of notebooks) {
        assertWithinTime();
        const candidateExperiments = notebook.experimentPath
          ? [experiments.get(notebook.experimentPath)].filter(Boolean)
          : [...experiments.values()];
        for (const experiment of candidateExperiments) {
          assertWithinTime();
          const notebookConfigLink = structuredValueReferencing(
            experiment.text,
            notebook.file.path,
            { assertWithinTime, beforeReferenceScan },
          );
          if (!notebookConfigLink) continue;
          const commit = commits.find((item) => {
            assertWithinTime();
            return (
              item.paths.includes(notebook.file.path) &&
              item.paths.includes(experiment.file.path)
            );
          });
          if (!commit) continue;
          const linkedArtifacts = [];
          for (const artifact of artifacts) {
            assertWithinTime();
            const artifactLink = structuredValueReferencing(
              experiment.text,
              artifact.path,
              { assertWithinTime, beforeReferenceScan },
            );
            if (!artifactLink) continue;
            if (!(await verifyDiscoveredFile(artifact, beforeFileRead))) {
              continue;
            }
            linkedArtifacts.push({ artifact, artifactLink });
          }
          const artifactReferences = linkedArtifacts.map(
            ({ artifact }) => artifact.path,
          );
          for (const { artifact, artifactLink } of linkedArtifacts) {
            assertWithinTime();
            for (const report of reports) {
              assertWithinTime();
              const claimLink = reportTokenReferencing(
                report.text,
                artifact.path,
                {
                  assertWithinTime,
                  beforeReferenceScan,
                  knownReferences: artifactReferences,
                },
              );
              if (!claimLink) continue;
              const chain = [
                {
                  kind: "objective",
                  id: `objective:${hash(notebook.objective).slice(0, 16)}`,
                  label: notebook.objective,
                  coordinates: { source: notebook.objectiveSource },
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
              const usesProjectContext =
                notebook.objectiveSource === "project-metadata";
              const discoveredExperimentLink = !notebook.experimentPath;
              const evidence = [
                makeEvidence({
                  evidenceType: usesProjectContext
                    ? "objective-project-context"
                    : "objective-notebook-link",
                  file: usesProjectContext ? null : notebook.file,
                  coordinates: usesProjectContext
                    ? {
                        source: "project.metadata.question-or-hypothesis",
                        valueHash: hash(notebook.objective),
                      }
                    : {
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
                    discoveredFromExperimentConfig: discoveredExperimentLink,
                    lineEnd: notebookConfigLink.line,
                    lineStart: notebookConfigLink.line,
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
                confidence: usesProjectContext ? 0.78 : 0.9,
                evidence,
                fingerprint,
                logicalKey,
                rationale: usesProjectContext
                  ? "A deterministic, bounded scan used the registered project objective as context and found explicit linkage evidence for every file-to-file edge. Review is required."
                  : "A deterministic, bounded scan found explicit linkage evidence for every objective-to-claim edge.",
              });
              if (usesProjectContext) projectContextSuggestionCount += 1;
              else explicitNotebookMetadataSuggestionCount += 1;
              if (discoveredExperimentLink) {
                discoveredExperimentLinkSuggestionCount += 1;
              }
              if (timeToFirstChainMs === null) {
                timeToFirstChainMs = now() - startedAt;
              }
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
          discoveredExperimentLinkSuggestionCount,
          explicitNotebookMetadataSuggestionCount,
          observedDirectoryCount: inventory.directoryCount,
          observedEntryCount: inventory.entryCount,
          observedEnvironmentFiles: environmentEvidence
            .map((item) => item.path)
            .filter(Boolean),
          observedFileCount: filesByPath.size,
          projectContextSuggestionCount,
          requiresClyNotebookMetadata: false,
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
