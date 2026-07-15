import { z } from "zod";
import {
  artifactInputSchema,
  experimentCreateInputSchema,
  experimentDefinitionInputSchema,
  metricsInputSchema,
  runCreateInputSchema,
  runStatusInputSchema,
  stalenessInputSchema,
} from "./experiment-provenance.js";

async function parseBody(c, schema, routeValues) {
  try {
    const parsed = schema.safeParse({
      ...(await c.req.json()),
      ...routeValues,
    });
    return parsed.success
      ? { data: parsed.data }
      : { error: c.text(z.prettifyError(parsed.error), 400) };
  } catch {
    return { error: c.text("Invalid JSON payload.", 400) };
  }
}

const failure = (c, error, fallback) =>
  c.text(error instanceof Error ? error.message : fallback, 400);

export function registerExperimentProvenanceRoutes(app, { getRepository }) {
  app.post("/api/projects/:projectId/experiments", async (c) => {
    const body = await parseBody(c, experimentCreateInputSchema, {
      projectId: c.req.param("projectId"),
    });
    if (body.error) return body.error;
    try {
      return c.json(getRepository().createExperiment(body.data), 201);
    } catch (error) {
      return failure(c, error, "Experiment could not be created.");
    }
  });

  app.post(
    "/api/projects/:projectId/experiments/:experimentId/definitions",
    async (c) => {
      const body = await parseBody(c, experimentDefinitionInputSchema, {
        projectId: c.req.param("projectId"),
        experimentId: c.req.param("experimentId"),
      });
      if (body.error) return body.error;
      try {
        return c.json(
          getRepository().reviseExperimentDefinition(body.data),
          201,
        );
      } catch (error) {
        return failure(c, error, "Experiment definition could not be revised.");
      }
    },
  );

  app.post(
    "/api/projects/:projectId/experiments/:experimentId/runs",
    async (c) => {
      const body = await parseBody(c, runCreateInputSchema, {
        projectId: c.req.param("projectId"),
        experimentId: c.req.param("experimentId"),
      });
      if (body.error) return body.error;
      try {
        return c.json(getRepository().createExperimentRun(body.data), 201);
      } catch (error) {
        return failure(c, error, "Experiment run could not be recorded.");
      }
    },
  );

  app.patch("/api/projects/:projectId/runs/:runId/status", async (c) => {
    const body = await parseBody(c, runStatusInputSchema, {
      projectId: c.req.param("projectId"),
      runId: c.req.param("runId"),
    });
    if (body.error) return body.error;
    try {
      return c.json(getRepository().updateExperimentRunStatus(body.data));
    } catch (error) {
      return failure(c, error, "Experiment run status could not be updated.");
    }
  });

  app.post("/api/projects/:projectId/runs/:runId/metrics", async (c) => {
    const body = await parseBody(c, metricsInputSchema, {
      projectId: c.req.param("projectId"),
      runId: c.req.param("runId"),
    });
    if (body.error) return body.error;
    try {
      return c.json(getRepository().logRunMetrics(body.data), 201);
    } catch (error) {
      return failure(c, error, "Run metrics could not be logged.");
    }
  });

  app.post("/api/projects/:projectId/runs/:runId/artifacts", async (c) => {
    const body = await parseBody(c, artifactInputSchema, {
      projectId: c.req.param("projectId"),
      runId: c.req.param("runId"),
    });
    if (body.error) return body.error;
    try {
      return c.json(getRepository().registerRunArtifact(body.data), 201);
    } catch (error) {
      return failure(c, error, "Run artifact could not be registered.");
    }
  });

  app.post(
    "/api/projects/:projectId/artifacts/:artifactId/staleness",
    async (c) => {
      const body = await parseBody(c, stalenessInputSchema, {
        projectId: c.req.param("projectId"),
        artifactId: c.req.param("artifactId"),
      });
      if (body.error) return body.error;
      try {
        return c.json(getRepository().assessArtifactStaleness(body.data));
      } catch (error) {
        return failure(c, error, "Artifact staleness could not be assessed.");
      }
    },
  );

  app.get("/api/projects/:projectId/experiments/lineage", (c) => {
    try {
      return c.json(
        getRepository().listExperimentLineages(c.req.param("projectId")),
      );
    } catch (error) {
      return failure(c, error, "Experiment lineage could not be loaded.");
    }
  });

  app.get("/api/projects/:projectId/experiments/:experimentId/lineage", (c) => {
    try {
      return c.json(
        getRepository().listExperimentLineage(
          c.req.param("projectId"),
          c.req.param("experimentId"),
        ),
      );
    } catch (error) {
      return failure(c, error, "Experiment lineage could not be loaded.");
    }
  });

  app.get("/api/projects/:projectId/artifacts/:artifactId/lineage", (c) => {
    try {
      return c.json(
        getRepository().getArtifactLineage(
          c.req.param("projectId"),
          c.req.param("artifactId"),
        ),
      );
    } catch (error) {
      return failure(c, error, "Artifact lineage could not be loaded.");
    }
  });
}
