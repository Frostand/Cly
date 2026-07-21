import { z } from "zod";
import { getStateDatabase } from "../../persisted-state.js";
import { defaultDeviceKeyVault } from "./device-key-vault.js";
import { createClyDevHandoffRepository } from "./handoff/handoff-repository.js";
import { createClyDevSessionRepository } from "./session-repository.js";
import { createClyDevSyncRepository } from "./sync-repository.js";
import {
  deviceKeyRotationSchema,
  deviceRegistrationSchema,
  deviceRevocationSchema,
  deviceVerificationSchema,
  syncBatchOptionsSchema,
  syncConflictResolutionSchema,
} from "./sync-schema.js";
import { createClyDevSyncService } from "./sync-service.js";

const id = z.string().trim().min(1).max(500);
const localDeviceSchema = z
  .object({ name: z.string().trim().min(1).max(200).default("This device") })
  .strict();
const importSchema = z
  .object({ envelopes: z.array(z.unknown()).max(500) })
  .strict();
const acknowledgementSchema = z
  .object({
    recipientDeviceId: id,
    envelopeIds: z.array(id).min(1).max(500),
  })
  .strict();

async function parseBody(c, schema) {
  try {
    const parsed = schema.safeParse(await c.req.json());
    return parsed.success
      ? { data: parsed.data }
      : { error: c.json({ error: parsed.error.message }, 400) };
  } catch {
    return { error: c.json({ error: "Invalid JSON payload." }, 400) };
  }
}

const statusForError = (message) => {
  if (/not found/i.test(message)) return 404;
  if (/revoked|not trusted|unverified/i.test(message)) return 403;
  if (/quota|too (?:large|many)|exceeds/i.test(message)) return 413;
  if (/locked|unavailable/i.test(message)) return 503;
  return 400;
};

const respond = async (c, operation, successStatus = 200) => {
  try {
    return c.json(await operation(), successStatus);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Cly Dev sync request failed.";
    return c.json({ error: message }, statusForError(message));
  }
};

const defaultGetService = () => {
  const db = getStateDatabase();
  return createClyDevSyncService({
    repository: createClyDevSyncRepository({ db }),
    sessionRepository: createClyDevSessionRepository({ db }),
    handoffRepository: createClyDevHandoffRepository({ db }),
    keyVault: defaultDeviceKeyVault,
  });
};

export function registerClyDevSyncRoutes(
  app,
  { getService = defaultGetService } = {},
) {
  app.get("/api/cly-dev/devices", (c) =>
    respond(c, () => getService().devices()),
  );

  app.post("/api/cly-dev/devices/local", async (c) => {
    const body = await parseBody(c, localDeviceSchema);
    if (body.error) return body.error;
    return respond(
      c,
      () => getService().ensureLocalDevice(body.data.name),
      201,
    );
  });

  app.post("/api/cly-dev/devices", async (c) => {
    const body = await parseBody(c, deviceRegistrationSchema);
    if (body.error) return body.error;
    return respond(c, () => getService().registerDevice(body.data), 201);
  });

  app.post("/api/cly-dev/devices/:deviceId/verify", async (c) => {
    const body = await parseBody(c, deviceVerificationSchema);
    if (body.error) return body.error;
    return respond(c, () =>
      getService().verifyDevice(c.req.param("deviceId"), body.data.fingerprint),
    );
  });

  app.post("/api/cly-dev/devices/local/rotate", (c) =>
    respond(c, () => getService().rotateLocalKeys()),
  );

  app.post("/api/cly-dev/devices/:deviceId/keys/verify", async (c) => {
    const body = await parseBody(c, deviceKeyRotationSchema);
    if (body.error) return body.error;
    return respond(c, () =>
      getService().verifyPeerKeyRotation(
        c.req.param("deviceId"),
        body.data.publicBundle,
        body.data.fingerprint,
      ),
    );
  });

  app.post("/api/cly-dev/devices/:deviceId/revoke", async (c) => {
    const body = await parseBody(c, deviceRevocationSchema);
    if (body.error) return body.error;
    return respond(c, () =>
      getService().revokeDevice(c.req.param("deviceId"), body.data.reason),
    );
  });

  app.get("/api/projects/:projectId/cly-dev/sync/status", (c) =>
    respond(c, () => getService().status(c.req.param("projectId"))),
  );

  app.get("/api/projects/:projectId/cly-dev/sync/received-handoffs", (c) =>
    respond(c, () => getService().receivedHandoffs(c.req.param("projectId"))),
  );

  app.post("/api/projects/:projectId/cly-dev/sync/stage", (c) =>
    respond(c, () => getService().stage(c.req.param("projectId"))),
  );

  app.get("/api/projects/:projectId/cly-dev/sync/outbox", (c) => {
    const parsed = syncBatchOptionsSchema
      .extend({ recipientDeviceId: id })
      .safeParse({
        recipientDeviceId: c.req.query("recipientDeviceId"),
        maxRecords: c.req.query("maxRecords")
          ? Number(c.req.query("maxRecords"))
          : undefined,
        maxBytes: c.req.query("maxBytes")
          ? Number(c.req.query("maxBytes"))
          : undefined,
      });
    if (!parsed.success) return c.json({ error: parsed.error.message }, 400);
    const { recipientDeviceId, maxRecords, maxBytes } = parsed.data;
    return respond(c, () =>
      getService().exportBatch(c.req.param("projectId"), recipientDeviceId, {
        maxRecords,
        maxBytes,
      }),
    );
  });

  app.post("/api/projects/:projectId/cly-dev/sync/import", async (c) => {
    const body = await parseBody(c, importSchema);
    if (body.error) return body.error;
    return respond(c, () =>
      getService().importBatch(c.req.param("projectId"), body.data.envelopes),
    );
  });

  app.post("/api/projects/:projectId/cly-dev/sync/ack", async (c) => {
    const body = await parseBody(c, acknowledgementSchema);
    if (body.error) return body.error;
    return respond(c, () =>
      getService().acknowledge(
        c.req.param("projectId"),
        body.data.recipientDeviceId,
        body.data.envelopeIds,
      ),
    );
  });

  app.post(
    "/api/projects/:projectId/cly-dev/sync/conflicts/:conflictId",
    async (c) => {
      const body = await parseBody(c, syncConflictResolutionSchema);
      if (body.error) return body.error;
      return respond(c, () =>
        getService().resolveConflict(
          c.req.param("projectId"),
          c.req.param("conflictId"),
          body.data.resolution,
        ),
      );
    },
  );
}
