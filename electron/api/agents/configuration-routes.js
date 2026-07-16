import { z } from "zod";
import { getStateDatabase } from "../../persisted-state.js";
import { createAgentConfigurationRepository } from "./configuration-repository.js";
import { agentConfigurationInputSchema } from "./configuration-schema.js";

const updateSchema = agentConfigurationInputSchema.extend({
  expectedRevision: z.number().int().min(1),
});

const revisionSchema = z.object({ expectedRevision: z.number().int().min(1) });

const estimateSchema = z
  .object({
    configuration: agentConfigurationInputSchema.optional(),
    availableContextSources: z.array(z.string()).optional(),
    availableTools: z.array(z.string()).optional(),
  })
  .strict();

async function readJson(c) {
  try {
    return { data: await c.req.json() };
  } catch {
    return { error: c.text("Invalid JSON payload.", 400) };
  }
}

const failure = (c, error, fallback) => {
  const message = error instanceof Error ? error.message : fallback;
  return c.json(
    { error: message },
    /revision conflict/i.test(message) ? 409 : 400,
  );
};

const estimateConfiguration = (
  configuration,
  { availableContextSources, availableTools },
) => {
  const sum = (field) =>
    configuration.roles.reduce(
      (total, role) => total + role.budget[field] * role.instanceCount,
      0,
    );
  const configuredTools = new Set(
    configuration.roles.flatMap((role) => role.allowedTools),
  );
  const configuredContext = new Set(
    configuration.roles.flatMap((role) => role.allowedContextSources),
  );
  const knownTools = new Set(availableTools ?? configuredTools);
  const knownContext = new Set(availableContextSources ?? configuredContext);
  const inaccessibleTools = [...configuredTools]
    .filter((tool) => !knownTools.has(tool))
    .sort();
  const inaccessibleContext = [...configuredContext]
    .filter((source) => !knownContext.has(source))
    .sort();
  const reasons = [
    ...inaccessibleTools.map(
      (tool) => `Tool “${tool}” is not available from the selected providers.`,
    ),
    ...inaccessibleContext.map(
      (source) =>
        `Context source “${source}” is not available to this project.`,
    ),
  ];
  for (const role of configuration.roles) {
    if (
      !role.permissions.canWriteFiles &&
      role.allowedTools.includes("writeFile")
    ) {
      inaccessibleTools.push("writeFile");
      reasons.push(
        `${role.id} cannot use writeFile because file writes are disabled.`,
      );
    }
    if (
      !role.permissions.canAccessNetwork &&
      role.allowedTools.includes("network")
    ) {
      inaccessibleTools.push("network");
      reasons.push(
        `${role.id} cannot use network because network access is disabled.`,
      );
    }
  }
  return {
    inputTokens: Math.min(
      sum("maxInputTokens"),
      configuration.maxTotalBudget.maxInputTokens,
    ),
    outputTokens: Math.min(
      sum("maxOutputTokens"),
      configuration.maxTotalBudget.maxOutputTokens,
    ),
    costMinorUnits: Math.min(
      sum("maxCostMinorUnits"),
      configuration.maxTotalBudget.maxCostMinorUnits,
    ),
    runtimeMs: Math.min(
      sum("maxRuntimeMs"),
      configuration.maxTotalBudget.maxRuntimeMs,
    ),
    inaccessibleContext: [...new Set(inaccessibleContext)],
    inaccessibleTools: [...new Set(inaccessibleTools)],
    reasons,
  };
};

export function registerAgentConfigurationRoutes(
  app,
  {
    getRepository = () =>
      createAgentConfigurationRepository({ db: getStateDatabase() }),
  } = {},
) {
  app.get("/api/projects/:projectId/agent-configurations", (c) => {
    try {
      return c.json(getRepository().list(c.req.param("projectId")));
    } catch (error) {
      return failure(c, error, "Agent configurations could not be loaded.");
    }
  });

  app.post("/api/projects/:projectId/agent-configurations", async (c) => {
    const body = await readJson(c);
    if (body.error) return body.error;
    const parsed = agentConfigurationInputSchema.safeParse(body.data);
    if (!parsed.success) return c.json({ error: parsed.error.message }, 400);
    try {
      return c.json(
        getRepository().create(c.req.param("projectId"), parsed.data),
        201,
      );
    } catch (error) {
      return failure(c, error, "Agent configuration could not be created.");
    }
  });

  app.put(
    "/api/projects/:projectId/agent-configurations/:configurationId",
    async (c) => {
      const body = await readJson(c);
      if (body.error) return body.error;
      const parsed = updateSchema.safeParse(body.data);
      if (!parsed.success) return c.json({ error: parsed.error.message }, 400);
      const { expectedRevision, ...input } = parsed.data;
      try {
        return c.json(
          getRepository().update(
            c.req.param("projectId"),
            c.req.param("configurationId"),
            expectedRevision,
            input,
          ),
        );
      } catch (error) {
        return failure(c, error, "Agent configuration could not be updated.");
      }
    },
  );

  app.delete(
    "/api/projects/:projectId/agent-configurations/:configurationId",
    async (c) => {
      const body = await readJson(c);
      if (body.error) return body.error;
      const parsed = revisionSchema.safeParse(body.data);
      if (!parsed.success) return c.json({ error: parsed.error.message }, 400);
      try {
        return c.json(
          getRepository().remove(
            c.req.param("projectId"),
            c.req.param("configurationId"),
            parsed.data.expectedRevision,
          ),
        );
      } catch (error) {
        return failure(c, error, "Agent configuration could not be removed.");
      }
    },
  );

  app.post(
    "/api/projects/:projectId/agent-configurations/:configurationId/estimate",
    async (c) => {
      const body = await readJson(c);
      if (body.error) return body.error;
      const parsed = estimateSchema.safeParse(body.data);
      if (!parsed.success) return c.json({ error: parsed.error.message }, 400);
      try {
        const persisted = getRepository().get(
          c.req.param("projectId"),
          c.req.param("configurationId"),
        );
        const configuration = parsed.data.configuration ?? persisted;
        if (!configuration) {
          return c.json({ error: "Agent configuration was not found." }, 404);
        }
        const validated = parsed.data.configuration
          ? agentConfigurationInputSchema.parse(parsed.data.configuration)
          : configuration;
        return c.json(estimateConfiguration(validated, parsed.data));
      } catch (error) {
        return failure(c, error, "Agent configuration estimate failed.");
      }
    },
  );
}
