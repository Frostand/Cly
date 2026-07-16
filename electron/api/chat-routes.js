import { promises as fs, realpathSync } from "node:fs";
import {
  getStateDatabase,
  resolvePersistedProjectPath,
} from "../persisted-state.js";
import { streamClaudeResponse } from "./chat/claude-stream.js";
import { streamCodexAppServerResponse } from "./chat/codex-app-server.js";
import { streamCursorResponse } from "./chat/cursor-stream.js";
import { streamOpenCodeResponse } from "./chat/opencode-stream.js";
import {
  chatRequestBodySchema,
  chatTitleRequestBodySchema,
  formatProjectReferencesForPrompt,
} from "./chat/schema.js";
import { generateChatTitle } from "./chat/title.js";
import { readCodexAccessToken } from "./providers/codex-auth.js";
import {
  getCursorCliUnavailableMessage,
  isCursorCliAvailable,
} from "./providers/cursor-cli.js";
import { createContextRepository } from "./research/context-repository.js";
import { createObligationService } from "./research/obligation-service.js";
import { isCliCommandAvailable } from "./shared/cli.js";

const validateProjectPath = async (projectPath) => {
  try {
    const projectStats = await fs.stat(projectPath);
    return projectStats.isDirectory()
      ? null
      : { message: "projectPath must point to a directory.", status: 400 };
  } catch {
    return { message: "Project path does not exist.", status: 400 };
  }
};

const validateCodexReady = async () => {
  const codexInstalled = await isCliCommandAvailable("codex");
  if (!codexInstalled) {
    return {
      message: "Codex CLI is not installed or not available on PATH.",
      status: 400,
    };
  }

  const accessToken = await readCodexAccessToken();
  if (!accessToken) {
    return {
      message: "Codex login not found. Run `codex login` and try again.",
      status: 401,
    };
  }

  return null;
};

const validateClaudeReady = async () => {
  const claudeInstalled = await isCliCommandAvailable("claude");
  if (!claudeInstalled) {
    return {
      message: "Claude Code CLI is not installed or not available on PATH.",
      status: 400,
    };
  }

  return null;
};

const validateOpenCodeReady = async () => {
  const openCodeInstalled = await isCliCommandAvailable("opencode");
  if (!openCodeInstalled) {
    return {
      message: "OpenCode CLI is not installed or not available on PATH.",
      status: 400,
    };
  }

  return null;
};

const validateCursorReady = async () => {
  const cursorInstalled = await isCursorCliAvailable();
  if (!cursorInstalled) {
    return {
      message: getCursorCliUnavailableMessage(),
      status: 400,
    };
  }

  return null;
};

const resolveEvaluationProjectId = (database, projectId, projectPath) => {
  const row = projectId
    ? database
        .prepare("SELECT id, path FROM projects WHERE id = ? LIMIT 1")
        .get(projectId)
    : database
        .prepare(
          "SELECT id, path FROM projects WHERE path = ? OR normalized_path = ? LIMIT 1",
        )
        .get(projectPath, projectPath);
  if (!row?.id || !row.path) {
    return null;
  }

  try {
    return realpathSync(row.path) === realpathSync(projectPath) ? row.id : null;
  } catch {
    return null;
  }
};

const evaluateProviderTransmission = (
  { projectId, projectPath, provider },
  { database, obligationService },
) => {
  const resolvedProjectId = resolveEvaluationProjectId(
    database,
    projectId,
    projectPath,
  );
  if (!resolvedProjectId) {
    return {
      evaluation: {
        decision: "block",
        alerts: [
          {
            rationale:
              "Cly could not identify the project for research-data obligation evaluation.",
          },
        ],
      },
      projectId: null,
    };
  }
  return {
    evaluation: obligationService.safeEvaluateOperation(resolvedProjectId, {
      kind: "provider-transmission",
      integration: "agent-chat",
      objectIds: [],
      purpose: "research-assistance",
      collaborators: [],
      provider,
      residency: null,
      license: null,
      external: true,
    }),
    projectId: resolvedProjectId,
  };
};

const blockedTransmissionResponse = (c, evaluation) =>
  c.json(
    {
      error:
        evaluation.decision === "review"
          ? "Provider transmission requires recorded human approval."
          : "Provider transmission blocked by research-data obligations.",
      evaluation,
    },
    409,
  );

export const registerChatRoutes = (
  app,
  {
    getDatabase = getStateDatabase,
    getObligationService = (database) => createObligationService(database),
    getContextRepository = (database) =>
      createContextRepository({ db: database }),
    resolveProjectPath = resolvePersistedProjectPath,
    providerStreams = {
      openai: streamCodexAppServerResponse,
      opencode: streamOpenCodeResponse,
      cursor: streamCursorResponse,
      anthropic: streamClaudeResponse,
    },
    providerValidators = {
      openai: validateCodexReady,
      opencode: validateOpenCodeReady,
      cursor: validateCursorReady,
      anthropic: validateClaudeReady,
    },
  } = {},
) => {
  app.post("/api/chat-title", async (c) => {
    let rawBody;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.text("Invalid JSON payload.", 400);
    }

    const parsed = chatTitleRequestBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.text(parsed.error.message, 400);
    }

    const { fallbackModel, projectId, projectPath, promptText, provider } =
      parsed.data;
    const projectPathError = await validateProjectPath(projectPath);
    if (projectPathError) {
      return c.text(projectPathError.message, projectPathError.status);
    }
    const database = getDatabase();
    const transmission = evaluateProviderTransmission(
      {
        projectId,
        projectPath,
        provider,
      },
      { database, obligationService: getObligationService(database) },
    );
    if (transmission.evaluation.decision !== "allow") {
      return blockedTransmissionResponse(c, transmission.evaluation);
    }

    if (provider === "openai") {
      const codexError = await validateCodexReady();
      if (codexError) {
        return c.text(codexError.message, codexError.status);
      }
    } else if (provider === "opencode") {
      const openCodeError = await validateOpenCodeReady();
      if (openCodeError) {
        return c.text(openCodeError.message, openCodeError.status);
      }
    } else if (provider === "cursor") {
      const cursorError = await validateCursorReady();
      if (cursorError) {
        return c.text(cursorError.message, cursorError.status);
      }
    } else {
      const claudeError = await validateClaudeReady();
      if (claudeError) {
        return c.text(claudeError.message, claudeError.status);
      }
    }

    try {
      const title = await generateChatTitle({
        fallbackModel,
        projectPath,
        promptText,
        provider,
      });
      return c.json({ title });
    } catch (error) {
      const detail =
        error instanceof Error && error.message
          ? error.message
          : "Chat title generation failed.";
      return c.text(detail, 500);
    }
  });

  app.post("/api/chat", async (c) => {
    let rawBody;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.text("Invalid JSON payload.", 400);
    }

    const parsed = chatRequestBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.text(parsed.error.message, 400);
    }

    const {
      chatId,
      agentMode,
      claudePermissionMode,
      codexPermissionMode,
      messages,
      model,
      modelLabel,
      modelSpeed,
      modelSpeedLabel,
      projectReferences,
      projectPath,
      projectId,
      provider,
      reasoningEffort,
      reasoningLabel,
      remoteConversationId,
      remoteConversationModel,
      remoteConversationModelSpeed,
      remoteConversationProjectPath,
      threadId,
      managedContext,
    } = parsed.data;
    const resolvedChatId = chatId ?? threadId;
    const resolvedProjectPath =
      resolveProjectPath({
        chatId: resolvedChatId,
        projectId,
      }) ?? projectPath;
    const responseMessageMetadata = {
      createdAt: new Date().toISOString(),
      model,
      modelLabel: modelLabel ?? model,
      modelSpeed,
      ...(modelSpeedLabel ? { modelSpeedLabel } : {}),
      ...(reasoningEffort ? { reasoningEffort } : {}),
      ...(reasoningLabel ? { reasoningLabel } : {}),
    };
    let projectReferencesPrompt =
      formatProjectReferencesForPrompt(projectReferences);

    const projectPathError = await validateProjectPath(resolvedProjectPath);
    if (projectPathError) {
      return c.text(projectPathError.message, projectPathError.status);
    }

    const database = getDatabase();
    let transmission;
    if (managedContext) {
      if (projectReferences.length > 0) {
        return c.json(
          {
            error:
              "Renderer-supplied project references cannot broaden a managed context manifest.",
          },
          400,
        );
      }
      const resolvedProjectId = resolveEvaluationProjectId(
        database,
        projectId,
        resolvedProjectPath,
      );
      if (!resolvedProjectId) {
        return blockedTransmissionResponse(c, {
          decision: "block",
          alerts: [{ rationale: "Managed context project binding failed." }],
        });
      }
      try {
        const manifest = getContextRepository(database).loadManifestForEgress(
          resolvedProjectId,
          managedContext.manifestId,
          {
            sha256: managedContext.sha256,
            provider,
            model,
            configurationId: managedContext.configurationId,
            roleId: managedContext.roleId,
          },
        );
        projectReferencesPrompt = manifest.canonicalPayload;
        transmission = {
          projectId: resolvedProjectId,
          evaluation: { decision: "allow" },
        };
      } catch (error) {
        return c.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Managed context verification failed.",
          },
          409,
        );
      }
    } else {
      transmission = evaluateProviderTransmission(
        {
          projectId,
          projectPath: resolvedProjectPath,
          provider,
        },
        { database, obligationService: getObligationService(database) },
      );
      if (transmission.evaluation.decision !== "allow") {
        return blockedTransmissionResponse(c, transmission.evaluation);
      }
    }

    if (provider === "openai") {
      const codexError = await providerValidators.openai();
      if (codexError) {
        return c.text(codexError.message, codexError.status);
      }

      return providerStreams.openai({
        abortSignal: c.req.raw.signal,
        chatId: resolvedChatId,
        codexPermissionMode,
        messages,
        model,
        projectReferencesPrompt,
        projectId: transmission.projectId,
        projectPath: resolvedProjectPath,
        modelSpeed,
        reasoningEffort,
        responseMessageMetadata,
      });
    }

    if (provider === "opencode") {
      const openCodeError = await providerValidators.opencode();
      if (openCodeError) {
        return c.text(openCodeError.message, openCodeError.status);
      }

      return providerStreams.opencode({
        abortSignal: c.req.raw.signal,
        agentMode,
        codexPermissionMode,
        messages,
        model,
        projectReferencesPrompt,
        projectId: transmission.projectId,
        projectPath: resolvedProjectPath,
        responseMessageMetadata,
      });
    }

    if (provider === "cursor") {
      const cursorError = await providerValidators.cursor();
      if (cursorError) {
        return c.text(cursorError.message, cursorError.status);
      }

      return providerStreams.cursor({
        abortSignal: c.req.raw.signal,
        codexPermissionMode,
        messages,
        model,
        modelSpeed,
        projectReferencesPrompt,
        projectPath: resolvedProjectPath,
        remoteConversationId,
        remoteConversationModel,
        remoteConversationModelSpeed,
        remoteConversationProjectPath,
        responseMessageMetadata,
      });
    }

    const claudeError = await providerValidators.anthropic();
    if (claudeError) {
      return c.text(claudeError.message, claudeError.status);
    }

    return providerStreams.anthropic({
      agentMode,
      claudePermissionMode,
      messages,
      model,
      projectReferencesPrompt,
      projectId: transmission.projectId,
      projectPath: resolvedProjectPath,
      reasoningEffort,
      responseMessageMetadata,
      runId: resolvedChatId,
    });
  });
};
