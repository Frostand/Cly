import { randomUUID } from "node:crypto";
import { createResearchRepository } from "../research/repository.js";
import {
  createGroundedSummary,
  findLiteratureDuplicate,
  normalizeLiteratureRecord,
} from "./ingestion.js";

const mapReadingList = (row, sourceIds = []) => ({
  id: row.id,
  projectId: row.project_id,
  name: row.name,
  description: row.description,
  sourceCount: sourceIds.length,
  sourceIds,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export function createLiteratureRepository(
  database,
  {
    clock = () => new Date().toISOString(),
    createId = randomUUID,
    researchRepository = createResearchRepository(database),
  } = {},
) {
  const ensureReadingList = (projectId, listId) => {
    const readingList = database
      .prepare(
        "SELECT * FROM literature_reading_lists WHERE id = ? AND project_id = ?",
      )
      .get(listId, projectId);
    if (!readingList)
      throw new Error("Reading list does not belong to the project.");
    return readingList;
  };

  const ensureSource = (projectId, sourceId) => {
    const source = database
      .prepare(
        "SELECT id FROM research_objects WHERE id = ? AND project_id = ? AND type = 'source'",
      )
      .get(sourceId, projectId);
    if (!source) throw new Error("Source does not belong to the project.");
  };

  const addSourceToReadingList = (projectId, listId, sourceId, actorId) => {
    ensureReadingList(projectId, listId);
    ensureSource(projectId, sourceId);
    const now = clock();
    database.exec("BEGIN IMMEDIATE");
    try {
      const result = database
        .prepare(
          `INSERT OR IGNORE INTO literature_reading_list_sources
           (reading_list_id, source_id, project_id, added_at) VALUES (?, ?, ?, ?)`,
        )
        .run(listId, sourceId, projectId, now);
      if (result.changes > 0) {
        researchRepository.appendProvenance({
          action: "reading-list.source-added",
          actorId,
          actorType: "human",
          metadata: { readingListId: listId },
          objectId: sourceId,
          projectId,
        });
      }
      database.exec("COMMIT");
      return result.changes > 0;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  };

  return {
    importRecords(
      projectId,
      records,
      {
        actorId = "local-user",
        importMethod = "metadata",
        readingListIds = [],
      } = {},
    ) {
      researchRepository.listProject(projectId);
      for (const readingListId of readingListIds) {
        ensureReadingList(projectId, readingListId);
      }
      const normalizedRecords = records.map((record) =>
        normalizeLiteratureRecord(record),
      );
      const results = [];
      let projectObjects = researchRepository.listProject(projectId).objects;
      for (const normalized of normalizedRecords) {
        const duplicate = findLiteratureDuplicate(normalized, projectObjects);
        if (duplicate) {
          for (const readingListId of readingListIds) {
            addSourceToReadingList(
              projectId,
              readingListId,
              duplicate.source.id,
              actorId,
            );
          }
          researchRepository.appendProvenance({
            action: "source.duplicate-detected",
            actorId,
            actorType: "human",
            metadata: {
              importMethod,
              matchedBy: duplicate.matchedBy,
              normalizedKey: normalized.normalizedKey,
            },
            objectId: duplicate.source.id,
            projectId,
          });
          results.push({
            duplicate: true,
            matchedBy: duplicate.matchedBy,
            source: duplicate.source,
          });
          continue;
        }

        const importedAt = clock();
        const groundedSummary = createGroundedSummary(normalized, importedAt);
        const source = researchRepository.createObject({
          projectId,
          type: "source",
          title: normalized.title,
          description: groundedSummary?.text ?? normalized.abstract ?? "",
          origin: "imported",
          payload: {
            kind: "source",
            ...normalized,
            groundedSummary: groundedSummary ?? undefined,
            importMethod,
            importedAt,
          },
        });
        for (const readingListId of readingListIds) {
          addSourceToReadingList(projectId, readingListId, source.id, actorId);
        }
        researchRepository.appendProvenance({
          action: "source.imported",
          actorId,
          actorType: "human",
          metadata: {
            groundedClaimCount: groundedSummary?.claims.length ?? 0,
            importMethod,
            normalizedKey: normalized.normalizedKey,
            readingListIds,
          },
          objectId: source.id,
          projectId,
        });
        results.push({ duplicate: false, matchedBy: null, source });
        projectObjects = [...projectObjects, source];
      }
      return {
        duplicateCount: results.filter((result) => result.duplicate).length,
        importedCount: results.filter((result) => !result.duplicate).length,
        results,
      };
    },

    listReadingLists(projectId) {
      researchRepository.listProject(projectId);
      const lists = database
        .prepare(
          `SELECT * FROM literature_reading_lists
           WHERE project_id = ? ORDER BY normalized_name, id`,
        )
        .all(projectId);
      const sourceIdsByList = new Map();
      for (const member of database
        .prepare(
          `SELECT reading_list_id, source_id
           FROM literature_reading_list_sources
           WHERE project_id = ? ORDER BY added_at, source_id`,
        )
        .all(projectId)) {
        const sourceIds = sourceIdsByList.get(member.reading_list_id) ?? [];
        sourceIds.push(member.source_id);
        sourceIdsByList.set(member.reading_list_id, sourceIds);
      }
      return lists.map((row) =>
        mapReadingList(row, sourceIdsByList.get(row.id) ?? []),
      );
    },

    createReadingList(projectId, input) {
      researchRepository.listProject(projectId);
      const name = input.name.trim().replace(/\s+/g, " ");
      const description = input.description?.trim() ?? "";
      const normalizedName = name.toLocaleLowerCase();
      const existing = database
        .prepare(
          "SELECT * FROM literature_reading_lists WHERE project_id = ? AND normalized_name = ?",
        )
        .get(projectId, normalizedName);
      if (existing) {
        const members = database
          .prepare(
            `SELECT source_id FROM literature_reading_list_sources
             WHERE reading_list_id = ? AND project_id = ? ORDER BY added_at, source_id`,
          )
          .all(existing.id, projectId);
        return {
          created: false,
          readingList: mapReadingList(
            existing,
            members.map((member) => member.source_id),
          ),
        };
      }
      const id = createId();
      const now = clock();
      database.exec("BEGIN IMMEDIATE");
      try {
        database
          .prepare(
            `INSERT INTO literature_reading_lists
             (id, project_id, name, normalized_name, description, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(id, projectId, name, normalizedName, description, now, now);
        researchRepository.appendProvenance({
          action: "reading-list.created",
          actorId: input.actorId ?? "local-user",
          actorType: "human",
          metadata: { name, readingListId: id },
          projectId,
        });
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      return {
        created: true,
        readingList: mapReadingList(
          database
            .prepare("SELECT * FROM literature_reading_lists WHERE id = ?")
            .get(id),
        ),
      };
    },

    addSourceToReadingList(
      projectId,
      listId,
      sourceId,
      actorId = "local-user",
    ) {
      const added = addSourceToReadingList(
        projectId,
        listId,
        sourceId,
        actorId,
      );
      return {
        added,
        readingList: this.listReadingLists(projectId).find(
          (item) => item.id === listId,
        ),
      };
    },

    removeSourceFromReadingList(
      projectId,
      listId,
      sourceId,
      actorId = "local-user",
    ) {
      ensureReadingList(projectId, listId);
      ensureSource(projectId, sourceId);
      database.exec("BEGIN IMMEDIATE");
      try {
        const result = database
          .prepare(
            `DELETE FROM literature_reading_list_sources
             WHERE reading_list_id = ? AND source_id = ? AND project_id = ?`,
          )
          .run(listId, sourceId, projectId);
        if (result.changes > 0) {
          researchRepository.appendProvenance({
            action: "reading-list.source-removed",
            actorId,
            actorType: "human",
            metadata: { readingListId: listId },
            objectId: sourceId,
            projectId,
          });
        }
        database.exec("COMMIT");
        return { removed: result.changes > 0 };
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
