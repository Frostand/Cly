const { spawnSync } = require("node:child_process");
const path = require("node:path");

module.exports = async function notarizeAfterSign(context) {
  if (context.electronPlatformName !== "darwin") return;
  if (process.env.CLY_REQUIRE_NOTARIZATION !== "1") return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  const script = path.join(__dirname, "notarize-macos-app.sh");
  const result = spawnSync("bash", [script, appPath], {
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Cly notarization failed with exit code ${result.status}.`);
  }
};
