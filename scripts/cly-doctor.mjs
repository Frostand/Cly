import { spawnSync } from "node:child_process";

const minimumNode = [22, 12, 0];

const parseVersion = (value) =>
  String(value ?? "")
    .replace(/^v/, "")
    .split(".")
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0);

const isAtLeast = (current, minimum) => {
  for (let index = 0; index < minimum.length; index += 1) {
    if ((current[index] ?? 0) > minimum[index]) return true;
    if ((current[index] ?? 0) < minimum[index]) return false;
  }
  return true;
};

const run = (command, args, timeout = 5_000) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
    timeout,
  });
  return {
    available: result.error?.code !== "ENOENT",
    ok: result.status === 0,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim(),
  };
};

const firstLine = (value) => value.split(/\r?\n/, 1)[0]?.trim() || "unknown";
const print = (symbol, label, detail) =>
  console.log(`${symbol} ${label.padEnd(16)} ${detail}`);

const parseClaudeAuthentication = (value) => {
  try {
    const status = JSON.parse(String(value ?? "").trim());
    return status?.loggedIn === true || status?.authenticated === true;
  } catch {
    return false;
  }
};

const parseOpenCodeAuthentication = (value) => {
  const text = String(value ?? "").replace(
    new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`, "g"),
    "",
  );
  const count = text.match(/\b(\d+)\s+credentials?\b/i);
  return count
    ? Number.parseInt(count[1], 10) > 0
    : /\bcredentials?\b/i.test(text) && /[●•]\s+\S/.test(text);
};

const findCursorCommand = () => {
  for (const command of ["agent", "cursor-agent"]) {
    const help = run(command, ["--help"], 3_000);
    if (
      help.available &&
      /cursor/i.test(help.output) &&
      /agent/i.test(help.output)
    ) {
      return command;
    }
  }
  return null;
};

const parseCursorAuthentication = (value) => {
  const text = String(value ?? "").trim();
  if (
    /\b(?:not\s+logged\s+in|not\s+authenticated|unauthenticated|logged\s+out)\b/i.test(
      text,
    )
  ) {
    return false;
  }
  return /\b(?:logged\s+in|authenticated|login\s+successful)\b/i.test(text);
};

const nodeReady = isAtLeast(parseVersion(process.version), minimumNode);
print(nodeReady ? "✓" : "✗", "Node.js", process.version);

const pnpm = run("pnpm", ["--version"]);
print(
  pnpm.ok ? "✓" : "✗",
  "pnpm",
  pnpm.ok ? firstLine(pnpm.output) : "not found (run: corepack enable)",
);

const git = run("git", ["--version"]);
print(git.ok ? "✓" : "✗", "Git", git.ok ? firstLine(git.output) : "not found");

const cursorCommand = findCursorCommand();
const providers = [
  {
    authArgs: ["login", "status"],
    command: "codex",
    label: "Codex",
    parseAuthentication: (_output, ok) => ok,
    versionArgs: ["--version"],
  },
  {
    authArgs: ["auth", "status", "--json"],
    command: "claude",
    label: "Claude Code",
    parseAuthentication: (output) => parseClaudeAuthentication(output),
    versionArgs: ["--version"],
  },
  {
    authArgs: ["auth", "list"],
    command: "opencode",
    label: "OpenCode",
    parseAuthentication: (output) => parseOpenCodeAuthentication(output),
    versionArgs: ["--version"],
  },
  {
    authArgs: ["status"],
    command: cursorCommand,
    label: "Cursor",
    parseAuthentication: (output) => parseCursorAuthentication(output),
    versionArgs: ["--version"],
  },
];

console.log("\nAI harnesses (install and sign in to at least one):");
let authenticatedProviders = 0;
for (const provider of providers) {
  if (!provider.command) {
    print("○", provider.label, "not installed");
    continue;
  }
  const version = run(provider.command, provider.versionArgs);
  if (!version.available) {
    print("○", provider.label, "not installed");
    continue;
  }

  const auth = run(provider.command, provider.authArgs);
  const authenticated = provider.parseAuthentication(auth.output, auth.ok);
  if (authenticated) authenticatedProviders += 1;
  print(
    authenticated ? "✓" : "!",
    provider.label,
    `${firstLine(version.output)} · ${authenticated ? "signed in" : "sign-in required"}`,
  );
}

console.log(`\nPlatform: ${process.platform}/${process.arch}`);
if (authenticatedProviders === 0) {
  console.log(
    "Note: Cly Research works without an AI harness; Cly Dev chat needs one installed and signed in.",
  );
}

if (!nodeReady || !pnpm.ok || !git.ok) {
  console.error("\nCly source prerequisites are incomplete.");
  process.exitCode = 1;
} else {
  console.log("\nCly source prerequisites are ready.");
}
