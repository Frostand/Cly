// @vitest-environment node
import { randomUUID } from "node:crypto";
import * as fileSystem from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElectronDeviceKeyVault } from "./device-key-vault.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) =>
        fileSystem.rm(directory, { force: true, recursive: true }),
      ),
  );
});

async function createTemporaryDirectory() {
  const directory = await fileSystem.mkdtemp(
    path.join(tmpdir(), "cly-device-key-vault-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}

const safeStorage = {
  decryptString(encrypted: Buffer) {
    const value = encrypted.toString("utf8");
    if (!value.startsWith("test-encrypted:")) {
      throw new Error("Invalid test ciphertext.");
    }
    return value.slice("test-encrypted:".length);
  },
  encryptString(value: string) {
    return Buffer.from(`test-encrypted:${value}`, "utf8");
  },
};

const loadSafeStorage = async () => ({
  app: { getPath: () => tmpdir() },
  backend: "test-safe-storage",
  safeStorage,
  state: "available" as const,
});

function createVault(
  directory: string,
  overrideFileSystem: typeof fileSystem = fileSystem,
) {
  return createElectronDeviceKeyVault({
    directory,
    fileSystem: overrideFileSystem,
    loadSafeStorage,
  });
}

describe("Electron device-key vault durability", () => {
  it("atomically replaces a key and leaves the old value intact if rename fails", async () => {
    const directory = await createTemporaryDirectory();
    let failNextReplacement = false;
    const faultingFileSystem = {
      ...fileSystem,
      rename: vi.fn(async (source: string, destination: string) => {
        if (
          failNextReplacement &&
          source.endsWith(".tmp") &&
          destination.endsWith(".bin")
        ) {
          failNextReplacement = false;
          throw Object.assign(new Error("simulated rename failure"), {
            code: "EIO",
          });
        }
        await fileSystem.rename(source, destination);
      }),
    } as typeof fileSystem;
    const vault = createVault(directory, faultingFileSystem);

    await vault.put("device-a", { privateKey: "old-key" });
    failNextReplacement = true;

    await expect(
      vault.put("device-a", { privateKey: "replacement-key" }),
    ).rejects.toThrow("simulated rename failure");
    const retainedBackup = path.join(directory, "device-a.bin.bak");
    await expect(fileSystem.readFile(retainedBackup)).resolves.toEqual(
      safeStorage.encryptString(JSON.stringify({ privateKey: "old-key" })),
    );
    if (process.platform !== "win32") {
      expect((await fileSystem.stat(retainedBackup)).mode & 0o777).toBe(0o600);
    }
    await expect(vault.get("device-a")).resolves.toEqual({
      privateKey: "old-key",
    });
    expect(await fileSystem.readdir(directory)).toEqual(["device-a.bin"]);
  });

  it("restores an interrupted backup and removes only recognized stale temps", async () => {
    const directory = await createTemporaryDirectory();
    const vault = createVault(directory);
    const target = path.join(directory, "device-a.bin");
    const backup = `${target}.bak`;
    const staleTemp = `${target}.${randomUUID()}.tmp`;
    const unrelatedTemp = `${target}.keep.tmp`;

    await vault.put("device-a", { privateKey: "recover-me" });
    await fileSystem.rename(target, backup);
    await fileSystem.writeFile(staleTemp, "incomplete");
    await fileSystem.writeFile(unrelatedTemp, "unrelated");

    await expect(vault.get("device-a")).resolves.toEqual({
      privateKey: "recover-me",
    });
    await expect(fileSystem.stat(target)).resolves.toBeDefined();
    await expect(fileSystem.stat(backup)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(fileSystem.stat(staleTemp)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(fileSystem.readFile(unrelatedTemp, "utf8")).resolves.toBe(
      "unrelated",
    );
  });

  it("keeps the live target when stale backup and temp files both exist", async () => {
    const directory = await createTemporaryDirectory();
    const vault = createVault(directory);
    const target = path.join(directory, "device-a.bin");
    const backup = `${target}.bak`;
    const staleTemp = `${target}.${randomUUID()}.tmp`;

    await vault.put("device-a", { privateKey: "authoritative" });
    await fileSystem.copyFile(target, backup);
    await fileSystem.writeFile(staleTemp, "incomplete");

    await expect(vault.get("device-a")).resolves.toEqual({
      privateKey: "authoritative",
    });
    expect(await fileSystem.readdir(directory)).toEqual(["device-a.bin"]);
  });

  it("uses restrictive permissions for the vault directory and key file", async () => {
    const directory = await createTemporaryDirectory();
    await fileSystem.chmod(directory, 0o755);
    const vault = createVault(directory);

    await vault.put("device-a", { privateKey: "secret" });

    if (process.platform !== "win32") {
      expect((await fileSystem.stat(directory)).mode & 0o777).toBe(0o700);
      expect(
        (await fileSystem.stat(path.join(directory, "device-a.bin"))).mode &
          0o777,
      ).toBe(0o600);
    }
  });

  it("serializes reads behind an in-progress replacement", async () => {
    const directory = await createTemporaryDirectory();
    let blockNextReplacement = false;
    let replacementRenameBlocked = false;
    let releaseReplacement!: () => void;
    let signalReplacementBlocked!: () => void;
    const replacementBlocked = new Promise<void>((resolve) => {
      signalReplacementBlocked = resolve;
    });
    const replacementReleased = new Promise<void>((resolve) => {
      releaseReplacement = resolve;
    });
    let fileOperationsWhileBlocked = 0;
    const faultingFileSystem = {
      ...fileSystem,
      lstat: vi.fn(async (...args: Parameters<typeof fileSystem.lstat>) => {
        if (replacementRenameBlocked) fileOperationsWhileBlocked += 1;
        return fileSystem.lstat(...args);
      }),
      readdir: vi.fn(async (...args: Parameters<typeof fileSystem.readdir>) => {
        if (replacementRenameBlocked) fileOperationsWhileBlocked += 1;
        return fileSystem.readdir(...args);
      }),
      rename: vi.fn(async (source: string, destination: string) => {
        if (
          blockNextReplacement &&
          source.endsWith(".tmp") &&
          destination.endsWith(".bin")
        ) {
          blockNextReplacement = false;
          replacementRenameBlocked = true;
          signalReplacementBlocked();
          await replacementReleased;
          replacementRenameBlocked = false;
        }
        await fileSystem.rename(source, destination);
      }),
    } as typeof fileSystem;
    const vault = createVault(directory, faultingFileSystem);

    await vault.put("device-a", { privateKey: "old-key" });
    blockNextReplacement = true;
    const replacement = vault.put("device-a", {
      privateKey: "replacement-key",
    });
    await replacementBlocked;

    const concurrentRead = vault.get("device-a");
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(fileOperationsWhileBlocked).toBe(0);

    releaseReplacement();
    await expect(replacement).resolves.toBeUndefined();
    await expect(concurrentRead).resolves.toEqual({
      privateKey: "replacement-key",
    });
    expect(await fileSystem.readdir(directory)).toEqual(["device-a.bin"]);
  });
});
