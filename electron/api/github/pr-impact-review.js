import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_MAX_DIFF_BYTES = 1024 * 1024;
const MAX_CHANGED_FILES = 250;
const CONTROL_OUTPUT_BYTES = 512 * 1024;
const NULL_DEVICE = process.platform === "win32" ? "NUL" : "/dev/null";
const REVIEW_CATEGORIES = [
  "software",
  "methodology",
  "statistical",
  "data-leakage",
  "reproducibility",
  "claim-impact",
];

const CATEGORY_RULES = {
  methodology:
    /(?:^|[/_.-])(method|model|algorithm|preprocess|pipeline|transform|calibrat)|\b(?:method|model|algorithm|threshold|preprocess|transform|calibrat)/i,
  statistical:
    /(?:^|[/_.-])(stat|metric|evaluation)|\b(?:p[-_ ]?value|confidence|coverage|bootstrap|threshold|variance|standard error|sample size)/i,
  "data-leakage":
    /(?:^|[/_.-])(data|dataset|split|train|test|eval|feature)|\b(?:dataset|train(?:ing)?|test|evaluation|holdout|split|leak|target|feature)/i,
  reproducibility:
    /(?:^|[/_.-])(experiment|config|environment|notebook)|(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|requirements\.txt|poetry\.lock|Dockerfile)$|\b(?:seed|random|dependency|environment|version|config)/i,
  "claim-impact":
    /(?:^|[/_.-])(claim|report|result|figure|fig|table|artifact|output|notebook)|\b(?:claim|figure|table|result|conclusion)/i,
};

const CATEGORY_COPY = {
  software: [
    "Software checks",
    "Changed code and repository checks require validation.",
  ],
  methodology: [
    "Methodology review",
    "A method, model, preprocessing step, or research threshold may have changed.",
  ],
  statistical: [
    "Statistical review",
    "Statistical assumptions, metrics, thresholds, or evaluation logic may have changed.",
  ],
  "data-leakage": [
    "Data-leakage review",
    "Data selection, splitting, evaluation, or feature handling may have changed.",
  ],
  reproducibility: [
    "Reproducibility review",
    "Experiment configuration, environment, seeds, or dependencies may have changed.",
  ],
  "claim-impact": [
    "Claim-impact review",
    "Downstream claims, figures, tables, notebooks, or artifacts may require review.",
  ],
};

const STATUS_MAP = {
  A: "added",
  C: "copied",
  D: "deleted",
  M: "modified",
  R: "renamed",
  T: "type-changed",
  U: "unmerged",
  X: "unknown",
};

const stableHash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

const normalizePath = (value) => value.replaceAll("\\", "/");

function validateGitPath(value) {
  const normalized = normalizePath(value);
  if (
    !normalized ||
    normalized.length > 4_000 ||
    path.posix.isAbsolute(normalized) ||
    path.win32.isAbsolute(normalized) ||
    normalized.split("/").includes("..")
  ) {
    throw new Error("Git returned a path outside the registered project.");
  }
  return normalized;
}

function validateRef(value, label) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 500 ||
    value.startsWith("-") ||
    /[\0\r\n]/.test(value)
  ) {
    throw new Error(`${label} is not a valid local Git ref.`);
  }
  return value;
}

export function parseGitNameStatus(output) {
  if (!output) return [];
  const records = output.split("\0");
  const files = [];
  for (let index = 0; index < records.length; index += 2) {
    const rawStatus = records[index];
    if (!rawStatus) continue;
    const rawPath = records[index + 1];
    const statusCode = rawStatus[0];
    if (!rawPath || !STATUS_MAP[statusCode] || rawStatus.length > 4) {
      throw new Error("Git returned malformed change data.");
    }
    files.push({
      path: validateGitPath(rawPath),
      status: STATUS_MAP[statusCode],
    });
    if (files.length > MAX_CHANGED_FILES) {
      throw new Error(
        "Git change list exceeded the project-scoped file limit.",
      );
    }
  }
  return files;
}

function diffSelection(source) {
  if (source.kind === "pull-request") {
    return [
      `${validateRef(source.baseRef, "Pull request base ref")}...${validateRef(source.headRef, "Pull request head ref")}`,
    ];
  }
  if (source.baseRef || source.headRef) {
    const base = validateRef(source.baseRef ?? "HEAD", "Base ref");
    const head = validateRef(source.headRef ?? "HEAD", "Head ref");
    return [`${base}...${head}`];
  }
  if (source.scope === "staged") return ["--cached", "HEAD"];
  return ["HEAD"];
}

const gitEnvironment = () => ({
  GIT_CONFIG_GLOBAL: NULL_DEVICE,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_OPTIONAL_LOCKS: "0",
  GIT_PAGER: "cat",
  GIT_TERMINAL_PROMPT: "0",
  LANG: "C",
  LC_ALL: "C",
  PATH: process.env.PATH,
  ...(process.platform === "win32"
    ? { SystemRoot: process.env.SystemRoot }
    : {}),
});

const fixedGitArguments = (args) => [
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
  ...args,
];

async function defaultGitExecutor(root, args, { maxBuffer }) {
  return execFileAsync("git", fixedGitArguments(args), {
    cwd: root,
    encoding: "utf8",
    env: gitEnvironment(),
    maxBuffer,
    timeout: 10_000,
    windowsHide: true,
  });
}

function isBoundedOutputError(error) {
  return (
    error?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" ||
    String(error?.message).includes("maxBuffer")
  );
}

function parseCommits(output) {
  if (!output) return [];
  const records = output.split("\0").filter(Boolean);
  const commits = [];
  for (let index = 0; index < records.length; index += 2) {
    const sha = records[index]?.trim();
    const subject = records[index + 1]?.trim();
    if (!sha || !/^[a-f0-9]{7,64}$/i.test(sha) || subject === undefined) {
      throw new Error("Git returned malformed commit data.");
    }
    commits.push({ sha, subject });
  }
  return commits.slice(0, 100);
}

export async function collectGitChangeSet(
  root,
  {
    source,
    executor = defaultGitExecutor,
    maxDiffBytes = DEFAULT_MAX_DIFF_BYTES,
  },
) {
  if (!Number.isSafeInteger(maxDiffBytes) || maxDiffBytes < 1) {
    throw new Error("Git diff output limit must be positive.");
  }
  const selection = diffSelection(source);
  const commonDiffArgs = [
    "diff",
    "--no-ext-diff",
    "--no-textconv",
    "--no-renames",
  ];
  const names = await executor(
    root,
    [...commonDiffArgs, "--name-status", "-z", ...selection, "--"],
    { maxBuffer: CONTROL_OUTPUT_BYTES },
  );
  const files = parseGitNameStatus(names.stdout);
  let truncated = false;
  let remaining = maxDiffBytes;
  for (const file of files) {
    if (remaining < 1) {
      file.patch = "";
      truncated = true;
      continue;
    }
    try {
      const result = await executor(
        root,
        [...commonDiffArgs, "--unified=3", ...selection, "--", file.path],
        { maxBuffer: remaining },
      );
      file.patch = result.stdout.slice(0, remaining);
      remaining -= Buffer.byteLength(file.patch, "utf8");
      if (
        Buffer.byteLength(result.stdout, "utf8") >
        Buffer.byteLength(file.patch, "utf8")
      ) {
        truncated = true;
      }
    } catch (error) {
      if (!isBoundedOutputError(error)) throw error;
      file.patch = "";
      truncated = true;
      remaining = 0;
    }
  }
  let commits = [];
  if (source.kind === "pull-request" || source.baseRef || source.headRef) {
    const range = selection[0];
    const result = await executor(
      root,
      ["log", "--format=%H%x00%s%x00", "--max-count=100", range],
      { maxBuffer: CONTROL_OUTPUT_BYTES },
    );
    commits = parseCommits(result.stdout);
  }
  return { files, commits, truncated };
}

function coordinatePaths(step) {
  const candidates = [step.id, step.coordinates?.path, step.coordinates?.file];
  return candidates
    .filter((value) => typeof value === "string" && value.includes("/"))
    .map(normalizePath);
}

function linkEvidenceForFile(file, graph, lineage) {
  const directObjects = graph.objects.filter((object) => {
    const objectPath = object.path ?? object.payload?.path;
    return (
      typeof objectPath === "string" && normalizePath(objectPath) === file.path
    );
  });
  const objects = directObjects.map((object) => ({
    id: object.id,
    type: object.type,
    label: object.title,
    linkStatus: object.reviewState === "approved" ? "verified" : "inferred",
  }));
  const relationships = graph.relationships
    .filter((relationship) =>
      directObjects.some(
        (object) =>
          relationship.fromObjectId === object.id ||
          relationship.toObjectId === object.id,
      ),
    )
    .map((relationship) => ({
      id: relationship.id,
      type: relationship.type,
      fromObjectId: relationship.fromObjectId,
      toObjectId: relationship.toObjectId,
      linkStatus:
        relationship.reviewState === "approved" ? "verified" : "inferred",
    }));

  for (const suggestion of lineage) {
    const matchedEvidence = suggestion.evidence.filter(
      (evidence) => evidence.path && normalizePath(evidence.path) === file.path,
    );
    const matchedStep = suggestion.chain.some((step) =>
      coordinatePaths(step).includes(file.path),
    );
    if (!matchedEvidence.length && !matchedStep) continue;
    const linkStatus =
      suggestion.reviewState === "approved" ? "verified" : "inferred";
    for (const step of suggestion.chain) {
      if (!objects.some((object) => object.id === step.id)) {
        objects.push({
          id: step.id,
          type: step.kind,
          label: step.label,
          linkStatus,
        });
      }
    }
    for (const evidence of matchedEvidence) {
      relationships.push({
        id: evidence.id,
        type: evidence.evidenceType,
        fromObjectId: suggestion.id,
        toObjectId: evidence.path,
        linkStatus,
      });
    }
  }

  if (!objects.length) {
    objects.push({
      id: "unknown",
      type: "unknown",
      label: "Unknown — missing provenance",
      linkStatus: "missing",
    });
  }
  const statuses = new Set([
    ...objects.map((object) => object.linkStatus),
    ...relationships.map((relationship) => relationship.linkStatus),
  ]);
  const linkStatus = statuses.has("missing")
    ? "missing"
    : statuses.has("inferred")
      ? "inferred"
      : "verified";
  return { linkStatus, objects, relationships };
}

function findingFor(category, file, changeSet, graph, lineage) {
  const links = linkEvidenceForFile(file, graph, lineage);
  const [title, summary] = CATEGORY_COPY[category];
  const scientific = category !== "software";
  return {
    id: stableHash([category, file.path, file.status]).slice(0, 20),
    category,
    title,
    summary,
    severity:
      category === "data-leakage" || file.status === "deleted"
        ? "blocking"
        : "warning",
    changedFiles: [{ path: file.path, status: file.status }],
    changedCommits: changeSet.commits,
    commitLabel: changeSet.commits.length
      ? "committed changes"
      : "uncommitted local changes",
    researchObjects: links.objects,
    relationships: links.relationships,
    linkStatus: links.linkStatus,
    provenanceLabel:
      links.linkStatus === "verified"
        ? "verified link"
        : links.linkStatus === "inferred"
          ? "inferred link — human review required"
          : "missing provenance",
    humanApproval:
      scientific &&
      (links.linkStatus !== "verified" || file.status === "deleted")
        ? "required"
        : "not-required",
  };
}

function matchesCategory(category, file, links) {
  if (category === "software") return true;
  const searchable = `${file.path}\n${file.patch}`;
  if (CATEGORY_RULES[category].test(searchable)) return true;
  if (category === "claim-impact") {
    return links.objects.some((object) =>
      ["artifact", "claim", "figure", "table", "notebook", "run"].includes(
        object.type,
      ),
    );
  }
  if (category === "reproducibility") {
    return links.objects.some((object) =>
      ["experiment", "run", "notebook"].includes(object.type),
    );
  }
  return false;
}

function uniqueObjects(findings, types) {
  const output = new Map();
  for (const finding of findings) {
    for (const object of finding.researchObjects) {
      if (types.includes(object.type) && object.id !== "unknown")
        output.set(object.id, object);
    }
  }
  return [...output.values()].sort((left, right) =>
    left.label.localeCompare(right.label),
  );
}

function approvalForReview(provenance, reviewId) {
  const event = [...provenance]
    .reverse()
    .find(
      (candidate) =>
        candidate.action === "pr-impact-review.human-reviewed" &&
        candidate.metadata?.reviewId === reviewId,
    );
  if (!event) return null;
  return {
    actorId: event.actorId ?? "unknown",
    decision: event.metadata.decision,
    reviewedAt: event.createdAt,
    confirmedLinkIds: event.metadata.confirmedLinkIds ?? [],
  };
}

export function analyzeResearchImpact({
  changeSet,
  graph,
  lineage,
  project,
  provenance = [],
  source,
}) {
  const normalizedGraph = {
    objects: graph?.objects ?? [],
    relationships: graph?.relationships ?? [],
  };
  const normalizedLineage = (lineage ?? []).filter(
    (suggestion) => suggestion.projectId === project.id,
  );
  const reviewId = stableHash({
    projectId: project.id,
    source,
    files: changeSet.files.map(({ path: filePath, status }) => ({
      path: filePath,
      status,
    })),
    commits: changeSet.commits.map(({ sha }) => sha),
  });
  const sections = REVIEW_CATEGORIES.map((category) => ({
    category,
    title: CATEGORY_COPY[category][0],
    findings: changeSet.files
      .filter((file) =>
        matchesCategory(
          category,
          file,
          linkEvidenceForFile(file, normalizedGraph, normalizedLineage),
        ),
      )
      .map((file) =>
        findingFor(
          category,
          file,
          changeSet,
          normalizedGraph,
          normalizedLineage,
        ),
      ),
  }));
  const scientificFindings = sections
    .filter((section) => section.category !== "software")
    .flatMap((section) => section.findings);
  const allFindings = sections.flatMap((section) => section.findings);
  const methods = uniqueObjects(
    sections.find((section) => section.category === "methodology")?.findings ??
      [],
    ["method", "code"],
  );
  const experiments = uniqueObjects(scientificFindings, ["experiment", "run"]);
  const artifacts = uniqueObjects(scientificFindings, [
    "artifact",
    "figure",
    "table",
    "notebook",
  ]);
  const claims = uniqueObjects(scientificFindings, ["claim"]);
  const datasets = uniqueObjects(scientificFindings, ["dataset"]);
  const objectiveStep = normalizedLineage
    .filter((item) => item.reviewState === "approved")
    .flatMap((item) => item.chain)
    .find((step) => step.kind === "objective");
  const objective =
    project.metadata?.objective ??
    project.metadata?.question ??
    objectiveStep?.label;
  const researchMotivation =
    project.metadata?.researchMotivation ?? project.metadata?.motivation;
  const hasMissing = allFindings.some(
    (finding) => finding.linkStatus === "missing",
  );
  const hasInferred = allFindings.some(
    (finding) => finding.linkStatus === "inferred",
  );
  const approval = approvalForReview(provenance, reviewId);
  const requiresHumanApproval = scientificFindings.some(
    (finding) =>
      finding.humanApproval === "required" || finding.severity === "blocking",
  );
  const validationChecklist = REVIEW_CATEGORIES.map((discipline) => {
    const findingCount = sections.find(
      (section) => section.category === discipline,
    ).findings.length;
    return {
      id: `validate-${discipline}`,
      discipline,
      label:
        discipline === "software"
          ? "Run relevant software tests and static checks"
          : `Complete ${CATEGORY_COPY[discipline][0].toLowerCase()}`,
      status: findingCount ? "pending" : "not-applicable",
      evidenceRequired: findingCount > 0,
    };
  });
  if (requiresHumanApproval) {
    validationChecklist.push({
      id: "validate-human-approval",
      discipline: "human-approval",
      label:
        "Record explicit human review of scientific conflicts and inferred links",
      status: approval?.decision === "approved" ? "complete" : "pending",
      evidenceRequired: true,
    });
  }
  const downstreamObjects = uniqueObjects(scientificFindings, [
    "run",
    "experiment",
    "artifact",
    "figure",
    "table",
    "notebook",
    "claim",
  ]);

  return {
    reviewId,
    projectId: project.id,
    source,
    generatedFrom: "local-git-and-project-provenance",
    externalTransmission: false,
    researchMotivation: {
      value: researchMotivation ?? "unknown",
      linkStatus: researchMotivation ? "verified" : "missing",
    },
    linkedObjective: {
      value: objective ?? "unknown",
      linkStatus:
        project.metadata?.objective ||
        project.metadata?.question ||
        objectiveStep
          ? "verified"
          : "missing",
    },
    methodsChanged: methods,
    experimentsMayNeedRerun: experiments,
    affected: { claims, figuresAndArtifacts: artifacts, datasets },
    risks: [
      ...(sections.find((section) => section.category === "data-leakage")
        .findings.length
        ? [
            "Data-leakage review is required before interpreting affected results.",
          ]
        : []),
      ...(sections.find((section) => section.category === "reproducibility")
        .findings.length
        ? [
            "Recorded runs may no longer reproduce the changed code or configuration.",
          ]
        : []),
      ...(hasMissing
        ? [
            "Missing provenance prevents a complete downstream impact assessment.",
          ]
        : []),
    ],
    unresolvedAssumptions: [
      ...(hasInferred
        ? ["Inferred relationships have not been verified by a human."]
        : []),
      ...(hasMissing
        ? ["Unlinked changed files may affect additional research objects."]
        : []),
      ...(changeSet.truncated
        ? ["The bounded diff omitted content; findings may be incomplete."]
        : []),
    ],
    sections,
    validationChecklist,
    downstreamImpact: downstreamObjects.map((object) => ({
      ...object,
      state:
        source.state === "merged"
          ? "needs-review"
          : "would-need-review-after-merge",
      recommendedAction:
        object.type === "experiment" || object.type === "run"
          ? "Assess whether the experiment must be rerun."
          : "Review or regenerate this downstream object after merge.",
    })),
    approval,
    requiresHumanApproval,
    noResearchImpact:
      changeSet.files.length === 0 || scientificFindings.length === 0,
    provenanceStatus:
      hasMissing || hasInferred || changeSet.truncated ? "partial" : "complete",
    partialReasons: [
      ...(hasMissing ? ["missing provenance"] : []),
      ...(hasInferred ? ["unreviewed inferred relationships"] : []),
      ...(changeSet.truncated ? ["bounded diff"] : []),
    ],
    caveats: [
      "This deterministic review identifies possible impact; it does not establish scientific correctness.",
      ...(hasInferred
        ? ["Inferred relationships are suggestions until a human reviews them."]
        : []),
      ...(hasMissing
        ? [
            "Unknown means the project does not contain enough provenance to decide.",
          ]
        : []),
    ],
  };
}

async function validateRegisteredRoot(
  projectPath,
  executor = defaultGitExecutor,
) {
  const canonicalRoot = await realpath(path.resolve(projectPath));
  const result = await executor(
    canonicalRoot,
    ["rev-parse", "--show-toplevel"],
    {
      maxBuffer: 64 * 1024,
    },
  );
  const reportedRoot = await realpath(result.stdout.trim());
  if (reportedRoot !== canonicalRoot) {
    throw new Error(
      "The registered project root must be the Git repository root.",
    );
  }
  return canonicalRoot;
}

export function createPrImpactReviewService(
  repository,
  {
    collectChangeSet = collectGitChangeSet,
    executor = defaultGitExecutor,
  } = {},
) {
  return {
    async analyze(projectId, source) {
      const project = repository.getProject(projectId);
      const root =
        collectChangeSet === collectGitChangeSet
          ? await validateRegisteredRoot(project.path, executor)
          : project.path;
      const changeSet = await collectChangeSet(root, { executor, source });
      return analyzeResearchImpact({
        changeSet,
        graph: repository.listProject(projectId),
        lineage: repository.listLineageSuggestions(projectId),
        project,
        provenance: repository.listProvenance(projectId),
        source,
      });
    },

    recordHumanReview(projectId, input) {
      repository.getProject(projectId);
      return repository.appendProvenance({
        action: "pr-impact-review.human-reviewed",
        actorId: input.actorId,
        actorType: "human",
        metadata: {
          reviewId: input.reviewId,
          decision: input.decision,
          confirmedLinkIds: input.confirmedLinkIds,
          note: input.note,
        },
        projectId,
      });
    },
  };
}
