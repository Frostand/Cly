// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import getPort from "get-port";
import { afterEach, describe, expect, it, vi } from "vitest";
import viteConfig from "../vite.config";

vi.mock("electron", () => ({
  app: { getPath: () => tmpdir() },
}));

import { API_SESSION_TOKEN_HEADER } from "./api-server.js";
import { createRendererServerManager } from "./renderer-server.js";

let manager: ReturnType<typeof createRendererServerManager> | undefined;
let temporaryDirectory: string | undefined;

afterEach(async () => {
  await manager?.stop();
  manager = undefined;
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { force: true, recursive: true });
    temporaryDirectory = undefined;
  }
});

describe("production renderer proxy authority boundary", () => {
  it("denies loopback API callers unless Electron grants renderer authority", async () => {
    temporaryDirectory = await mkdtemp(
      path.join(tmpdir(), "cly-renderer-server-"),
    );
    const appDir = path.join(temporaryDirectory, "electron");
    const distDir = path.join(temporaryDirectory, "dist");
    await mkdir(appDir);
    await mkdir(distDir);
    await writeFile(
      path.join(distDir, "index.html"),
      "<!doctype html><title>Cly renderer test</title>",
    );

    const apiServerPort = await getPort({ host: "127.0.0.1" });
    const internalRendererPort = await getPort({
      exclude: [apiServerPort],
      host: "127.0.0.1",
    });
    const rendererUrl = `http://127.0.0.1:${internalRendererPort}`;
    const clyDevHandoffOptions = { marker: "production-options" };
    const getDatabase = vi.fn(() => {
      throw new Error("threaded production dependency");
    });
    const handoffDependencies = { getDatabase };
    const createClyDevHandoffDependencies = vi.fn(() => handoffDependencies);
    manager = createRendererServerManager({
      apiServerPort,
      appDir,
      developmentRendererUrl: rendererUrl,
      internalRendererPort,
      isDevelopment: false,
      rendererProbeIntervalMs: 10,
      rendererStartupTimeoutMs: 1_000,
      rendererUrlFromEnv: undefined,
      createClyDevHandoffDependencies,
      clyDevHandoffOptions,
    });
    await manager.start();

    expect(createClyDevHandoffDependencies).toHaveBeenCalledOnce();
    expect(createClyDevHandoffDependencies).toHaveBeenCalledWith(
      clyDevHandoffOptions,
    );

    const staticResponse = await fetch(rendererUrl);
    expect(staticResponse.status).toBe(200);
    expect(await staticResponse.text()).toContain("Cly renderer test");

    const unauthenticatedResponse = await fetch(`${rendererUrl}/api/not-found`);
    expect(unauthenticatedResponse.status).toBe(401);
    expect(await unauthenticatedResponse.text()).toBe("Unauthorized");

    const guessedTokenResponse = await fetch(`${rendererUrl}/api/not-found`, {
      headers: { [API_SESSION_TOKEN_HEADER]: "attacker-controlled" },
    });
    expect(guessedTokenResponse.status).toBe(401);

    const authorizedResponse = await fetch(`${rendererUrl}/api/not-found`, {
      headers: {
        [API_SESSION_TOKEN_HEADER]: manager.getApiSessionToken(),
      },
    });
    expect(authorizedResponse.status).toBe(404);

    const threadedHandoffResponse = await fetch(
      `${rendererUrl}/api/projects/project-1/cly-dev/handoffs/export`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [API_SESSION_TOKEN_HEADER]: manager.getApiSessionToken(),
        },
        body: JSON.stringify({ sessionId: "session-1" }),
      },
    );
    expect(threadedHandoffResponse.status).toBe(409);
    expect(getDatabase).toHaveBeenCalledOnce();
  });

  it("does not configure the development proxy with backend authority", async () => {
    const resolveConfig = viteConfig as unknown as (environment: {
      command: "serve";
      isPreview: false;
      isSsrBuild: false;
      mode: "development";
    }) =>
      | Promise<{
          server?: { proxy?: Record<string, unknown> };
        }>
      | {
          server?: { proxy?: Record<string, unknown> };
        };
    const config = await resolveConfig({
      command: "serve",
      isPreview: false,
      isSsrBuild: false,
      mode: "development",
    });
    const apiProxy = config.server?.proxy?.["/api"];

    expect(apiProxy).toMatchObject({
      changeOrigin: true,
      target: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+$/),
    });
    expect(apiProxy).not.toHaveProperty("headers");
  });
});
