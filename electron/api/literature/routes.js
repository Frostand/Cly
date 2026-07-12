import { z } from "zod";
import { getStateDatabase } from "../../persisted-state.js";
import { createResearchRepository } from "../research/repository.js";
import { tryLocalCrossEncoder } from "./cross-encoder.js";
import { searchLiteratureProviders } from "./search.js";
import { LiteratureSearchError } from "./semantic-scholar.js";

const requestSchema = z.object({
  query: z.string().trim().min(1).max(2_000),
  limit: z.number().int().min(1).max(100).default(25),
  provider: z.enum(["arxiv", "semantic-scholar", "both"]).default("both"),
});

export function registerLiteratureRoutes(
  app,
  {
    search = searchLiteratureProviders,
    rerank = tryLocalCrossEncoder,
    getRepository = () => createResearchRepository(getStateDatabase()),
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
      getRepository().listProject(c.req.param("projectId"));
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
}
