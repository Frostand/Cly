import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

const [before, after] = process.argv.slice(2);
if (!before || !after)
  throw new Error("Usage: compare-screenshots.mjs BEFORE AFTER");
const info = (file) => ({
  file,
  bytes: statSync(file).size,
  sha256: createHash("sha256").update(readFileSync(file)).digest("hex"),
});
console.log(
  JSON.stringify({ before: info(before), after: info(after) }, null, 2),
);
