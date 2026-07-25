import path from "node:path";
import { z } from "zod";

const providerModelIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/+\-[\]]*$/);
const providerPathSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine((value) => !/[\0\r\n]/.test(value), {
    message: "Path contains unsupported control characters.",
  });
const providerProjectPathSchema = providerPathSchema.refine(path.isAbsolute, {
  message: "Project path must be absolute.",
});
const providerSessionIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);

export const chatRequestBodySchema = z.object({
  claudePermissionMode: z
    .enum(["ask-permissions", "accept-edits"])
    .default("ask-permissions"),
  codexPermissionMode: z
    .enum(["default", "auto-accept-edits"])
    .default("default"),
  messages: z.array(z.unknown()),
  model: providerModelIdSchema,
  modelLabel: z.string().min(1).optional(),
  projectReferences: z
    .array(
      z.object({
        kind: z.enum(["file", "folder"]),
        name: z.string().min(1).optional(),
        parentPath: providerPathSchema.optional(),
        path: providerPathSchema,
      }),
    )
    .default([]),
  projectPath: providerProjectPathSchema,
  provider: z.enum(["openai", "anthropic", "opencode", "cursor"]),
  agentMode: z.enum(["plan", "build"]).default("build"),
  remoteConversationId: providerSessionIdSchema.nullable().optional(),
  remoteConversationModel: providerModelIdSchema.nullable().optional(),
  remoteConversationModelSpeed: z
    .enum(["standard", "fast"])
    .nullable()
    .optional(),
  remoteConversationProjectPath: providerProjectPathSchema
    .nullable()
    .optional(),
  modelSpeed: z.enum(["standard", "fast"]).default("standard"),
  modelSpeedLabel: z.string().min(1).optional(),
  reasoningEffort: z
    .enum(["low", "medium", "high", "xhigh", "max", "ultra"])
    .nullable()
    .optional(),
  reasoningLabel: z.string().min(1).optional(),
  chatId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
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

export const formatProjectReferencesForPrompt = (projectReferences) => {
  if (!Array.isArray(projectReferences) || projectReferences.length === 0) {
    return null;
  }

  const lines = projectReferences.map((reference) => {
    const kind = reference.kind === "folder" ? "folder" : "file";
    const name = reference.name ? ` (${reference.name})` : "";
    return `- ${kind}${name}: ${reference.path}`;
  });

  return [
    "Current turn project references:",
    ...lines,
    "Use these referenced project paths as the user's selected context. Read referenced files or inspect referenced folders with the project tools before making claims about their contents.",
  ].join("\n");
};

export const chatTitleRequestBodySchema = z.object({
  fallbackModel: providerModelIdSchema.optional(),
  projectPath: providerProjectPathSchema,
  projectId: z.string().min(1).optional(),
  promptText: z.string(),
  provider: z.enum(["openai", "anthropic", "opencode", "cursor"]),
});

export const DEFAULT_TOOL_STEP_LIMIT = 8;
export const REASONING_TOOL_STEP_LIMIT = 50;
