import { z } from "zod";
import { getStateDatabase } from "../../persisted-state.js";
import {
  fetchAnthropicModels,
  fetchCursorModels,
  fetchOpenAiModels,
  fetchOpenCodeModels,
} from "../providers/provider-models.js";
import { AGENT_TOOL_REGISTRY } from "./action-policy.js";
import { createAgentConfigurationRepository } from "./configuration-repository.js";
import { agentConfigurationInputSchema } from "./configuration-schema.js";

const updateSchema = agentConfigurationInputSchema.extend({
  expectedRevision: z.number().int().min(1),
});

const revisionSchema = z.object({ expectedRevision: z.number().int().min(1) });

const estimateSchema = z
  .object({
    configuration: agentConfigurationInputSchema.optional(),
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
  { contextSources, providerCatalogs, tools },
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
  const knownTools = new Set(tools);
  const knownContext = new Set(contextSources);
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
    const catalog = providerCatalogs[role.provider];
    if (!catalog) {
      reasons.push(`Provider “${role.provider}” is not available.`);
      reasons.push(
        `Model “${role.model}” cannot be validated because provider “${role.provider}” is unavailable.`,
      );
      continue;
    }
    const discoveryUnavailable =
      catalog.installed === false ||
      catalog.source === "unavailable" ||
      catalog.source === "error" ||
      Boolean(catalog.error);
    if (discoveryUnavailable) {
      const providerReason =
        catalog.installed === false
          ? `Provider “${role.provider}” is not installed`
          : `Provider model discovery for “${role.provider}” is unavailable`;
      const detail = catalog.error ? `: ${catalog.error}` : "";
      reasons.push(
        `${providerReason}${detail}. Model “${role.model}” could not be validated.`,
      );
      if (role.fallbackModel) {
        reasons.push(
          `${providerReason}${detail}. Fallback model “${role.fallbackModel}” could not be validated.`,
        );
      }
      continue;
    }
    const normalizedModels = new Set(
      catalog.models.map((model) => model.toLocaleLowerCase()),
    );
    if (!normalizedModels.has(role.model.toLocaleLowerCase())) {
      reasons.push(
        `Model “${role.model}” is not available from provider “${role.provider}”.`,
      );
    }
    if (
      role.fallbackModel &&
      !normalizedModels.has(role.fallbackModel.toLocaleLowerCase())
    ) {
      reasons.push(
        `Fallback model “${role.fallbackModel}” is not available from provider “${role.provider}”.`,
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

const modelIds = (result) =>
  (result?.models ?? [])
    .map((model) => model?.id)
    .filter((model) => typeof model === "string" && model);

const discoveryErrorMessage = (error) =>
  error instanceof Error ? error.message : "Provider model discovery failed.";

const normalizeProviderCatalog = (result) => ({
  installed: typeof result?.installed === "boolean" ? result.installed : null,
  models: modelIds(result),
  source:
    typeof result?.source === "string" && result.source
      ? result.source
      : "unknown",
  error:
    typeof result?.error === "string" && result.error ? result.error : null,
});

const discoverProviderModels = () => ({
  openai: fetchOpenAiModels(),
  anthropic: fetchAnthropicModels(),
  opencode: fetchOpenCodeModels(),
  cursor: fetchCursorModels(),
});

export const resolveAgentConfigurationAvailability = async ({
  db,
  projectId,
  discoverProviders = discoverProviderModels,
}) => {
  const project = db
    .prepare("SELECT metadata FROM projects WHERE id = ?")
    .get(projectId);
  if (!project) throw new Error("Project was not found.");
  let metadata = {};
  try {
    metadata = JSON.parse(project.metadata ?? "{}");
  } catch {
    metadata = {};
  }
  const contextSources = new Set(["project"]);
  for (const source of Array.isArray(metadata?.agentContextSources)
    ? metadata.agentContextSources
    : []) {
    if (typeof source === "string" && source) contextSources.add(source);
  }
  for (const object of db
    .prepare("SELECT id, type FROM research_objects WHERE project_id = ?")
    .all(projectId)) {
    contextSources.add(`research-object:${object.id}`);
    contextSources.add(`${object.type}:${object.id}`);
  }
  const discovered = await discoverProviders();
  const providerCatalogs = Object.fromEntries(
    await Promise.all(
      Object.entries(discovered).map(async ([providerId, discovery]) => {
        try {
          return [providerId, normalizeProviderCatalog(await discovery)];
        } catch (error) {
          return [
            providerId,
            {
              installed: null,
              models: [],
              source: "error",
              error: discoveryErrorMessage(error),
            },
          ];
        }
      }),
    ),
  );
  return {
    contextSources: [...contextSources],
    providerCatalogs,
    tools: Object.keys(AGENT_TOOL_REGISTRY),
  };
};

export function registerAgentConfigurationRoutes(
  app,
  {
    getRepository = () =>
      createAgentConfigurationRepository({ db: getStateDatabase() }),
    resolveAvailability = ({ projectId }) =>
      resolveAgentConfigurationAvailability({
        db: getStateDatabase(),
        projectId,
      }),
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
        const availability = await resolveAvailability({
          projectId: c.req.param("projectId"),
        });
        return c.json(estimateConfiguration(validated, availability));
      } catch (error) {
        return failure(c, error, "Agent configuration estimate failed.");
      }
    },
  );
}
