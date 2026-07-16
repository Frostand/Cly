import { getStateDatabase } from "../../persisted-state.js";
import { createContextRepository } from "./context-repository.js";

const readJson = async (c) => {
  try {
    return { data: await c.req.json() };
  } catch {
    return { error: c.json({ error: "Invalid JSON payload." }, 400) };
  }
};

const failure = (c, error, fallback) => {
  const message = error instanceof Error ? error.message : fallback;
  return c.json(
    { error: message },
    /conflict|collision/i.test(message) ? 409 : 400,
  );
};

export function registerContextRoutes(
  app,
  {
    getRepository = () => createContextRepository({ db: getStateDatabase() }),
  } = {},
) {
  app.get("/api/projects/:projectId/agent-context", (c) => {
    try {
      return c.json(getRepository().snapshot(c.req.param("projectId")));
    } catch (error) {
      return failure(c, error, "Context query failed.");
    }
  });

  app.get("/api/projects/:projectId/agent-context/audit", (c) => {
    try {
      return c.json(getRepository().listAudit(c.req.param("projectId")));
    } catch (error) {
      return failure(c, error, "Context audit query failed.");
    }
  });

  app.post("/api/projects/:projectId/agent-context/items", async (c) => {
    const body = await readJson(c);
    if (body.error) return body.error;
    try {
      return c.json(
        getRepository().createItem(c.req.param("projectId"), body.data),
        201,
      );
    } catch (error) {
      return failure(c, error, "Context item creation failed.");
    }
  });

  app.post(
    "/api/projects/:projectId/agent-context/items/:itemId/revisions",
    async (c) => {
      const body = await readJson(c);
      if (body.error) return body.error;
      try {
        return c.json(
          getRepository().proposeRevision(
            c.req.param("projectId"),
            c.req.param("itemId"),
            body.data,
          ),
          201,
        );
      } catch (error) {
        return failure(c, error, "Context proposal failed.");
      }
    },
  );

  app.post(
    "/api/projects/:projectId/agent-context/items/:itemId/revisions/:revisionId/approve",
    async (c) => {
      const body = await readJson(c);
      if (body.error) return body.error;
      try {
        return c.json(
          getRepository().approveRevision(
            c.req.param("projectId"),
            c.req.param("itemId"),
            c.req.param("revisionId"),
            body.data,
          ),
        );
      } catch (error) {
        return failure(c, error, "Context approval failed.");
      }
    },
  );

  app.post(
    "/api/projects/:projectId/agent-context/items/:itemId/lifecycle",
    async (c) => {
      const body = await readJson(c);
      if (body.error) return body.error;
      try {
        return c.json(
          getRepository().setLifecycle(
            c.req.param("projectId"),
            c.req.param("itemId"),
            body.data,
          ),
        );
      } catch (error) {
        return failure(c, error, "Context lifecycle update failed.");
      }
    },
  );

  app.put("/api/projects/:projectId/agent-context/packs", async (c) => {
    const body = await readJson(c);
    if (body.error) return body.error;
    try {
      return c.json(
        getRepository().savePack(c.req.param("projectId"), body.data),
      );
    } catch (error) {
      return failure(c, error, "Context pack save failed.");
    }
  });

  app.post(
    "/api/projects/:projectId/agent-context/manifests/preview",
    async (c) => {
      const body = await readJson(c);
      if (body.error) return body.error;
      try {
        return c.json(
          getRepository().previewManifest(c.req.param("projectId"), body.data),
        );
      } catch (error) {
        return failure(c, error, "Context preview failed.");
      }
    },
  );

  app.post("/api/projects/:projectId/agent-context/manifests", async (c) => {
    const body = await readJson(c);
    if (body.error) return body.error;
    try {
      return c.json(
        getRepository().persistManifest(c.req.param("projectId"), body.data),
        201,
      );
    } catch (error) {
      return failure(c, error, "Context manifest persistence failed.");
    }
  });

  app.post("/api/projects/:projectId/agent-context/approvals", async (c) => {
    const body = await readJson(c);
    if (body.error) return body.error;
    try {
      return c.json(
        getRepository().createTransmissionApproval(
          c.req.param("projectId"),
          body.data,
        ),
        201,
      );
    } catch (error) {
      return failure(c, error, "Context transmission approval failed.");
    }
  });

  app.post(
    "/api/projects/:projectId/agent-context/approvals/:approvalId/revoke",
    async (c) => {
      const body = await readJson(c);
      if (body.error) return body.error;
      try {
        return c.json(
          getRepository().revokeTransmissionApproval(
            c.req.param("projectId"),
            c.req.param("approvalId"),
            body.data,
          ),
        );
      } catch (error) {
        return failure(c, error, "Context approval revocation failed.");
      }
    },
  );
}
