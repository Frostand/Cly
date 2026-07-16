const WINDOW_ROLES = new Set(["agent", "workspace"]);
const INTENT_TYPES = new Set([
  "select_file",
  "select_diff",
  "resolve_approval",
  "set_workspace_mode",
  "activate_workbench_tab",
]);

const createSnapshot = (sessionId) => ({
  sessionId,
  revision: 0,
  selectedFileId: null,
  selectedDiffId: null,
  pendingApprovalIds: [],
  workspaceMode: "inline",
  activeWorkbenchTabId: null,
});

const normalizedString = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const workspaceMode = (value) =>
  value === "detached" || value === "inline" ? value : null;

/**
 * The main-process state authority for replaceable Cly Dev renderers. It keeps
 * only the small shared projection needed by both windows; conversation and
 * durable task events remain owned by Cly Core's session repository.
 */
export function createClyDevWorkspaceCore({ initialSnapshots = [] } = {}) {
  const snapshots = new Map(
    initialSnapshots.map((snapshot) => [snapshot.sessionId, { ...snapshot }]),
  );
  const acceptedMutations = new Map();
  const listeners = new Set();

  const getSnapshot = (sessionId) => {
    const normalizedSessionId = normalizedString(sessionId);
    if (!normalizedSessionId) return null;
    if (!snapshots.has(normalizedSessionId)) {
      snapshots.set(normalizedSessionId, createSnapshot(normalizedSessionId));
    }
    return { ...snapshots.get(normalizedSessionId) };
  };

  const notify = (snapshot) => {
    for (const listener of listeners) listener({ ...snapshot });
  };

  const dispatchIntent = (role, intent) => {
    const sessionId = normalizedString(intent?.sessionId);
    const mutationId = normalizedString(intent?.mutationId);
    const type = normalizedString(intent?.type);
    if (
      !WINDOW_ROLES.has(role) ||
      !sessionId ||
      !mutationId ||
      !INTENT_TYPES.has(type) ||
      !Number.isInteger(intent?.baseRevision) ||
      intent.baseRevision < 0 ||
      !intent.payload ||
      typeof intent.payload !== "object" ||
      Array.isArray(intent.payload)
    ) {
      return {
        accepted: false,
        duplicate: false,
        reason: "invalid-intent",
        snapshot: getSnapshot(sessionId) ?? createSnapshot("invalid"),
      };
    }

    const duplicate = acceptedMutations.get(mutationId);
    if (duplicate) return { ...duplicate, duplicate: true };

    const current = getSnapshot(sessionId);
    if (type === "resolve_approval" && role !== "agent") {
      return {
        accepted: false,
        duplicate: false,
        reason: "agent-window-required",
        snapshot: current,
      };
    }
    if (intent.baseRevision !== current.revision) {
      return {
        accepted: false,
        duplicate: false,
        reason: "stale-revision",
        snapshot: current,
      };
    }

    const next = { ...current, revision: current.revision + 1 };
    if (type === "select_file") {
      next.selectedFileId = normalizedString(intent.payload.selectedFileId);
    } else if (type === "select_diff") {
      next.selectedDiffId = normalizedString(intent.payload.selectedDiffId);
    } else if (type === "set_workspace_mode") {
      const mode = workspaceMode(intent.payload.workspaceMode);
      if (!mode) {
        return {
          accepted: false,
          duplicate: false,
          reason: "invalid-intent",
          snapshot: current,
        };
      }
      next.workspaceMode = mode;
    } else if (type === "activate_workbench_tab") {
      next.activeWorkbenchTabId = normalizedString(
        intent.payload.activeWorkbenchTabId,
      );
    } else if (type === "resolve_approval") {
      const approvalId = normalizedString(intent.payload.approvalId);
      next.pendingApprovalIds = current.pendingApprovalIds.filter(
        (id) => id !== approvalId,
      );
    }

    snapshots.set(sessionId, next);
    const result = {
      accepted: true,
      duplicate: false,
      reason: null,
      snapshot: { ...next },
    };
    acceptedMutations.set(mutationId, result);
    notify(next);
    return result;
  };

  return {
    dispatchIntent,
    getSnapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const clamp = (value, minimum, maximum) =>
  Math.min(Math.max(value, minimum), maximum);

const intersects = (bounds, area) =>
  bounds.x < area.x + area.width &&
  bounds.x + bounds.width > area.x &&
  bounds.y < area.y + area.height &&
  bounds.y + bounds.height > area.y;

export function clampWindowBounds(
  bounds,
  displays,
  preferredDisplayId,
  minimumSize = { width: 640, height: 480 },
) {
  const safeDisplays = Array.isArray(displays) ? displays : [];
  const preferred = safeDisplays.find(
    (display) => String(display.id) === String(preferredDisplayId),
  );
  const intersecting = safeDisplays.find((display) =>
    intersects(bounds, display.workArea),
  );
  const display = preferred ?? intersecting ?? safeDisplays[0];
  if (!display) {
    return {
      x: Number.isFinite(bounds?.x) ? bounds.x : 0,
      y: Number.isFinite(bounds?.y) ? bounds.y : 0,
      width: Math.max(minimumSize.width, bounds?.width ?? minimumSize.width),
      height: Math.max(
        minimumSize.height,
        bounds?.height ?? minimumSize.height,
      ),
      displayId: null,
    };
  }

  const area = display.workArea;
  const width = clamp(
    Number.isFinite(bounds?.width) ? bounds.width : minimumSize.width,
    minimumSize.width,
    area.width,
  );
  const height = clamp(
    Number.isFinite(bounds?.height) ? bounds.height : minimumSize.height,
    minimumSize.height,
    area.height,
  );
  return {
    x: clamp(
      Number.isFinite(bounds?.x) ? bounds.x : area.x,
      area.x,
      area.x + area.width - width,
    ),
    y: clamp(
      Number.isFinite(bounds?.y) ? bounds.y : area.y,
      area.y,
      area.y + area.height - height,
    ),
    width,
    height,
    displayId: display.id,
  };
}

export const isClyDevWindowRole = (value) => WINDOW_ROLES.has(value);
