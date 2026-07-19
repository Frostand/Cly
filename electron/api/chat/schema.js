import { z } from "zod";

export const getProviderPermissionModes = (agentMode) =>
  agentMode === "plan"
    ? {
        claudePermissionMode: "ask-permissions",
        codexPermissionMode: "default",
      }
    : {
        claudePermissionMode: "accept-edits",
        codexPermissionMode: "auto-accept-edits",
      };

const chatRequestSchema = z.object({
  // These compatibility fields are accepted only when they agree with the
  // authoritative agent mode. Provider policy is always derived below.
  claudePermissionMode: z.enum(["ask-permissions", "accept-edits"]).optional(),
  codexPermissionMode: z.enum(["default", "auto-accept-edits"]).optional(),
  messages: z.array(z.unknown()),
  model: z.string().min(1),
  modelLabel: z.string().min(1).optional(),
  projectReferences: z
    .array(
      z.object({
        kind: z.enum(["file", "folder"]),
        name: z.string().min(1).optional(),
        parentPath: z.string().optional(),
        path: z.string().min(1),
      }),
    )
    .default([]),
  projectPath: z.string().min(1).optional(),
  provider: z.enum(["openai", "anthropic", "opencode", "cursor"]),
  agentMode: z.enum(["plan", "build"]).default("build"),
  remoteConversationId: z.string().nullable().optional(),
  remoteConversationModel: z.string().nullable().optional(),
  remoteConversationModelSpeed: z
    .enum(["standard", "fast"])
    .nullable()
    .optional(),
  remoteConversationProjectPath: z.string().nullable().optional(),
  modelSpeed: z.enum(["standard", "fast"]).default("standard"),
  modelSpeedLabel: z.string().min(1).optional(),
  reasoningEffort: z
    .enum(["low", "medium", "high", "xhigh", "max"])
    .nullable()
    .optional(),
  reasoningLabel: z.string().min(1).optional(),
  chatId: z.string().min(1).optional(),
  projectId: z.string().min(1),
  threadId: z.string().min(1).optional(),
  managedContext: z
    .object({
      manifestId: z.string().trim().min(1).max(500),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      configurationId: z.string().trim().min(1).max(500),
      roleId: z.string().trim().min(1).max(500),
    })
    .strict()
    .optional(),
});

export const chatRequestBodySchema = chatRequestSchema
  .superRefine((value, context) => {
    const expected = getProviderPermissionModes(value.agentMode);
    if (
      value.claudePermissionMode !== undefined &&
      value.claudePermissionMode !== expected.claudePermissionMode
    ) {
      context.addIssue({
        code: "custom",
        message: "claudePermissionMode must match agentMode.",
        path: ["claudePermissionMode"],
      });
    }
    if (
      value.codexPermissionMode !== undefined &&
      value.codexPermissionMode !== expected.codexPermissionMode
    ) {
      context.addIssue({
        code: "custom",
        message: "codexPermissionMode must match agentMode.",
        path: ["codexPermissionMode"],
      });
    }
    if (value.provider === "cursor" && value.agentMode !== "plan") {
      context.addIssue({
        code: "custom",
        message:
          "Cursor is plan-only until Cly can intercept and authorize each Cursor action.",
        path: ["agentMode"],
      });
    }
  })
  .transform((value) => ({
    ...value,
    ...getProviderPermissionModes(value.agentMode),
  }));

export const formatProjectReferencesForPrompt = (projectReferences) => {
  if (!Array.isArray(projectReferences) || projectReferences.length === 0) {
    return null;
  }

  const lines = projectReferences.map((reference) => {
    const kind = reference.kind === "folder" ? "folder" : "file";
    return `- ${kind}: ${reference.path}`;
  });

  return [
    "Current turn project references:",
    ...lines,
    "Use these referenced project paths as the user's selected context. Read referenced files or inspect referenced folders with the project tools before making claims about their contents.",
  ].join("\n");
};

export const chatTitleRequestBodySchema = z.object({
  fallbackModel: z.string().min(1).optional(),
  projectPath: z.string().min(1).optional(),
  projectId: z.string().min(1),
  promptText: z.string(),
  provider: z.enum(["openai", "anthropic", "opencode", "cursor"]),
});

export const DEFAULT_TOOL_STEP_LIMIT = 8;
export const REASONING_TOOL_STEP_LIMIT = 50;
