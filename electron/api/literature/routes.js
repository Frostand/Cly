import { z } from "zod";
import { getStateDatabase } from "../../persisted-state.js";
import { createResearchRepository } from "../research/repository.js";
import { tryLocalCrossEncoder } from "./cross-encoder.js";
import { parseBibtex } from "./ingestion.js";
import { createLiteratureRepository } from "./repository.js";
import { searchLiteratureProviders } from "./search.js";
import { LiteratureSearchError } from "./semantic-scholar.js";

const requestSchema = z.object({
  query: z.string().trim().min(1).max(2_000),
  limit: z.number().int().min(1).max(100).default(25),
  provider: z.enum(["arxiv", "semantic-scholar", "both"]).default("both"),
});

const metadataRecordSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    authors: z
      .union([
        z.string().trim().max(5_000),
        z.array(z.string().trim().min(1).max(500)).max(100),
      ])
      .optional(),
    abstract: z.string().trim().max(20_000).optional(),
    citation: z.string().trim().max(5_000).optional(),
    date: z.string().trim().max(100).optional(),
    doi: z.string().trim().max(500).optional(),
    journal: z.string().trim().max(500).optional(),
    provider: z.string().trim().max(200).optional(),
    providerId: z.string().trim().max(500).optional(),
    tags: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
    url: z.url().max(4_000).optional(),
    year: z
      .union([
        z.number().int().min(1500).max(2199),
        z
          .string()
          .trim()
          .regex(/^(?:1[5-9]\d{2}|20\d{2}|21\d{2})$/),
      ])
      .optional(),
  })
  .strict();

const importSchema = z.discriminatedUnion("format", [
  z
    .object({
      format: z.literal("metadata"),
      records: z.array(metadataRecordSchema).min(1).max(100),
      readingListIds: z.array(z.string().trim().min(1)).max(25).default([]),
    })
    .strict(),
  z
    .object({
      format: z.literal("bibtex"),
      content: z.string().trim().min(1).max(1_000_000),
      readingListIds: z.array(z.string().trim().min(1)).max(25).default([]),
    })
    .strict(),
]);

const readingListSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2_000).default(""),
  })
  .strict();

const externalDestinations = {
  arxiv: ["arxiv"],
  "semantic-scholar": ["semantic-scholar"],
  both: ["arxiv", "semantic-scholar"],
};

export function registerLiteratureRoutes(
  app,
  {
    search = searchLiteratureProviders,
    rerank = tryLocalCrossEncoder,
    getRepository = () => createResearchRepository(getStateDatabase()),
    getLiteratureRepository = () =>
      createLiteratureRepository(getStateDatabase()),
  } = {},
) {
  app.post("/api/projects/:projectId/literature/search", async (c) => {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.text("Invalid JSON payload.", 400);
    }
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return c.text("Invalid literature search.", 400);
    try {
      const repository = getRepository();
      const projectId = c.req.param("projectId");
      repository.listProject(projectId);
      const project = repository.getProject(projectId);
      const approvals = new Set(
        Array.isArray(project.metadata?.externalTransmissionApprovals)
          ? project.metadata.externalTransmissionApprovals
          : [],
      );
      const unapprovedDestination = externalDestinations[
        parsed.data.provider
      ].find((destination) => !approvals.has(destination));
      if (project.metadata?.localOnly && unapprovedDestination) {
        return c.text(
          `Local-only project blocks external transmission to ${unapprovedDestination}. Approve that destination in project privacy settings first.`,
          403,
        );
      }
      const papers = await search(parsed.data.query, {
        limit: parsed.data.limit,
        provider: parsed.data.provider,
      });
      const reranking = await rerank(parsed.data.query, papers);
      return c.json({ papers, provider: parsed.data.provider, reranking });
    } catch (error) {
      if (error instanceof LiteratureSearchError) {
        const status =
          error.kind === "rate_limited"
            ? 429
            : error.kind === "timeout"
              ? 504
              : 502;
        return c.text(error.message, status);
      }
      return c.text(
        error instanceof Error ? error.message : "Literature search failed.",
        400,
      );
    }
  });

  app.post("/api/projects/:projectId/literature/imports", async (c) => {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.text("Invalid JSON payload.", 400);
    }
    const parsed = importSchema.safeParse(body);
    if (!parsed.success) return c.text("Invalid literature import.", 400);
    try {
      const records =
        parsed.data.format === "bibtex"
          ? parseBibtex(parsed.data.content)
          : parsed.data.records;
      if (records.length > 100) {
        return c.text("A literature import is limited to 100 records.", 400);
      }
      const result = getLiteratureRepository().importRecords(
        c.req.param("projectId"),
        records,
        {
          importMethod: parsed.data.format,
          readingListIds: parsed.data.readingListIds,
        },
      );
      return c.json(result, 201);
    } catch (error) {
      return c.text(
        error instanceof Error ? error.message : "Literature import failed.",
        400,
      );
    }
  });

  app.get("/api/projects/:projectId/literature/reading-lists", (c) => {
    try {
      return c.json(
        getLiteratureRepository().listReadingLists(c.req.param("projectId")),
      );
    } catch (error) {
      return c.text(
        error instanceof Error ? error.message : "Reading lists failed.",
        400,
      );
    }
  });

  app.post("/api/projects/:projectId/literature/reading-lists", async (c) => {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.text("Invalid JSON payload.", 400);
    }
    const parsed = readingListSchema.safeParse(body);
    if (!parsed.success) return c.text("Invalid reading list.", 400);
    try {
      const result = getLiteratureRepository().createReadingList(
        c.req.param("projectId"),
        parsed.data,
      );
      return c.json(result.readingList, result.created ? 201 : 200);
    } catch (error) {
      return c.text(
        error instanceof Error
          ? error.message
          : "Reading list creation failed.",
        400,
      );
    }
  });

  app.put(
    "/api/projects/:projectId/literature/reading-lists/:listId/sources/:sourceId",
    (c) => {
      try {
        return c.json(
          getLiteratureRepository().addSourceToReadingList(
            c.req.param("projectId"),
            c.req.param("listId"),
            c.req.param("sourceId"),
          ),
        );
      } catch (error) {
        return c.text(
          error instanceof Error
            ? error.message
            : "Reading list update failed.",
          400,
        );
      }
    },
  );

  app.delete(
    "/api/projects/:projectId/literature/reading-lists/:listId/sources/:sourceId",
    (c) => {
      try {
        return c.json(
          getLiteratureRepository().removeSourceFromReadingList(
            c.req.param("projectId"),
            c.req.param("listId"),
            c.req.param("sourceId"),
          ),
        );
      } catch (error) {
        return c.text(
          error instanceof Error
            ? error.message
            : "Reading list update failed.",
          400,
        );
      }
    },
  );
}
