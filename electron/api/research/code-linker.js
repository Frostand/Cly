import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

const execFileAsync = promisify(execFile);
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_SCAN_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 2_000;
const LOCAL_OBJECT_KINDS = new Set([
  "artifact",
  "source",
  "claim",
  "experiment",
  "run",
]);
const targetKindSchema = z.enum([
  "objective",
  "method",
  "dataset",
  "experiment",
  "run",
  "claim",
  "test",
  "risk",
  "commit",
  "issue",
  "source",
  "artifact",
]);
const relativePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(4_000)
  .refine(
    (value) =>
      !path.posix.isAbsolute(value) &&
      !path.win32.isAbsolute(value) &&
      !value.split(/[\\/]/).includes(".."),
    "Code paths must be project-relative.",
  )
  .transform((value) => value.replaceAll("\\", "/"));
const evidenceSchema = z
  .object({
    type: z.enum([
      "source-location",
      "notebook-cell",
      "execution-trace",
      "git-commit",
      "user-assertion",
    ]),
    locator: z.string().trim().min(1).max(4_000),
    description: z.string().trim().min(1).max(2_000),
    contentHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      ["source-location", "notebook-cell"].includes(value.type) &&
      (path.posix.isAbsolute(value.locator) ||
        path.win32.isAbsolute(value.locator) ||
        value.locator.split(/[\\/]/).includes(".."))
    ) {
      context.addIssue({
        code: "custom",
        path: ["locator"],
        message: "Source evidence locators must be project-relative.",
      });
    }
  });
const linkInputSchema = z
  .object({
    projectId: z.string().trim().min(1).max(500),
    codeEntityId: z.string().trim().min(1).max(500),
    targetKind: targetKindSchema,
    targetId: z.string().trim().min(1).max(4_000),
    targetTitle: z.string().trim().min(1).max(500).optional(),
    linkRole: z.enum([
      "implements",
      "uses",
      "produces",
      "tests",
      "supports",
      "affects",
      "discusses",
    ]),
    source: z.enum(["manual", "execution", "agent-proposed"]),
    origin: z.string().trim().min(1).max(500),
    confidence: z.number().finite().min(0).max(1).nullable().optional(),
    evidence: z.array(evidenceSchema).max(50).default([]),
  })
  .superRefine((value, context) => {
    if (
      ["execution", "agent-proposed"].includes(value.source) &&
      value.evidence.length === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["evidence"],
        message: `${value.source} links require evidence.`,
      });
    }
    if (value.source === "agent-proposed" && value.confidence == null) {
      context.addIssue({
        code: "custom",
        path: ["confidence"],
        message: "Agent-proposed links require confidence.",
      });
    }
    if (
      value.source === "execution" &&
      !value.evidence.some((item) => item.type === "execution-trace")
    ) {
      context.addIssue({
        code: "custom",
        path: ["evidence"],
        message: "Execution links require execution-trace evidence.",
      });
    }
    if (value.source !== "agent-proposed" && value.confidence != null) {
      context.addIssue({
        code: "custom",
        path: ["confidence"],
        message: "Confidence is reserved for agent-proposed links.",
      });
    }
  });
const reviewInputSchema = z.object({
  projectId: z.string().trim().min(1).max(500),
  id: z.string().trim().min(1).max(500),
  verificationState: z.enum(["verified", "rejected"]),
  reviewerId: z.string().trim().min(1).max(500),
});

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const samePath = (left, right) =>
  process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
const isWithin = (root, candidate) =>
  samePath(root, candidate) || candidate.startsWith(`${root}${path.sep}`);
const parseJson = (value, fallback = []) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

function gitEnvironment() {
  const environment = {
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
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
}

async function runGit(root, args, { allowFailure = false } = {}) {
  try {
    const { stdout } = await execFileAsync(
      "git",
      [
        "--no-optional-locks",
        "-c",
        `core.hooksPath=${process.platform === "win32" ? "NUL" : "/dev/null"}`,
        "-c",
        "credential.helper=",
        ...args,
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: gitEnvironment(),
        maxBuffer: 5 * 1024 * 1024,
        windowsHide: true,
      },
    );
    return stdout;
  } catch (error) {
    if (allowFailure) return null;
    if (String(error?.message).includes("maxBuffer")) {
      throw new Error("Code scan exceeded its Git metadata limit.");
    }
    throw new Error("Registered project is not a scannable Git repository.");
  }
}

function githubSlug(remote) {
  if (!remote) return null;
  const trimmed = remote.trim();
  const match = trimmed.match(
    /^(?:git@github\.com:|ssh:\/\/git@github\.com\/|https:\/\/github\.com\/)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/,
  );
  return match ? `${match[1]}/${match[2]}` : null;
}

function parsePythonSymbols(source, { cell = null } = {}) {
  const lines = source.split(/\r?\n/);
  const definitions = [];
  const scopes = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(
      /^(\s*)(?:async\s+)?(def|class)\s+([A-Za-z_]\w*)\b/,
    );
    if (!match) continue;
    const indent = match[1].replaceAll("\t", "    ").length;
    while (scopes.length && scopes.at(-1).indent >= indent) scopes.pop();
    const qualified = [...scopes.map((scope) => scope.name), match[3]].join(
      ".",
    );
    definitions.push({
      name: cell == null ? qualified : `cell[${cell}]::${qualified}`,
      symbolKind: match[2] === "def" ? "function" : "class",
      lineStart: index + 1,
      indent,
      cell,
    });
    scopes.push({ name: match[3], indent });
  }
  return definitions.map((definition) => {
    let lineEnd = lines.length;
    for (
      let cursor = definition.lineStart;
      cursor < lines.length;
      cursor += 1
    ) {
      const candidate = lines[cursor];
      if (!candidate.trim()) continue;
      const indent =
        candidate.match(/^\s*/)?.[0].replaceAll("\t", "    ").length ?? 0;
      if (
        indent <= definition.indent &&
        !candidate.trimStart().startsWith("#")
      ) {
        lineEnd = cursor;
        break;
      }
    }
    const body = lines.slice(definition.lineStart - 1, lineEnd).join("\n");
    return { ...definition, lineEnd, contentHash: sha256(body) };
  });
}

function scanContent(relativePath, content) {
  if (relativePath.endsWith(".py")) {
    return {
      language: "python",
      symbols: parsePythonSymbols(content),
    };
  }
  let notebook;
  try {
    notebook = JSON.parse(content);
  } catch {
    throw new Error(`Notebook is not valid JSON: ${relativePath}`);
  }
  if (!Array.isArray(notebook?.cells)) {
    throw new Error(`Notebook has no cells array: ${relativePath}`);
  }
  const symbols = [];
  for (let index = 0; index < notebook.cells.length; index += 1) {
    const cell = notebook.cells[index];
    if (cell?.cell_type !== "code") continue;
    const source = Array.isArray(cell.source)
      ? cell.source.join("")
      : typeof cell.source === "string"
        ? cell.source
        : "";
    symbols.push(...parsePythonSymbols(source, { cell: index }));
  }
  return { language: "jupyter", symbols };
}

function mapEntity(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind,
    path: row.path,
    symbol: row.symbol ?? null,
    language: row.language,
    symbolKind: row.symbol_kind ?? null,
    lineStart: row.line_start ?? null,
    lineEnd: row.line_end ?? null,
    notebookCell: row.notebook_cell ?? null,
    contentHash: row.content_hash,
    commitSha: row.commit_sha ?? null,
    repositorySlug: row.repository_slug ?? null,
    stale: Boolean(row.stale),
    staleReason: row.stale_reason ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLink(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    codeEntityId: row.code_entity_id,
    researchObjectId: row.research_object_id ?? null,
    target: {
      kind: row.target_kind,
      id: row.target_id,
      title: row.target_title,
    },
    linkRole: row.link_role,
    source: row.source,
    origin: row.origin,
    confidence: typeof row.confidence === "number" ? row.confidence : null,
    evidence: parseJson(row.evidence_json),
    verificationState: row.verification_state,
    verifiedBy: row.verified_by ?? null,
    verifiedAt: row.verified_at ?? null,
    stale: Boolean(row.stale),
    staleReason: row.stale_reason ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function readBoundedFile(root, relativePath, remainingBytes) {
  const absolute = path.resolve(root, relativePath);
  if (!isWithin(root, absolute))
    throw new Error("Code path escaped the project root.");
  const canonical = await realpath(absolute);
  if (!isWithin(root, canonical))
    throw new Error("Code file symlink escaped the project root.");
  const handle = await open(
    canonical,
    fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
  );
  try {
    const stat = await handle.stat();
    if (
      !stat.isFile() ||
      stat.size > MAX_FILE_BYTES ||
      stat.size > remainingBytes
    ) {
      throw new Error(`Code scan file exceeds its size limit: ${relativePath}`);
    }
    return { content: await handle.readFile("utf8"), size: stat.size };
  } finally {
    await handle.close();
  }
}

export function createCodeResearchLinker(
  database,
  repository,
  { clock = () => new Date().toISOString(), createId = randomUUID } = {},
) {
  const ensureEntity = (projectId, entityId) => {
    const entity = database
      .prepare("SELECT * FROM code_entities WHERE id = ? AND project_id = ?")
      .get(entityId, projectId);
    if (!entity) throw new Error("Code entity does not belong to the project.");
    return entity;
  };

  const markPathsStale = (projectId, paths, reason, observedAt = clock()) => {
    repository.getProject(projectId);
    const normalizedPaths = [
      ...new Set(paths.map((item) => relativePathSchema.parse(item))),
    ];
    if (normalizedPaths.length === 0) return [];
    const staleLinks = [];
    database.exec("BEGIN IMMEDIATE");
    try {
      for (const changedPath of normalizedPaths) {
        const entities = database
          .prepare(
            "SELECT id FROM code_entities WHERE project_id = ? AND path = ?",
          )
          .all(projectId, changedPath);
        if (entities.length === 0) continue;
        database
          .prepare(
            `UPDATE code_entities SET stale = 1, stale_reason = ?, updated_at = ?
             WHERE project_id = ? AND path = ?`,
          )
          .run(reason, observedAt, projectId, changedPath);
        for (const entity of entities) {
          const links = database
            .prepare(
              `SELECT * FROM code_research_links
               WHERE project_id = ? AND code_entity_id = ? AND stale = 0`,
            )
            .all(projectId, entity.id);
          for (const link of links) {
            database
              .prepare(
                `UPDATE code_research_links SET stale = 1, stale_reason = ?, updated_at = ?
                 WHERE id = ? AND project_id = ?`,
              )
              .run(reason, observedAt, link.id, projectId);
            repository.appendProvenance({
              projectId,
              objectId: link.research_object_id ?? undefined,
              action: "code.link.stale",
              actorType: "system",
              actorId: "code-linker-v1",
              metadata: {
                linkId: link.id,
                codeEntityId: entity.id,
                path: changedPath,
                targetKind: link.target_kind,
                targetId: link.target_id,
                reason,
              },
            });
            staleLinks.push(
              mapLink({
                ...link,
                stale: 1,
                stale_reason: reason,
                updated_at: observedAt,
              }),
            );
          }
        }
      }
      database.exec("COMMIT");
      return staleLinks;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  };

  return {
    async scan(projectId) {
      const project = repository.getProject(projectId);
      const configuredRoot = path.resolve(project.path);
      const root = await realpath(configuredRoot);
      if (!samePath(configuredRoot, root)) {
        throw new Error("The registered project path is not canonical.");
      }
      const reportedRoot = (
        await runGit(root, ["rev-parse", "--show-toplevel"])
      ).trim();
      if (!samePath(await realpath(reportedRoot), root)) {
        throw new Error(
          "The registered project root must be the Git repository root.",
        );
      }
      const head =
        (
          await runGit(root, ["rev-parse", "--verify", "HEAD"], {
            allowFailure: true,
          })
        )?.trim() || null;
      const remote = await runGit(root, ["remote", "get-url", "origin"], {
        allowFailure: true,
      });
      const repositorySlug = githubSlug(remote);
      const rawPaths = await runGit(root, [
        "ls-files",
        "-z",
        "--",
        ":(glob)**/*.py",
        ":(glob)**/*.ipynb",
        "*.py",
        "*.ipynb",
      ]);
      const paths = [
        ...new Set(
          rawPaths
            .split("\0")
            .filter(Boolean)
            .map((item) => relativePathSchema.parse(item)),
        ),
      ].sort();
      if (paths.length > MAX_FILES)
        throw new Error("Code scan exceeds its file-count limit.");

      let remainingBytes = MAX_SCAN_BYTES;
      const scanned = [];
      for (const relativePath of paths) {
        const file = await readBoundedFile(root, relativePath, remainingBytes);
        remainingBytes -= file.size;
        const parsed = scanContent(relativePath, file.content);
        scanned.push({
          id: sha256(`${projectId}\0${relativePath}\0`),
          kind: "file",
          path: relativePath,
          symbol: null,
          language: parsed.language,
          symbolKind: null,
          lineStart: null,
          lineEnd: null,
          notebookCell: null,
          contentHash: sha256(file.content),
        });
        for (const symbol of parsed.symbols) {
          scanned.push({
            id: sha256(`${projectId}\0${relativePath}\0${symbol.name}`),
            kind: "symbol",
            path: relativePath,
            symbol: symbol.name,
            language: parsed.language,
            symbolKind: symbol.symbolKind,
            lineStart: symbol.lineStart,
            lineEnd: symbol.lineEnd,
            notebookCell: symbol.cell,
            contentHash: symbol.contentHash,
          });
        }
      }

      const now = clock();
      const changedPaths = new Set();
      const identities = new Set(scanned.map((entity) => entity.id));
      database.exec("BEGIN IMMEDIATE");
      try {
        for (const entity of scanned) {
          const previous = database
            .prepare(
              "SELECT content_hash FROM code_entities WHERE id = ? AND project_id = ?",
            )
            .get(entity.id, projectId);
          if (previous && previous.content_hash !== entity.contentHash)
            changedPaths.add(entity.path);
          database
            .prepare(
              `INSERT INTO code_entities
               (id, project_id, kind, path, symbol, language, symbol_kind, line_start,
                line_end, notebook_cell, content_hash, commit_sha, repository_slug,
                stale, stale_reason, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                kind = excluded.kind, path = excluded.path, symbol = excluded.symbol,
                language = excluded.language, symbol_kind = excluded.symbol_kind,
                line_start = excluded.line_start, line_end = excluded.line_end,
                notebook_cell = excluded.notebook_cell, content_hash = excluded.content_hash,
                commit_sha = excluded.commit_sha, repository_slug = excluded.repository_slug,
                stale = 0, stale_reason = NULL, updated_at = excluded.updated_at`,
            )
            .run(
              entity.id,
              projectId,
              entity.kind,
              entity.path,
              entity.symbol,
              entity.language,
              entity.symbolKind,
              entity.lineStart,
              entity.lineEnd,
              entity.notebookCell,
              entity.contentHash,
              head,
              repositorySlug,
              now,
              now,
            );
        }
        const previousEntities = database
          .prepare(
            "SELECT id, path FROM code_entities WHERE project_id = ? AND stale = 0",
          )
          .all(projectId);
        for (const entity of previousEntities) {
          if (!identities.has(entity.id)) changedPaths.add(entity.path);
        }
        repository.appendProvenance({
          projectId,
          action: "code.scan.completed",
          actorType: "system",
          actorId: "code-linker-v1",
          metadata: {
            commitSha: head,
            entityCount: scanned.length,
            fileCount: paths.length,
            languages: [
              ...new Set(scanned.map((entity) => entity.language)),
            ].sort(),
            repositorySlug,
          },
        });
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      const staleLinks = markPathsStale(
        projectId,
        [...changedPaths],
        "code-content-changed",
        now,
      );
      return {
        projectId,
        commitSha: head,
        repositorySlug,
        filesScanned: paths.length,
        entities: scanned.length,
        staleLinks,
      };
    },

    getContext(projectId, input) {
      repository.getProject(projectId);
      const parsed = z
        .object({
          path: relativePathSchema,
          symbol: z.string().trim().min(1).max(4_000).nullable().optional(),
        })
        .parse(input);
      const entity = database
        .prepare(
          `SELECT * FROM code_entities
           WHERE project_id = ? AND path = ? AND symbol IS ?`,
        )
        .get(projectId, parsed.path, parsed.symbol ?? null);
      if (!entity) throw new Error("Code entity has not been indexed.");
      const links = database
        .prepare(
          `SELECT * FROM code_research_links
           WHERE project_id = ? AND code_entity_id = ?
           ORDER BY stale, verification_state, target_kind, target_title, id`,
        )
        .all(projectId, entity.id)
        .map(mapLink);
      const provenance = database
        .prepare(
          `SELECT id, action, actor_type, actor_id, metadata, created_at
           FROM provenance_events
           WHERE project_id = ? AND (
             json_extract(metadata, '$.codeEntityId') = ? OR
             json_extract(metadata, '$.linkId') IN (
               SELECT id FROM code_research_links WHERE project_id = ? AND code_entity_id = ?
             )
           ) ORDER BY created_at, rowid`,
        )
        .all(projectId, entity.id, projectId, entity.id)
        .map((row) => ({
          id: row.id,
          action: row.action,
          actorType: row.actor_type,
          actorId: row.actor_id ?? null,
          metadata: parseJson(row.metadata, {}),
          createdAt: row.created_at,
        }));
      return { entity: mapEntity(entity), links, provenance };
    },

    listEntities(projectId, input = {}) {
      repository.getProject(projectId);
      const { kind } = z
        .object({ kind: z.enum(["file", "symbol"]).optional() })
        .parse(input);
      return database
        .prepare(
          `SELECT entities.*,
             COUNT(links.id) AS link_count,
             SUM(CASE WHEN links.verification_state = 'unverified' THEN 1 ELSE 0 END) AS unverified_count,
             SUM(CASE WHEN links.stale = 1 THEN 1 ELSE 0 END) AS stale_link_count
           FROM code_entities entities
           LEFT JOIN code_research_links links
             ON links.code_entity_id = entities.id AND links.project_id = entities.project_id
           WHERE entities.project_id = ? AND (? IS NULL OR entities.kind = ?)
           GROUP BY entities.id
           ORDER BY entities.path, entities.kind, entities.line_start, entities.id`,
        )
        .all(projectId, kind ?? null, kind ?? null)
        .map((row) => ({
          ...mapEntity(row),
          linkCount: Number(row.link_count ?? 0),
          unverifiedCount: Number(row.unverified_count ?? 0),
          staleLinkCount: Number(row.stale_link_count ?? 0),
        }));
    },

    createLink(input) {
      const parsed = linkInputSchema.parse(input);
      ensureEntity(parsed.projectId, parsed.codeEntityId);
      let researchObjectId = null;
      let targetTitle = parsed.targetTitle;
      if (LOCAL_OBJECT_KINDS.has(parsed.targetKind)) {
        const object = database
          .prepare(
            "SELECT id, type, title FROM research_objects WHERE id = ? AND project_id = ?",
          )
          .get(parsed.targetId, parsed.projectId);
        if (!object || object.type !== parsed.targetKind) {
          throw new Error(
            "Linked research object does not match the project and target kind.",
          );
        }
        researchObjectId = object.id;
        targetTitle = object.title;
      }
      if (!targetTitle)
        throw new Error("Non-graph link targets require a title.");
      if (
        parsed.targetKind === "commit" &&
        !/^[a-f0-9]{7,64}$/i.test(parsed.targetId)
      ) {
        throw new Error("Commit targets require a Git commit SHA.");
      }
      const id = createId();
      const now = clock();
      const verificationState =
        parsed.source === "agent-proposed" ? "unverified" : "verified";
      const verifiedBy =
        verificationState === "verified" ? parsed.origin : null;
      const confidence = parsed.confidence ?? null;
      database.exec("BEGIN IMMEDIATE");
      try {
        database
          .prepare(
            `INSERT INTO code_research_links
             (id, project_id, code_entity_id, research_object_id, target_kind,
              target_id, target_title, link_role, source, origin, confidence,
              evidence_json, verification_state, verified_by, verified_at,
              stale, stale_reason, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`,
          )
          .run(
            id,
            parsed.projectId,
            parsed.codeEntityId,
            researchObjectId,
            parsed.targetKind,
            parsed.targetId,
            targetTitle,
            parsed.linkRole,
            parsed.source,
            parsed.origin,
            confidence,
            JSON.stringify(parsed.evidence),
            verificationState,
            verifiedBy,
            verificationState === "verified" ? now : null,
            now,
            now,
          );
        repository.appendProvenance({
          projectId: parsed.projectId,
          objectId: researchObjectId ?? undefined,
          action: "code.link.created",
          actorType:
            parsed.source === "agent-proposed"
              ? "agent"
              : parsed.source === "execution"
                ? "integration"
                : "human",
          actorId: parsed.origin,
          metadata: {
            linkId: id,
            codeEntityId: parsed.codeEntityId,
            targetKind: parsed.targetKind,
            targetId: parsed.targetId,
            linkRole: parsed.linkRole,
            source: parsed.source,
            confidence,
            evidence: parsed.evidence,
            verificationState,
          },
        });
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      return mapLink(
        database
          .prepare("SELECT * FROM code_research_links WHERE id = ?")
          .get(id),
      );
    },

    reviewLink(input) {
      const parsed = reviewInputSchema.parse(input);
      const existing = database
        .prepare(
          "SELECT * FROM code_research_links WHERE id = ? AND project_id = ?",
        )
        .get(parsed.id, parsed.projectId);
      if (!existing)
        throw new Error("Code link does not belong to the project.");
      if (existing.verification_state !== "unverified") {
        throw new Error("Only unverified code links can be reviewed.");
      }
      const now = clock();
      database.exec("BEGIN IMMEDIATE");
      try {
        database
          .prepare(
            `UPDATE code_research_links
             SET verification_state = ?, verified_by = ?, verified_at = ?, updated_at = ?
             WHERE id = ? AND project_id = ?`,
          )
          .run(
            parsed.verificationState,
            parsed.reviewerId,
            now,
            now,
            parsed.id,
            parsed.projectId,
          );
        repository.appendProvenance({
          projectId: parsed.projectId,
          objectId: existing.research_object_id ?? undefined,
          action: "code.link.reviewed",
          actorType: "human",
          actorId: parsed.reviewerId,
          metadata: {
            linkId: parsed.id,
            codeEntityId: existing.code_entity_id,
            from: "unverified",
            to: parsed.verificationState,
          },
        });
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      return mapLink(
        database
          .prepare("SELECT * FROM code_research_links WHERE id = ?")
          .get(parsed.id),
      );
    },

    recordRepositoryChanges(projectId, changes, metadata = {}) {
      const paths = changes.flatMap((change) =>
        [change.path, change.originalPath].filter(
          (item) => typeof item === "string",
        ),
      );
      return markPathsStale(
        projectId,
        paths,
        `repository-change${metadata.gitHead ? `@${metadata.gitHead.slice(0, 12)}` : ""}`,
        metadata.observedAt ?? clock(),
      );
    },

    listStaleImpact(projectId) {
      repository.getProject(projectId);
      return database
        .prepare(
          `SELECT links.*, entities.path, entities.symbol
           FROM code_research_links links
           JOIN code_entities entities
             ON entities.id = links.code_entity_id AND entities.project_id = links.project_id
           WHERE links.project_id = ? AND links.stale = 1
           ORDER BY links.updated_at DESC, links.id`,
        )
        .all(projectId)
        .map((row) => ({
          link: mapLink(row),
          code: { path: row.path, symbol: row.symbol ?? null },
          impact: {
            kind: row.target_kind,
            id: row.target_id,
            title: row.target_title,
          },
        }));
    },
  };
}
