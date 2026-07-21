import { readFileSync } from "node:fs";

const [, , tag] = process.argv;
if (!tag) {
  throw new Error("Usage: node scripts/validate-release-tag.mjs <version-tag>");
}

if (
  !/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(
    tag,
  )
) {
  throw new Error(`Release ref ${tag} is not a supported version tag.`);
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const expectedTag = `v${packageJson.version}`;
if (tag !== expectedTag) {
  throw new Error(
    `Release tag ${tag} does not match package.json version ${packageJson.version}; expected ${expectedTag}.`,
  );
}

process.stdout.write(`${packageJson.version}\n`);
