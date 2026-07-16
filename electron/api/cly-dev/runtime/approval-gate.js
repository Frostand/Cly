import { createHash } from "node:crypto";

const TOOL_CATEGORIES = Object.freeze({
  applyPatch: "file_write",
  createFile: "file_write",
  deleteFile: "file_write",
  editFile: "file_write",
  moveFile: "file_write",
  writeFile: "file_write",
  command: "command",
  exec: "command",
  runCommand: "command",
  shell: "command",
  fetch: "network",
  http: "network",
  network: "network",
  requestUrl: "network",
  getSecret: "secret",
  readEnvironmentVariable: "secret",
  readSecret: "secret",
  git: "git",
  gitCheckout: "git",
  gitCommit: "git",
  gitMerge: "git",
  gitPush: "git",
  gitReset: "git",
  createExperiment: "experiment",
  runExperiment: "experiment",
  updateExperiment: "experiment",
  createResearchRecord: "research_record",
  deleteResearchRecord: "research_record",
  updateResearchRecord: "research_record",
  writeResearchRecord: "research_record",
  glob: "read_only",
  listFiles: "read_only",
  readFile: "read_only",
  search: "read_only",
});

const SIDE_EFFECT_CATEGORIES = new Set([
  "file_write",
  "command",
  "network",
  "secret",
  "git",
  "experiment",
  "research_record",
]);
const VALID_MODES = new Set(["allow", "deny", "approval"]);

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
};

export const hashToolArguments = (argumentsValue = {}) =>
  createHash("sha256")
    .update(JSON.stringify(canonicalize(argumentsValue)))
    .digest("hex");

const getToolName = (toolCall) => toolCall?.tool ?? toolCall?.name;

const getMode = (policy, category) => {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    return { code: "POLICY_MISSING" };
  }
  const configured =
    policy?.categories?.[category] ??
    policy?.permissions?.[category] ??
    policy?.[category] ??
    policy?.default;
  if (VALID_MODES.has(configured)) return { mode: configured };
  if (configured === true) return { mode: "allow" };
  if (configured === false) return { mode: "deny" };
  return {
    code: configured === undefined ? "POLICY_MISSING" : "POLICY_INVALID",
  };
};

const decision = (type, category, extras = {}) => ({
  type,
  category,
  ...extras,
});

const approvalScope = (approval) => approval?.scope ?? approval ?? {};

export function createApprovalGate({
  projectPolicy,
  loadProjectPolicy,
  loadApproval,
  now = () => new Date().toISOString(),
  approvalTtlMs = 15 * 60 * 1000,
} = {}) {
  const classify = (toolCall) => {
    const tool = getToolName(toolCall);
    const category = TOOL_CATEGORIES[tool];
    if (!category) return null;
    return {
      tool,
      category,
      sideEffecting: SIDE_EFFECT_CATEGORIES.has(category),
    };
  };

  const policyFor = async (projectId) => {
    const source = loadProjectPolicy
      ? await loadProjectPolicy(projectId)
      : projectPolicy;
    if (typeof source === "function") return source(projectId) ?? {};
    if (source?.projects) return source.projects[projectId] ?? null;
    return source ?? null;
  };

  const createRequest = ({
    projectId,
    sessionId,
    toolCall,
    contextHash,
    expiresAt,
  }) => {
    const classification = classify(toolCall);
    if (!classification) return null;
    const scope = {
      projectId,
      sessionId,
      toolCallId: toolCall.toolCallId,
      tool: classification.tool,
      category: classification.category,
      argumentsHash: hashToolArguments(toolCall.arguments),
      contextHash,
      expiresAt:
        expiresAt ?? new Date(Date.parse(now()) + approvalTtlMs).toISOString(),
    };
    return {
      approvalId: `approval-${createHash("sha256")
        .update(JSON.stringify(scope))
        .digest("hex")
        .slice(0, 24)}`,
      ...scope,
    };
  };

  const evaluate = async ({
    projectId,
    sessionId,
    toolCall,
    contextHash,
    approval,
  }) => {
    const classification = classify(toolCall);
    if (!classification) {
      return decision("deny", "unknown", {
        code: "UNKNOWN_TOOL",
        reason: `Tool ${getToolName(toolCall) ?? "(missing)"} has no known permission category.`,
      });
    }
    const policyDecision = getMode(
      await policyFor(projectId),
      classification.category,
    );
    if (!policyDecision.mode) {
      return decision("deny", classification.category, {
        code: policyDecision.code,
        reason: "No valid trusted project policy authorizes this tool.",
      });
    }
    if (policyDecision.mode === "deny") {
      return decision("deny", classification.category, {
        code: "POLICY_DENIED",
        reason: `Project policy denies ${classification.category} effects.`,
      });
    }
    if (policyDecision.mode === "allow") {
      return decision("allow", classification.category, {
        reason: "Project policy allows this tool effect.",
      });
    }

    if (typeof loadApproval !== "function") {
      return decision("deny", classification.category, {
        code: "APPROVAL_RESOLVER_UNAVAILABLE",
        reason: "A durable authoritative approval resolver is required.",
      });
    }

    const request = createRequest({
      projectId,
      sessionId,
      toolCall,
      contextHash,
    });
    const approvalId =
      typeof approval === "string" ? approval : approval?.approvalId;
    if (!approvalId) {
      return decision("pending", classification.category, {
        code: "APPROVAL_REQUIRED",
        approval: request,
      });
    }
    const storedApproval = await loadApproval(approvalId, {
      projectId,
      sessionId,
      toolCallId: toolCall.toolCallId,
    });
    if (!storedApproval) {
      return decision("deny", classification.category, {
        code: "APPROVAL_NOT_FOUND",
        reason: "The durable approval record was not found.",
      });
    }
    const scope = approvalScope(storedApproval);
    if (
      storedApproval.approvalId !== approvalId ||
      !["pending", "approved", "rejected", "canceled"].includes(
        storedApproval.state,
      )
    ) {
      return decision("deny", classification.category, {
        code: "INVALID_APPROVAL_RECORD",
        reason: "The durable approval record is malformed.",
      });
    }

    const exactFields = [
      "projectId",
      "sessionId",
      "toolCallId",
      "tool",
      "category",
      "argumentsHash",
      "contextHash",
    ];
    const mismatch = exactFields.find(
      (field) => scope[field] !== request[field],
    );
    if (mismatch) {
      return decision("deny", classification.category, {
        code: "APPROVAL_SCOPE_MISMATCH",
        reason: `Approval scope does not match ${mismatch}.`,
      });
    }
    if (
      typeof scope.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(scope.expiresAt)) ||
      Date.parse(scope.expiresAt) <= Date.parse(now())
    ) {
      return decision("deny", classification.category, {
        code: "APPROVAL_EXPIRED",
        reason: "The approval has expired.",
      });
    }
    if (storedApproval.state === "pending") {
      return decision("pending", classification.category, {
        code: "APPROVAL_PENDING",
        approval: storedApproval,
      });
    }
    if (["rejected", "canceled"].includes(storedApproval.state)) {
      return decision("deny", classification.category, {
        code: "APPROVAL_REJECTED",
        reason: "The requested tool effect was not approved.",
        approval: storedApproval,
      });
    }
    return decision("allow", classification.category, {
      reason: "An exact, unexpired approval permits this tool effect.",
      approval: storedApproval,
    });
  };

  return Object.freeze({ classify, createRequest, evaluate });
}
