import { randomUUID } from "node:crypto";
import { z } from "zod";
import { parseAwsCurCsv } from "./aws-cur.js";

const COST_CATEGORIES = [
  "gpu",
  "cloud",
  "storage",
  "model-api",
  "agent",
  "rerun",
  "other",
];

const manualEntrySchema = z
  .object({
    amountMinor: z.number().int().safe(),
    category: z.enum(COST_CATEGORIES),
    confidenceBps: z.number().int().min(0).max(10_000),
    currency: z.string().regex(/^[A-Z]{3}$/),
    description: z.string().trim().max(2_000).default(""),
    endedAt: z.iso.datetime(),
    projectId: z.string().trim().min(1),
    runId: z.string().trim().min(1),
    startedAt: z.iso.datetime(),
  })
  .refine((value) => value.endedAt >= value.startedAt, {
    message: "Cost end time must not precede its start time.",
    path: ["endedAt"],
  });

const parseJson = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const mapEntry = (row, waste = []) => ({
  id: row.id,
  projectId: row.project_id,
  runId: row.run_id,
  runTitle: row.run_title,
  source: row.source,
  providerEntryId: row.provider_entry_id,
  amountMinor: row.amount_minor,
  currency: row.currency,
  category: row.category,
  startedAt: row.started_at,
  endedAt: row.ended_at,
  confidenceBps: row.confidence_bps,
  description: row.description,
  raw: parseJson(row.raw_json),
  createdAt: row.created_at,
  waste,
});

function aggregate(entries) {
  const totalsByCurrency = new Map();
  const categories = new Map();
  for (const entry of entries) {
    totalsByCurrency.set(
      entry.currency,
      (totalsByCurrency.get(entry.currency) ?? 0) + entry.amountMinor,
    );
    const category = categories.get(entry.category) ?? new Map();
    category.set(
      entry.currency,
      (category.get(entry.currency) ?? 0) + entry.amountMinor,
    );
    categories.set(entry.category, category);
  }
  const toTotals = (values) =>
    [...values.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, amountMinor]) => ({ amountMinor, currency }));
  const totals = toTotals(totalsByCurrency);
  return {
    categorizedTotals: COST_CATEGORIES.filter((category) =>
      categories.has(category),
    ).map((category) => ({
      category,
      totals: toTotals(categories.get(category)),
    })),
    conversionState:
      totals.length > 1
        ? "unsupported-mixed-currency"
        : totals.length === 1
          ? "single-currency"
          : "empty",
    totals,
  };
}

function rowsForProject(database, projectId) {
  return database
    .prepare(
      `SELECT entry.*, run.title AS run_title
       FROM cost_entries entry
       JOIN research_objects run
         ON run.id = entry.run_id AND run.project_id = entry.project_id
       WHERE entry.project_id = ?
       ORDER BY entry.started_at DESC, entry.created_at DESC, entry.id DESC`,
    )
    .all(projectId);
}

function projectGraph(database, projectId) {
  const objects = database
    .prepare("SELECT * FROM research_objects WHERE project_id = ?")
    .all(projectId);
  const relationships = database
    .prepare("SELECT * FROM research_relationships WHERE project_id = ?")
    .all(projectId);
  return {
    objects,
    objectsById: new Map(objects.map((object) => [object.id, object])),
    relationships,
  };
}

function supportingRunsForClaim(graph, claimId) {
  const runIds = new Set();
  const visited = new Set([claimId]);
  const queue = [claimId];
  const traversable = new Set([
    "supports",
    "tests",
    "generated-by",
    "uses",
    "implements",
  ]);
  while (queue.length) {
    const objectId = queue.shift();
    const object = graph.objectsById.get(objectId);
    for (const relationship of graph.relationships) {
      if (
        relationship.to_object_id === objectId &&
        traversable.has(relationship.type)
      ) {
        const source = graph.objectsById.get(relationship.from_object_id);
        if (!source) continue;
        if (source.type === "run") runIds.add(source.id);
        else if (!visited.has(source.id)) {
          visited.add(source.id);
          queue.push(source.id);
        }
      }
      if (
        object?.type === "artifact" &&
        relationship.from_object_id === objectId &&
        ["generated-by", "uses"].includes(relationship.type)
      ) {
        const target = graph.objectsById.get(relationship.to_object_id);
        if (target?.type === "run") runIds.add(target.id);
        else if (target && !visited.has(target.id)) {
          visited.add(target.id);
          queue.push(target.id);
        }
      }
    }
  }
  return runIds;
}

function classifyWaste(graph, rows, now) {
  const flags = new Map(
    graph.objects
      .filter((object) => object.type === "run")
      .map((run) => [run.id, new Set()]),
  );
  const claimRunIds = new Map(
    graph.objects
      .filter((object) => object.type === "claim")
      .map((claim) => [claim.id, supportingRunsForClaim(graph, claim.id)]),
  );
  const usedRunIds = new Set(
    [...claimRunIds.values()].flatMap((runIds) => [...runIds]),
  );
  const experimentRuns = new Map();
  for (const relationship of graph.relationships) {
    if (relationship.type !== "generated-by") continue;
    const source = graph.objectsById.get(relationship.from_object_id);
    const target = graph.objectsById.get(relationship.to_object_id);
    if (source?.type !== "run" || target?.type !== "experiment") continue;
    const runs = experimentRuns.get(target.id) ?? [];
    runs.push(source);
    experimentRuns.set(target.id, runs);
  }
  const nowMs = Date.parse(now);
  const latestEntryEnd = new Map();
  for (const row of rows) {
    const current = latestEntryEnd.get(row.run_id) ?? "";
    if (row.ended_at > current) latestEntryEnd.set(row.run_id, row.ended_at);
  }
  for (const run of graph.objects.filter((object) => object.type === "run")) {
    const payload = parseJson(run.payload);
    if (payload.status === "failed") flags.get(run.id)?.add("failed");
    if (!usedRunIds.has(run.id)) flags.get(run.id)?.add("unused");
    if (["planned", "running"].includes(payload.status)) {
      const lastActivity = latestEntryEnd.get(run.id) ?? run.updated_at;
      if (nowMs - Date.parse(lastActivity) > 24 * 60 * 60 * 1000) {
        flags.get(run.id)?.add("abandoned");
      }
    }
  }
  for (const runs of experimentRuns.values()) {
    const ordered = [...runs].sort(
      (left, right) =>
        left.created_at.localeCompare(right.created_at) ||
        left.id.localeCompare(right.id),
    );
    const fingerprints = new Map();
    for (const run of ordered) {
      const payload = parseJson(run.payload);
      const fingerprint = payload.commitSha
        ? JSON.stringify(["commit", payload.commitSha])
        : JSON.stringify([
            "description",
            run.title.trim().toLowerCase(),
            run.description.trim().toLowerCase(),
          ]);
      const matching = fingerprints.get(fingerprint) ?? [];
      matching.push(run.id);
      fingerprints.set(fingerprint, matching);
    }
    for (const duplicateIds of fingerprints.values()) {
      for (const id of duplicateIds.slice(1)) flags.get(id)?.add("duplicated");
    }
    for (const run of ordered.slice(1)) flags.get(run.id)?.add("repeated");
    for (const run of ordered.slice(0, -1)) {
      if (!usedRunIds.has(run.id)) flags.get(run.id)?.add("stale-rerun");
    }
  }
  return { claimRunIds, flags };
}

export function createCostLedgerRepository(
  database,
  {
    clock = () => new Date().toISOString(),
    createId = () => randomUUID(),
  } = {},
) {
  const ensureProject = (projectId) => {
    const project = database
      .prepare("SELECT id FROM projects WHERE id = ?")
      .get(projectId);
    if (!project) throw new Error("Research project does not exist.");
  };
  const ensureRun = (projectId, runId) => {
    const run = database
      .prepare(
        "SELECT id FROM research_objects WHERE id = ? AND project_id = ? AND type = 'run'",
      )
      .get(runId, projectId);
    if (!run) throw new Error("Cost entry run does not belong to the project.");
  };

  const insertEntry = (entry) => {
    database
      .prepare(
        `INSERT INTO cost_entries
          (id, project_id, run_id, source, provider_entry_id, dedup_key,
           amount_minor, currency, category, started_at, ended_at,
           confidence_bps, description, raw_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.id,
        entry.projectId,
        entry.runId,
        entry.source,
        entry.providerEntryId ?? null,
        entry.dedupKey,
        entry.amountMinor,
        entry.currency,
        entry.category,
        entry.startedAt,
        entry.endedAt,
        entry.confidenceBps,
        entry.description,
        JSON.stringify(entry.raw),
        entry.createdAt,
      );
  };

  return {
    createManualEntry(input) {
      const parsed = manualEntrySchema.parse(input);
      ensureProject(parsed.projectId);
      ensureRun(parsed.projectId, parsed.runId);
      const id = createId();
      const createdAt = clock();
      insertEntry({
        ...parsed,
        createdAt,
        dedupKey: `manual:${id}`,
        id,
        providerEntryId: null,
        raw: { input: parsed, schema: "cly.manual-cost.v1" },
        source: "manual",
      });
      return this.getEntry(parsed.projectId, id);
    },

    importAwsCur({ projectId, csv, fileName }) {
      ensureProject(projectId);
      const parsedRows = parseAwsCurCsv(csv, fileName);
      for (const row of parsedRows) ensureRun(projectId, row.runId);
      let importedCount = 0;
      let duplicateCount = 0;
      const createdAt = clock();
      database.exec("BEGIN IMMEDIATE");
      try {
        for (const row of parsedRows) {
          const dedupKey = `aws-cur:${row.providerEntryId}`;
          const duplicate = database
            .prepare(
              "SELECT id FROM cost_entries WHERE project_id = ? AND dedup_key = ?",
            )
            .get(projectId, dedupKey);
          if (duplicate) {
            duplicateCount += 1;
            continue;
          }
          insertEntry({
            ...row,
            createdAt,
            dedupKey,
            id: createId(),
            projectId,
          });
          importedCount += 1;
        }
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      return {
        duplicateCount,
        importedCount,
        ledger: this.listLedger(projectId),
        rowCount: parsedRows.length,
      };
    },

    getEntry(projectId, id) {
      ensureProject(projectId);
      const row = database
        .prepare(
          `SELECT entry.*, run.title AS run_title
           FROM cost_entries entry
           JOIN research_objects run
             ON run.id = entry.run_id AND run.project_id = entry.project_id
           WHERE entry.project_id = ? AND entry.id = ?`,
        )
        .get(projectId, id);
      if (!row) throw new Error("Cost entry does not belong to the project.");
      const graph = projectGraph(database, projectId);
      const { flags } = classifyWaste(graph, [row], clock());
      return mapEntry(row, [...(flags.get(row.run_id) ?? [])]);
    },

    listLedger(projectId) {
      ensureProject(projectId);
      const rows = rowsForProject(database, projectId);
      const graph = projectGraph(database, projectId);
      const { flags } = classifyWaste(graph, rows, clock());
      const entries = rows.map((row) =>
        mapEntry(row, [...(flags.get(row.run_id) ?? [])]),
      );
      const wasteEntries = entries.filter((entry) => entry.waste.length > 0);
      return {
        ...aggregate(entries),
        entries,
        waste: {
          ...aggregate(wasteEntries),
          entryCount: wasteEntries.length,
        },
      };
    },

    getClaimCosts(projectId, claimId) {
      ensureProject(projectId);
      const graph = projectGraph(database, projectId);
      const claim = graph.objectsById.get(claimId);
      if (!claim || claim.type !== "claim") {
        throw new Error("Claim does not belong to the project.");
      }
      const rows = rowsForProject(database, projectId);
      const { flags } = classifyWaste(graph, rows, clock());
      const runIds = supportingRunsForClaim(graph, claimId);
      const entries = rows
        .filter((row) => runIds.has(row.run_id))
        .map((row) => mapEntry(row, [...(flags.get(row.run_id) ?? [])]));
      return {
        ...aggregate(entries),
        claimId,
        entries,
        runIds: [...runIds].sort(),
      };
    },

    listClaimCosts(projectId) {
      ensureProject(projectId);
      const claims = database
        .prepare(
          "SELECT id FROM research_objects WHERE project_id = ? AND type = 'claim' ORDER BY created_at, id",
        )
        .all(projectId);
      return claims.map((claim) => this.getClaimCosts(projectId, claim.id));
    },
  };
}
