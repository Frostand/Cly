import { getDesktopApi } from "@/lib/electron";
import {
  createOnboardingDraft,
  type OnboardingDraft,
  restoreOnboardingDraft,
} from "../domain/onboarding";

const prefix = "cly:onboarding:v1";

export interface OnboardingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface OnboardingDesktopStorage {
  loadOnboardingDraft(projectId: string | null): Promise<unknown | null>;
  saveOnboardingDraft(draft: OnboardingDraft): Promise<boolean>;
}

export class OnboardingDraftLoadError extends Error {
  override readonly cause: unknown;

  constructor(cause: unknown) {
    super(
      cause instanceof Error && cause.message
        ? `Saved setup could not be loaded: ${cause.message}`
        : "Saved setup could not be loaded.",
    );
    this.name = "OnboardingDraftLoadError";
    this.cause = cause;
  }
}

interface OnboardingStorageOptions {
  cache?: OnboardingStorage | null;
  desktop?: OnboardingDesktopStorage | null;
}

export const onboardingStorageKey = (projectId: string | null) =>
  `${prefix}:${projectId ?? "new-project"}`;

const defaultCache = (): OnboardingStorage | null =>
  typeof window === "undefined" ? null : window.localStorage;

const defaultDesktop = (): OnboardingDesktopStorage | null => {
  const api = getDesktopApi();
  return api
    ? {
        loadOnboardingDraft: (projectId) => api.loadOnboardingDraft(projectId),
        saveOnboardingDraft: (draft) => api.saveOnboardingDraft(draft),
      }
    : null;
};

const cacheDraft = (
  cache: OnboardingStorage | null,
  draft: OnboardingDraft,
) => {
  if (!cache) return;
  try {
    cache.setItem(onboardingStorageKey(draft.projectId), JSON.stringify(draft));
  } catch {
    // localStorage is only a best-effort same-origin cache.
  }
};

const readCachedDraft = (
  cache: OnboardingStorage | null,
  projectId: string | null,
) => {
  if (!cache) return null;
  try {
    const value = cache.getItem(onboardingStorageKey(projectId));
    return value ? restoreOnboardingDraft(JSON.parse(value), projectId) : null;
  } catch {
    return null;
  }
};

export async function loadOnboardingDraft(
  projectId: string | null,
  options: OnboardingStorageOptions = {},
): Promise<OnboardingDraft> {
  const cache = options.cache === undefined ? defaultCache() : options.cache;
  const desktop =
    options.desktop === undefined ? defaultDesktop() : options.desktop;

  if (desktop) {
    try {
      const persisted = await desktop.loadOnboardingDraft(projectId);
      if (persisted) {
        const durableDraft = restoreOnboardingDraft(persisted, projectId);
        cacheDraft(cache, durableDraft);
        return durableDraft;
      }
    } catch (error) {
      throw new OnboardingDraftLoadError(error);
    }
  }

  return readCachedDraft(cache, projectId) ?? createOnboardingDraft(projectId);
}

export async function saveOnboardingDraft(
  draft: OnboardingDraft,
  options: OnboardingStorageOptions = {},
): Promise<void> {
  const cache = options.cache === undefined ? defaultCache() : options.cache;
  const desktop =
    options.desktop === undefined ? defaultDesktop() : options.desktop;
  cacheDraft(cache, draft);
  if (desktop) await desktop.saveOnboardingDraft(draft);
}

export async function scopeOnboardingDraftToProject(
  draft: OnboardingDraft,
  projectId: string,
  options: OnboardingStorageOptions = {},
): Promise<OnboardingDraft> {
  const cache = options.cache === undefined ? defaultCache() : options.cache;
  const scoped = restoreOnboardingDraft(
    { ...draft, projectId, updatedAt: new Date().toISOString() },
    projectId,
  );
  await saveOnboardingDraft(scoped, { ...options, cache });
  if (draft.projectId === null && cache) {
    try {
      cache.removeItem(onboardingStorageKey(null));
    } catch {
      // localStorage cleanup is best effort.
    }
  }
  return scoped;
}
