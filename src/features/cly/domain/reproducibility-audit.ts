import type {
  AuditArea,
  AuditFinding,
  ClyRepositoryData,
  ReproducibilityAudit,
} from "./types";

export interface GeneratedReproducibilityAudit {
  audit: ReproducibilityAudit;
  findings: AuditFinding[];
}

interface FindingInput {
  area: AuditArea;
  key: string;
  title: string;
  detail: string;
  severity: AuditFinding["severity"];
  objectIds: string[];
  recommendedFix: string;
}

const auditAreas: AuditArea[] = [
  "Code",
  "Data",
  "Environment",
  "Experiments",
  "Outputs",
  "Claims",
];

const issueSeverity = new Set<AuditFinding["severity"]>([
  "Blocking",
  "High",
  "Warning",
]);

const unique = (values: string[]) => [...new Set(values)];

const isMissing = (value: string) =>
  /^(?:not (?:captured|configured|linked|recorded)|unknown|none)$/i.test(
    value.trim(),
  );

const isPinnedEnvironment = (value: string) =>
  !isMissing(value) &&
  /(?:sha256:|@[a-f\d]{7,}|@sha256:|:\d+\.\d+(?:\.\d+)?(?:$|[-+]))/i.test(
    value,
  );

const findingId = (area: AuditArea, key: string) =>
  `audit-${area.toLowerCase()}-${key}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const statusForScore = (
  score: number,
  findings: AuditFinding[],
): ReproducibilityAudit["status"] => {
  const open = findings.filter(
    (finding) =>
      finding.status !== "Resolved" && issueSeverity.has(finding.severity),
  );
  if (open.some((finding) => finding.severity === "Blocking"))
    return "Not reproducible";
  if (score >= 95 && open.length === 0) return "Publication-ready";
  if (score >= 85 && !open.some((finding) => finding.severity === "High"))
    return "Artifact-ready";
  if (score >= 70) return "Mostly reproducible";
  if (score >= 40) return "Partially reproducible";
  return "Not reproducible";
};

export function generateReproducibilityAudit(
  data: Pick<
    ClyRepositoryData,
    | "sources"
    | "claims"
    | "experiments"
    | "runs"
    | "notebooks"
    | "code"
    | "artifacts"
  >,
  createdAt = new Date().toISOString(),
): GeneratedReproducibilityAudit {
  const inputs: FindingInput[] = [];
  const add = (input: FindingInput) => inputs.push(input);
  const claimsById = new Map(data.claims.map((claim) => [claim.id, claim]));
  const experimentsById = new Map(
    data.experiments.map((experiment) => [experiment.id, experiment]),
  );
  const runsById = new Map(data.runs.map((run) => [run.id, run]));

  if (
    data.sources.length === 0 &&
    data.claims.length === 0 &&
    data.experiments.length === 0 &&
    data.runs.length === 0 &&
    data.notebooks.length === 0 &&
    data.code.length === 0 &&
    data.artifacts.length === 0
  ) {
    add({
      area: "Claims",
      key: "no-research-objects",
      title: "No research objects are available to audit",
      detail:
        "An audit requires at least one claim, evidence source, experiment, or output.",
      severity: "Blocking",
      objectIds: [],
      recommendedFix:
        "Create or import research objects, then run the audit again.",
    });
  }

  for (const artifact of data.code) {
    if (/^(?:none|no direct tests)$/i.test(artifact.tests.trim())) {
      add({
        area: "Code",
        key: `untested-${artifact.id}`,
        title: `No executable test covers ${artifact.path}`,
        detail: `${artifact.path} contributes to ${artifact.claimIds.length} claim${artifact.claimIds.length === 1 ? "" : "s"}, but its test evidence is “${artifact.tests}”.`,
        severity: artifact.claimIds.length ? "High" : "Warning",
        objectIds: [artifact.id, ...artifact.claimIds],
        recommendedFix:
          "Add an executable test and record the passing revision.",
      });
    }
    if (artifact.status === "Obsolete" && artifact.claimIds.length) {
      add({
        area: "Code",
        key: `obsolete-${artifact.id}`,
        title: `A claim still depends on obsolete code`,
        detail: `${artifact.path} is marked obsolete but remains linked to an active claim.`,
        severity: "Blocking",
        objectIds: [artifact.id, ...artifact.claimIds],
        recommendedFix:
          "Relink the claim to current code or explicitly supersede it.",
      });
    }
  }
  if (data.code.length === 0) {
    add({
      area: "Code",
      key: "missing-inventory",
      title: "No code inventory is available",
      detail:
        "The audit cannot trace methods or outputs to a versioned implementation.",
      severity: "High",
      objectIds: [],
      recommendedFix:
        "Scan the repository and link implementation files to experiments and claims.",
    });
  }

  const datasets = data.sources.filter((source) => source.type === "Dataset");
  if (!datasets.length && data.experiments.length) {
    add({
      area: "Data",
      key: "missing-dataset-source",
      title: "Experiments have no dataset source record",
      detail:
        "Dataset names appear in experiments, but no versioned dataset source can be audited.",
      severity: "High",
      objectIds: data.experiments.map((experiment) => experiment.id),
      recommendedFix:
        "Create a dataset source with origin, version, license, and checksum metadata.",
    });
  }
  for (const experiment of data.experiments.filter((item) =>
    isMissing(item.dataset),
  )) {
    add({
      area: "Data",
      key: `unlinked-${experiment.id}`,
      title: `${experiment.name} has no dataset link`,
      detail:
        "The experiment cannot be recreated without an identified input dataset.",
      severity: "High",
      objectIds: [experiment.id, ...experiment.claimIds],
      recommendedFix:
        "Link a versioned dataset and document preprocessing and access requirements.",
    });
  }

  for (const experiment of data.experiments) {
    if (!isPinnedEnvironment(experiment.environment)) {
      add({
        area: "Environment",
        key: `unpinned-${experiment.id}`,
        title: `${experiment.name} does not have a pinned environment`,
        detail: isMissing(experiment.environment)
          ? "No dependency or runtime environment was captured."
          : `“${experiment.environment}” does not identify an immutable environment.`,
        severity: experiment.status === "Complete" ? "High" : "Warning",
        objectIds: [experiment.id, ...experiment.claimIds],
        recommendedFix:
          "Record a lockfile, container digest, OS assumptions, and required hardware.",
      });
    }
  }
  if (data.experiments.length === 0 && data.claims.length > 0) {
    add({
      area: "Environment",
      key: "missing-environment-inventory",
      title: "No experiment environments are recorded",
      detail:
        "The project has claims but no captured dependency or runtime environment.",
      severity: "High",
      objectIds: data.claims.map((claim) => claim.id),
      recommendedFix:
        "Capture a lockfile or container digest for the experiment that tests each computational claim.",
    });
  }

  for (const experiment of data.experiments) {
    const failedRuns = experiment.runIds
      .map((runId) => runsById.get(runId))
      .filter((run) => run?.status === "Failed");
    if (experiment.status === "Failed" || failedRuns.length) {
      add({
        area: "Experiments",
        key: `failed-${experiment.id}`,
        title: `${experiment.name} has failed evidence runs`,
        detail: `${failedRuns.length || 1} failed run${failedRuns.length === 1 ? "" : "s"} remain in the evidence chain.`,
        severity: experiment.claimIds.length ? "Blocking" : "High",
        objectIds: [
          experiment.id,
          ...failedRuns.map((run) => run?.id ?? ""),
          ...experiment.claimIds,
        ].filter(Boolean),
        recommendedFix:
          "Preserve the failure, correct the configuration, and record a reviewed rerun.",
      });
    }
  }
  for (const run of data.runs.filter(
    (item) => item.status === "Complete" && item.reproducibility !== "Verified",
  )) {
    const experiment = experimentsById.get(run.experimentId);
    add({
      area: "Experiments",
      key: `unverified-${run.id}`,
      title: `${run.name} is complete but not verified`,
      detail: `The run is marked ${run.reproducibility.toLowerCase()} and should not be treated as independently reproducible evidence.`,
      severity: "High",
      objectIds: [run.id, run.experimentId, ...(experiment?.claimIds ?? [])],
      recommendedFix:
        "Re-run from the recorded command, data, configuration, seed, and environment.",
    });
  }
  if (data.experiments.length === 0 && data.claims.length > 0) {
    add({
      area: "Experiments",
      key: "missing-experiment-inventory",
      title: "Claims have no experiment records",
      detail:
        "No configuration, command, seed, metric, or run can be inspected for the current claims.",
      severity: "High",
      objectIds: data.claims.map((claim) => claim.id),
      recommendedFix:
        "Link each computational claim to a configured experiment and preserve its runs.",
    });
  }

  for (const artifact of data.artifacts) {
    const experiment = experimentsById.get(artifact.experimentId);
    const generator = data.code.find(
      (code) =>
        code.path === artifact.generator ||
        code.path.endsWith(`/${artifact.generator}`),
    );
    const upstreamDates = [experiment?.updatedAt, generator?.updatedAt]
      .filter((value): value is string => Boolean(value))
      .map((value) => Date.parse(value));
    const staleFromDependency = upstreamDates.some(
      (timestamp) => timestamp > Date.parse(artifact.updatedAt),
    );
    if (artifact.regeneration !== "Ready" || staleFromDependency) {
      const isBroken = artifact.regeneration === "Broken";
      const isManual = artifact.regeneration === "Manual";
      add({
        area: "Outputs",
        key: `stale-${artifact.id}`,
        title: `${artifact.name} is ${isBroken ? "broken" : isManual ? "not fully generated by code" : "stale"}`,
        detail: staleFromDependency
          ? "A linked experiment or generator changed after this output was produced."
          : `The output regeneration status is ${artifact.regeneration}.`,
        severity: isBroken || isManual ? "Blocking" : "High",
        objectIds: [artifact.id, artifact.experimentId, ...artifact.claimIds],
        recommendedFix:
          "Regenerate the output from current code and data, then record its command and hash.",
      });
    }
  }

  for (const notebook of data.notebooks.filter(
    (item) =>
      item.status === "Stale" ||
      item.reproducibility === "At risk" ||
      item.issues.some((issue) => /stale output/i.test(issue)),
  )) {
    add({
      area: "Outputs",
      key: `notebook-${notebook.id}`,
      title: `${notebook.title} contains stale or at-risk outputs`,
      detail: notebook.issues.join(" · ") || "The notebook is marked stale.",
      severity: notebook.claimIds.length ? "High" : "Warning",
      objectIds: [notebook.id, ...notebook.claimIds],
      recommendedFix:
        "Restart the kernel, execute in order, and replace outputs with the clean run.",
    });
  }
  if (
    data.artifacts.length === 0 &&
    data.notebooks.length === 0 &&
    data.claims.length > 0
  ) {
    add({
      area: "Outputs",
      key: "missing-output-inventory",
      title: "Claims have no auditable outputs",
      detail:
        "No generated figure, table, output, or notebook is available for regeneration checks.",
      severity: "High",
      objectIds: data.claims.map((claim) => claim.id),
      recommendedFix:
        "Link generated outputs to their run, command, code revision, data, and claims.",
    });
  }

  for (const claim of data.claims) {
    const evidenceCount =
      claim.supportingSourceIds.length +
      claim.experimentIds.length +
      claim.artifactIds.length;
    if (evidenceCount === 0) {
      add({
        area: "Claims",
        key: `unsupported-${claim.id}`,
        title: `Claim has no supporting evidence`,
        detail: claim.text,
        severity: "Blocking",
        objectIds: [claim.id],
        recommendedFix:
          "Link reviewed evidence or mark the claim as out of scope.",
      });
    }
    if (claim.contradictingSourceIds.length) {
      add({
        area: "Claims",
        key: `contradicted-${claim.id}`,
        title: `Contradictory evidence is linked to a claim`,
        detail: `${claim.contradictingSourceIds.length} source${claim.contradictingSourceIds.length === 1 ? "" : "s"} contradict “${claim.text}”.`,
        severity:
          claim.status === "Strong" || claim.status === "Paper-ready"
            ? "Blocking"
            : "High",
        objectIds: [claim.id, ...claim.contradictingSourceIds],
        recommendedFix:
          "Reconcile the conflict in the limitations and revise the claim status or wording.",
      });
    }
    const dependencyDates = [
      ...claim.experimentIds.map(
        (experimentId) => experimentsById.get(experimentId)?.updatedAt,
      ),
      ...claim.artifactIds.map(
        (artifactId) =>
          data.artifacts.find((artifact) => artifact.id === artifactId)
            ?.updatedAt,
      ),
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => Date.parse(value));
    if (
      dependencyDates.some(
        (timestamp) => timestamp > Date.parse(claim.updatedAt),
      )
    ) {
      add({
        area: "Claims",
        key: `stale-${claim.id}`,
        title: `Claim needs review after upstream changes`,
        detail: `An experiment or output changed after “${claim.text}” was last verified.`,
        severity: "High",
        objectIds: [claim.id, ...claim.experimentIds, ...claim.artifactIds],
        recommendedFix:
          "Review the current evidence chain and re-verify the claim.",
      });
    }
  }

  const findings: AuditFinding[] = inputs.map((input) => ({
    id: findingId(input.area, input.key),
    category: input.area,
    area: input.area,
    title: input.title,
    detail: input.detail,
    severity: input.severity,
    status: input.severity === "Passed" ? "Resolved" : "Open",
    objectIds: unique(input.objectIds),
    affectedClaimIds: unique(
      input.objectIds.filter((objectId) => claimsById.has(objectId)),
    ),
    recommendedFix: input.recommendedFix,
  }));

  for (const area of auditAreas) {
    if (
      findings.some(
        (finding) =>
          finding.area === area && issueSeverity.has(finding.severity),
      )
    )
      continue;
    findings.push({
      id: findingId(area, "passed"),
      category: area,
      area,
      title: `${area} checks passed`,
      detail: `No reproducibility gaps were detected in the available ${area.toLowerCase()} records.`,
      severity: "Passed",
      status: "Resolved",
      objectIds: [],
      affectedClaimIds: [],
      recommendedFix: "No action required.",
    });
  }

  const penalty = findings.reduce((total, finding) => {
    if (finding.severity === "Blocking") return total + 18;
    if (finding.severity === "High") return total + 10;
    if (finding.severity === "Warning") return total + 4;
    return total;
  }, 0);
  const score = Math.max(0, 100 - penalty);
  const sortedFindings = findings.toSorted((left, right) => {
    const rank = { Blocking: 0, High: 1, Warning: 2, Passed: 3 };
    return (
      rank[left.severity] - rank[right.severity] ||
      auditAreas.indexOf(left.area ?? (left.category as AuditArea)) -
        auditAreas.indexOf(right.area ?? (right.category as AuditArea)) ||
      left.title.localeCompare(right.title)
    );
  });
  const audit: ReproducibilityAudit = {
    id: `audit-${createdAt.replace(/[^0-9]/g, "").slice(0, 17)}`,
    score,
    status: statusForScore(score, sortedFindings),
    createdAt,
    findingIds: sortedFindings.map((finding) => finding.id),
    areas: auditAreas.map((area) => ({
      area,
      passed: !sortedFindings.some(
        (finding) =>
          finding.area === area && issueSeverity.has(finding.severity),
      ),
      findingCount: sortedFindings.filter(
        (finding) =>
          finding.area === area && issueSeverity.has(finding.severity),
      ).length,
    })),
  };
  return { audit, findings: sortedFindings };
}
