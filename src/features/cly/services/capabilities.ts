import inventory from "../../../../docs/cly-v1-capabilities.json";
import type { ScreenId } from "../domain/types";

export type CapabilityState =
  | "production"
  | "read-only-preview"
  | "unavailable"
  | "demo-only";

export interface ClyCapability {
  id: string;
  route: string;
  action: string;
  state: CapabilityState;
  service: string | null;
  api: string | null;
  test: string | null;
  reason: string | null;
}

export const clyCapabilities = inventory as ClyCapability[];

const capabilitiesById = new Map(
  clyCapabilities.map((capability) => [capability.id, capability]),
);

export function getCapability(id: string): ClyCapability {
  const capability = capabilitiesById.get(id);
  if (!capability) throw new Error(`Unknown Cly capability: ${id}`);
  return capability;
}

export function capabilityUnavailableMessage(id: string): string {
  const capability = getCapability(id);
  return capability.reason ?? `${capability.action} is not available.`;
}

export class CapabilityUnavailableError extends Error {
  readonly capabilityId: string;

  constructor(capabilityId: string) {
    super(capabilityUnavailableMessage(capabilityId));
    this.name = "CapabilityUnavailableError";
    this.capabilityId = capabilityId;
  }
}

/** Route-level limits shown in the free beta outside deterministic demos. */
export const freeBetaScreenNotices: Partial<Record<ScreenId, string>> = {
  agents:
    "Session history is durable, but starting or controlling agents is not included in the free beta.",
  notebooks:
    "Notebook scanning is a preview until imported scans can be persisted and recovered.",
  code: "Code scanning is a preview until filesystem approval and indexed provenance are available.",
  reproducibility:
    "Audits run locally and are included in project backups; finding-resolution choices reset after reload in this beta.",
  decisions:
    "Decision history is a preview until create and supersede operations are persisted.",
  "next-steps":
    "Recommendations are read-only until planner decisions are persisted.",
  integrations:
    "Provider connections are unavailable until credentials and approval flows are implemented.",
};

export function freeBetaScreenNotice(screen: ScreenId): string | null {
  return freeBetaScreenNotices[screen] ?? null;
}
