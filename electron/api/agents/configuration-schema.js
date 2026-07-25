import { z } from "zod";

export const agentResourceBudgetSchema = z
  .object({
    maxInputTokens: z.number().int().nonnegative(),
    maxOutputTokens: z.number().int().nonnegative(),
    maxCostMinorUnits: z.number().int().nonnegative(),
    maxRuntimeMs: z.number().int().positive(),
  })
  .strict();

export const agentPermissionsSchema = z
  .object({
    canReadFiles: z.boolean(),
    canWriteFiles: z.boolean(),
    canRunCommands: z.boolean(),
    canAccessNetwork: z.boolean(),
    requiresApprovalForWrite: z.boolean(),
    requiresApprovalForNetwork: z.boolean(),
  })
  .strict();

export const agentRoleConfigurationSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    role: z.enum([
      "orchestrator",
      "implementation",
      "review",
      "literature",
      "analysis",
      "experiment",
      "custom",
    ]),
    instanceCount: z.number().int().min(1),
    maxParallel: z.number().int().min(1),
    provider: z.string().trim().min(1).max(200),
    model: z.string().trim().min(1).max(500),
    reasoningLevel: z.enum(["low", "medium", "high", "xhigh", "max", "ultra"]),
    budget: agentResourceBudgetSchema,
    allowedTools: z.array(z.string().trim().min(1).max(500)).max(500),
    allowedContextSources: z
      .array(z.string().trim().min(1).max(1_000))
      .max(500),
    allowedFileGlobs: z.array(z.string().trim().min(1).max(1_000)).max(500),
    permissions: agentPermissionsSchema,
    approvalCheckpoints: z.array(z.string().trim().min(1).max(500)).max(500),
    fallbackModel: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  .superRefine((role, context) => {
    if (role.maxParallel > role.instanceCount) {
      context.addIssue({
        code: "custom",
        message: "Role maxParallel must not exceed instanceCount.",
        path: ["maxParallel"],
      });
    }
  });

export const agentConfigurationInputSchema = z
  .object({
    name: z.string().trim().min(1).max(500),
    maxParallel: z.number().int().min(1),
    maxTotalBudget: agentResourceBudgetSchema,
    partialFailurePolicy: z.enum(["continue", "cancel_remaining"]),
    roles: z.array(agentRoleConfigurationSchema).min(1).max(100),
  })
  .strict()
  .superRefine((configuration, context) => {
    const roleIds = new Set();
    for (const [index, role] of configuration.roles.entries()) {
      if (roleIds.has(role.id)) {
        context.addIssue({
          code: "custom",
          message: "Role ids must be unique within a configuration.",
          path: ["roles", index, "id"],
        });
      }
      roleIds.add(role.id);
    }
    const aggregateParallelism = configuration.roles.reduce(
      (total, role) => total + role.maxParallel,
      0,
    );
    if (aggregateParallelism > configuration.maxParallel) {
      context.addIssue({
        code: "custom",
        message:
          "Aggregate role maxParallel must not exceed global maxParallel.",
        path: ["maxParallel"],
      });
    }
  });

export const parseAgentConfigurationInput = (input) =>
  agentConfigurationInputSchema.parse(input);
