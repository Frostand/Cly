/**
 * Hono-based API server for Cly.
 *
 * Migrated from Next.js App Router route handlers.  Each route keeps the same
 * Request/Response contract so the renderer `fetch("/api/…")` calls work
 * unchanged.
 *
 * This file is loaded by the Electron main process at startup.
 */

import { randomBytes } from "node:crypto";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { registerAgentConfigurationRoutes } from "./agents/configuration-routes.js";
import { registerChatRoutes } from "./chat-routes.js";
import { registerClyDevHandoffRoutes } from "./cly-dev/handoff/handoff-routes.js";
import { registerClyDevSessionRoutes } from "./cly-dev/session-routes.js";
import { registerPrImpactReviewRoutes } from "./github/routes.js";
import { registerLiteratureRoutes } from "./literature/routes.js";
import { registerProjectGitRoutes } from "./project-git-routes.js";
import { registerProviderRoutes } from "./provider-routes.js";
import { registerResearchRoutes } from "./research/routes.js";
import { registerToolApprovalRoutes } from "./tool-approvals.js";

export const API_SESSION_TOKEN_HEADER = "x-cly-api-token";
const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_CONCURRENT_REQUESTS = 32;

// ---------------------------------------------------------------------------
// Session token
// ---------------------------------------------------------------------------

export function createApiSessionToken() {
  return randomBytes(32).toString("hex");
}

// ---------------------------------------------------------------------------
// Exported start function
// ---------------------------------------------------------------------------

export function createApiApp(
  apiToken,
  {
    allowedRendererOrigin,
    maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
    maxConcurrentRequests = DEFAULT_MAX_CONCURRENT_REQUESTS,
    clyDev,
    clyDevHandoff,
    registerAdditionalRoutes,
  } = {},
) {
  if (!apiToken) {
    throw new Error("API session token is required to start the API server.");
  }

  const guardedApp = new Hono();
  let activeRequests = 0;

  guardedApp.use("/api/*", async (c, next) => {
    const host = c.req.header("host") ?? new URL(c.req.url).host;
    const hostname = host.startsWith("[")
      ? host.slice(1, host.indexOf("]"))
      : host.split(":", 1)[0];
    if (!new Set(["127.0.0.1", "localhost", "::1"]).has(hostname)) {
      return c.text("Invalid Host", 403);
    }

    const origin = c.req.header("origin");
    if (origin && allowedRendererOrigin && origin !== allowedRendererOrigin) {
      return c.text("Invalid Origin", 403);
    }

    if (c.req.header(API_SESSION_TOKEN_HEADER) !== apiToken) {
      return c.text("Unauthorized", 401);
    }

    const contentLength = Number(c.req.header("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
      return c.text("Request body too large", 413);
    }

    if (activeRequests >= maxConcurrentRequests) {
      return c.text("Too many concurrent requests", 429);
    }

    activeRequests += 1;
    try {
      await next();
    } finally {
      activeRequests -= 1;
    }
  });
  guardedApp.use(
    "/api/*",
    bodyLimit({
      maxSize: maxBodyBytes,
      onError: (c) => c.text("Request body too large", 413),
    }),
  );

  registerToolApprovalRoutes(guardedApp);
  registerAgentConfigurationRoutes(guardedApp);
  registerClyDevSessionRoutes(guardedApp, clyDev);
  registerClyDevHandoffRoutes(guardedApp, clyDevHandoff);
  registerProviderRoutes(guardedApp);
  registerChatRoutes(guardedApp);
  registerLiteratureRoutes(guardedApp);
  registerPrImpactReviewRoutes(guardedApp);
  registerProjectGitRoutes(guardedApp);
  registerResearchRoutes(guardedApp);
  registerAdditionalRoutes?.(guardedApp);

  return guardedApp;
}

export function startApiServer({
  port,
  apiToken,
  allowedRendererOrigin,
  clyDevHandoff,
}) {
  const guardedApp = createApiApp(apiToken, {
    allowedRendererOrigin,
    clyDevHandoff,
  });

  return new Promise((resolve, reject) => {
    const server = serve(
      {
        fetch: guardedApp.fetch,
        hostname: "127.0.0.1",
        port,
      },
      (info) => {
        server.off("error", reject);
        server.headersTimeout = 10_000;
        server.requestTimeout = 30_000;
        console.log(`API server listening on http://127.0.0.1:${info.port}`);
        resolve({
          close: () =>
            new Promise((resolveClose, rejectClose) => {
              server.close((error) => {
                if (error) {
                  rejectClose(error);
                  return;
                }
                resolveClose();
              });
            }),
          port: info.port,
        });
      },
    );
    server.once("error", reject);
  });
}
