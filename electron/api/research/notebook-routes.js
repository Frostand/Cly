import { z } from "zod";

const notebookImportBodySchema = z
  .object({ path: z.string().trim().min(1).max(4_000) })
  .strict();

export function registerNotebookRoutes(app, { getImporter }) {
  app.post("/api/projects/:projectId/notebooks/import", async (c) => {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.text("Invalid JSON payload.", 400);
    }
    const parsed = notebookImportBodySchema.safeParse(body);
    if (!parsed.success) return c.text(parsed.error.message, 400);
    try {
      const result = await getImporter().importNotebook(
        c.req.param("projectId"),
        parsed.data.path,
      );
      return c.json(result, 201);
    } catch (error) {
      return c.text(
        error instanceof Error ? error.message : "Notebook import failed.",
        400,
      );
    }
  });
}
