// @vitest-environment node
import { serve } from "@hono/node-server";
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

const apiRequest = (path: string) =>
  new Request(`http://127.0.0.1:3211${path}`, {
    headers: { [API_SESSION_TOKEN_HEADER]: token },
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

  it("keeps a streaming response counted until its body closes", async () => {
    let streamController:
      | ReadableStreamDefaultController<Uint8Array>
      | undefined;
    const app = createApiApp(token, {
      allowedRendererOrigin: rendererOrigin,
      maxConcurrentRequests: 1,
      registerAdditionalRoutes: (testApp) => {
        testApp.get(
          "/api/test/stream",
          () =>
            new Response(
              new ReadableStream<Uint8Array>({
                start(controller) {
                  streamController = controller;
                  controller.enqueue(new TextEncoder().encode("first"));
                },
              }),
              {
                headers: {
                  "content-type": "text/event-stream",
                  "x-stream-test": "preserved",
                },
                status: 202,
                statusText: "Streaming",
              },
            ),
        );
        testApp.get("/api/test/quick", (c) => c.text("quick"));
      },
    });

    const response = await app.request(apiRequest("/api/test/stream"));
    expect(response.status).toBe(202);
    expect(response.statusText).toBe("Streaming");
    expect(response.headers.get("x-stream-test")).toBe("preserved");
    const reader = response.body?.getReader();
    expect(new TextDecoder().decode((await reader?.read())?.value)).toBe(
      "first",
    );

    expect((await app.request(apiRequest("/api/test/quick"))).status).toBe(429);

    streamController?.close();
    expect((await reader?.read())?.done).toBe(true);
    const quickResponse = await app.request(apiRequest("/api/test/quick"));
    expect(quickResponse.status).toBe(200);
    expect(await quickResponse.text()).toBe("quick");
  });

  it("releases a streaming response exactly once when its body is cancelled", async () => {
    let upstreamCancelCount = 0;
    const app = createApiApp(token, {
      allowedRendererOrigin: rendererOrigin,
      maxConcurrentRequests: 1,
      registerAdditionalRoutes: (testApp) => {
        testApp.get(
          "/api/test/stream",
          () =>
            new Response(
              new ReadableStream<Uint8Array>({
                cancel() {
                  upstreamCancelCount += 1;
                },
                start(controller) {
                  controller.enqueue(new TextEncoder().encode("chunk"));
                },
              }),
              { headers: { "content-type": "text/event-stream" } },
            ),
        );
        testApp.get("/api/test/quick", (c) => c.text("quick"));
      },
    });

    const firstResponse = await app.request(apiRequest("/api/test/stream"));
    const firstReader = firstResponse.body?.getReader();
    await firstReader?.read();
    expect((await app.request(apiRequest("/api/test/quick"))).status).toBe(429);

    await firstReader?.cancel("client stopped reading");
    expect(upstreamCancelCount).toBe(1);

    const secondResponse = await app.request(apiRequest("/api/test/stream"));
    expect(secondResponse.status).toBe(200);
    await firstReader?.cancel("duplicate cancellation");
    expect((await app.request(apiRequest("/api/test/quick"))).status).toBe(429);

    await secondResponse.body?.cancel("second client stopped reading");
    expect(upstreamCancelCount).toBe(2);
    const quickResponse = await app.request(apiRequest("/api/test/quick"));
    expect(quickResponse.status).toBe(200);
    await quickResponse.body?.cancel();
  });

  it("releases a streaming response when its body errors", async () => {
    let streamController:
      | ReadableStreamDefaultController<Uint8Array>
      | undefined;
    const app = createApiApp(token, {
      allowedRendererOrigin: rendererOrigin,
      maxConcurrentRequests: 1,
      registerAdditionalRoutes: (testApp) => {
        testApp.get(
          "/api/test/stream",
          () =>
            new Response(
              new ReadableStream<Uint8Array>({
                start(controller) {
                  streamController = controller;
                  controller.enqueue(new TextEncoder().encode("chunk"));
                },
              }),
              { headers: { "content-type": "text/event-stream" } },
            ),
        );
        testApp.get("/api/test/quick", (c) => c.text("quick"));
      },
    });

    const response = await app.request(apiRequest("/api/test/stream"));
    const reader = response.body?.getReader();
    await reader?.read();
    expect((await app.request(apiRequest("/api/test/quick"))).status).toBe(429);

    streamController?.error(new Error("stream failed"));
    await expect(reader?.read()).rejects.toThrow("stream failed");
    const quickResponse = await app.request(apiRequest("/api/test/quick"));
    expect(quickResponse.status).toBe(200);
    await quickResponse.body?.cancel();
  });

  it("preserves a buffered chunk when the upstream errors before a consumer reads it", async () => {
    let pullCount = 0;
    let reportSourceError: (() => void) | undefined;
    const sourceErrored = new Promise<void>((resolve) => {
      reportSourceError = resolve;
    });
    const app = createApiApp(token, {
      allowedRendererOrigin: rendererOrigin,
      maxConcurrentRequests: 1,
      registerAdditionalRoutes: (testApp) => {
        testApp.get(
          "/api/test/stream",
          () =>
            new Response(
              new ReadableStream<Uint8Array>({
                pull(controller) {
                  pullCount += 1;
                  if (pullCount === 1) {
                    controller.enqueue(
                      new TextEncoder().encode("must-not-be-lost"),
                    );
                    return;
                  }
                  controller.error(new Error("failed after first chunk"));
                  reportSourceError?.();
                },
              }),
              { headers: { "content-type": "text/event-stream" } },
            ),
        );
        testApp.get("/api/test/quick", (c) => c.text("quick"));
      },
    });

    const response = await app.request(apiRequest("/api/test/stream"));
    await sourceErrored;

    // The upstream work is over, so its concurrency slot can be reused even
    // though the client has not consumed the already-buffered chunk yet.
    expect((await app.request(apiRequest("/api/test/quick"))).status).toBe(200);

    const reader = response.body?.getReader();
    expect(new TextDecoder().decode((await reader?.read())?.value)).toBe(
      "must-not-be-lost",
    );
    await expect(reader?.read()).rejects.toThrow("failed after first chunk");
  });

  it("releases immediate non-stream responses before their bodies are read", async () => {
    const app = createApiApp(token, {
      allowedRendererOrigin: rendererOrigin,
      maxConcurrentRequests: 1,
      registerAdditionalRoutes: (testApp) => {
        testApp.get("/api/test/quick", (c) => c.text("quick"));
      },
    });

    const firstResponse = await app.request(apiRequest("/api/test/quick"));
    const secondResponse = await app.request(apiRequest("/api/test/quick"));

    expect(secondResponse.status).toBe(200);
    expect(await firstResponse.text()).toBe("quick");
    expect(await secondResponse.text()).toBe("quick");
  });

  it("does not retain a slot for a HEAD response body that Hono discards", async () => {
    const app = createApiApp(token, {
      allowedRendererOrigin: rendererOrigin,
      maxConcurrentRequests: 1,
      registerAdditionalRoutes: (testApp) => {
        testApp.get(
          "/api/test/stream",
          () =>
            new Response(
              new ReadableStream<Uint8Array>({
                start(controller) {
                  controller.enqueue(new TextEncoder().encode("chunk"));
                },
              }),
            ),
        );
        testApp.get("/api/test/quick", (c) => c.text("quick"));
      },
    });

    const headResponse = await app.request(
      new Request("http://127.0.0.1:3211/api/test/stream", {
        headers: { [API_SESSION_TOKEN_HEADER]: token },
        method: "HEAD",
      }),
    );
    expect(headResponse.status).toBe(200);
    expect(headResponse.body).toBeNull();

    const quickResponse = await app.request(apiRequest("/api/test/quick"));
    expect(quickResponse.status).toBe(200);
    await quickResponse.body?.cancel();
  });

  it("preserves Node adapter Content-Length handling for ordinary responses", async () => {
    const textBody = "ordinary text";
    const jsonValue = { kind: "ordinary", ok: true };
    const app = createApiApp(token, {
      allowedRendererOrigin: rendererOrigin,
      maxConcurrentRequests: 1,
      registerAdditionalRoutes: (testApp) => {
        testApp.get("/api/test/text", (c) => c.text(textBody));
        testApp.get("/api/test/json", (c) => c.json(jsonValue));
      },
    });

    const { port, server } = await new Promise<{
      port: number;
      server: ReturnType<typeof serve>;
    }>((resolve, reject) => {
      const nodeServer = serve(
        { fetch: app.fetch, hostname: "127.0.0.1", port: 0 },
        (info) => {
          nodeServer.off("error", reject);
          resolve({ port: info.port, server: nodeServer });
        },
      );
      nodeServer.once("error", reject);
    });

    try {
      const requestHeaders = { [API_SESSION_TOKEN_HEADER]: token };
      const textResponse = await fetch(
        `http://127.0.0.1:${port}/api/test/text`,
        { headers: requestHeaders },
      );
      expect(textResponse.headers.get("content-length")).toBe(
        String(Buffer.byteLength(textBody)),
      );
      expect(textResponse.headers.get("transfer-encoding")).toBeNull();
      expect(await textResponse.text()).toBe(textBody);

      const jsonResponse = await fetch(
        `http://127.0.0.1:${port}/api/test/json`,
        { headers: requestHeaders },
      );
      const jsonBody = JSON.stringify(jsonValue);
      expect(jsonResponse.headers.get("content-length")).toBe(
        String(Buffer.byteLength(jsonBody)),
      );
      expect(jsonResponse.headers.get("transfer-encoding")).toBeNull();
      expect(await jsonResponse.text()).toBe(jsonBody);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });
});
