// @vitest-environment node
import { describe, expect, it } from "vitest";

import { API_SESSION_TOKEN_HEADER, createApiApp } from "./app.js";

const token = "test-session-token";
const rendererOrigin = "http://127.0.0.1:3210";

const request = (headers: Record<string, string> = {}) =>
  new Request("http://127.0.0.1:3211/api/not-found", {
    headers: {
      [API_SESSION_TOKEN_HEADER]: token,
      ...headers,
    },
  });

describe("local API authority boundary", () => {
  it("requires the per-launch session token", async () => {
    const app = createApiApp(token, { allowedRendererOrigin: rendererOrigin });
    const response = await app.request(
      new Request("http://127.0.0.1:3211/api/not-found"),
    );
    expect(response.status).toBe(401);
  });

  it("rejects non-loopback Host and foreign Origin headers", async () => {
    const app = createApiApp(token, { allowedRendererOrigin: rendererOrigin });

    expect((await app.request(request({ host: "evil.example" }))).status).toBe(
      403,
    );
    expect(
      (
        await app.request(
          request({ host: "127.0.0.1:3211", origin: "https://evil.example" }),
        )
      ).status,
    ).toBe(403);
  });

  it("rejects declared oversized bodies before route parsing", async () => {
    const app = createApiApp(token, {
      allowedRendererOrigin: rendererOrigin,
      maxBodyBytes: 10,
    });
    const response = await app.request(
      request({ "content-length": "11", origin: rendererOrigin }),
    );
    expect(response.status).toBe(413);
  });

  it("rejects streamed oversized bodies without a content-length header", async () => {
    const app = createApiApp(token, {
      allowedRendererOrigin: rendererOrigin,
      maxBodyBytes: 4,
      registerAdditionalRoutes: (testApp) => {
        testApp.post("/api/test/body", async (c) =>
          c.json({ body: await c.req.text() }),
        );
      },
    });
    const response = await app.request(
      new Request("http://127.0.0.1:3211/api/test/body", {
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("123"));
            controller.enqueue(new TextEncoder().encode("45"));
            controller.close();
          },
        }),
        duplex: "half",
        headers: { [API_SESSION_TOKEN_HEADER]: token },
        method: "POST",
      } as RequestInit & { duplex: "half" }),
    );
    expect(response.status).toBe(413);
  });

  it("bounds concurrent API work", async () => {
    let releaseFirst: (() => void) | undefined;
    const firstCanFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const app = createApiApp(token, {
      allowedRendererOrigin: rendererOrigin,
      maxConcurrentRequests: 1,
      registerAdditionalRoutes: (testApp) => {
        testApp.get("/api/test/slow", async (c) => {
          await firstCanFinish;
          return c.text("ok");
        });
      },
    });
    const first = app.request(
      new Request("http://127.0.0.1:3211/api/test/slow", {
        headers: { [API_SESSION_TOKEN_HEADER]: token },
      }),
    );
    await Promise.resolve();
    const second = await app.request(
      new Request("http://127.0.0.1:3211/api/test/slow", {
        headers: { [API_SESSION_TOKEN_HEADER]: token },
      }),
    );
    expect(second.status).toBe(429);
    releaseFirst?.();
    expect((await first).status).toBe(200);
  });
});
