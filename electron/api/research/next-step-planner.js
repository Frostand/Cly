import { createHash, randomUUID } from "node:crypto";

const CATEGORY_PRIORITY = {
  "blocking-dependency": 700,
  verification: 600,
  reproducibility: 500,
  "evidence-gap": 400,
  "stale-artifact": 350,
  conflict: 300,
  workflow: 200,
};

const ACTION_RELATION = {
  accept: "accepted-because-of",
  edit: "edited-because-of",
  defer: "deferred-because-of",
  dismiss: "dismissed-despite",
};

const parseJson = (value, fallback) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const stableJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const hash = (...values) =>
  createHash("sha256").update(values.join("\u001f")).digest("hex");

const stableId = (prefix, ...values) =>
  `${prefix}-${hash(...values).slice(0, 24)}`;

const tableExists = (database, name) =>
  Boolean(
    database
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
      )
      .get(name),
  );

const mapEvidenceRow = (row) => ({
  id: row.id,
  kind: row.evidence_kind,
  objectId: row.object_id,
  relationshipId: row.relationship_id,
  provenanceEventId: row.provenance_event_id,
  auditFindingId: row.audit_finding_id,
  workflowReference: row.workflow_reference,
  label: row.label,
  rationale: row.rationale,
});

const mapRecommendationRow = (row, evidence = []) => ({
  id: row.id,
  projectId: row.project_id,
  planId: row.plan_id,
  category: row.category,
  title: row.title,
  rationale: row.rationale,
  expectedBenefit: row.expected_benefit,
  priority: row.priority,
  effort: row.effort,
  rankScore: row.rank_score,
  dependencies: parseJson(row.dependencies_json, []),
  proposedAction: parseJson(row.proposed_action_json, {}),
  status: row.status,
  requiresExplicitApproval: row.requires_explicit_approval === 1,
  executionState: "not-created",
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  evidence,
});

const latestProvenance = (events, objectId) =>
  events.find((event) => event.object_id === objectId) ?? null;

function buildCandidates({
  objects,
  relationships,
  provenance,
  artifacts,
  findings,
  project,
}) {
  const candidates = [];
  const objectById = new Map(objects.map((object) => [object.id, object]));
  const relationshipEvidence = (relationship, rationale) => ({
    kind: "graph",
    objectId: relationship.to_object_id,
    relationshipId: relationship.id,
    provenanceEventId:
      latestProvenance(provenance, relationship.to_object_id)?.id ?? null,
    auditFindingId: null,
    workflowReference: null,
    label: `${objectById.get(relationship.from_object_id)?.title ?? relationship.from_object_id} ${relationship.type} ${objectById.get(relationship.to_object_id)?.title ?? relationship.to_object_id}`,
    rationale,
  });
  const objectEvidence = (object, kind, rationale) => ({
    kind,
    objectId: object.id,
    relationshipId: null,
    provenanceEventId: latestProvenance(provenance, object.id)?.id ?? null,
    auditFindingId: null,
    workflowReference: null,
    label: object.title,
    rationale,
  });

  const metadata = parseJson(project.metadata, {});
  const openQuestions = Array.isArray(metadata.openQuestions)
    ? metadata.openQuestions.filter(
        (question) => typeof question === "string" && question.trim(),
      )
    : [];
  openQuestions.forEach((question, index) => {
    candidates.push({
      key: `open-question:${index}:${question}`,
      category: "workflow",
      title: `Clarify open question: ${question}`,
      rationale:
        "The project workflow records this research question as open and unresolved.",
      expectedBenefit:
        "Turns an unresolved question into a reviewable research decision or evidence request.",
      priority: "medium",
      effort: "small",
      score: 65,
      dependencies: [],
      action: {
        kind: "review",
        description: `Review open question: ${question}`,
      },
      evidence: [
        {
          kind: "workflow",
          objectId: null,
          relationshipId: null,
          provenanceEventId: null,
          auditFindingId: null,
          workflowReference: `project:${project.id}:open-question:${index}`,
          label: question,
          rationale:
            "Persisted in project workflow metadata as an open question.",
        },
      ],
    });
  });

  const risks = Array.isArray(metadata.risks) ? metadata.risks : [];
  risks.forEach((risk, index) => {
    const title =
      typeof risk === "string"
        ? risk.trim()
        : risk && typeof risk.title === "string"
          ? risk.title.trim()
          : "";
    if (!title || (typeof risk === "object" && risk.resolved === true)) return;
    const blocking = typeof risk === "object" && risk.blocking === true;
    candidates.push({
      key: `risk:${index}:${title}`,
      category: blocking ? "blocking-dependency" : "workflow",
      title: `${blocking ? "Resolve blocking risk" : "Review open risk"}: ${title}`,
      rationale: blocking
        ? "The project workflow marks this unresolved risk as blocking downstream work."
        : "The project workflow records this unresolved research risk.",
      expectedBenefit: "Makes the risk disposition explicit and auditable.",
      priority: blocking ? "critical" : "medium",
      effort: "medium",
      score: blocking ? 97 : 70,
      dependencies: [],
      action: { kind: "resolve", description: `Review project risk: ${title}` },
      evidence: [
        {
          kind: "workflow",
          objectId: null,
          relationshipId: null,
          provenanceEventId: null,
          auditFindingId: null,
          workflowReference: `project:${project.id}:risk:${index}`,
          label: title,
          rationale:
            "Persisted in project workflow metadata as an unresolved risk.",
        },
      ],
    });
  });

  for (const object of objects) {
    const payload = parseJson(object.payload, {});
    if (object.type === "run" && payload.status === "failed") {
      candidates.push({
        key: `failed-run:${object.id}`,
        category: "blocking-dependency",
        title: `Unblock failed run: ${object.title}`,
        rationale:
          "This failed run blocks downstream verification and should be diagnosed before lower-priority work.",
        expectedBenefit:
          "Restores the experiment path needed to verify dependent claims.",
        priority: "critical",
        effort: "medium",
        score: 100,
        dependencies: [],
        action: {
          kind: "review",
          description: `Diagnose failed run ${object.id}.`,
        },
        evidence: [
          objectEvidence(
            object,
            "workflow",
            "The persisted run state is failed.",
          ),
        ],
      });
    }

    if (object.type !== "claim") continue;
    const supports = relationships.filter(
      (edge) => edge.to_object_id === object.id && edge.type === "supports",
    );
    const contradicts = relationships.filter(
      (edge) => edge.to_object_id === object.id && edge.type === "contradicts",
    );
    const reviewStatus = payload.reviewStatus;
    const needsEvidence =
      payload.status === "draft" ||
      payload.status === "needs-evidence" ||
      ["Unsupported", "Weak", "Needs review"].includes(reviewStatus);

    if (supports.length > 0 && contradicts.length > 0) {
      candidates.push({
        key: `conflict:${object.id}`,
        category: "verification",
        title: `Resolve conflicting evidence for ${object.title}`,
        rationale:
          "The claim graph contains both supporting and contradicting evidence; the conflict must be reviewed before the claim can be strengthened.",
        expectedBenefit:
          "Produces an explainable evidence judgment and prevents selective citation.",
        priority: "high",
        effort: "medium",
        score: 88,
        dependencies: [...supports, ...contradicts]
          .map((edge) => edge.id)
          .sort(),
        action: {
          kind: "review",
          description: `Compare supporting and contradicting evidence linked to ${object.id}.`,
        },
        evidence: [
          objectEvidence(
            object,
            "audit",
            "The claim is the subject of the evidence conflict.",
          ),
          ...supports.map((edge) =>
            relationshipEvidence(edge, "This graph edge supports the claim."),
          ),
          ...contradicts.map((edge) =>
            relationshipEvidence(
              edge,
              "This graph edge contradicts the claim.",
            ),
          ),
        ],
      });
    } else if (needsEvidence && supports.length === 0) {
      candidates.push({
        key: `missing-evidence:${object.id}`,
        category: "verification",
        title: `Add verifiable evidence for ${object.title}`,
        rationale:
          "The claim is marked as needing evidence and has no supporting graph edge.",
        expectedBenefit:
          "Makes the claim reviewable from linked source evidence.",
        priority: "high",
        effort: "small",
        score: 86,
        dependencies: [],
        action: {
          kind: "review",
          description: `Review sources and link evidence to claim ${object.id}.`,
        },
        evidence: [
          objectEvidence(
            object,
            "audit",
            "The claim status records a missing evidence gap.",
          ),
        ],
      });
    }

    if ((payload.openRiskCount ?? 0) > 0) {
      candidates.push({
        key: `open-risk:${object.id}`,
        category: "blocking-dependency",
        title: `Resolve ${payload.openRiskCount} open risk${payload.openRiskCount === 1 ? "" : "s"} for ${object.title}`,
        rationale:
          "Open claim risks are blocking dependencies and take precedence over exploratory work.",
        expectedBenefit: "Removes known blockers from the claim review path.",
        priority: "critical",
        effort: "medium",
        score: 96,
        dependencies: [],
        action: {
          kind: "resolve",
          description: `Review open risks for claim ${object.id}.`,
        },
        evidence: [
          objectEvidence(
            object,
            "audit",
            "The claim audit records unresolved risks.",
          ),
        ],
      });
    }

    if (payload.reproducibilityStatus === "failed") {
      candidates.push({
        key: `reproducibility:${object.id}`,
        category: "reproducibility",
        title: `Repair reproducibility for ${object.title}`,
        rationale:
          "The persisted claim audit reports a failed reproducibility check.",
        expectedBenefit:
          "Makes the claim regenerable and independently reviewable.",
        priority: "high",
        effort: "medium",
        score: 92,
        dependencies: [],
        action: {
          kind: "review",
          description: `Audit reproducibility inputs for claim ${object.id}.`,
        },
        evidence: [
          objectEvidence(
            object,
            "audit",
            "The claim reproducibility status is failed.",
          ),
        ],
      });
    }
  }

  for (const artifact of artifacts) {
    const object = objectById.get(artifact.id);
    if (!object) continue;
    candidates.push({
      key: `stale-artifact:${artifact.id}`,
      category: "reproducibility",
      title: `Regenerate stale ${artifact.kind}: ${object.title}`,
      rationale: `The artifact is stale: ${parseJson(artifact.stale_reasons_json, []).join("; ") || "its recorded inputs changed"}.`,
      expectedBenefit:
        "Restores current, reproducible evidence for downstream claims.",
      priority: "high",
      effort: "medium",
      score: 94,
      dependencies: [artifact.run_id],
      action: {
        kind: "regenerate",
        description: `Regenerate artifact ${artifact.id} from its recorded run inputs.`,
      },
      evidence: [
        {
          ...objectEvidence(
            object,
            "audit",
            "The persisted artifact state is stale.",
          ),
          provenanceEventId: artifact.provenance_event_id,
        },
      ],
    });
  }

  for (const finding of findings) {
    const category =
      finding.category === "missing-provenance"
        ? "reproducibility"
        : finding.category === "failed-run"
          ? "blocking-dependency"
          : "workflow";
    const evidenceRows = finding.evidence.length
      ? finding.evidence.map((evidence) => ({
          kind: "audit",
          objectId: evidence.object_id,
          relationshipId: null,
          provenanceEventId: evidence.provenance_event_id,
          auditFindingId: finding.id,
          workflowReference: null,
          label: finding.title,
          rationale: finding.detail,
        }))
      : [];
    if (!evidenceRows.length) continue;
    candidates.push({
      key: `audit-finding:${finding.id}`,
      category,
      title: finding.title,
      rationale: finding.detail,
      expectedBenefit: "Closes an open, evidence-linked audit finding.",
      priority: category === "blocking-dependency" ? "critical" : "high",
      effort: "medium",
      score: category === "blocking-dependency" ? 98 : 90,
      dependencies: [],
      action: { kind: "resolve", description: finding.recommended_action },
      evidence: evidenceRows,
    });
  }

  return candidates
    .map((candidate) => ({
      ...candidate,
      rankScore: CATEGORY_PRIORITY[candidate.category] + candidate.score,
      evidence: candidate.evidence
        .filter(
          (evidence) =>
            evidence.objectId ||
            evidence.relationshipId ||
            evidence.provenanceEventId ||
            evidence.auditFindingId ||
            evidence.workflowReference,
        )
        .sort((a, b) =>
          `${a.kind}:${a.objectId ?? ""}:${a.relationshipId ?? ""}`.localeCompare(
            `${b.kind}:${b.objectId ?? ""}:${b.relationshipId ?? ""}`,
          ),
        ),
    }))
    .filter((candidate) => candidate.evidence.length > 0)
    .sort(
      (a, b) =>
        b.rankScore - a.rankScore ||
        a.title.localeCompare(b.title) ||
        a.key.localeCompare(b.key),
    );
}

export function createNextStepPlanner(
  database,
  {
    clock = () => new Date().toISOString(),
    createId = () => randomUUID(),
  } = {},
) {
  const readInputs = (projectId) => {
    const project = database
      .prepare("SELECT id, metadata FROM projects WHERE id = ?")
      .get(projectId);
    const objects = database
      .prepare(
        "SELECT id, project_id, type, title, payload, updated_at FROM research_objects WHERE project_id = ? ORDER BY id",
      )
      .all(projectId);
    const relationships = database
      .prepare(
        "SELECT id, project_id, from_object_id, to_object_id, type, review_state FROM research_relationships WHERE project_id = ? AND review_state <> 'rejected' ORDER BY id",
      )
      .all(projectId);
    const provenance = database
      .prepare(
        "SELECT id, object_id, action, created_at FROM provenance_events WHERE project_id = ? ORDER BY coalesce(sequence, 0) DESC, created_at DESC, id DESC",
      )
      .all(projectId);
    const artifacts = tableExists(database, "run_artifacts")
      ? database
          .prepare(
            "SELECT id, run_id, kind, stale_reasons_json, provenance_event_id FROM run_artifacts WHERE project_id = ? AND state = 'stale' ORDER BY id",
          )
          .all(projectId)
      : [];
    const findings = tableExists(database, "decision_brief_findings")
      ? database
          .prepare(
            `SELECT id, category, title, detail, recommended_action
             FROM decision_brief_findings
             WHERE project_id = ? AND status IN ('open', 'assigned')
             ORDER BY id`,
          )
          .all(projectId)
          .map((finding) => ({
            ...finding,
            evidence: tableExists(database, "decision_brief_finding_evidence")
              ? database
                  .prepare(
                    `SELECT object_id, provenance_event_id
                     FROM decision_brief_finding_evidence
                     WHERE project_id = ? AND finding_id = ? ORDER BY id`,
                  )
                  .all(projectId, finding.id)
              : [],
          }))
      : [];
    return { project, objects, relationships, provenance, artifacts, findings };
  };

  const readRecommendations = (projectId, planId = null) => {
    const rows = database
      .prepare(
        `SELECT * FROM planner_recommendations
         WHERE project_id = ? AND (? IS NULL OR plan_id = ?)
         ORDER BY rank_score DESC, title, id`,
      )
      .all(projectId, planId, planId);
    const evidenceStatement = database.prepare(
      `SELECT * FROM planner_recommendation_evidence
       WHERE project_id = ? AND recommendation_id = ?
       ORDER BY evidence_kind, label, id`,
    );
    return rows.map((row) =>
      mapRecommendationRow(
        row,
        evidenceStatement.all(projectId, row.id).map(mapEvidenceRow),
      ),
    );
  };

  const list = (projectId) => {
    const latest = database
      .prepare(
        `SELECT id FROM planner_plans
         WHERE project_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
      )
      .get(projectId);
    return latest ? readRecommendations(projectId, latest.id) : [];
  };

  const generate = (projectId, actor = "local-user") => {
    const project = database
      .prepare("SELECT id FROM projects WHERE id = ?")
      .get(projectId);
    if (!project) throw new Error("Research project was not found.");
    const inputs = readInputs(projectId);
    const candidates = buildCandidates(inputs);
    const fingerprint = hash(stableJson(inputs));
    const existing = database
      .prepare(
        "SELECT id FROM planner_plans WHERE project_id = ? AND fingerprint = ?",
      )
      .get(projectId, fingerprint);
    if (existing) {
      return {
        planId: existing.id,
        created: false,
        fingerprint,
        recommendations: readRecommendations(projectId, existing.id),
      };
    }

    const now = clock();
    const planId = stableId("plan", projectId, fingerprint);
    database.exec("BEGIN IMMEDIATE");
    try {
      database
        .prepare(
          `INSERT INTO planner_plans
             (id, project_id, fingerprint, generated_by, input_summary_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          planId,
          projectId,
          fingerprint,
          actor,
          JSON.stringify({
            artifactCount: inputs.artifacts.length,
            findingCount: inputs.findings.length,
            objectCount: inputs.objects.length,
            relationshipCount: inputs.relationships.length,
          }),
          now,
        );
      const insertRecommendation = database.prepare(
        `INSERT INTO planner_recommendations
           (id, project_id, plan_id, category, title, rationale, expected_benefit,
            priority, effort, rank_score, dependencies_json, proposed_action_json,
            status, requires_explicit_approval, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'recommended', 1, ?, ?)`,
      );
      const insertEvidence = database.prepare(
        `INSERT INTO planner_recommendation_evidence
           (id, project_id, recommendation_id, evidence_kind, object_id,
            relationship_id, provenance_event_id, audit_finding_id,
            workflow_reference, label, rationale, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      candidates.forEach((candidate) => {
        const recommendationId = stableId(
          "recommendation",
          projectId,
          fingerprint,
          candidate.key,
        );
        insertRecommendation.run(
          recommendationId,
          projectId,
          planId,
          candidate.category,
          candidate.title,
          candidate.rationale,
          candidate.expectedBenefit,
          candidate.priority,
          candidate.effort,
          candidate.rankScore,
          JSON.stringify(candidate.dependencies),
          JSON.stringify(candidate.action),
          now,
          now,
        );
        candidate.evidence.forEach((evidence, index) => {
          insertEvidence.run(
            stableId(
              "evidence",
              recommendationId,
              String(index),
              stableJson(evidence),
            ),
            projectId,
            recommendationId,
            evidence.kind,
            evidence.objectId,
            evidence.relationshipId,
            evidence.provenanceEventId,
            evidence.auditFindingId,
            evidence.workflowReference,
            evidence.label,
            evidence.rationale,
            now,
          );
        });
      });
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    return {
      planId,
      created: true,
      fingerprint,
      recommendations: readRecommendations(projectId, planId),
    };
  };

  const decide = ({
    projectId,
    recommendationId,
    action,
    actor = "local-user",
    reason = null,
    edit = null,
  }) => {
    const row = database
      .prepare(
        "SELECT * FROM planner_recommendations WHERE id = ? AND project_id = ?",
      )
      .get(recommendationId, projectId);
    if (!row) throw new Error("Planner recommendation was not found.");
    if (["defer", "dismiss"].includes(action) && !reason?.trim()) {
      throw new Error(
        `${action === "defer" ? "Deferring" : "Dismissing"} a recommendation requires a reason.`,
      );
    }
    if (action === "edit" && !edit) {
      throw new Error("Editing a recommendation requires corrected content.");
    }
    if (action !== "edit" && edit) {
      throw new Error("Corrected content is only valid for an edit decision.");
    }

    const before = mapRecommendationRow(row);
    if (before.status !== "recommended") {
      throw new Error("This recommendation already has a review decision.");
    }
    const next = {
      ...before,
      ...(edit ?? {}),
      status:
        action === "accept"
          ? "accepted"
          : action === "defer"
            ? "deferred"
            : action === "dismiss"
              ? "dismissed"
              : before.status,
      updatedAt: clock(),
    };
    const decisionId = createId();
    const auditId = createId();
    const evidence = database
      .prepare(
        "SELECT id FROM planner_recommendation_evidence WHERE project_id = ? AND recommendation_id = ? ORDER BY id",
      )
      .all(projectId, recommendationId);

    database.exec("BEGIN IMMEDIATE");
    try {
      database
        .prepare(
          `UPDATE planner_recommendations SET
             title = ?, rationale = ?, expected_benefit = ?, effort = ?,
             dependencies_json = ?, proposed_action_json = ?, status = ?, updated_at = ?
           WHERE id = ? AND project_id = ?`,
        )
        .run(
          next.title,
          next.rationale,
          next.expectedBenefit,
          next.effort,
          JSON.stringify(next.dependencies),
          JSON.stringify(next.proposedAction),
          next.status,
          next.updatedAt,
          recommendationId,
          projectId,
        );
      database
        .prepare(
          `INSERT INTO planner_decisions
             (id, project_id, recommendation_id, action, actor, reason,
              before_json, after_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          decisionId,
          projectId,
          recommendationId,
          action,
          actor,
          reason,
          JSON.stringify(before),
          JSON.stringify(next),
          next.updatedAt,
        );
      const insertGraph = database.prepare(
        `INSERT INTO planner_graph_records
           (id, project_id, recommendation_id, decision_id, evidence_id, relation, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      evidence.forEach((item) => {
        insertGraph.run(
          createId(),
          projectId,
          recommendationId,
          decisionId,
          item.id,
          ACTION_RELATION[action],
          next.updatedAt,
        );
      });
      database
        .prepare(
          `INSERT INTO planner_audit_events
             (id, project_id, recommendation_id, decision_id, action, actor,
              metadata_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          auditId,
          projectId,
          recommendationId,
          decisionId,
          `planner.recommendation_${action}`,
          actor,
          JSON.stringify({
            evidenceCount: evidence.length,
            executionState: "not-created",
            requiresExplicitApproval: true,
          }),
          next.updatedAt,
        );
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }

    return {
      recommendation: readRecommendations(projectId, row.plan_id).find(
        (item) => item.id === recommendationId,
      ),
      decision: {
        id: decisionId,
        action,
        actor,
        reason,
        createdAt: next.updatedAt,
      },
      execution: {
        created: false,
        state: "not-created",
        message:
          "The review decision was recorded. No task, branch, or command was created.",
      },
    };
  };

  return { generate, list, decide };
}

export const nextStepPlannerInternals = { buildCandidates, stableJson };
