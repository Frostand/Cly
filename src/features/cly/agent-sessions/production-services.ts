import { apiClient } from "../services/api-client";
import type {
  ClyDevEventInput,
  ClyDevSessionOverview,
  ClyDevSessionState,
} from "./types";

type SessionApi = Pick<
  typeof apiClient,
  | "fetchClyDevSessionOverviews"
  | "fetchClyDevSessionEvents"
  | "createClyDevSessionAggregate"
  | "startClyDevSession"
  | "respondToClyDevApproval"
  | "appendClyDevSessionEvent"
>;

interface ProductionServiceOptions {
  api?: Partial<SessionApi>;
  now?: () => string;
  idempotencyKey?: () => string;
}

const defaultIdempotencyKey = () => crypto.randomUUID();

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

    async startSession(
      projectId: string,
      input: Parameters<SessionApi["startClyDevSession"]>[1],
    ) {
      return api.startClyDevSession(projectId, input);
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
  };
}

export const productionAgentSessionServices =
  createProductionAgentSessionServices();
