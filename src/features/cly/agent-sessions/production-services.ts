import { apiClient } from "../services/api-client";
import type {
  ClyDevEventInput,
  ClyDevExecutionInput,
  ClyDevSessionEvent,
  ClyDevSessionLaunchInput,
  ClyDevSessionOverview,
  ClyDevSessionState,
} from "./types";

type SessionApi = Pick<
  typeof apiClient,
  | "fetchClyDevSessionOverviews"
  | "fetchClyDevSessionEvents"
  | "fetchClyDevSessionSnapshot"
  | "fetchClyDevRuntimeProviders"
  | "createClyDevSessionAggregate"
  | "launchClyDevSession"
  | "executeClyDevSession"
  | "resumeClyDevSession"
  | "cancelClyDevSession"
  | "respondToClyDevApproval"
  | "appendClyDevSessionEvent"
>;

interface ProductionServiceOptions {
  api?: Partial<SessionApi>;
  now?: () => string;
  idempotencyKey?: () => string;
}

const defaultIdempotencyKey = () => crypto.randomUUID();

const requestPrefix = (projectId: string, sessionId: string) =>
  `cly-dev:${projectId}:${sessionId}:`;

export const getClyDevRequestId = (
  projectId: string,
  sessionId: string,
  events: ClyDevSessionEvent[],
): string | null => {
  const prefix = requestPrefix(projectId, sessionId);
  for (const event of events.toReversed()) {
    if (!event.idempotencyKey.startsWith(prefix)) continue;
    const suffix = event.idempotencyKey.slice(prefix.length);
    const separator = suffix.indexOf(":");
    if (separator > 0) return suffix.slice(0, separator);
  }
  return null;
};

export const getClyDevResumeInput = (
  projectId: string,
  sessionId: string,
  events: ClyDevSessionEvent[],
  fallbackMode: ClyDevExecutionInput["mode"] = "read_only",
): ClyDevExecutionInput | null => {
  const requestId = getClyDevRequestId(projectId, sessionId, events);
  if (!requestId) return null;
  const prefix = `${requestPrefix(projectId, sessionId)}${requestId}:`;
  const userMessage = events.find(
    (event) =>
      event.idempotencyKey === `${prefix}request` &&
      event.type === "message.recorded" &&
      event.payload.role === "user",
  );
  const approvals = Object.fromEntries(
    events.flatMap((event) => {
      if (event.type !== "approval.requested") return [];
      const approvalId = String(event.payload.approvalId ?? "");
      let detail: Record<string, unknown> = {};
      try {
        detail = JSON.parse(String(event.payload.detail ?? "{}"));
      } catch {
        return [];
      }
      const toolCallId = String(detail.toolCallId ?? "");
      return approvalId && toolCallId
        ? [[toolCallId, { approvalId }] as const]
        : [];
    }),
  );
  const settings = events.find(
    (event) =>
      event.type === "summary.recorded" &&
      event.payload.title === "Execution settings",
  );
  const sections = Array.isArray(settings?.payload.sections)
    ? settings.payload.sections.map(String)
    : [];
  const storedMode = sections
    .find((section) => section.startsWith("mode:"))
    ?.slice("mode:".length);
  const mode = new Set(["read_only", "workspace_write"]).has(String(storedMode))
    ? storedMode === "workspace_write"
      ? "execute"
      : "read_only"
    : fallbackMode;
  const tools = sections
    .filter((section) => section.startsWith("tool:"))
    .map((section) => ({ name: section.slice("tool:".length) }))
    .filter((tool) => tool.name);
  return {
    schemaVersion: 1,
    payloadVersion: 1,
    requestId,
    prompt: String(userMessage?.payload.body ?? "Resume the interrupted task."),
    mode,
    tools,
    ...(Object.keys(approvals).length ? { approvals } : {}),
  };
};

export function createProductionAgentSessionServices({
  api: apiOverrides,
  now = () => new Date().toISOString(),
  idempotencyKey = defaultIdempotencyKey,
}: ProductionServiceOptions = {}) {
  const api: SessionApi = { ...apiClient, ...apiOverrides };
  const append = (
    projectId: string,
    sessionId: string,
    event: Omit<
      ClyDevEventInput,
      | "schemaVersion"
      | "payloadVersion"
      | "transferability"
      | "idempotencyKey"
      | "occurredAt"
    > &
      Partial<Pick<ClyDevEventInput, "idempotencyKey" | "occurredAt">>,
  ) =>
    api.appendClyDevSessionEvent(projectId, sessionId, {
      ...event,
      schemaVersion: 1,
      payloadVersion: 1,
      transferability: "local-only",
      idempotencyKey: event.idempotencyKey ?? idempotencyKey(),
      occurredAt: event.occurredAt ?? now(),
    });

  return {
    async hydrate(projectId: string): Promise<ClyDevSessionOverview[]> {
      if (!projectId.trim()) return [];
      const sessions: ClyDevSessionOverview[] = [];
      let offset = 0;
      while (true) {
        const page = await api.fetchClyDevSessionOverviews(
          projectId,
          offset,
          50,
        );
        sessions.push(...page.items);
        if (page.nextOffset === null) return sessions;
        if (page.nextOffset <= offset) {
          throw new Error("Cly Dev session pagination did not advance.");
        }
        offset = page.nextOffset;
      }
    },

    async createSession(
      projectId: string,
      input: Parameters<SessionApi["createClyDevSessionAggregate"]>[1],
    ) {
      const aggregate = await api.createClyDevSessionAggregate(
        projectId,
        input,
      );
      return aggregate.session;
    },

    providers() {
      return api.fetchClyDevRuntimeProviders();
    },

    launch(projectId: string, input: ClyDevSessionLaunchInput) {
      return api.launchClyDevSession(projectId, input);
    },

    snapshot(projectId: string, sessionId: string) {
      return api.fetchClyDevSessionSnapshot(projectId, sessionId);
    },

    execute(projectId: string, sessionId: string, input: ClyDevExecutionInput) {
      return api.executeClyDevSession(projectId, sessionId, input);
    },

    resume(projectId: string, sessionId: string, input: ClyDevExecutionInput) {
      return api.resumeClyDevSession(projectId, sessionId, input);
    },

    cancel(projectId: string, sessionId: string, requestId: string) {
      return api.cancelClyDevSession(projectId, sessionId, requestId);
    },

    appendEvent: append,

    transition(
      projectId: string,
      sessionId: string,
      state: ClyDevSessionState,
      actorId = "local-user",
    ) {
      return append(projectId, sessionId, {
        type: "session.state.changed",
        actor: { kind: "user", id: actorId },
        payload: { state },
      });
    },

    async resolveApproval(
      projectId: string,
      sessionId: string,
      approvalId: string,
      state: "approved" | "rejected" | "canceled",
      actorId = "local-user",
    ) {
      const broker = await api.respondToClyDevApproval({
        approved: state === "approved",
        id: approvalId,
        reason: state === "approved" ? null : "Rejected by the user.",
        scope: "once",
      });
      if (broker.handled) return broker;
      await append(projectId, sessionId, {
        type: "approval.resolved",
        actor: { kind: "user", id: actorId },
        payload: { approvalId, state, resolvedBy: actorId },
      });
      return broker;
    },

    listEvents(
      projectId: string,
      sessionId: string,
      afterSequence = 0,
      limit = 100,
    ) {
      return api.fetchClyDevSessionEvents(
        projectId,
        sessionId,
        afterSequence,
        limit,
      );
    },

    async allEvents(projectId: string, sessionId: string) {
      const events: ClyDevSessionEvent[] = [];
      let afterSequence = 0;
      while (true) {
        const page = await api.fetchClyDevSessionEvents(
          projectId,
          sessionId,
          afterSequence,
          500,
        );
        events.push(...page);
        if (page.length < 500) return events;
        const nextSequence = page.at(-1)?.sequence ?? afterSequence;
        if (nextSequence <= afterSequence) {
          throw new Error("Cly Dev event pagination did not advance.");
        }
        afterSequence = nextSequence;
      }
    },
  };
}

export const productionAgentSessionServices =
  createProductionAgentSessionServices();
