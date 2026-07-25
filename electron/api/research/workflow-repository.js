import { randomUUID } from "node:crypto";

const parseArray = (value) => {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const mapDecision = (row) => ({
  id: row.id,
  title: row.title,
  date: row.created_at.slice(0, 10),
  decision: row.decision_text,
  reason: row.reason,
  alternatives: parseArray(row.alternatives_json),
  evidenceIds: parseArray(row.evidence_ids_json),
  affectedIds: parseArray(row.affected_ids_json),
  status: row.status,
  ...(row.outcome ? { outcome: row.outcome } : {}),
  ...(row.superseded_by ? { supersededBy: row.superseded_by } : {}),
  origin: row.origin,
});

const mapStep = (row) => ({
  id: row.id,
  title: row.title,
  category: row.category,
  rationale: row.rationale,
  impact: row.impact,
  effort: row.effort,
  urgency: row.urgency,
  evidenceIds: parseArray(row.evidence_ids_json),
  ...(row.claim_id ? { claimId: row.claim_id } : {}),
  ...(row.experiment_id ? { experimentId: row.experiment_id } : {}),
  agentPreset: row.agent_preset,
  contextPack: row.context_pack,
  status: row.status,
});

const mapAudit = (row) => ({
  id: row.id,
  score: row.score,
  status: row.status,
  createdAt: row.created_at,
  findingIds: [],
  areas: parseArray(row.areas_json),
});

const mapFinding = (row) => ({
  id: row.id,
  category: row.category,
  title: row.title,
  detail: row.detail,
  severity: row.severity,
  status: row.status,
  objectIds: parseArray(row.object_ids_json),
  ...(row.assignee ? { assignee: row.assignee } : {}),
  ...(row.deferred_reason ? { deferredReason: row.deferred_reason } : {}),
  ...(row.area ? { area: row.area } : {}),
  affectedClaimIds: parseArray(row.affected_claim_ids_json),
  ...(row.recommended_fix ? { recommendedFix: row.recommended_fix } : {}),
});

export function createResearchWorkflowRepository(
  database,
  {
    appendProvenance = () => {},
    clock = () => new Date(),
    createId = randomUUID,
  } = {},
) {
  const ensureProject = (projectId) => {
    if (
      !database.prepare("SELECT id FROM projects WHERE id = ?").get(projectId)
    ) {
      throw new Error("Research project does not exist.");
    }
  };
  const provenance = (projectId, action, metadata, now) =>
    appendProvenance(
      {
        projectId,
        action,
        actorType: "human",
        actorId: metadata.actor ?? "local-user",
        metadata,
      },
      now,
    );

  const listSnapshot = (projectId) => {
    ensureProject(projectId);
    const decisions = database
      .prepare(
        "SELECT * FROM research_decisions WHERE project_id = ? ORDER BY updated_at DESC, id",
      )
      .all(projectId)
      .map(mapDecision);
    const nextSteps = database
      .prepare(
        "SELECT * FROM planner_steps WHERE project_id = ? ORDER BY updated_at DESC, id",
      )
      .all(projectId)
      .map(mapStep);
    const audits = database
      .prepare(
        "SELECT * FROM research_workflow_audits WHERE project_id = ? ORDER BY created_at DESC, id DESC",
      )
      .all(projectId)
      .map(mapAudit);
    const findings = database
      .prepare(
        "SELECT * FROM research_workflow_findings WHERE project_id = ? AND audit_id = ? ORDER BY updated_at DESC, id",
      )
      .all(projectId, audits[0]?.id ?? "")
      .map(mapFinding);
    for (const audit of audits) {
      audit.findingIds = database
        .prepare(
          "SELECT id FROM research_workflow_findings WHERE project_id = ? AND audit_id = ? ORDER BY id",
        )
        .all(projectId, audit.id)
        .map((row) => row.id);
    }
    return { decisions, nextSteps, audits, findings };
  };

  return {
    listSnapshot,
    listDecisionHistory(projectId, decisionId) {
      ensureProject(projectId);
      return database
        .prepare(
          "SELECT id, action, actor, before_json, after_json, created_at FROM research_decision_transitions WHERE project_id = ? AND decision_id = ? ORDER BY created_at, id",
        )
        .all(projectId, decisionId)
        .map((row) => ({
          id: row.id,
          action: row.action,
          actor: row.actor,
          before: row.before_json ? JSON.parse(row.before_json) : null,
          after: JSON.parse(row.after_json),
          createdAt: row.created_at,
        }));
    },
    createDecision(projectId, input) {
      ensureProject(projectId);
      const now = clock().toISOString();
      const id = createId();
      const values = [
        id,
        projectId,
        input.title,
        input.decision,
        input.reason,
        JSON.stringify(input.alternatives ?? []),
        JSON.stringify(input.evidenceIds ?? []),
        JSON.stringify(input.affectedIds ?? []),
        input.status ?? "Active",
        input.outcome ?? null,
        input.origin ?? "Researcher",
        now,
        now,
      ];
      database.exec("BEGIN IMMEDIATE");
      try {
        database
          .prepare(
            "INSERT INTO research_decisions (id, project_id, title, decision_text, reason, alternatives_json, evidence_ids_json, affected_ids_json, status, outcome, origin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .run(...values);
        const decision = mapDecision(
          database
            .prepare("SELECT * FROM research_decisions WHERE id = ?")
            .get(id),
        );
        database
          .prepare(
            "INSERT INTO research_decision_transitions (id, project_id, decision_id, action, actor, before_json, after_json, created_at) VALUES (?, ?, ?, 'created', ?, NULL, ?, ?)",
          )
          .run(
            createId(),
            projectId,
            id,
            input.actor ?? "local-user",
            JSON.stringify(decision),
            now,
          );
        provenance(
          projectId,
          "decision.created",
          { decisionId: id, actor: input.actor },
          now,
        );
        database.exec("COMMIT");
        return decision;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    updateDecision(projectId, decisionId, input) {
      ensureProject(projectId);
      const row = database
        .prepare(
          "SELECT * FROM research_decisions WHERE id = ? AND project_id = ?",
        )
        .get(decisionId, projectId);
      if (!row)
        throw new Error("Research decision does not exist in this project.");
      const before = mapDecision(row);
      const next = { ...before, ...input, id: before.id, date: before.date };
      const now = clock().toISOString();
      database.exec("BEGIN IMMEDIATE");
      try {
        database
          .prepare(
            "UPDATE research_decisions SET title = ?, decision_text = ?, reason = ?, alternatives_json = ?, evidence_ids_json = ?, affected_ids_json = ?, status = ?, outcome = ?, origin = ?, updated_at = ? WHERE id = ? AND project_id = ?",
          )
          .run(
            next.title,
            next.decision,
            next.reason,
            JSON.stringify(next.alternatives),
            JSON.stringify(next.evidenceIds),
            JSON.stringify(next.affectedIds),
            next.status,
            next.outcome ?? null,
            next.origin,
            now,
            decisionId,
            projectId,
          );
        const after = mapDecision(
          database
            .prepare("SELECT * FROM research_decisions WHERE id = ?")
            .get(decisionId),
        );
        database
          .prepare(
            "INSERT INTO research_decision_transitions (id, project_id, decision_id, action, actor, before_json, after_json, created_at) VALUES (?, ?, ?, 'updated', ?, ?, ?, ?)",
          )
          .run(
            createId(),
            projectId,
            decisionId,
            input.actor ?? "local-user",
            JSON.stringify(before),
            JSON.stringify(after),
            now,
          );
        provenance(
          projectId,
          "decision.updated",
          { decisionId, actor: input.actor },
          now,
        );
        database.exec("COMMIT");
        return after;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    supersedeDecision(projectId, decisionId, replacementInput) {
      ensureProject(projectId);
      const current = database
        .prepare(
          "SELECT * FROM research_decisions WHERE id = ? AND project_id = ?",
        )
        .get(decisionId, projectId);
      if (!current)
        throw new Error("Research decision does not exist in this project.");
      if (current.status === "Superseded")
        throw new Error("Research decision is already superseded.");
      const now = clock().toISOString();
      const replacementId = createId();
      database.exec("BEGIN IMMEDIATE");
      try {
        database
          .prepare(
            "INSERT INTO research_decisions (id, project_id, title, decision_text, reason, alternatives_json, evidence_ids_json, affected_ids_json, status, outcome, origin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?, ?, ?)",
          )
          .run(
            replacementId,
            projectId,
            replacementInput.title,
            replacementInput.decision,
            replacementInput.reason,
            JSON.stringify(replacementInput.alternatives ?? []),
            JSON.stringify(replacementInput.evidenceIds ?? []),
            JSON.stringify(replacementInput.affectedIds ?? []),
            replacementInput.outcome ?? null,
            replacementInput.origin ?? "Researcher",
            now,
            now,
          );
        database
          .prepare(
            "UPDATE research_decisions SET status = 'Superseded', superseded_by = ?, updated_at = ? WHERE id = ? AND project_id = ?",
          )
          .run(replacementId, now, decisionId, projectId);
        const before = mapDecision(current);
        const after = mapDecision(
          database
            .prepare("SELECT * FROM research_decisions WHERE id = ?")
            .get(decisionId),
        );
        const replacement = mapDecision(
          database
            .prepare("SELECT * FROM research_decisions WHERE id = ?")
            .get(replacementId),
        );
        database
          .prepare(
            "INSERT INTO research_decision_transitions (id, project_id, decision_id, action, actor, before_json, after_json, created_at) VALUES (?, ?, ?, 'superseded', ?, ?, ?, ?)",
          )
          .run(
            createId(),
            projectId,
            decisionId,
            replacementInput.actor ?? "local-user",
            JSON.stringify(before),
            JSON.stringify(after),
            now,
          );
        database
          .prepare(
            "INSERT INTO research_decision_transitions (id, project_id, decision_id, action, actor, before_json, after_json, created_at) VALUES (?, ?, ?, 'created', ?, NULL, ?, ?)",
          )
          .run(
            createId(),
            projectId,
            replacementId,
            replacementInput.actor ?? "local-user",
            JSON.stringify(replacement),
            now,
          );
        provenance(
          projectId,
          "decision.superseded",
          { decisionId, replacementId, actor: replacementInput.actor },
          now,
        );
        database.exec("COMMIT");
        return { decision: after, replacement };
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    replacePlannerSteps(projectId, steps, actor = "local-user") {
      ensureProject(projectId);
      const now = clock().toISOString();
      database.exec("BEGIN IMMEDIATE");
      try {
        for (const step of steps) {
          const storedStepId = step.id.startsWith(`${projectId}:`)
            ? step.id
            : `${projectId}:${step.id}`;
          database
            .prepare(
              "INSERT INTO planner_steps (id, project_id, title, category, rationale, impact, effort, urgency, evidence_ids_json, claim_id, experiment_id, agent_preset, context_pack, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, category=excluded.category, rationale=excluded.rationale, impact=excluded.impact, effort=excluded.effort, urgency=excluded.urgency, evidence_ids_json=excluded.evidence_ids_json, claim_id=excluded.claim_id, experiment_id=excluded.experiment_id, agent_preset=excluded.agent_preset, context_pack=excluded.context_pack, updated_at=excluded.updated_at",
            )
            .run(
              storedStepId,
              projectId,
              step.title,
              step.category,
              step.rationale,
              step.impact,
              step.effort,
              step.urgency,
              JSON.stringify(step.evidenceIds),
              step.claimId ?? null,
              step.experimentId ?? null,
              step.agentPreset,
              step.contextPack,
              step.status,
              now,
              now,
            );
        }
        provenance(
          projectId,
          "planner.generated",
          { stepCount: steps.length, actor },
          now,
        );
        database.exec("COMMIT");
        return listSnapshot(projectId).nextSteps;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    transitionPlannerStep(projectId, stepId, status, actor = "local-user") {
      ensureProject(projectId);
      const row = database
        .prepare("SELECT * FROM planner_steps WHERE id = ? AND project_id = ?")
        .get(stepId, projectId);
      if (!row) throw new Error("Planner step does not exist in this project.");
      const now = clock().toISOString();
      database.exec("BEGIN IMMEDIATE");
      try {
        database
          .prepare(
            "UPDATE planner_steps SET status = ?, updated_at = ? WHERE id = ? AND project_id = ?",
          )
          .run(status, now, stepId, projectId);
        database
          .prepare(
            "INSERT INTO planner_step_transitions (id, project_id, step_id, from_status, to_status, actor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          )
          .run(createId(), projectId, stepId, row.status, status, actor, now);
        provenance(
          projectId,
          "planner.status.updated",
          { stepId, fromStatus: row.status, toStatus: status, actor },
          now,
        );
        database.exec("COMMIT");
        return mapStep(
          database
            .prepare("SELECT * FROM planner_steps WHERE id = ?")
            .get(stepId),
        );
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    saveAudit(projectId, audit, findings, actor = "local-user") {
      ensureProject(projectId);
      const now = audit.createdAt;
      const auditId = audit.id.startsWith(`${projectId}:`)
        ? audit.id
        : `${projectId}:${audit.id}`;
      database.exec("BEGIN IMMEDIATE");
      try {
        database
          .prepare(
            "INSERT INTO research_workflow_audits (id, project_id, score, status, areas_json, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
          )
          .run(
            auditId,
            projectId,
            audit.score,
            audit.status,
            JSON.stringify(audit.areas ?? []),
            now,
          );
        const storedFindings = findings.map((finding) => ({
          ...finding,
          id: `${auditId}:${finding.id}`,
        }));
        for (const finding of storedFindings)
          database
            .prepare(
              "INSERT INTO research_workflow_findings (id, project_id, audit_id, category, title, detail, severity, status, object_ids_json, area, affected_claim_ids_json, recommended_fix, assignee, deferred_reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
            )
            .run(
              finding.id,
              projectId,
              auditId,
              finding.category,
              finding.title,
              finding.detail,
              finding.severity,
              finding.status,
              JSON.stringify(finding.objectIds),
              finding.area ?? null,
              JSON.stringify(finding.affectedClaimIds ?? []),
              finding.recommendedFix ?? null,
              finding.assignee ?? null,
              finding.deferredReason ?? null,
              now,
              now,
            );
        provenance(
          projectId,
          "reproducibility.audit.recorded",
          {
            auditId,
            score: audit.score,
            findingCount: storedFindings.length,
            actor,
          },
          now,
        );
        database.exec("COMMIT");
        return {
          audit: {
            ...audit,
            id: auditId,
            findingIds: storedFindings.map((finding) => finding.id),
          },
          findings: storedFindings,
        };
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    transitionFinding(projectId, findingId, input) {
      ensureProject(projectId);
      const row = database
        .prepare(
          "SELECT * FROM research_workflow_findings WHERE id = ? AND project_id = ?",
        )
        .get(findingId, projectId);
      if (!row)
        throw new Error(
          "Reproducibility finding does not exist in this project.",
        );
      const now = clock().toISOString();
      database.exec("BEGIN IMMEDIATE");
      try {
        database
          .prepare(
            "UPDATE research_workflow_findings SET status = ?, assignee = ?, deferred_reason = ?, updated_at = ? WHERE id = ? AND project_id = ?",
          )
          .run(
            input.status,
            input.assignee ?? null,
            input.reason ?? null,
            now,
            findingId,
            projectId,
          );
        database
          .prepare(
            "INSERT INTO research_workflow_finding_transitions (id, project_id, finding_id, from_status, to_status, actor, assignee, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .run(
            createId(),
            projectId,
            findingId,
            row.status,
            input.status,
            input.actor ?? "local-user",
            input.assignee ?? null,
            input.reason ?? null,
            now,
          );
        provenance(
          projectId,
          "reproducibility.finding.disposition.updated",
          {
            findingId,
            fromStatus: row.status,
            toStatus: input.status,
            assignee: input.assignee,
            reason: input.reason,
            actor: input.actor,
          },
          now,
        );
        database.exec("COMMIT");
        return mapFinding(
          database
            .prepare("SELECT * FROM research_workflow_findings WHERE id = ?")
            .get(findingId),
        );
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
