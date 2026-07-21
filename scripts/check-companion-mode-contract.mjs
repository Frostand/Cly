import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const contractPath = fileURLToPath(
  new URL("../docs/research-client-contract.md", import.meta.url),
);
const contract = readFileSync(contractPath, "utf8");
const failures = [];

const requiredClauses = [
  "## Shared companion contract",
  "## Deep links and external locations",
  "cly://research/projects/{projectId}/provenance/{provenanceEventId}",
  "## Attachment semantics and provenance",
  "### `cly.companion-attachment-provenance@1`",
  '`companion.schema: "cly.companion-attachment-provenance"`',
  "`selection.sha256`",
  "`symbol.qualifiedName`",
  "`notebook.cellSourceSha256ByIdJson`",
  "`commit.parentShasJson`",
  "## Adapter responsibilities",
  "| **VS Code-compatible extension**",
  "| **Jupyter integration**",
  "| **CLI**",
  "| **MCP server**",
  "| **GitHub integration**",
  "### Exact diff content contract",
  'contentState: "exact" | "redacted" | "truncated" | "unavailable"',
  "dataBase64, chunkSha256, patchSha256, final",
  "**prohibits approval**",
  "## Rollout",
  "Ship a **VS Code-compatible extension**",
  "does **not** embed, replace, or take ownership of editors, terminals, Git",
];

for (const clause of requiredClauses) {
  if (!contract.includes(clause)) failures.push(`Missing clause: ${clause}`);
}

if (
  !/CLI and MCP clients must expose the actual reviewable content\./.test(
    contract,
  )
) {
  failures.push("CLI/MCP exact diff content requirement is missing.");
}
if (
  !/Because `metadata` values are scalar,[\s\S]*canonical JSON/.test(contract)
) {
  failures.push("Scalar-safe canonical metadata encoding is missing.");
}
if (
  !/A `redacted`, `truncated`, or `unavailable` file[\s\S]*prohibits approval/.test(
    contract,
  )
) {
  failures.push("Non-exact diff approval must fail closed.");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(
  `Validated ${requiredClauses.length} companion-mode documentation clauses.`,
);
