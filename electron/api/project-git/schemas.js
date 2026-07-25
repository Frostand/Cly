import { z } from "zod";

const projectAuthoritySchema = {
  projectId: z.string().trim().min(1),
  projectPath: z.string().trim().min(1).optional(),
};

export const projectFilesRequestSchema = z.object({
  directory: z.string().min(1).default("."),
  maxResults: z.number().int().min(1).max(5000).default(2000),
  ...projectAuthoritySchema,
});

export const projectFileRequestSchema = z.object({
  endLine: z.number().int().min(1).optional(),
  filePath: z.string().min(1),
  ...projectAuthoritySchema,
  startLine: z.number().int().min(1).optional(),
});

export const projectIconRequestSchema = z.object({
  ...projectAuthoritySchema,
});

export const projectGitStatusRequestSchema = z.object({
  ...projectAuthoritySchema,
});

export const projectGitBranchesRequestSchema = z.object({
  ...projectAuthoritySchema,
});

export const projectGitCheckoutRequestSchema = z.object({
  branchName: z.string().min(1),
  create: z.boolean().default(false),
  ...projectAuthoritySchema,
});

export const projectGitWorktreesRequestSchema = z.object({
  ...projectAuthoritySchema,
});

export const projectGitCreateWorktreeRequestSchema = z.object({
  baseRef: z.string().trim().optional().nullable(),
  branchName: z.string().min(1),
  ...projectAuthoritySchema,
});

export const projectGitRemoveWorktreeRequestSchema = z.object({
  force: z.boolean().default(false),
  ...projectAuthoritySchema,
  worktreePath: z.string().min(1),
});

export const projectGitDiffRequestSchema = z.object({
  filePath: z.string().min(1),
  previousPath: z.string().min(1).nullable(),
  ...projectAuthoritySchema,
  status: z.enum([
    "modified",
    "added",
    "renamed",
    "copied",
    "deleted",
    "untracked",
  ]),
});

export const projectGitRevertFileRequestSchema = projectGitDiffRequestSchema;

const nullableTrimmedStringSchema = z
  .string()
  .transform((value) => value.trim())
  .optional()
  .nullable();

export const projectGitCommitRequestSchema = z.object({
  customInstructions: nullableTrimmedStringSchema,
  includeUnstaged: z.boolean().default(true),
  message: nullableTrimmedStringSchema,
  ...projectAuthoritySchema,
});

export const projectGitCommitMessageRequestSchema = z.object({
  includeUnstaged: z.boolean().default(true),
  model: nullableTrimmedStringSchema,
  ...projectAuthoritySchema,
  provider: z
    .enum(["openai", "anthropic", "opencode", "cursor"])
    .default("openai"),
});

export const projectGitPushRequestSchema = z.object({
  commitMessage: nullableTrimmedStringSchema,
  customInstructions: nullableTrimmedStringSchema,
  includeUnstaged: z.boolean().default(true),
  nextStep: z.enum(["push", "commit-push"]).default("push"),
  ...projectAuthoritySchema,
});

export const projectGitPushPreviewRequestSchema = z.object({
  ...projectAuthoritySchema,
});

export const projectGitCreatePullRequestSchema = z.object({
  baseBranch: nullableTrimmedStringSchema,
  commitMessage: nullableTrimmedStringSchema,
  customInstructions: nullableTrimmedStringSchema,
  description: nullableTrimmedStringSchema,
  draft: z.boolean().default(true),
  includeUnstaged: z.boolean().default(true),
  nextStep: z
    .enum(["create", "push-create", "commit-push-create"])
    .default("create"),
  openPrPage: z.boolean().default(false),
  ...projectAuthoritySchema,
  title: nullableTrimmedStringSchema,
});

export const projectGitPullRequestDetailsRequestSchema = z.object({
  baseBranch: nullableTrimmedStringSchema,
  customInstructions: nullableTrimmedStringSchema,
  includeUnstaged: z.boolean().default(true),
  model: nullableTrimmedStringSchema,
  nextStep: z
    .enum(["create", "push-create", "commit-push-create"])
    .default("create"),
  ...projectAuthoritySchema,
  provider: z
    .enum(["openai", "anthropic", "opencode", "cursor"])
    .default("openai"),
});
