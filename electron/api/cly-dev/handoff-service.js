import { assertTransferableHandoffEnvelope } from "./handoff-schema.js";

const statusByCode = {
  "device-not-paired": 403,
  "device-revoked": 403,
  "handoff-conflict": 409,
  "handoff-not-found": 404,
  "provider-authentication-failed": 401,
  "handoff-provider-unavailable": 503,
  "transport-offline": 503,
};

export class ClyDevHandoffError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "ClyDevHandoffError";
    this.code = code;
    this.status = statusByCode[code] ?? 400;
    this.details = details;
  }
}

export function createMemoryHandoffTransport({
  online = true,
  authenticated = true,
} = {}) {
  const handoffs = new Map();
  const devices = new Map();
  let isOnline = online;
  let isAuthenticated = authenticated;

  const assertProvider = () => {
    if (!isOnline) {
      throw new ClyDevHandoffError(
        "transport-offline",
        "The handoff provider is offline. Saved work remains local.",
      );
    }
    if (!isAuthenticated) {
      throw new ClyDevHandoffError(
        "provider-authentication-failed",
        "Handoff provider authentication failed. Sign in again before resuming.",
      );
    }
  };
  const assertDevice = (deviceId) => {
    assertProvider();
    const state = devices.get(deviceId);
    if (state === "revoked") {
      throw new ClyDevHandoffError(
        "device-revoked",
        "This device was revoked and cannot read or publish handoffs.",
      );
    }
    if (state !== "paired") {
      throw new ClyDevHandoffError(
        "device-not-paired",
        "Pair this device before reading or publishing task state.",
      );
    }
  };

  return {
    async pairDevice({ deviceId, pairingCode }) {
      assertProvider();
      if (!/^\d{6}$/.test(pairingCode)) {
        throw new ClyDevHandoffError(
          "device-not-paired",
          "Enter the six-digit pairing code shown on the source machine.",
        );
      }
      devices.set(deviceId, "paired");
      return { deviceId, state: "paired" };
    },
    async compareAndSwap(handoffId, expectedRevision, envelope, deviceId) {
      assertDevice(deviceId);
      const current = handoffs.get(handoffId);
      const currentRevision = current?.revision ?? 0;
      if (currentRevision !== expectedRevision) {
        throw new ClyDevHandoffError(
          "handoff-conflict",
          "This task changed on another machine. Inspect both revisions before continuing.",
          { currentRevision, expectedRevision },
        );
      }
      handoffs.set(handoffId, structuredClone(envelope));
      return structuredClone(envelope);
    },
    async fetch(handoffId, deviceId) {
      assertDevice(deviceId);
      const envelope = handoffs.get(handoffId);
      if (!envelope) {
        throw new ClyDevHandoffError(
          "handoff-not-found",
          "The requested task handoff was not found.",
        );
      }
      return structuredClone(envelope);
    },
    revokeDevice(deviceId) {
      devices.set(deviceId, "revoked");
    },
    setAuthenticated(value) {
      isAuthenticated = Boolean(value);
    },
    setOnline(value) {
      isOnline = Boolean(value);
    },
  };
}

export function createUnavailableHandoffTransport() {
  const unavailable = async () => {
    throw new ClyDevHandoffError(
      "handoff-provider-unavailable",
      "No cross-device handoff provider is configured on this machine.",
    );
  };
  return {
    pairDevice: unavailable,
    compareAndSwap: unavailable,
    fetch: unavailable,
  };
}

const transferableEvent = (event) => ({
  id: event.id,
  sequence: event.sequence,
  schemaVersion: event.schemaVersion,
  payloadVersion: event.payloadVersion,
  idempotencyKey: event.idempotencyKey,
  type: event.type,
  transferability: "transferable",
  occurredAt: event.occurredAt,
  actor: event.actor,
  payload: event.payload,
  recordedAt: event.recordedAt,
});

export function createClyDevHandoffService({
  repository,
  transport,
  inspectDestination,
  now = () => new Date().toISOString(),
}) {
  if (!repository || !transport) {
    throw new Error("A Cly Dev repository and handoff transport are required.");
  }
  return {
    pairDevice(input) {
      return transport.pairDevice(input);
    },
    async publish(projectId, sessionId, { deviceId, expectedRevision }) {
      const source = await repository.getHandoffSource(projectId, sessionId);
      const envelope = assertTransferableHandoffEnvelope({
        schemaVersion: 1,
        handoffId: `${projectId}:${sessionId}`,
        projectId,
        sessionId,
        revision: expectedRevision + 1,
        previousRevision: expectedRevision,
        sourceMachine: source.workspace.machine,
        repository: source.workspace.repository,
        worktree: source.workspace.worktree,
        commit: source.session.commit,
        task: {
          id: source.task.id,
          title: source.task.title,
          objective: source.task.objective,
          researchObjectIds: source.task.researchObjectIds ?? [],
        },
        session: {
          id: source.session.id,
          title: source.session.title,
          provider: source.session.provider,
          state: source.session.state,
          createdAt: source.session.createdAt,
          updatedAt: source.session.updatedAt,
        },
        context: source.context.preview,
        events: source.events
          .filter((event) => event.transferability === "transferable")
          .map(transferableEvent),
        createdAt: now(),
      });
      return transport.compareAndSwap(
        envelope.handoffId,
        expectedRevision,
        envelope,
        deviceId,
      );
    },
    async inspect(handoffId, { deviceId, destination, offline = false }) {
      const envelope = assertTransferableHandoffEnvelope(
        await transport.fetch(handoffId, deviceId),
      );
      if (!inspectDestination) {
        return {
          envelope,
          readiness: {
            status: "unsupported",
            blocking: true,
            checks: [],
            actions: ["defer", "return-to-source"],
          },
        };
      }
      return {
        envelope,
        readiness: await inspectDestination({ envelope, destination, offline }),
      };
    },
    async resume(handoffId, options) {
      const inspected = await this.inspect(handoffId, options);
      if (inspected.readiness.blocking) return inspected;
      if (typeof repository.importHandoff !== "function") {
        throw new Error("The destination repository cannot import handoffs.");
      }
      return {
        ...inspected,
        snapshot: repository.importHandoff(
          inspected.envelope.projectId,
          inspected.envelope,
          options.destination,
        ),
      };
    },
  };
}
