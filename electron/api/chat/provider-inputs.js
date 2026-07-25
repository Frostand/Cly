import path from "node:path";

const PROVIDER_MODEL_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:/+\-[\]]{0,199}$/;
const PROVIDER_SESSION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,499}$/;

export const assertProviderModelId = (value) => {
  const model = typeof value === "string" ? value.trim() : "";
  if (!PROVIDER_MODEL_ID_PATTERN.test(model)) {
    throw new Error("Provider model id contains unsupported characters.");
  }
  return model;
};

export const assertProviderProjectPath = (value) => {
  if (
    typeof value !== "string" ||
    !path.isAbsolute(value) ||
    value.length > 4096 ||
    /[\0\r\n]/.test(value)
  ) {
    throw new Error("Provider project path must be a safe absolute path.");
  }
  return path.normalize(value);
};

export const normalizeProviderSessionId = (value) => {
  if (value == null || value === "") return null;
  const sessionId = typeof value === "string" ? value.trim() : "";
  if (!PROVIDER_SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error("Provider session id contains unsupported characters.");
  }
  return sessionId;
};
