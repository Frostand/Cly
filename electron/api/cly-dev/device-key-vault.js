import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const referencePattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/;
const assertReference = (reference) => {
  if (!referencePattern.test(reference)) {
    throw new Error("Invalid device-key credential reference.");
  }
};

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

export function createElectronDeviceKeyVault({ directory } = {}) {
  const resolveDirectory = async () => {
    if (directory) return directory;
    const loaded = await loadElectronSafeStorage();
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
      const loaded = await loadElectronSafeStorage();
      return {
        state: loaded.state,
        backend: loaded.backend ?? null,
        reason: loaded.reason ?? null,
      };
    },
    async put(reference, value) {
      const loaded = await loadElectronSafeStorage();
      if (loaded.state !== "available") {
        throw new Error(
          "The operating-system credential store is unavailable or locked.",
        );
      }
      const target = await fileFor(reference);
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      const encrypted = loaded.safeStorage.encryptString(JSON.stringify(value));
      const temporary = `${target}.${randomUUID()}.tmp`;
      await writeFile(temporary, encrypted, { mode: 0o600, flag: "wx" });
      await rm(target, { force: true });
      await writeFile(target, await readFile(temporary), {
        mode: 0o600,
        flag: "wx",
      });
      await rm(temporary, { force: true });
    },
    async get(reference) {
      const loaded = await loadElectronSafeStorage();
      if (loaded.state !== "available") {
        throw new Error(
          "The operating-system credential store is unavailable or locked.",
        );
      }
      try {
        const encrypted = await readFile(await fileFor(reference));
        return JSON.parse(loaded.safeStorage.decryptString(encrypted));
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new Error("Stored device key is corrupted.");
        }
        throw error;
      }
    },
    async delete(reference) {
      await rm(await fileFor(reference), { force: true });
    },
  };
}

export const defaultDeviceKeyVault = createElectronDeviceKeyVault();
