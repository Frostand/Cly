import { createHash } from "node:crypto";
import { getStateDatabase } from "../../../persisted-state.js";
import { runGitCommand } from "../../project-git/core.js";
import { createSignedInCodexRunner } from "../runtime/codex-runner.js";
import {
  CLY_DEV_PROVIDER_CAPABILITY_FIELDS,
  hasCanonicalProviderCapabilities,
  isCanonicalProviderModelId,
} from "../runtime/provider-contract.js";
import { createClyDevSessionRepository } from "../session-repository.js";
import { canonicalJson } from "./canonical-json.js";

const EFFECT_CATEGORIES = [
  "file_write",
  "git",
  "command",
  "experiment",
  "research_record",
];
const VALID_POLICY_MODES = new Set(["allow", "approval", "deny"]);
const PROVIDER_IDS = new Set(["openai", "openai-codex"]);

const parseJson = (value, fallback = null) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const policyMode = (policy, category) => {
  const configured =
    policy?.categories?.[category] ??
    policy?.permissions?.[category] ??
    policy?.[category] ??
    policy?.default;
  if (VALID_POLICY_MODES.has(configured)) return configured;
  if (configured === true) return "allow";
  if (configured === false) return "deny";
  throw new Error(`Cly Dev policy mode for ${category} is unavailable.`);
};

const loadPermissionScope = (db, projectId) => {
  const row = db
    .prepare("SELECT metadata FROM projects WHERE id = ?")
    .get(projectId);
  if (!row) throw new Error("Project was not found.");
  const policy = parseJson(row.metadata, {})?.clyDevPolicy;
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    throw new Error("A current Cly Dev project policy is required.");
  }
  const effectModes = EFFECT_CATEGORIES.map((category) =>
    policyMode(policy, category),
  );
  const commandMode = policyMode(policy, "command");
  const networkMode = policyMode(policy, "network");
  return {
    filesystem: effectModes.some((mode) => mode !== "deny")
      ? "workspace-write"
      : "read-only",
    network: networkMode === "deny" ? "disabled" : "restricted",
    commands: commandMode === "deny" ? [] : ["*"],
  };
};

const researchObject = (row) => {
  const content = {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    payload: parseJson(row.payload, null),
    origin: row.origin,
    reviewState: row.review_state,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  };
  return {
    id: row.id,
    version: row.updated_at,
    contentHash: createHash("sha256")
      .update(canonicalJson(content))
      .digest("hex"),
  };
};

const capabilityNames = (capabilities) =>
  CLY_DEV_PROVIDER_CAPABILITY_FIELDS.filter(
    (name) => capabilities[name] === true,
  )
    .map((name) =>
      name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
    )
    .sort();

export function createProductionClyDevHandoffDependencies({
  db = getStateDatabase(),
  runner,
  runGit = runGitCommand,
  now,
} = {}) {
  if (!db) throw new Error("A SQLite database is required.");
  const sessions = createClyDevSessionRepository({
    db,
    ...(now ? { now } : {}),
  });
  const productionRunner = runner ?? createSignedInCodexRunner({ db });

  const findWorkspace = (projectId, repository) => {
    const workspace = sessions
      .listWorkspaces(projectId)
      .find(
        (candidate) =>
          candidate.repository?.id === repository.id &&
          candidate.worktree?.id === repository.worktreeId &&
          candidate.worktree?.branch === repository.branch,
      );
    if (!workspace) {
      throw new Error("The matching target repository worktree was not found.");
    }
    if (typeof workspace.localOnly?.worktreePath !== "string") {
      throw new Error("The target worktree path is unavailable.");
    }
    return workspace;
  };

  const git = async (cwd, args) => {
    const result = await runGit(cwd, args, { allowFailure: true });
    if (!result?.ok || !result.stdout?.trim()) {
      throw new Error(result?.stderr?.trim() || "Git inspection failed.");
    }
    return result.stdout.trim();
  };

  const inspectRepository = async ({ projectId, repository }) => {
    const workspace = findWorkspace(projectId, repository);
    const cwd = workspace.localOnly.worktreePath;
    return {
      id: workspace.repository.id,
      branch: await git(cwd, ["branch", "--show-current"]),
      worktreeId: workspace.worktree.id,
      commitSha: await git(cwd, ["rev-parse", "HEAD"]),
      files: await Promise.all(
        repository.files.map(async ({ relativePath }) => ({
          relativePath,
          objectHash: await git(cwd, ["rev-parse", `HEAD:${relativePath}`]),
        })),
      ),
    };
  };

  const loadResearch = (projectId, objectIds) => {
    const statement = db.prepare(
      `SELECT id, type, title, description, payload, origin, review_state,
              reviewed_by, reviewed_at, created_at, updated_at
       FROM research_objects WHERE id = ? AND project_id = ?`,
    );
    return objectIds.map((objectId) => {
      const row = statement.get(objectId, projectId);
      if (!row) throw new Error(`Research object ${objectId} was not found.`);
      return researchObject(row);
    });
  };

  const providerState = async () => {
    const authentication = await productionRunner.getAuthentication();
    if (authentication?.status !== "authenticated") {
      throw new Error("The production Codex provider is not authenticated.");
    }
    const models = await productionRunner.listModels();
    if (
      !Array.isArray(models) ||
      models.length === 0 ||
      models.some(
        (model) =>
          !model ||
          typeof model !== "object" ||
          Array.isArray(model) ||
          !isCanonicalProviderModelId(model.id),
      )
    ) {
      throw new Error("Production Codex model discovery is malformed.");
    }
    const discoveredCapabilities = await productionRunner.getCapabilities();
    if (!hasCanonicalProviderCapabilities(discoveredCapabilities)) {
      throw new Error(
        "Production Codex capability discovery is incomplete or unknown.",
      );
    }
    const capabilities = capabilityNames(discoveredCapabilities);
    return { capabilities, models: models.filter((model) => model?.id) };
  };

  return {
    getDatabase: () => db,
    getSessionRepository: () => sessions,
    projectExists: ({ projectId }) =>
      db.prepare("SELECT id FROM projects WHERE id = ?").get(projectId),
    inspectRepository,
    inspectSourceResearch: ({ projectId, researchObjectIds }) => ({
      objects: loadResearch(projectId, researchObjectIds),
      impact: [],
    }),
    inspectResearch: ({ projectId, research }) => ({
      objects: loadResearch(
        projectId,
        research.objects.map((object) => object.id),
      ),
    }),
    getProviderRequirements: async ({ session }) => {
      if (!PROVIDER_IDS.has(session.provider?.id)) {
        throw new Error(
          "The source session provider is not production supported.",
        );
      }
      const state = await providerState();
      if (!state.models.some((model) => model.id === session.provider.model)) {
        throw new Error("The source session model is not currently available.");
      }
      return { required: true, capabilities: state.capabilities };
    },
    getProviderCapabilities: async () => (await providerState()).capabilities,
    inspectSourcePermissions: ({ projectId }) =>
      loadPermissionScope(db, projectId),
    inspectPermissions: ({ projectId }) => ({
      current: loadPermissionScope(db, projectId),
    }),
    inspectApprovals: ({ projectId }) => {
      loadPermissionScope(db, projectId);
      db.prepare(
        `SELECT 1 FROM cly_dev_approvals
           WHERE project_id = ? LIMIT 1`,
      ).get(projectId);
      return {
        // There is no imported session/action/context scope to validate yet.
        // Every resumed effect must obtain fresh durable target authority.
        compatible: true,
        currentApprovalIds: [],
      };
    },
    resolveTargetWorkspace: ({ projectId, repository }) =>
      findWorkspace(projectId, repository),
    resolveTargetProvider: async () => {
      const state = await providerState();
      return { id: "openai-codex", model: state.models[0].id };
    },
    ...(now ? { now } : {}),
  };
}
