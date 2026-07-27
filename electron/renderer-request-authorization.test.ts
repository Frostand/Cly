// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import {
  authorizeRendererRequestHeaders,
  installRendererRequestAuthorization,
  isAuthorizedRendererApiRequest,
} from "./renderer-request-authorization.js";

const TOKEN_HEADER = "x-cly-api-token";

describe("renderer request authorization", () => {
  it("recognizes only the exact renderer origin and API path", () => {
    const origin = "http://127.0.0.1:3210";
    expect(
      isAuthorizedRendererApiRequest(
        "http://127.0.0.1:3210/api/projects",
        origin,
      ),
    ).toBe(true);
    expect(
      isAuthorizedRendererApiRequest(
        "http://127.0.0.1:3210/api-evil/projects",
        origin,
      ),
    ).toBe(false);
    expect(
      isAuthorizedRendererApiRequest(
        "http://127.0.0.1:3211/api/projects",
        origin,
      ),
    ).toBe(false);
  });

  it("strips renderer-supplied tokens and injects authority only for the API", () => {
    expect(
      authorizeRendererRequestHeaders({
        apiToken: "secret-token",
        details: {
          requestHeaders: {
            Accept: "application/json",
            "X-Cly-Api-Token": "attacker-token",
          },
          url: "https://example.com/api/exfiltrate",
        },
        rendererOrigin: "http://127.0.0.1:3210",
      }),
    ).toEqual({ requestHeaders: { Accept: "application/json" } });

    expect(
      authorizeRendererRequestHeaders({
        apiToken: "secret-token",
        details: {
          requestHeaders: { Accept: "application/json" },
          url: "http://127.0.0.1:3210/api/projects",
        },
        rendererOrigin: "http://127.0.0.1:3210",
      }),
    ).toEqual({
      requestHeaders: {
        Accept: "application/json",
        [TOKEN_HEADER]: "secret-token",
      },
    });
  });

  it("installs one main-process request hook", () => {
    const onBeforeSendHeaders = vi.fn();
    installRendererRequestAuthorization({
      apiToken: "secret-token",
      rendererOrigin: "http://127.0.0.1:3210",
      session: { webRequest: { onBeforeSendHeaders } },
    });
    expect(onBeforeSendHeaders).toHaveBeenCalledOnce();
  });
});
