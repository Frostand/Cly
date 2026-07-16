import path from "node:path";

export const AGENT_TOOL_REGISTRY = Object.freeze({
  network: Object.freeze({
    checkpoint: "network",
    permission: "canAccessNetwork",
    approvalPermission: "requiresApprovalForNetwork",
    sideEffecting: true,
  }),
  readFile: Object.freeze({
    checkpoint: "read",
    permission: "canReadFiles",
    pathScoped: true,
    sideEffecting: false,
  }),
  runCommand: Object.freeze({
    checkpoint: "command",
    permission: "canRunCommands",
    sideEffecting: true,
  }),
  writeFile: Object.freeze({
    checkpoint: "write",
    permission: "canWriteFiles",
    approvalPermission: "requiresApprovalForWrite",
    pathScoped: true,
    sideEffecting: true,
  }),
});

const escapeRegex = (character) =>
  /[\\^$+?.()|{}[\]]/.test(character) ? `\\${character}` : character;

const globRegex = (pattern) => {
  const normalized = pattern.replaceAll("\\", "/").replace(/^\.\//, "");
  let source = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === "*" && normalized[index + 1] === "*") {
      if (normalized[index + 2] === "/") {
        source += "(?:.*/)?";
        index += 2;
      } else {
        source += ".*";
        index += 1;
      }
    } else if (character === "*") {
      source += "[^/]*";
    } else if (character === "?") {
      source += "[^/]";
    } else {
      source += escapeRegex(character);
    }
  }
  return new RegExp(`^${source}$`);
};

const normalizedProjectPath = (value) => {
  if (typeof value !== "string" || !value.trim()) return null;
  const slashPath = value.trim().replaceAll("\\", "/");
  if (path.posix.isAbsolute(slashPath) || /^[A-Za-z]:\//.test(slashPath)) {
    return null;
  }
  const normalized = path.posix.normalize(slashPath).replace(/^\.\//, "");
  return normalized === ".." || normalized.startsWith("../")
    ? null
    : normalized;
};

const violation = (message) => ({
  allowed: false,
  error: { code: "POLICY_VIOLATION", message },
});

export const evaluateAgentAction = (role, action) => {
  const definition = AGENT_TOOL_REGISTRY[action.tool];
  if (!definition || !role.allowedTools.includes(action.tool)) {
    return violation(`Tool ${action.tool ?? "(missing)"} is not allowed.`);
  }
  if (!role.permissions[definition.permission]) {
    return violation(`Permission ${definition.permission} is disabled.`);
  }
  if (
    action.checkpoint !== undefined &&
    action.checkpoint !== definition.checkpoint
  ) {
    return violation(
      `Checkpoint ${action.checkpoint} does not match ${definition.checkpoint}.`,
    );
  }
  if (definition.pathScoped) {
    const targetPath = normalizedProjectPath(
      action.input?.path ?? action.input?.filePath,
    );
    if (!targetPath) {
      return violation("File actions require a project-relative path.");
    }
    if (
      !role.allowedFileGlobs.some((pattern) =>
        globRegex(pattern).test(targetPath),
      )
    ) {
      return violation(`${targetPath} is outside the allowed file globs.`);
    }
  }
  const requiresApproval =
    role.approvalCheckpoints.includes(definition.checkpoint) ||
    (definition.approvalPermission
      ? role.permissions[definition.approvalPermission]
      : false);
  return {
    allowed: true,
    checkpoint: definition.checkpoint,
    requiresApproval,
    sideEffecting: definition.sideEffecting,
  };
};
