import { createHash } from "node:crypto";
import { z } from "zod";

const pendingToolApprovals = new Map();
const DEFAULT_APPROVAL_TTL_MS = 2 * 60 * 1000;

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
};

const hashApprovalAction = (request) =>
  createHash("sha256")
    .update(JSON.stringify(canonicalize(request)))
    .digest("hex");

const inferApprovalScope = ({ id, projectId, request, runId }) => ({
  actionHash: hashApprovalAction(request),
  projectId:
    projectId ??
    request?.projectId ??
    request?.directory ??
    request?.params?.cwd ??
    request?.options?.blockedPath ??
    "unscoped-project",
  runId:
    runId ??
    request?.runId ??
    request?.params?.turnId ??
    request?.params?.threadId ??
    request?.options?.toolUseID ??
    id,
});

const registerPendingToolApproval = (approval) => {
  if (pendingToolApprovals.has(approval.id)) {
    throw new Error(
      `A tool approval with id ${approval.id} is already pending.`,
    );
  }
  pendingToolApprovals.set(approval.id, approval);
};

const toolApprovalResponseSchema = z.object({
  approved: z.boolean(),
  id: z.string().min(1),
  reason: z.string().nullable().optional(),
  scope: z.enum(["once", "session"]).default("once"),
});

export const waitForToolApproval = ({
  expiresInMs = DEFAULT_APPROVAL_TTL_MS,
  id,
  projectId,
  provider,
  request,
  runId,
  signal,
}) =>
  new Promise((resolve) => {
    let settled = false;
    const expiresAt = Date.now() + expiresInMs;
    const binding = inferApprovalScope({ id, projectId, request, runId });
    let expirationTimer;

    const finish = (response) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(expirationTimer);
      signal?.removeEventListener("abort", handleAbort);
      pendingToolApprovals.delete(id);
      resolve(response);
    };

    const handleAbort = () => {
      finish({
        approved: false,
        id,
        reason: "Permission request was cancelled.",
        scope: "once",
      });
    };

    registerPendingToolApproval({
      ...binding,
      expiresAt,
      id,
      provider,
      request,
      respond: finish,
    });

    expirationTimer = setTimeout(() => {
      finish({
        approved: false,
        id,
        reason: "Permission request expired.",
        scope: "once",
      });
    }, expiresInMs);
    expirationTimer.unref?.();

    if (signal?.aborted) {
      handleAbort();
      return;
    }

    signal?.addEventListener("abort", handleAbort, { once: true });
  });

export const registerToolApprovalRoutes = (app) => {
  app.post("/api/tool-approval-response", async (c) => {
    let payload;
    try {
      payload = toolApprovalResponseSchema.parse(await c.req.json());
    } catch (error) {
      return c.text(
        error instanceof Error ? error.message : "Invalid approval response.",
        400,
      );
    }

    const pendingApproval = pendingToolApprovals.get(payload.id);
    if (!pendingApproval) {
      // AI SDK-owned approvals, such as the current Anthropic writeFile flow,
      // are resolved in-process by useChat(). The shared endpoint intentionally
      // treats unknown approvals as handled so the frontend can use one path.
      return c.json({ handled: false, status: "not-found" });
    }

    if (pendingApproval.expiresAt <= Date.now()) {
      pendingToolApprovals.delete(payload.id);
      await pendingApproval.respond({
        approved: false,
        id: payload.id,
        reason: "Permission request expired.",
        scope: "once",
      });
      return c.json({ handled: false, status: "expired" }, 410);
    }

    pendingToolApprovals.delete(payload.id);

    try {
      await pendingApproval.respond(payload);
    } catch (error) {
      return c.text(
        error instanceof Error ? error.message : "Failed to resolve approval.",
        500,
      );
    }

    return c.json({
      actionHash: pendingApproval.actionHash,
      handled: true,
      projectId: pendingApproval.projectId,
      provider: pendingApproval.provider,
      runId: pendingApproval.runId,
      status: "ok",
    });
  });
};
