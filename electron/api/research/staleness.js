import { createHash } from "node:crypto";
import { z } from "zod";

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/i);

const currentCodeRefSchema = z
  .object({
    path: z.string().trim().min(1).max(4_000),
    symbol: z.string().trim().min(1).max(1_000).optional(),
    kind: z.enum(["function", "class", "module", "notebook-cell"]).optional(),
    contentHash: hashSchema,
  })
  .strict();

const currentDatasetSchema = z
  .object({
    id: z.string().trim().min(1).max(4_000),
    version: z.string().trim().min(1).max(1_000).optional(),
    contentHash: hashSchema.optional(),
  })
  .strict()
  .refine(
    (value) => value.version !== undefined || value.contentHash !== undefined,
    "A current dataset requires a version or content hash.",
  );

const currentDependencySchema = z
  .object({
    name: z.string().trim().min(1).max(1_000),
    version: z.string().trim().min(1).max(1_000),
    integrity: z.string().trim().min(1).max(4_000).optional(),
  })
  .strict();

const currentArtifactSchema = z
  .object({
    path: z.string().trim().min(1).max(4_000),
    contentHash: hashSchema,
  })
  .strict();

const currentEnvironmentSchema = z
  .object({
    runtime: z.string().trim().min(1).max(200).optional(),
    runtimeVersion: z.string().trim().min(1).max(200).optional(),
    platform: z.string().trim().min(1).max(200).optional(),
    architecture: z.string().trim().min(1).max(100).optional(),
    imageDigest: z.string().trim().min(1).max(500).optional(),
    lockfileHash: hashSchema.optional(),
    fingerprint: hashSchema.optional(),
  })
  .strict();

export const projectStalenessInputSchema = z
  .object({
    projectId: z.string().trim().min(1),
    commitSha: z
      .string()
      .regex(/^[a-f0-9]{7,64}$/i)
      .optional(),
    code: z.array(currentCodeRefSchema).max(2_000).optional(),
    datasets: z.array(currentDatasetSchema).max(1_000).optional(),
    configuration: z.record(z.string(), z.unknown()).optional(),
    environment: currentEnvironmentSchema.optional(),
    dependencies: z.array(currentDependencySchema).max(2_000).optional(),
    artifacts: z.array(currentArtifactSchema).max(2_000).optional(),
    includeIncompleteProvenance: z.boolean().default(true),
    actorType: z
      .enum(["human", "agent", "system", "integration"])
      .default("system"),
    actorId: z.string().trim().min(1).max(200).default("staleness-detector"),
  })
  .strict()
  .superRefine((value, context) => {
    const unique = (items, key, path, message) => {
      const keys = items.map(key);
      if (new Set(keys).size !== keys.length) {
        context.addIssue({ code: "custom", path: [path], message });
      }
    };
    unique(
      value.code ?? [],
      (item) => `${item.path}\u0000${item.symbol ?? ""}`,
      "code",
      "Current code references must be unique by path and symbol.",
    );
    unique(
      value.datasets ?? [],
      (item) => item.id,
      "datasets",
      "Current datasets must be unique by id.",
    );
    unique(
      value.dependencies ?? [],
      (item) => item.name,
      "dependencies",
      "Current dependencies must be unique by name.",
    );
    unique(
      value.artifacts ?? [],
      (item) => item.path,
      "artifacts",
      "Current artifacts must be unique by path.",
    );
  });

const parseJson = (value, fallback = null) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

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

const hashJson = (value) =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");

const mapPathNode = (object) => ({
  id: object.id ?? object.object_id,
  type: object.type,
  title: object.title,
});

const mapRecord = (row, object) => ({
  object: mapPathNode(object),
  state: row.state,
  reasons: parseJson(row.reasons_json, []),
  explanation: row.explanation,
  dependencyPath: parseJson(row.dependency_path_json, []),
  recommendations: parseJson(row.recommendations_json, []),
  checkedAt: row.checked_at,
  updatedAt: row.updated_at,
});

const mapTransition = (row) => ({
  id: row.id,
  projectId: row.project_id,
  objectId: row.object_id,
  fromState: row.from_state,
  toState: row.to_state,
  reasons: parseJson(row.reasons_json, []),
  explanation: row.explanation,
  dependencyPath: parseJson(row.dependency_path_json, []),
  recommendations: parseJson(row.recommendations_json, []),
  provenanceEventId: row.provenance_event_id,
  createdAt: row.created_at,
});

const statePriority = { current: 0, "needs-review": 1, stale: 2 };

const reasonPriority = (reason) => {
  const root = reason.upstreamReason ?? reason;
  return (
    {
      code: 100,
      "experiment-definition": 95,
      dataset: 90,
      configuration: 80,
      environment: 80,
      dependencies: 80,
      "git-commit": 70,
      "manual-artifact-edit": 60,
      "incomplete-provenance": 50,
    }[root.kind] ?? 40
  );
};

const codeLabel = (code) =>
  code.symbol
    ? `${code.kind === "function" ? "Function" : code.kind === "notebook-cell" ? "Notebook cell" : "Symbol"} ${code.symbol} in ${code.path}`
    : `Code at ${code.path}`;

const recommendationsFor = (object, state, reasons) => {
  if (state === "current") return [];
  const recommendations = [];
  if (object.type === "run") {
    recommendations.push(
      "Re-run the experiment with the current code, data, configuration, and environment.",
    );
  } else if (object.type === "artifact") {
    recommendations.push(
      "Regenerate the artifact from a current run and verify its content hash.",
    );
  } else if (object.type === "claim") {
    recommendations.push(
      "Review the claim after its affected runs and artifacts are regenerated.",
    );
  }
  if (reasons.some((reason) => reason.kind === "manual-artifact-edit")) {
    recommendations.push(
      "Restore the generated artifact or record the manual edit as a new provenance event.",
    );
  }
  if (reasons.some((reason) => reason.kind === "incomplete-provenance")) {
    recommendations.push(
      "Capture the missing hashes or generator references before relying on this result.",
    );
  }
  return [...new Set(recommendations)];
};

export function createStalenessMethods({
  database,
  ensureProject,
  insertProvenance,
  clock,
  createId,
}) {
  const getObjects = (projectId) =>
    database
      .prepare(
        "SELECT id, project_id, type, title, description, payload FROM research_objects WHERE project_id = ?",
      )
      .all(projectId);

  const list = (projectId, { includeCurrent = false } = {}) => {
    ensureProject(projectId);
    return database
      .prepare(
        `SELECT state.*, object.type, object.title, object.description, object.payload
         FROM research_object_staleness state
         JOIN research_objects object ON object.id = state.object_id
         WHERE state.project_id = ? ${includeCurrent ? "" : "AND state.state <> 'current'"}
         ORDER BY CASE state.state WHEN 'stale' THEN 0 WHEN 'needs-review' THEN 1 ELSE 2 END,
                  object.type, object.title, object.id`,
      )
      .all(projectId)
      .map((row) => mapRecord(row, row));
  };

  return {
    assessProjectStaleness(input) {
      const parsed = projectStalenessInputSchema.parse(input);
      ensureProject(parsed.projectId);
      const objects = getObjects(parsed.projectId);
      const objectById = new Map(objects.map((object) => [object.id, object]));
      const previousRows = database
        .prepare("SELECT * FROM research_object_staleness WHERE project_id = ?")
        .all(parsed.projectId);
      const previousById = new Map(
        previousRows.map((row) => [row.object_id, row]),
      );
      const runs = database
        .prepare(
          `SELECT run.*, object.type, object.title, object.description
           FROM experiment_runs run
           JOIN research_objects object ON object.id = run.id
           WHERE run.project_id = ? ORDER BY run.started_at, run.id`,
        )
        .all(parsed.projectId);
      const artifacts = database
        .prepare(
          `SELECT artifact.*, object.type, object.title, object.description
           FROM run_artifacts artifact
           JOIN research_objects object ON object.id = artifact.id
           WHERE artifact.project_id = ? ORDER BY artifact.generated_at, artifact.id`,
        )
        .all(parsed.projectId);
      const artifactsByRun = new Map();
      for (const artifact of artifacts) {
        const values = artifactsByRun.get(artifact.run_id) ?? [];
        values.push(artifact);
        artifactsByRun.set(artifact.run_id, values);
      }
      const assessments = new Map();
      const initialize = (object) => {
        if (!assessments.has(object.id)) {
          assessments.set(object.id, {
            object,
            state: "current",
            reasons: [],
            explanation:
              "No upstream changes currently invalidate this object.",
            dependencyPath: [mapPathNode(object)],
            primaryReason: null,
            primaryReasonPriority: 0,
          });
        }
        return assessments.get(object.id);
      };
      for (const run of runs) initialize(run);
      for (const artifact of artifacts) initialize(artifact);

      const addImpact = (
        object,
        state,
        reason,
        explanation,
        dependencyPath,
      ) => {
        const assessment = initialize(object);
        const priority = reasonPriority(reason);
        const becomesPrimary =
          statePriority[state] > statePriority[assessment.state] ||
          (state === assessment.state &&
            priority > assessment.primaryReasonPriority);
        if (becomesPrimary) {
          assessment.state = state;
          assessment.explanation = explanation;
          assessment.dependencyPath = dependencyPath;
          assessment.primaryReason = reason;
          assessment.primaryReasonPriority = priority;
        }
        const reasonJson = canonicalJson(reason);
        const existingIndex = assessment.reasons.findIndex(
          (existing) => canonicalJson(existing) === reasonJson,
        );
        if (existingIndex === -1) {
          if (becomesPrimary) assessment.reasons.unshift(reason);
          else assessment.reasons.push(reason);
        } else if (becomesPrimary && existingIndex > 0) {
          assessment.reasons.splice(existingIndex, 1);
          assessment.reasons.unshift(reason);
        }
      };

      const reasonWasReassessed = (reason) => {
        if (reason.kind === "experiment-definition") return true;
        if (reason.kind === "git-commit") return parsed.commitSha !== undefined;
        if (reason.kind === "code") return parsed.code !== undefined;
        if (reason.kind === "dataset") return parsed.datasets !== undefined;
        if (reason.kind === "configuration")
          return parsed.configuration !== undefined;
        if (reason.kind === "environment")
          return parsed.environment !== undefined;
        if (reason.kind === "dependencies")
          return parsed.dependencies !== undefined;
        if (reason.kind === "manual-artifact-edit")
          return parsed.artifacts !== undefined;
        if (reason.kind === "incomplete-provenance")
          return parsed.includeIncompleteProvenance;
        return (
          reason.kind === "upstream-run" || reason.kind === "upstream-impact"
        );
      };
      for (const previous of previousRows) {
        const object = objectById.get(previous.object_id);
        if (!object) continue;
        const path = parseJson(previous.dependency_path_json, [
          mapPathNode(object),
        ]);
        for (const reason of parseJson(previous.reasons_json, [])) {
          if (reasonWasReassessed(reason)) continue;
          const state =
            object.type === "claim" || reason.kind === "incomplete-provenance"
              ? "needs-review"
              : "stale";
          addImpact(object, state, reason, previous.explanation, path);
        }
      }

      const codeChanges = (parsed.code ?? []).map((item) => ({
        ...item,
        contentHash: item.contentHash.toLowerCase(),
      }));
      const currentDatasets = new Map(
        (parsed.datasets ?? []).map((item) => [item.id, item]),
      );
      const definitions = database
        .prepare(
          `SELECT id, experiment_id, version, definition_hash
           FROM experiment_definition_versions
           WHERE project_id = ? ORDER BY experiment_id, version DESC`,
        )
        .all(parsed.projectId);
      const definitionById = new Map(
        definitions.map((definition) => [definition.id, definition]),
      );
      const latestDefinitionByExperiment = new Map();
      for (const definition of definitions) {
        if (!latestDefinitionByExperiment.has(definition.experiment_id)) {
          latestDefinitionByExperiment.set(
            definition.experiment_id,
            definition,
          );
        }
      }
      for (const run of runs) {
        const runNode = mapPathNode(run);
        const capturedCode = parseJson(run.code_refs_json, []);
        const capturedDatasets = parseJson(run.datasets_json, []);
        const capturedConfiguration = parseJson(run.configuration_json, {});
        const capturedEnvironment = parseJson(run.environment_json, {});
        const capturedDependencies = parseJson(run.dependencies_json, []);
        const capturedDefinition = definitionById.get(
          run.definition_version_id,
        );
        const currentDefinition = latestDefinitionByExperiment.get(
          run.experiment_id,
        );
        if (
          capturedDefinition &&
          currentDefinition &&
          capturedDefinition.definition_hash !==
            currentDefinition.definition_hash
        ) {
          const label = `Experiment definition changed from version ${capturedDefinition.version} to ${currentDefinition.version}`;
          addImpact(
            run,
            "stale",
            {
              kind: "experiment-definition",
              capturedHash: capturedDefinition.definition_hash,
              currentHash: currentDefinition.definition_hash,
              capturedVersion: capturedDefinition.version,
              currentVersion: currentDefinition.version,
              upstream: label,
            },
            `${label}; run ${run.title} is stale.`,
            [
              {
                id: `experiment-definition:${currentDefinition.id}`,
                type: "experiment-definition",
                title: label,
              },
              runNode,
            ],
          );
        }
        if (
          parsed.commitSha?.toLowerCase() !== undefined &&
          parsed.commitSha.toLowerCase() !== run.commit_sha
        ) {
          const label = `Git commit changed from ${run.commit_sha} to ${parsed.commitSha.toLowerCase()}`;
          const root = {
            id: `git:${parsed.commitSha.toLowerCase()}`,
            type: "git",
            title: label,
          };
          addImpact(
            run,
            "stale",
            {
              kind: "git-commit",
              captured: run.commit_sha,
              current: parsed.commitSha.toLowerCase(),
              upstream: label,
            },
            `${label}; run ${run.title} is stale.`,
            [root, runNode],
          );
        }
        for (const current of codeChanges) {
          const captured = capturedCode.find(
            (item) =>
              item.path === current.path &&
              (!current.symbol ||
                !item.symbol ||
                item.symbol === current.symbol),
          );
          if (!captured) continue;
          const label = codeLabel(current);
          const root = {
            id: `code:${current.path}${current.symbol ? `#${current.symbol}` : ""}`,
            type: "code",
            title: label,
          };
          if (current.symbol && !captured.symbol) {
            addImpact(
              run,
              "needs-review",
              {
                kind: "incomplete-provenance",
                field: "code.symbol",
                path: current.path,
                symbol: current.symbol,
                upstream: label,
              },
              `${label} may affect run ${run.title}, but its captured provenance is not symbol-specific.`,
              [root, runNode],
            );
          } else if (!captured.contentHash) {
            addImpact(
              run,
              "needs-review",
              {
                kind: "incomplete-provenance",
                field: "code.contentHash",
                path: current.path,
                symbol: current.symbol ?? null,
                upstream: label,
              },
              `${label} may affect run ${run.title}, but the captured code hash is missing.`,
              [root, runNode],
            );
          } else if (
            captured.contentHash.toLowerCase() !== current.contentHash
          ) {
            addImpact(
              run,
              "stale",
              {
                kind: "code",
                path: current.path,
                symbol: current.symbol ?? captured.symbol ?? null,
                capturedHash: captured.contentHash.toLowerCase(),
                currentHash: current.contentHash,
                upstream: `${label} changed`,
              },
              `${label} changed; run ${run.title} is stale.`,
              [root, runNode],
            );
          }
        }
        for (const captured of capturedDatasets) {
          const current = currentDatasets.get(captured.id);
          if (!current) continue;
          const versionChanged =
            current.version !== undefined &&
            current.version !== captured.version;
          const hashChanged =
            current.contentHash !== undefined &&
            captured.contentHash !== undefined &&
            current.contentHash.toLowerCase() !==
              captured.contentHash?.toLowerCase();
          if (current.contentHash && !captured.contentHash) {
            const label = `Dataset ${captured.id} is missing a captured content hash`;
            addImpact(
              run,
              "needs-review",
              {
                kind: "incomplete-provenance",
                field: "dataset.contentHash",
                datasetId: captured.id,
                upstream: label,
              },
              `${label}; run ${run.title} needs review.`,
              [
                {
                  id: `dataset:${captured.id}`,
                  type: "dataset",
                  title: label,
                },
                runNode,
              ],
            );
          }
          if (versionChanged || hashChanged) {
            const label = `Dataset ${captured.id} changed`;
            addImpact(
              run,
              "stale",
              {
                kind: "dataset",
                id: captured.id,
                capturedVersion: captured.version,
                currentVersion: current.version ?? captured.version,
                capturedHash: captured.contentHash ?? null,
                currentHash: current.contentHash ?? null,
                upstream: label,
              },
              `${label}; run ${run.title} is stale.`,
              [
                { id: `dataset:${captured.id}`, type: "dataset", title: label },
                runNode,
              ],
            );
          }
        }
        const snapshots = [
          ["configuration", parsed.configuration, capturedConfiguration],
          ["environment", parsed.environment, capturedEnvironment],
          ["dependencies", parsed.dependencies, capturedDependencies],
        ];
        for (const [kind, current, captured] of snapshots) {
          if (
            current !== undefined &&
            hashJson(current) !== hashJson(captured)
          ) {
            const label = `${kind[0].toUpperCase()}${kind.slice(1)} changed`;
            addImpact(
              run,
              "stale",
              {
                kind,
                capturedHash: hashJson(captured),
                currentHash: hashJson(current),
                upstream: label,
              },
              `${label}; run ${run.title} is stale.`,
              [
                {
                  id: `${kind}:${hashJson(current)}`,
                  type: kind,
                  title: label,
                },
                runNode,
              ],
            );
          }
        }
        if (parsed.includeIncompleteProvenance) {
          const missing = [];
          if (capturedCode.length === 0) missing.push("code references");
          if (capturedCode.some((item) => !item.contentHash))
            missing.push("code hashes");
          if (capturedDatasets.some((item) => !item.contentHash))
            missing.push("dataset hashes");
          if (Object.keys(capturedEnvironment).length === 0)
            missing.push("environment snapshot");
          if (missing.length > 0) {
            const label = `Incomplete provenance: missing ${missing.join(", ")}`;
            addImpact(
              run,
              "needs-review",
              {
                kind: "incomplete-provenance",
                fields: missing,
                upstream: label,
              },
              `${label}; run ${run.title} needs review.`,
              [
                {
                  id: `provenance:${run.id}`,
                  type: "provenance",
                  title: label,
                },
                runNode,
              ],
            );
          }
        }
      }

      const currentArtifacts = new Map(
        (parsed.artifacts ?? []).map((artifact) => [artifact.path, artifact]),
      );
      for (const artifact of artifacts) {
        const artifactNode = mapPathNode(artifact);
        const current = currentArtifacts.get(artifact.path);
        if (
          current &&
          current.contentHash.toLowerCase() !==
            artifact.content_hash.toLowerCase()
        ) {
          const label = `Artifact ${artifact.path} was edited outside its recorded run`;
          addImpact(
            artifact,
            "stale",
            {
              kind: "manual-artifact-edit",
              path: artifact.path,
              capturedHash: artifact.content_hash.toLowerCase(),
              currentHash: current.contentHash.toLowerCase(),
              upstream: label,
            },
            `${label}; ${artifact.kind} ${artifact.title} is stale.`,
            [
              {
                id: `artifact-file:${artifact.path}`,
                type: "file",
                title: label,
              },
              artifactNode,
            ],
          );
        }
        if (
          parsed.includeIncompleteProvenance &&
          (!artifact.generator_path || !artifact.generator_hash)
        ) {
          const label =
            "Incomplete artifact provenance: generator path or hash is missing";
          addImpact(
            artifact,
            "needs-review",
            {
              kind: "incomplete-provenance",
              fields: [
                !artifact.generator_path ? "generatorPath" : null,
                !artifact.generator_hash ? "generatorHash" : null,
              ].filter(Boolean),
              upstream: label,
            },
            `${label}; ${artifact.kind} ${artifact.title} needs review.`,
            [
              {
                id: `provenance:${artifact.id}`,
                type: "provenance",
                title: label,
              },
              artifactNode,
            ],
          );
        }
      }

      for (const run of runs) {
        const runAssessment = assessments.get(run.id);
        if (!runAssessment || runAssessment.state === "current") continue;
        for (const artifact of artifactsByRun.get(run.id) ?? []) {
          const reason =
            runAssessment.primaryReason ?? runAssessment.reasons[0];
          const path = [...runAssessment.dependencyPath, mapPathNode(artifact)];
          addImpact(
            artifact,
            runAssessment.state,
            { kind: "upstream-run", runId: run.id, upstreamReason: reason },
            `${reason.upstream}; ${artifact.kind} ${artifact.title} depends on affected run ${run.title}.`,
            path,
          );
        }
      }

      const relationships = database
        .prepare(
          `SELECT * FROM research_relationships
           WHERE project_id = ? AND review_state <> 'rejected'
           ORDER BY created_at, id`,
        )
        .all(parsed.projectId);
      const downstream = new Map();
      const addEdge = (from, to) => {
        const targets = downstream.get(from) ?? [];
        targets.push(to);
        downstream.set(from, targets);
      };
      for (const relationship of relationships) {
        if (
          relationship.type === "generated-by" ||
          relationship.type === "uses"
        ) {
          addEdge(relationship.to_object_id, relationship.from_object_id);
        } else {
          addEdge(relationship.from_object_id, relationship.to_object_id);
        }
      }
      const queue = [...assessments.values()]
        .filter((assessment) => assessment.state !== "current")
        .map((assessment) => ({
          id: assessment.object.id,
          root: assessment,
          path: assessment.dependencyPath,
        }));
      const visited = new Set(
        queue.map((item) => `${item.root.object.id}:${item.id}`),
      );
      while (queue.length > 0) {
        const item = queue.shift();
        for (const targetId of downstream.get(item.id) ?? []) {
          const key = `${item.root.object.id}:${targetId}`;
          if (visited.has(key)) continue;
          visited.add(key);
          const target = objectById.get(targetId);
          if (!target) continue;
          const path = [...item.path, mapPathNode(target)];
          if (target.type === "claim") {
            const rootReason = item.root.primaryReason ?? item.root.reasons[0];
            addImpact(
              target,
              "needs-review",
              {
                kind: "upstream-impact",
                upstreamObjectId: item.root.object.id,
                upstreamReason: rootReason,
              },
              `${rootReason.upstream}; claim ${target.title} depends on the affected lineage and needs review.`,
              path,
            );
          } else {
            queue.push({ id: targetId, root: item.root, path });
          }
        }
      }

      for (const row of previousRows) {
        const object = objectById.get(row.object_id);
        if (object) initialize(object);
      }

      const now = clock();
      database.exec("BEGIN IMMEDIATE");
      try {
        for (const assessment of [...assessments.values()].sort((left, right) =>
          left.object.id.localeCompare(right.object.id),
        )) {
          assessment.recommendations = recommendationsFor(
            assessment.object,
            assessment.state,
            assessment.reasons,
          );
          const reasonsJson = canonicalJson(assessment.reasons);
          const pathJson = canonicalJson(assessment.dependencyPath);
          const recommendationsJson = canonicalJson(assessment.recommendations);
          const previous = previousById.get(assessment.object.id);
          const changed =
            !previous ||
            previous.state !== assessment.state ||
            previous.reasons_json !== reasonsJson ||
            previous.explanation !== assessment.explanation ||
            previous.dependency_path_json !== pathJson ||
            previous.recommendations_json !== recommendationsJson;
          database
            .prepare(
              `INSERT INTO research_object_staleness
               (object_id, project_id, state, reasons_json, explanation,
                dependency_path_json, recommendations_json, checked_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(object_id) DO UPDATE SET
                 state = excluded.state,
                 reasons_json = excluded.reasons_json,
                 explanation = excluded.explanation,
                 dependency_path_json = excluded.dependency_path_json,
                 recommendations_json = excluded.recommendations_json,
                 checked_at = excluded.checked_at,
                 updated_at = CASE WHEN
                   research_object_staleness.state <> excluded.state OR
                   research_object_staleness.reasons_json <> excluded.reasons_json OR
                   research_object_staleness.explanation <> excluded.explanation OR
                   research_object_staleness.dependency_path_json <> excluded.dependency_path_json OR
                   research_object_staleness.recommendations_json <> excluded.recommendations_json
                   THEN excluded.updated_at ELSE research_object_staleness.updated_at END`,
            )
            .run(
              assessment.object.id,
              parsed.projectId,
              assessment.state,
              reasonsJson,
              assessment.explanation,
              pathJson,
              recommendationsJson,
              now,
              now,
            );
          if (assessment.object.type === "artifact") {
            database
              .prepare(
                `UPDATE run_artifacts
                 SET state = ?, stale_reasons_json = ?, checked_at = ?
                 WHERE id = ? AND project_id = ?`,
              )
              .run(
                assessment.state === "current" ? "current" : "stale",
                reasonsJson,
                now,
                assessment.object.id,
                parsed.projectId,
              );
          }
          if (
            assessment.object.type === "claim" &&
            assessment.state === "needs-review"
          ) {
            database
              .prepare(
                `UPDATE research_objects
                 SET payload = json_set(payload, '$.status', 'needs-evidence', '$.reviewStatus', 'Needs review'),
                     updated_at = ?
                 WHERE id = ? AND project_id = ?`,
              )
              .run(now, assessment.object.id, parsed.projectId);
          }
          if (!changed || (!previous && assessment.state === "current")) {
            continue;
          }
          const claimPayload =
            assessment.object.type === "claim"
              ? parseJson(assessment.object.payload, {})
              : null;
          const event = insertProvenance(
            {
              id: createId(),
              projectId: parsed.projectId,
              objectId: assessment.object.id,
              action:
                assessment.state === "stale"
                  ? "staleness.marked-stale"
                  : assessment.state === "needs-review"
                    ? "staleness.needs-review"
                    : "staleness.marked-current",
              actorType: parsed.actorType,
              actorId: parsed.actorId,
              metadata: {
                from: previous?.state ?? "current",
                to: assessment.state,
                reasons: assessment.reasons,
                dependencyPath: assessment.dependencyPath,
                recommendations: assessment.recommendations,
                claimReviewStatus:
                  assessment.object.type === "claim" &&
                  assessment.state === "needs-review"
                    ? {
                        from:
                          claimPayload.reviewStatus ??
                          claimPayload.status ??
                          "unknown",
                        to: "Needs review",
                      }
                    : undefined,
              },
            },
            now,
          );
          database
            .prepare(
              `INSERT INTO research_object_staleness_transitions
               (id, project_id, object_id, from_state, to_state, reasons_json,
                explanation, dependency_path_json, recommendations_json,
                provenance_event_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              createId(),
              parsed.projectId,
              assessment.object.id,
              previous?.state ?? "current",
              assessment.state,
              reasonsJson,
              assessment.explanation,
              pathJson,
              recommendationsJson,
              event.id,
              now,
            );
        }
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      return {
        projectId: parsed.projectId,
        checkedAt: now,
        impacted: list(parsed.projectId),
        states: list(parsed.projectId, { includeCurrent: true }),
      };
    },

    listStaleness(projectId, options) {
      return list(projectId, options);
    },

    listStalenessTransitions(projectId, objectId) {
      ensureProject(projectId);
      const object = database
        .prepare(
          "SELECT id FROM research_objects WHERE id = ? AND project_id = ?",
        )
        .get(objectId, projectId);
      if (!object)
        throw new Error("Research object does not belong to the project.");
      return database
        .prepare(
          `SELECT * FROM research_object_staleness_transitions
           WHERE project_id = ? AND object_id = ?
           ORDER BY created_at, rowid`,
        )
        .all(projectId, objectId)
        .map(mapTransition);
    },
  };
}
