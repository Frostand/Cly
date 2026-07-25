import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const inventoryPath = join(root, "docs/cly-v1-capabilities.json");
const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
const states = new Set(["production", "unavailable", "demo-only"]);
const ids = new Set();
const failures = [];

for (const capability of inventory) {
  if (!capability.id || ids.has(capability.id)) {
    failures.push(`Capability id is missing or duplicated: ${capability.id}`);
  }
  ids.add(capability.id);
  if (!states.has(capability.state)) {
    failures.push(`${capability.id} has invalid state ${capability.state}`);
  }
  if (!capability.route || !capability.action) {
    failures.push(
      `${capability.id} must identify its route and visible action`,
    );
  }
  if (capability.state === "production") {
    for (const field of ["service", "api", "test"]) {
      if (!capability[field])
        failures.push(`${capability.id} production capability lacks ${field}`);
    }
  } else if (!capability.reason) {
    failures.push(
      `${capability.id} ${capability.state} capability lacks a reason`,
    );
  }
  if (capability.test && !existsSync(join(root, capability.test))) {
    failures.push(
      `${capability.id} references missing test ${capability.test}`,
    );
  }
}

const durableSessions = inventory.find(
  (capability) => capability.id === "agents.sessions-durable",
);
if (
  durableSessions?.state !== "production" ||
  durableSessions?.action !==
    "Persist and inspect durable agent session state" ||
  durableSessions?.api !==
    "GET /api/projects/:projectId/cly-dev/sessions; POST /api/projects/:projectId/cly-dev/session-aggregates"
) {
  failures.push(
    "agents.sessions-durable must advertise only production-ready durable persistence and inspection through real session routes",
  );
}
const agentExecution = inventory.find(
  (capability) => capability.id === "agents.execute",
);
if (
  agentExecution?.state !== "production" ||
  agentExecution?.service !== "productionAgentSessionServices" ||
  !agentExecution?.api?.includes("/execute") ||
  !agentExecution?.api?.includes("/resume") ||
  !agentExecution?.api?.includes("/cancel")
) {
  failures.push(
    "agents.execute must expose the tested production execute, resume, cancel, and approval-gated runtime lifecycle",
  );
}

const productionRoots = [
  join(root, "src/features/cly/components"),
  join(root, "src/features/cly/screens"),
];
const sourceFiles = [];
const walk = (directory) => {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|stories)\./.test(name))
      sourceFiles.push(path);
  }
};
for (const directory of productionRoots) walk(directory);
sourceFiles.push(
  join(root, "src/features/cly/agent-sessions/index.tsx"),
  join(root, "src/features/cly/services/project-services.ts"),
  join(root, "src/features/cly/store/cly-store.ts"),
);

for (const path of sourceFiles) {
  const source = readFileSync(path, "utf8");
  const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(
    (match) => match[1],
  );
  if (
    imports.some(
      (specifier) =>
        specifier.includes("/fixtures") || specifier.includes("mock-services"),
    )
  ) {
    failures.push(`${relative(root, path)} imports a fixture or mock service`);
  }
  if (/\bmockServices\b/.test(source)) {
    failures.push(`${relative(root, path)} references mockServices`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Validated ${inventory.length} Cly v1 capabilities.`);
