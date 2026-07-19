import { randomUUID } from "node:crypto";
import * as defaultFileSystem from "node:fs/promises";
import path from "node:path";

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const referencePattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/;
const temporaryTokenPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const vaultFileOperations = new Map();
const assertReference = (reference) => {
  if (!referencePattern.test(reference)) {
    throw new Error("Invalid device-key credential reference.");
  }
};

const isMissing = (error) => error?.code === "ENOENT";

async function withVaultFileLock(target, operation) {
  const previous = vaultFileOperations.get(target) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  vaultFileOperations.set(target, current);

  try {
    return await current;
  } finally {
    if (vaultFileOperations.get(target) === current) {
      vaultFileOperations.delete(target);
    }
  }
}

async function pathExists(fileSystem, filePath) {
  try {
    await fileSystem.lstat(filePath);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

async function syncDirectory(fileSystem, directory) {
  let handle;
  try {
    handle = await fileSystem.open(directory, "r");
    await handle.sync();
  } catch (error) {
    if (
      ![
        "EACCES",
        "EBADF",
        "EISDIR",
        "EINVAL",
        "ENOENT",
        "ENOTSUP",
        "EPERM",
      ].includes(error?.code)
    ) {
      throw error;
    }
  } finally {
    await handle?.close();
  }
}

function backupFor(target) {
  return `${target}.bak`;
}

function isTemporaryFileFor(name, target) {
  const prefix = `${path.basename(target)}.`;
  const suffix = ".tmp";
  if (!name.startsWith(prefix) || !name.endsWith(suffix)) {
    return false;
  }

  return temporaryTokenPattern.test(
    name.slice(prefix.length, name.length - suffix.length),
  );
}

async function cleanupTemporaryFiles(fileSystem, target) {
  const directory = path.dirname(target);
  let entries;
  try {
    entries = await fileSystem.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }

  let removed = false;
  for (const entry of entries) {
    if (!entry.isFile() || !isTemporaryFileFor(entry.name, target)) {
      continue;
    }
    await fileSystem.rm(path.join(directory, entry.name), { force: true });
    removed = true;
  }
  return removed;
}

async function recoverVaultFile(fileSystem, target) {
  const directory = path.dirname(target);
  const backup = backupFor(target);
  const targetExists = await pathExists(fileSystem, target);
  const backupExists = await pathExists(fileSystem, backup);
  let changed = false;

  if (!targetExists && backupExists) {
    await fileSystem.chmod(backup, FILE_MODE);
    await fileSystem.rename(backup, target);
    changed = true;
  } else if (targetExists && backupExists) {
    await fileSystem.rm(backup, { force: true });
    changed = true;
  }

  if (targetExists || backupExists) {
    await fileSystem.chmod(target, FILE_MODE);
  }

  changed = (await cleanupTemporaryFiles(fileSystem, target)) || changed;
  if (changed) {
    await syncDirectory(fileSystem, directory);
  }
}

async function writeFileAtomically(fileSystem, target, contents) {
  const directory = path.dirname(target);
  const temporary = `${target}.${randomUUID()}.tmp`;
  const backup = backupFor(target);
  let installed = false;
  let retainedPriorValue = false;

  try {
    const handle = await fileSystem.open(temporary, "wx", FILE_MODE);
    try {
      await handle.writeFile(contents);
      await handle.chmod(FILE_MODE);
      await handle.sync();
    } finally {
      await handle.close();
    }

    if (await pathExists(fileSystem, target)) {
      await fileSystem.rename(target, backup);
      retainedPriorValue = true;
      await fileSystem.chmod(backup, FILE_MODE);
      await syncDirectory(fileSystem, directory);
    }

    await fileSystem.rename(temporary, target);
    installed = true;
    await syncDirectory(fileSystem, directory);

    if (retainedPriorValue) {
      await fileSystem.rm(backup, { force: true });
      await syncDirectory(fileSystem, directory);
    }
  } finally {
    if (!installed) {
      await fileSystem.rm(temporary, { force: true }).catch(() => {});
      await syncDirectory(fileSystem, directory).catch(() => {});
    }
  }
}

export function createMemoryDeviceKeyVault(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    async status() {
      return { state: "available", backend: "memory-test" };
    },
    async put(reference, value) {
      assertReference(reference);
      values.set(reference, structuredClone(value));
    },
    async get(reference) {
      assertReference(reference);
      const value = values.get(reference);
      if (!value) throw new Error("Device key is unavailable or has expired.");
      return structuredClone(value);
    },
    async delete(reference) {
      assertReference(reference);
      values.delete(reference);
    },
  };
}

async function loadElectronSafeStorage() {
  const electron = await import("electron");
  const { app, safeStorage } = electron;
  if (!app?.isReady?.()) {
    return { state: "locked", reason: "application_not_ready" };
  }
  if (!safeStorage?.isEncryptionAvailable?.()) {
    return { state: "locked", reason: "os_store_locked" };
  }
  const backend = safeStorage.getSelectedStorageBackend?.() ?? "os-protected";
  if (backend === "basic_text") {
    return {
      state: "unavailable",
      reason: "secure_backend_unavailable",
      backend,
    };
  }
  return { state: "available", app, safeStorage, backend };
}

export function createElectronDeviceKeyVault({
  directory,
  fileSystem = defaultFileSystem,
  loadSafeStorage = loadElectronSafeStorage,
} = {}) {
  const resolveDirectory = async () => {
    if (directory) return directory;
    const loaded = await loadSafeStorage();
    if (loaded.state !== "available") {
      throw new Error(
        loaded.state === "locked"
          ? "The operating-system credential store is locked."
          : "A secure operating-system credential store is unavailable.",
      );
    }
    return path.join(loaded.app.getPath("userData"), "device-key-vault");
  };
  const fileFor = async (reference) => {
    assertReference(reference);
    return path.join(await resolveDirectory(), `${reference}.bin`);
  };
  return {
    async status() {
      const loaded = await loadSafeStorage();
      return {
        state: loaded.state,
        backend: loaded.backend ?? null,
        reason: loaded.reason ?? null,
      };
    },
    async put(reference, value) {
      const loaded = await loadSafeStorage();
      if (loaded.state !== "available") {
        throw new Error(
          "The operating-system credential store is unavailable or locked.",
        );
      }
      const target = await fileFor(reference);
      await withVaultFileLock(target, async () => {
        const targetDirectory = path.dirname(target);
        await fileSystem.mkdir(targetDirectory, {
          recursive: true,
          mode: DIRECTORY_MODE,
        });
        await fileSystem.chmod(targetDirectory, DIRECTORY_MODE);
        await recoverVaultFile(fileSystem, target);
        const encrypted = loaded.safeStorage.encryptString(
          JSON.stringify(value),
        );
        await writeFileAtomically(fileSystem, target, encrypted);
      });
    },
    async get(reference) {
      const loaded = await loadSafeStorage();
      if (loaded.state !== "available") {
        throw new Error(
          "The operating-system credential store is unavailable or locked.",
        );
      }
      try {
        const target = await fileFor(reference);
        return await withVaultFileLock(target, async () => {
          await recoverVaultFile(fileSystem, target);
          const encrypted = await fileSystem.readFile(target);
          return JSON.parse(loaded.safeStorage.decryptString(encrypted));
        });
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new Error("Stored device key is corrupted.");
        }
        throw error;
      }
    },
    async delete(reference) {
      const target = await fileFor(reference);
      await withVaultFileLock(target, async () => {
        const directory = path.dirname(target);
        await fileSystem.rm(target, { force: true });
        await fileSystem.rm(backupFor(target), { force: true });
        await cleanupTemporaryFiles(fileSystem, target);
        await syncDirectory(fileSystem, directory);
      });
    },
  };
}

export const defaultDeviceKeyVault = createElectronDeviceKeyVault();
