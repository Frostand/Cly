import { execCliCommand, resolveCliCommandPath } from "../shared/cli.js";

export const parseClaudeAuthentication = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return false;

  try {
    const parsed = JSON.parse(text);
    return parsed?.loggedIn === true || parsed?.authenticated === true;
  } catch {
    if (
      /\b(?:not\s+logged\s+in|not\s+authenticated|unauthenticated|logged\s+out)\b/i.test(
        text,
      )
    ) {
      return false;
    }
    return /\b(?:logged\s+in|authenticated)\b/i.test(text);
  }
};

export const checkClaudeAuthentication = async ({
  execCommand = execCliCommand,
  resolveCommand = resolveCliCommandPath,
} = {}) => {
  const executable = await resolveCommand("claude");
  if (!executable) {
    return { authenticated: false, installed: false };
  }

  try {
    const result = await execCommand("claude", ["auth", "status", "--json"]);
    return {
      authenticated: parseClaudeAuthentication(
        `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
      ),
      installed: true,
    };
  } catch {
    return { authenticated: false, installed: true };
  }
};

export const parseOpenCodeAuthentication = (value) => {
  const text = String(value ?? "").replace(
    new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`, "g"),
    "",
  );
  const count = text.match(/\b(\d+)\s+credentials?\b/i);
  if (count) return Number.parseInt(count[1], 10) > 0;

  return /\bcredentials?\b/i.test(text) && /[●•]\s+\S/.test(text);
};

export const checkOpenCodeAuthentication = async ({
  execCommand = execCliCommand,
  resolveCommand = resolveCliCommandPath,
} = {}) => {
  const executable = await resolveCommand("opencode");
  if (!executable) {
    return { authenticated: false, installed: false };
  }

  try {
    const result = await execCommand("opencode", ["auth", "list"]);
    return {
      authenticated: parseOpenCodeAuthentication(
        `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
      ),
      installed: true,
    };
  } catch {
    return { authenticated: false, installed: true };
  }
};
