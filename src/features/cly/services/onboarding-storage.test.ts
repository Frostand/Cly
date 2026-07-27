import { describe, expect, it, vi } from "vitest";
import {
  createOnboardingDraft,
  type OnboardingDraft,
  updateOnboardingDraft,
} from "../domain/onboarding";
import {
  loadOnboardingDraft,
  OnboardingDraftLoadError,
  type OnboardingStorage,
  onboardingStorageKey,
  saveOnboardingDraft,
  scopeOnboardingDraftToProject,
} from "./onboarding-storage";

const memoryStorage = (): OnboardingStorage & {
  values: Map<string, string>;
} => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};

describe("onboarding storage", () => {
  it("persists interrupted setup per project through the durable desktop boundary", async () => {
    const storage = memoryStorage();
    const persisted = new Map<string | null, unknown>();
    const desktop = {
      loadOnboardingDraft: vi.fn(async (projectId: string | null) =>
        persisted.get(projectId),
      ),
      saveOnboardingDraft: vi.fn(async (draft: OnboardingDraft) => {
        persisted.set(draft.projectId, structuredClone(draft));
        return true;
      }),
    };
    const draft = updateOnboardingDraft(createOnboardingDraft("project-a"), {
      currentStep: "research",
      datasets: ["local/data.csv"],
    });
    await saveOnboardingDraft(draft, { cache: storage, desktop });
    expect(
      await loadOnboardingDraft("project-a", { cache: storage, desktop }),
    ).toMatchObject({
      currentStep: "research",
      datasets: ["local/data.csv"],
    });
    expect(
      (await loadOnboardingDraft("project-b", { cache: storage, desktop }))
        .datasets,
    ).toEqual([]);
  });

  it("writes the project-scoped draft durably before resolving selection", async () => {
    const storage = memoryStorage();
    let durableWriteFinished = false;
    const desktop = {
      loadOnboardingDraft: vi.fn(async () => null),
      saveOnboardingDraft: vi.fn(async () => {
        await Promise.resolve();
        durableWriteFinished = true;
        return true;
      }),
    };
    const draft = updateOnboardingDraft(createOnboardingDraft(), {
      topic: "Migrated setup",
    });
    const scoped = await scopeOnboardingDraftToProject(draft, "project-a", {
      cache: storage,
      desktop,
    });
    expect(scoped.projectId).toBe("project-a");
    expect(durableWriteFinished).toBe(true);
    expect(desktop.saveOnboardingDraft).toHaveBeenCalledWith(scoped);
    expect(
      JSON.parse(storage.values.get(onboardingStorageKey("project-a")) ?? "{}"),
    ).toMatchObject({ topic: "Migrated setup" });
    expect(storage.values.has(onboardingStorageKey(null))).toBe(false);
  });

  it("prefers a durable draft over an empty same-origin cache", async () => {
    const storage = memoryStorage();
    storage.setItem(
      onboardingStorageKey("project-a"),
      JSON.stringify(createOnboardingDraft("project-a")),
    );
    const durable = updateOnboardingDraft(createOnboardingDraft("project-a"), {
      currentStep: "research",
      topic: "Durable topic",
    });
    const desktop = {
      loadOnboardingDraft: vi.fn(async () => durable),
      saveOnboardingDraft: vi.fn(async () => true),
    };

    await expect(
      loadOnboardingDraft("project-a", { cache: storage, desktop }),
    ).resolves.toMatchObject({ topic: "Durable topic" });
    expect(storage.getItem(onboardingStorageKey("project-a"))).toContain(
      "Durable topic",
    );
    expect(desktop.saveOnboardingDraft).not.toHaveBeenCalled();
  });

  it("propagates a durable read failure without falling back or overwriting the draft", async () => {
    const storage = memoryStorage();
    const cached = updateOnboardingDraft(createOnboardingDraft("project-a"), {
      topic: "Cached topic must not become authoritative",
    });
    storage.setItem(onboardingStorageKey("project-a"), JSON.stringify(cached));
    const desktop = {
      loadOnboardingDraft: vi
        .fn()
        .mockRejectedValue(new Error("SQLITE_BUSY: database is locked")),
      saveOnboardingDraft: vi.fn(async () => true),
    };

    await expect(
      loadOnboardingDraft("project-a", { cache: storage, desktop }),
    ).rejects.toEqual(expect.any(OnboardingDraftLoadError));
    expect(desktop.saveOnboardingDraft).not.toHaveBeenCalled();
    expect(storage.getItem(onboardingStorageKey("project-a"))).toBe(
      JSON.stringify(cached),
    );
  });
});
