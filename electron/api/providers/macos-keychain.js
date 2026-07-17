import { spawn } from "node:child_process";

export function updateGenericPassword(
  { account, password, service },
  { spawnProcess = spawn } = {},
) {
  if (
    typeof account !== "string" ||
    !account ||
    typeof password !== "string" ||
    typeof service !== "string" ||
    !service
  ) {
    return Promise.reject(new Error("Invalid macOS keychain credential."));
  }

  return new Promise((resolve, reject) => {
    const child = spawnProcess(
      "security",
      [
        "add-generic-password",
        "-U",
        "-a",
        account,
        "-s",
        service,
        // A trailing -w makes `security` read the password from stdin. Passing
        // the value after -w would expose the credential in process arguments.
        "-w",
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    let stderr = "";
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };

    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", (error) => finish(error));
    child.once("close", (code) => {
      if (code === 0) {
        finish();
        return;
      }
      finish(
        new Error(
          stderr.trim() || `macOS keychain update failed with code ${code}.`,
        ),
      );
    });

    if (!child.stdin) {
      finish(new Error("macOS keychain process did not accept input."));
      return;
    }
    child.stdin.on("error", (error) => finish(error));
    child.stdin.end(`${password}\n`);
  });
}
