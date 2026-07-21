import { createHash, randomUUID } from "node:crypto";

const AREAS = [
  "Code",
  "Data",
  "Environment",
  "Experiments",
  "Outputs",
  "Claims",
];

const ISSUE_SEVERITIES = new Set(["Blocking", "High", "Warning"]);
const STATUS_RANK = { Blocking: 0, High: 1, Warning: 2, Passed: 3 };

const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const sha256 = (value) =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");

const normalizeKey = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const hasValue = (value) => {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return value !== undefined && value !== null;
};

const findKey = (value, names) => {
  if (!value || typeof value !== "object") return undefined;
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  for (const [key, nested] of Object.entries(value)) {
    if (wanted.has(key.toLowerCase()) && hasValue(nested)) return nested;
    const match = findKey(nested, names);
    if (match !== undefined) return match;
  }
  return undefined;
};

const evidenceFor = (objectIds, objectsById, provenanceByObject) =>
  [...new Set(objectIds)].flatMap((objectId) => {
    const object = objectsById.get(objectId);
    const references = object
      ? [
          {
            kind: "research-object",
            id: object.id,
            objectType: object.type,
            label: object.title,
          },
        ]
      : [];
    const event = provenanceByObject.get(objectId);
    if (event) {
      references.push({
        kind: "provenance-event",
        id: event.id,
        objectId,
        label: event.action,
        sequence: event.sequence ?? null,
      });
    }
    return references;
  });

const connectedClaimIds = (seedIds, objectsById, relationships) => {
  const visited = new Set(seedIds.filter(Boolean));
  let frontier = [...visited];
  for (let depth = 0; depth < 4 && frontier.length > 0; depth += 1) {
    const next = [];
    for (const relationship of relationships) {
      let adjacent;
      if (frontier.includes(relationship.fromObjectId)) {
        adjacent = relationship.toObjectId;
      } else if (frontier.includes(relationship.toObjectId)) {
        adjacent = relationship.fromObjectId;
      }
      if (adjacent && !visited.has(adjacent)) {
        visited.add(adjacent);
        next.push(adjacent);
      }
    }
    frontier = next;
  }
  return [...visited]
    .filter((id) => objectsById.get(id)?.type === "claim")
    .sort();
};

const reportStatus = (score, findings) => {
  const open = findings.filter((finding) =>
    ISSUE_SEVERITIES.has(finding.severity),
  );
  if (open.some((finding) => finding.severity === "Blocking")) {
    return "Not reproducible";
  }
  if (score >= 95 && open.length === 0) return "Publication-ready";
  if (score >= 85 && !open.some((finding) => finding.severity === "High")) {
    return "Artifact-ready";
  }
  if (score >= 70) return "Mostly reproducible";
  if (score >= 40) return "Partially reproducible";
  return "Not reproducible";
};

export function generateReproducibilityReport(
  {
    project,
    objects,
    relationships,
    lineages,
    provenance,
    provenanceIntegrity,
  },
  { createdAt = new Date().toISOString(), id = randomUUID() } = {},
) {
  const objectsById = new Map(objects.map((object) => [object.id, object]));
  const provenanceByObject = new Map();
  for (const event of provenance) {
    if (event.objectId) provenanceByObject.set(event.objectId, event);
  }
  const claims = objects.filter((object) => object.type === "claim");
  const datasetSources = objects.filter(
    (object) =>
      object.type === "source" && object.payload?.sourceType === "dataset",
  );
  const findings = [];
  const add = ({
    area,
    checkId,
    requirementStatus,
    severity,
    title,
    detail,
    objectIds = [],
    missingArtifactIds = [],
    recommendedFix,
  }) => {
    const uniqueObjectIds = [...new Set(objectIds.filter(Boolean))];
    const findingKey = sha256({
      checkId,
      missingArtifactIds,
      objectIds: uniqueObjectIds,
      title,
    }).slice(0, 12);
    findings.push({
      id: `repro-${normalizeKey(checkId)}-${findingKey}`,
      category: area,
      area,
      checkId,
      requirementStatus,
      title,
      detail,
      severity,
      status: severity === "Passed" ? "Resolved" : "Open",
      objectIds: uniqueObjectIds,
      evidenceRefs: evidenceFor(
        uniqueObjectIds,
        objectsById,
        provenanceByObject,
      ),
      affectedClaimIds: connectedClaimIds(
        uniqueObjectIds,
        objectsById,
        relationships,
      ),
      missingArtifactIds: [...new Set(missingArtifactIds)],
      recommendedFix,
    });
  };

  if (objects.length === 0) {
    add({
      area: "Claims",
      checkId: "research-object-inventory",
      requirementStatus: "missing",
      severity: "Blocking",
      title: "No research objects are available to audit",
      detail:
        "The project contains no persisted evidence, experiments, outputs, or claims.",
      recommendedFix:
        "Create or import research objects, then run the audit again.",
    });
  }

  if (!provenanceIntegrity.valid) {
    add({
      area: "Code",
      checkId: "provenance-integrity",
      requirementStatus: "failed",
      severity: "Blocking",
      title: "The provenance ledger failed integrity verification",
      detail:
        provenanceIntegrity.reason ??
        "The provenance chain could not be verified.",
      objectIds: objects.map((object) => object.id),
      recommendedFix:
        "Restore the last verified database snapshot before relying on this report.",
    });
  }

  for (const object of objects) {
    if (!provenanceByObject.has(object.id)) {
      add({
        area: object.type === "claim" ? "Claims" : "Code",
        checkId: "object-provenance",
        requirementStatus: "missing",
        severity: "High",
        title: `${object.title} has no object-level provenance`,
        detail:
          "The report cannot trace this object to a recorded creation or update event.",
        objectIds: [object.id],
        recommendedFix:
          "Record the object's origin and immutable provenance event.",
      });
    }
  }

  for (const lineage of lineages) {
    const experimentId = lineage.experiment.id;
    const definition = lineage.definitions.at(-1);
    const configuration = definition?.configuration ?? {};
    const experimentObjectIds = [experimentId];
    if (!definition) {
      add({
        area: "Experiments",
        checkId: "experiment-definition",
        requirementStatus: "missing",
        severity: "Blocking",
        title: `${lineage.experiment.title} has no versioned definition`,
        detail: "The method, inputs, and declared metrics are unavailable.",
        objectIds: experimentObjectIds,
        recommendedFix:
          "Save a versioned experiment definition before running it.",
      });
      continue;
    }

    const command = findKey(configuration, [
      "command",
      "runCommand",
      "executableCommand",
    ]);
    const testCommand = findKey(configuration, [
      "test",
      "tests",
      "testCommand",
    ]);
    const testStatus = findKey(configuration, ["testStatus", "testsStatus"]);
    const lockfile = findKey(configuration, [
      "lockfile",
      "lockFile",
      "dependencyLock",
      "containerDigest",
    ]);
    const dependencies = findKey(configuration, [
      "dependencies",
      "environment",
      "runtime",
    ]);
    const os = findKey(configuration, ["os", "operatingSystem", "platform"]);
    const hardware = findKey(configuration, [
      "hardware",
      "accelerator",
      "device",
    ]);
    const seed = findKey(configuration, ["seed", "randomSeed", "rngSeed"]);
    const preprocessing = findKey(configuration, [
      "preprocessing",
      "preprocess",
      "preprocessingCommand",
    ]);
    const datasetLicense = findKey(configuration, [
      "datasetLicense",
      "dataLicense",
      "license",
    ]);
    const logs = findKey(configuration, ["log", "logs", "logPath", "logUri"]);

    if (!command) {
      add({
        area: "Code",
        checkId: "execution-command",
        requirementStatus: "missing",
        severity: "High",
        title: `${lineage.experiment.title} has no executable command`,
        detail: "No command is recorded for reproducing the experiment.",
        objectIds: experimentObjectIds,
        recommendedFix:
          "Record the exact non-interactive command and working directory.",
      });
    }
    if (!testCommand) {
      add({
        area: "Code",
        checkId: "test-evidence",
        requirementStatus: "missing",
        severity: "High",
        title: `${lineage.experiment.title} has no test evidence`,
        detail:
          "The captured configuration does not identify an executable test.",
        objectIds: experimentObjectIds,
        recommendedFix: "Record the test command and its passing revision.",
      });
    } else if (
      typeof testStatus === "string" &&
      /fail|error/i.test(testStatus)
    ) {
      add({
        area: "Code",
        checkId: "test-evidence",
        requirementStatus: "failed",
        severity: "Blocking",
        title: `${lineage.experiment.title} has failing tests`,
        detail: `The recorded test status is ${testStatus}.`,
        objectIds: experimentObjectIds,
        recommendedFix:
          "Fix the failure and preserve evidence from a passing test run.",
      });
    }
    if (!lockfile || !dependencies) {
      add({
        area: "Environment",
        checkId: "dependencies",
        requirementStatus: "missing",
        severity: "High",
        title: `${lineage.experiment.title} has an incomplete dependency snapshot`,
        detail:
          "Both dependency metadata and an immutable lockfile or container digest are required.",
        objectIds: experimentObjectIds,
        recommendedFix:
          "Record resolved dependencies and a lockfile or container digest.",
      });
    }
    if (!os || !hardware) {
      add({
        area: "Environment",
        checkId: "platform-assumptions",
        requirementStatus: "missing",
        severity: "Warning",
        title: `${lineage.experiment.title} omits platform assumptions`,
        detail:
          "The required operating system and hardware are not both recorded.",
        objectIds: experimentObjectIds,
        recommendedFix:
          "Capture OS, architecture, accelerator, memory, and other required hardware.",
      });
    }
    if (seed === undefined) {
      add({
        area: "Experiments",
        checkId: "random-seed",
        requirementStatus: "missing",
        severity: "High",
        title: `${lineage.experiment.title} has no recorded seed`,
        detail: "Randomized execution cannot be repeated deterministically.",
        objectIds: experimentObjectIds,
        recommendedFix:
          "Record every random seed or explicitly document deterministic execution.",
      });
    }
    if (!logs) {
      add({
        area: "Experiments",
        checkId: "run-logs",
        requirementStatus: "missing",
        severity: "Warning",
        title: `${lineage.experiment.title} has no preserved log location`,
        detail:
          "Execution diagnostics and failure context cannot be independently inspected.",
        objectIds: experimentObjectIds,
        recommendedFix:
          "Preserve stdout, stderr, and structured logs with the run.",
      });
    }

    if (definition.datasets.length === 0) {
      add({
        area: "Data",
        checkId: "dataset-reference",
        requirementStatus: "missing",
        severity: "High",
        title: `${lineage.experiment.title} has no dataset reference`,
        detail: "The experiment definition does not identify its input data.",
        objectIds: experimentObjectIds,
        recommendedFix:
          "Link a dataset source with version, checksum, license, and preprocessing.",
      });
    }
    for (const dataset of definition.datasets) {
      const source = datasetSources.find(
        (candidate) =>
          candidate.id === dataset.id ||
          candidate.payload?.providerId === dataset.id ||
          candidate.title === dataset.id,
      );
      if (!source) {
        add({
          area: "Data",
          checkId: "dataset-source",
          requirementStatus: "missing",
          severity: "High",
          title: `Dataset ${dataset.id} has no source record`,
          detail:
            "The dataset reference cannot be traced to origin and licensing metadata.",
          objectIds: experimentObjectIds,
          missingArtifactIds: [`dataset-source:${dataset.id}`],
          recommendedFix:
            "Create a dataset source object and link it to the experiment.",
        });
      }
      if (!dataset.contentHash) {
        add({
          area: "Data",
          checkId: "dataset-checksum",
          requirementStatus: "missing",
          severity: "High",
          title: `Dataset ${dataset.id} has no checksum`,
          detail: `Version ${dataset.version} is named, but its exact bytes are not verified.`,
          objectIds: [experimentId, source?.id],
          recommendedFix:
            "Record a cryptographic checksum for the exact dataset version.",
        });
      }
      if (!datasetLicense && !source?.payload?.license) {
        add({
          area: "Data",
          checkId: "dataset-license",
          requirementStatus: "missing",
          severity: "Warning",
          title: `Dataset ${dataset.id} has no recorded license`,
          detail: "Reuse and publication permissions cannot be evaluated.",
          objectIds: [experimentId, source?.id],
          recommendedFix:
            "Record the dataset license and any access restrictions.",
        });
      }
      if (!preprocessing) {
        add({
          area: "Data",
          checkId: "dataset-preprocessing",
          requirementStatus: "missing",
          severity: "High",
          title: `Dataset ${dataset.id} has no preprocessing record`,
          detail:
            "The transformation from source data to experiment input is not reproducible.",
          objectIds: [experimentId, source?.id],
          recommendedFix:
            "Record the preprocessing code, command, parameters, and output checksum.",
        });
      }
    }

    if (lineage.runs.length === 0) {
      add({
        area: "Experiments",
        checkId: "experiment-run",
        requirementStatus: "missing",
        severity: "High",
        title: `${lineage.experiment.title} has no preserved run`,
        detail:
          "No configuration snapshot, execution result, metrics, or output can be inspected.",
        objectIds: experimentObjectIds,
        missingArtifactIds: [`run:${experimentId}`],
        recommendedFix:
          "Execute the versioned definition and preserve the resulting run.",
      });
    }

    for (const run of lineage.runs) {
      const runIds = [experimentId, run.id];
      if (run.codeRefs.length === 0) {
        add({
          area: "Code",
          checkId: "code-reference",
          requirementStatus: "missing",
          severity: "High",
          title: `${run.title} has no code references`,
          detail: "The committed implementation used by this run is unknown.",
          objectIds: runIds,
          recommendedFix:
            "Capture every executable code path and its content hash.",
        });
      } else if (run.codeRefs.some((reference) => !reference.contentHash)) {
        add({
          area: "Code",
          checkId: "code-hash",
          requirementStatus: "missing",
          severity: "High",
          title: `${run.title} has unhashed code references`,
          detail: "At least one code path lacks an immutable content hash.",
          objectIds: runIds,
          recommendedFix:
            "Record a content hash for every code reference used by the run.",
        });
      }
      if (
        run.status === "failed" ||
        (run.exitCode !== null && run.exitCode !== 0)
      ) {
        add({
          area: "Experiments",
          checkId: "run-result",
          requirementStatus: "failed",
          severity:
            connectedClaimIds(runIds, objectsById, relationships).length > 0
              ? "Blocking"
              : "High",
          title: `${run.title} failed`,
          detail: `The preserved run ended with status ${run.status} and exit code ${run.exitCode ?? "unknown"}.`,
          objectIds: runIds,
          recommendedFix:
            "Preserve the failure, correct it, and record a reviewed successful rerun.",
        });
      }
      if (run.status === "completed" && run.metrics.length === 0) {
        add({
          area: "Experiments",
          checkId: "run-metrics",
          requirementStatus: "missing",
          severity: "High",
          title: `${run.title} has no preserved metrics`,
          detail:
            "The completed run cannot be compared with declared outcomes.",
          objectIds: runIds,
          recommendedFix:
            "Log declared metrics with units, steps, and timestamps.",
        });
      }
      if (
        ["completed", "failed"].includes(run.status) &&
        run.artifacts.length === 0
      ) {
        add({
          area: "Outputs",
          checkId: "run-output",
          requirementStatus: "missing",
          severity: "High",
          title: `${run.title} has no preserved output artifact`,
          detail:
            "A terminal run has no registered figure, table, report, diagnostic, or output file.",
          objectIds: runIds,
          missingArtifactIds: [`output:${run.id}`],
          recommendedFix:
            "Register generated outputs with their paths, hashes, and generator metadata.",
        });
      }
      for (const artifact of run.artifacts) {
        const artifactIds = [...runIds, artifact.id];
        if (artifact.state === "stale") {
          add({
            area: "Outputs",
            checkId: "artifact-currentness",
            requirementStatus: "failed",
            severity:
              connectedClaimIds(artifactIds, objectsById, relationships)
                .length > 0
                ? "Blocking"
                : "High",
            title: `${artifact.title} is stale`,
            detail:
              artifact.staleReasons.map((reason) => reason.kind).join(", ") ||
              "Its captured inputs no longer match current inputs.",
            objectIds: artifactIds,
            recommendedFix:
              "Regenerate the artifact from current inputs and review linked claims.",
          });
        }
        if (!artifact.generatorPath || !artifact.generatorHash) {
          add({
            area: "Outputs",
            checkId: "artifact-generator",
            requirementStatus: "missing",
            severity: "High",
            title: `${artifact.title} lacks complete generator evidence`,
            detail:
              "Both the generator path and immutable generator hash are required.",
            objectIds: artifactIds,
            recommendedFix:
              "Record the generator path, hash, and exact regeneration command.",
          });
        }
      }
    }
  }

  for (const claim of claims) {
    const supporting = relationships.filter(
      (relationship) =>
        relationship.toObjectId === claim.id &&
        ["supports", "tests"].includes(relationship.type) &&
        relationship.reviewState === "approved",
    );
    const contradictions = relationships.filter(
      (relationship) =>
        relationship.toObjectId === claim.id &&
        relationship.type === "contradicts" &&
        relationship.reviewState !== "rejected",
    );
    if (supporting.length === 0) {
      add({
        area: "Claims",
        checkId: "claim-evidence",
        requirementStatus: "missing",
        severity: "Blocking",
        title: `${claim.title} has no supporting evidence`,
        detail:
          "No current source, run, or artifact is linked as evidence for this claim.",
        objectIds: [claim.id],
        missingArtifactIds: [`claim-evidence:${claim.id}`],
        recommendedFix:
          "Link reviewed evidence or explicitly retire the claim.",
      });
    }
    if (contradictions.length > 0 || claim.payload?.status === "contradicted") {
      add({
        area: "Claims",
        checkId: "claim-contradiction",
        requirementStatus: "failed",
        severity: "Blocking",
        title: `${claim.title} has contradictory evidence`,
        detail:
          "The current claim conflicts with persisted evidence and requires review.",
        objectIds: [
          claim.id,
          ...contradictions.map((relationship) => relationship.fromObjectId),
        ],
        recommendedFix:
          "Reconcile the contradiction and revise the claim or its limitations.",
      });
    }
    if (
      !claim.payload?.reproducibilityStatus ||
      claim.payload.reproducibilityStatus === "not-assessed"
    ) {
      add({
        area: "Claims",
        checkId: "claim-reproducibility",
        requirementStatus: "missing",
        severity: "High",
        title: `${claim.title} has not been reproducibility-assessed`,
        detail:
          "The claim does not record a passed or failed reproducibility decision.",
        objectIds: [claim.id, ...supporting.map((item) => item.fromObjectId)],
        recommendedFix:
          "Review the current evidence chain and record the claim assessment.",
      });
    } else if (claim.payload.reproducibilityStatus === "failed") {
      add({
        area: "Claims",
        checkId: "claim-reproducibility",
        requirementStatus: "failed",
        severity: "Blocking",
        title: `${claim.title} failed reproducibility assessment`,
        detail: "The persisted claim assessment is failed.",
        objectIds: [claim.id, ...supporting.map((item) => item.fromObjectId)],
        recommendedFix:
          "Repair the evidence chain and record a reviewed successful reassessment.",
      });
    }
  }

  for (const area of AREAS) {
    if (findings.some((finding) => finding.area === area)) continue;
    add({
      area,
      checkId: `${area.toLowerCase()}-coverage`,
      requirementStatus: "passed",
      severity: "Passed",
      title: `${area} checks passed`,
      detail: `No ${area.toLowerCase()} reproducibility gaps were detected.`,
      recommendedFix: "No action required.",
    });
  }

  findings.sort(
    (left, right) =>
      STATUS_RANK[left.severity] - STATUS_RANK[right.severity] ||
      AREAS.indexOf(left.area) - AREAS.indexOf(right.area) ||
      left.id.localeCompare(right.id),
  );
  const penalty = findings.reduce((total, finding) => {
    if (finding.severity === "Blocking") return total + 18;
    if (finding.severity === "High") return total + 10;
    if (finding.severity === "Warning") return total + 4;
    return total;
  }, 0);
  const score = Math.max(0, 100 - penalty);
  const summary = {
    blockingIssueIds: findings
      .filter((finding) => finding.severity === "Blocking")
      .map((finding) => finding.id),
    warningIds: findings
      .filter((finding) => ["High", "Warning"].includes(finding.severity))
      .map((finding) => finding.id),
    missingArtifactIds: [
      ...new Set(findings.flatMap((finding) => finding.missingArtifactIds)),
    ],
    affectedClaimIds: [
      ...new Set(findings.flatMap((finding) => finding.affectedClaimIds)),
    ].sort(),
    recommendedFixes: findings
      .filter((finding) => finding.severity !== "Passed")
      .map((finding) => ({
        findingId: finding.id,
        action: finding.recommendedFix,
      })),
    missingRequirementCount: findings.filter(
      (finding) => finding.requirementStatus === "missing",
    ).length,
    failedCheckCount: findings.filter(
      (finding) => finding.requirementStatus === "failed",
    ).length,
  };
  return {
    audit: {
      id,
      projectId: project.id,
      inputSha256: sha256({
        objects,
        relationships,
        lineages,
        provenance,
        provenanceIntegrity,
      }),
      score,
      status: reportStatus(score, findings),
      createdAt,
      findingIds: findings.map((finding) => finding.id),
      summary,
      areas: AREAS.map((area) => ({
        area,
        passed: !findings.some(
          (finding) =>
            finding.area === area && ISSUE_SEVERITIES.has(finding.severity),
        ),
        findingCount: findings.filter(
          (finding) =>
            finding.area === area && ISSUE_SEVERITIES.has(finding.severity),
        ).length,
      })),
    },
    findings,
  };
}

export function createReproducibilityAuditService(
  database,
  repository,
  { clock = () => new Date().toISOString(), createId = randomUUID } = {},
) {
  const dispositionsFor = (projectId, auditId) =>
    new Map(
      database
        .prepare(
          `SELECT finding_id, status FROM reproducibility_finding_dispositions
           WHERE project_id = ? AND audit_id = ?`,
        )
        .all(projectId, auditId)
        .map((row) => [row.finding_id, row.status]),
    );
  const mapRow = (row) => {
    const findings = JSON.parse(row.findings_json);
    const dispositions = dispositionsFor(row.project_id, row.id);
    return {
      audit: {
        id: row.id,
        projectId: row.project_id,
        inputSha256: row.input_sha256,
        score: row.score,
        status: row.status,
        summary: JSON.parse(row.summary_json),
        createdAt: row.created_at,
        findingIds: findings.map((finding) => finding.id),
        areas: AREAS.map((area) => ({
          area,
          passed: !findings.some(
            (finding) =>
              finding.area === area && ISSUE_SEVERITIES.has(finding.severity),
          ),
          findingCount: findings.filter(
            (finding) =>
              finding.area === area && ISSUE_SEVERITIES.has(finding.severity),
          ).length,
        })),
      },
      findings: findings.map((finding) => ({
        ...finding,
        status: dispositions.get(finding.id) ?? finding.status,
      })),
    };
  };

  return {
    run(projectId) {
      const report = generateReproducibilityReport(
        {
          project: repository.getProject(projectId),
          ...repository.listProject(projectId),
          lineages: repository.listExperimentLineages(projectId),
          provenance: repository.listProvenance(projectId),
          provenanceIntegrity: repository.verifyProvenance(projectId),
        },
        { createdAt: clock(), id: createId() },
      );
      database
        .prepare(
          `INSERT INTO reproducibility_audits
           (id, project_id, input_sha256, score, status, summary_json, findings_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          report.audit.id,
          projectId,
          report.audit.inputSha256,
          report.audit.score,
          report.audit.status,
          JSON.stringify(report.audit.summary),
          JSON.stringify(report.findings),
          report.audit.createdAt,
        );
      return report;
    },

    latest(projectId) {
      repository.getProject(projectId);
      const row = database
        .prepare(
          `SELECT * FROM reproducibility_audits
           WHERE project_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
        )
        .get(projectId);
      return row ? mapRow(row) : null;
    },

    resolve(projectId, auditId, findingId, actorId = "local-user") {
      const row = database
        .prepare(
          "SELECT * FROM reproducibility_audits WHERE id = ? AND project_id = ?",
        )
        .get(auditId, projectId);
      if (!row) throw new Error("Reproducibility audit was not found.");
      const finding = JSON.parse(row.findings_json).find(
        (candidate) => candidate.id === findingId,
      );
      if (!finding) throw new Error("Reproducibility finding was not found.");
      if (finding.severity === "Passed") {
        throw new Error("A passed check does not require resolution.");
      }
      database
        .prepare(
          `INSERT INTO reproducibility_finding_dispositions
           (audit_id, project_id, finding_id, status, actor_id, note, updated_at)
           VALUES (?, ?, ?, 'Resolved', ?, NULL, ?)
           ON CONFLICT(audit_id, finding_id) DO UPDATE SET
             status = excluded.status,
             actor_id = excluded.actor_id,
             note = excluded.note,
             updated_at = excluded.updated_at`,
        )
        .run(auditId, projectId, findingId, actorId, clock());
      return { ...finding, status: "Resolved" };
    },
  };
}
