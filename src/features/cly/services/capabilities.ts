import inventory from "../../../../docs/cly-v1-capabilities.json";

export type CapabilityState = "production" | "unavailable";

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
