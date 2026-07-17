import { createHash } from "node:crypto";

const PROJECT_TERMINAL_SESSION_PREFIX = "__project_terminal__:";
const RUN_TERMINAL_SESSION_PREFIX = "__browser_terminal__:";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isSecurityDisplayControl = (codePoint) =>
  codePoint <= 0x1f ||
  (codePoint >= 0x7f && codePoint <= 0x9f) ||
  (codePoint >= 0x202a && codePoint <= 0x202e) ||
  (codePoint >= 0x2066 && codePoint <= 0x2069);

const escapeSecurityDisplayText = (value) =>
  Array.from(String(value ?? ""), (character) => {
    const codePoint = character.codePointAt(0);
    return isSecurityDisplayControl(codePoint)
      ? `\\u{${codePoint.toString(16).padStart(4, "0")}}`
      : character;
  }).join("");

const formatSecurityBoundText = (value, maxChars = 4_000) => {
  const raw = String(value ?? "");
  const escaped = escapeSecurityDisplayText(raw);
  if (escaped.length <= maxChars) return escaped;
  const digest = createHash("sha256").update(raw).digest("hex");
  return `${escaped.slice(0, maxChars)}\n\n[Action truncated in this dialog]\nSHA-256: ${digest}`;
};

export function getBoundRendererId(
  event,
  { windowBindings, allowedRoles = ["agent"] },
) {
  const sender = event?.sender;
  if (!sender || sender.isDestroyed?.()) return null;
  if (!event.senderFrame || event.senderFrame !== sender.mainFrame) return null;

  const binding = windowBindings.get(sender.id);
  return binding && allowedRoles.includes(binding.role) ? sender.id : null;
}

export function getPrivilegedRendererId(
  event,
  { isRendererNavigation, windowBindings, allowedRoles = ["agent"] },
) {
  const senderId = getBoundRendererId(event, {
    allowedRoles,
    windowBindings,
  });
  if (senderId === null) return null;
  return isRendererNavigation(event.sender.getURL?.() ?? "") ? senderId : null;
}

const isProjectTerminalSession = (sessionId, projectId) => {
  if (sessionId === `${RUN_TERMINAL_SESSION_PREFIX}${projectId}`) return true;
  const prefix = `${PROJECT_TERMINAL_SESSION_PREFIX}${projectId}:`;
  return (
    sessionId.startsWith(prefix) &&
    UUID_PATTERN.test(sessionId.slice(prefix.length))
  );
};

export function resolveTerminalLaunch(payload, state) {
  const projectId =
    typeof payload?.projectId === "string" ? payload.projectId.trim() : "";
  const sessionId =
    typeof payload?.sessionId === "string" ? payload.sessionId.trim() : "";
  const purpose = payload?.purpose;

  if (
    !projectId ||
    projectId.length > 200 ||
    !sessionId ||
    sessionId.length > 300 ||
    (purpose !== "interactive" && purpose !== "run-project") ||
    !isProjectTerminalSession(sessionId, projectId)
  ) {
    throw new Error("Invalid project terminal session.");
  }

  const project = state?.projects?.find(
    (candidate) => candidate.id === projectId,
  );
  if (!project || typeof project.path !== "string" || !project.path.trim()) {
    throw new Error("Terminal project is not open.");
  }

  const command =
    purpose === "run-project" && typeof project.runCommand === "string"
      ? project.runCommand.trim()
      : "";
  if (purpose === "run-project" && !command) {
    throw new Error("Project run command is empty.");
  }

  return {
    command: command || undefined,
    cwd: project.path,
    projectId,
    purpose,
    sessionId,
    shellPath:
      typeof state?.settings?.shellPath === "string" &&
      state.settings.shellPath.trim()
        ? state.settings.shellPath.trim()
        : undefined,
  };
}

export const getTerminalLaunchApprovalOptions = (launch) => {
  const runsCommand = launch?.purpose === "run-project";
  return {
    buttons: ["Cancel", runsCommand ? "Run Command" : "Open Terminal"],
    cancelId: 0,
    defaultId: 0,
    detail: runsCommand
      ? `Command:\n${launch.command}\n\nProject:\n${launch.cwd}`
      : `Project:\n${launch.cwd}\n\nOpening an interactive terminal grants this Cly window command access until the terminal is closed.`,
    message: runsCommand
      ? "Allow Cly to run this project command?"
      : "Allow Cly to open an interactive project terminal?",
    noLink: true,
    type: "warning",
  };
};

export const getHostCommandApprovalOptions = ({ command, root }) => {
  const displayedCommand = escapeSecurityDisplayText(command);
  const displayedRoot = escapeSecurityDisplayText(root);
  return {
    buttons: ["Cancel", "Run Command"],
    cancelId: 0,
    defaultId: 0,
    detail: `Command:\n${displayedCommand}\n\nProject worktree:\n${displayedRoot}\n\nThis command runs with your user account and may access files outside the project.`,
    message: "Allow Cly to run this project command?",
    noLink: true,
    type: "warning",
  };
};

export const getProviderHostActionApprovalOptions = ({
  action,
  provider,
  root,
}) => ({
  buttons: ["Cancel", "Allow Once"],
  cancelId: 0,
  defaultId: 0,
  detail: `Provider:\n${formatSecurityBoundText(provider)}\n\nProject worktree:\n${formatSecurityBoundText(root)}\n\nRequested action:\n${formatSecurityBoundText(action)}\n\nThis provider action runs with your user account and may access files or the network outside the project.`,
  message: "Allow this AI provider host action?",
  noLink: true,
  type: "warning",
});

export const isTerminalSessionOwner = (owners, senderId, sessionId) =>
  typeof sessionId === "string" && owners.get(sessionId) === senderId;
