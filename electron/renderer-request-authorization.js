import { API_SESSION_TOKEN_HEADER } from "./api/app.js";

const removeApiTokenHeader = (headers) => {
  const sanitized = { ...(headers ?? {}) };
  for (const headerName of Object.keys(sanitized)) {
    if (headerName.toLowerCase() === API_SESSION_TOKEN_HEADER) {
      delete sanitized[headerName];
    }
  }
  return sanitized;
};

export function isAuthorizedRendererApiRequest(urlValue, rendererOrigin) {
  let requestUrl;
  let allowedOrigin;
  try {
    requestUrl = new URL(urlValue);
    allowedOrigin = new URL(rendererOrigin).origin;
  } catch {
    return false;
  }

  return (
    requestUrl.origin === allowedOrigin &&
    requestUrl.pathname.startsWith("/api/")
  );
}

export function authorizeRendererRequestHeaders({
  apiToken,
  details,
  rendererOrigin,
}) {
  const requestHeaders = removeApiTokenHeader(details?.requestHeaders);
  if (
    typeof apiToken === "string" &&
    apiToken &&
    isAuthorizedRendererApiRequest(details?.url, rendererOrigin)
  ) {
    requestHeaders[API_SESSION_TOKEN_HEADER] = apiToken;
  }
  return { requestHeaders };
}

export function installRendererRequestAuthorization({
  apiToken,
  rendererOrigin,
  session,
}) {
  if (!session?.webRequest?.onBeforeSendHeaders) {
    throw new Error("Renderer request authorization requires a web session.");
  }

  session.webRequest.onBeforeSendHeaders((details, callback) => {
    callback(
      authorizeRendererRequestHeaders({ apiToken, details, rendererOrigin }),
    );
  });
}
