// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DeviceSyncPanel } from "./device-sync-panel";

const status = {
  localDevice: {
    id: "device-a",
    name: "Research Mac",
    kind: "local" as const,
    trustState: "trusted" as const,
    fingerprint: "AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-0000-1111",
    keyVersion: 2,
    publicBundle: {
      deviceId: "device-a",
      keyVersion: 2,
      encryptionKey: "encryption-key",
      signingKey: "signing-key",
    },
    registeredAt: "2026-07-16T12:00:00.000Z",
    verifiedAt: "2026-07-16T12:00:00.000Z",
    revokedAt: null,
    revocationReason: null,
    lastSeenAt: "2026-07-16T12:00:00.000Z",
  },
  devices: [],
  keyStoreState: "available" as const,
  approvedChanges: 3,
  localOnlyItems: 4,
  trustedDeviceCount: 0,
  pendingChanges: 2,
  failedChanges: 0,
  policyBlocked: 3,
  conflictCount: 1,
  conflicts: [
    {
      id: "conflict-1",
      projectId: "project-a",
      recordKind: "handoff-state",
      recordId: "session-1:plan.recorded",
      localRevision: 2,
      incomingRevision: 3,
      localEnvelopeId: "local",
      incomingEnvelopeId: "incoming",
      state: "pending" as const,
      createdAt: "2026-07-16T12:00:00.000Z",
      resolvedAt: null,
    },
  ],
  lastSyncAt: null,
};

function api(patch: Record<string, unknown> = {}) {
  return {
    fetchClyDevSyncStatus: vi.fn().mockResolvedValue(status),
    stageClyDevSync: vi.fn().mockResolvedValue({ queued: 3, policyBlocked: 0 }),
    registerClyDevDevice: vi.fn(),
    verifyClyDevDevice: vi.fn(),
    verifyClyDevPeerKeyRotation: vi.fn(),
    revokeClyDevDevice: vi.fn(),
    rotateClyDevDeviceKeys: vi.fn(),
    resolveClyDevSyncConflict: vi.fn().mockResolvedValue({}),
    ...patch,
  };
}

describe("DeviceSyncPanel", () => {
  it("shows pending, local-only, policy, last-sync, device, and conflict states", async () => {
    const client = api();
    const user = userEvent.setup();
    render(<DeviceSyncPanel projectId="project-a" api={client as never} />);

    await user.click(screen.getByRole("button", { name: /device sync/i }));

    expect(
      await screen.findByRole("dialog", { name: "Device sync" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Device name")).toHaveFocus();
    expect(screen.getByText("2 pending")).toBeVisible();
    expect(screen.getByText("4 local only")).toBeVisible();
    expect(screen.getByText("3 policy blocked")).toBeVisible();
    expect(screen.getByText("Never synced")).toBeVisible();
    expect(screen.getByText("Research Mac")).toBeVisible();
    expect(screen.getByText("No trusted peer devices")).toBeVisible();
    expect(screen.getByText("Concurrent handoff-state changes")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Keep this device" }));
    expect(client.resolveClyDevSyncConflict).toHaveBeenCalledWith(
      "project-a",
      "conflict-1",
      "keep_local",
    );
  });

  it("stages encrypted changes and reports unavailable key storage", async () => {
    const unavailable = {
      ...status,
      keyStoreState: "locked" as const,
      conflictCount: 0,
      conflicts: [],
    };
    const client = api({
      fetchClyDevSyncStatus: vi
        .fn()
        .mockResolvedValueOnce(unavailable)
        .mockResolvedValue(status),
    });
    const user = userEvent.setup();
    render(<DeviceSyncPanel projectId="project-a" api={client as never} />);

    await user.click(screen.getByRole("button", { name: /device sync/i }));
    expect(
      await screen.findByText("Device keys are locked or unavailable."),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Prepare encrypted sync" }),
    ).toBeDisabled();
  });

  it("registers a pasted public pairing bundle without accepting private material", async () => {
    const client = api({
      registerClyDevDevice: vi.fn().mockResolvedValue({}),
      fetchClyDevSyncStatus: vi.fn().mockResolvedValue(status),
    });
    const user = userEvent.setup();
    render(<DeviceSyncPanel projectId="project-a" api={client as never} />);
    await user.click(screen.getByRole("button", { name: /device sync/i }));
    await screen.findByRole("dialog", { name: "Device sync" });

    await user.type(screen.getByLabelText("Device name"), "Lab workstation");
    fireEvent.change(screen.getByLabelText("Public pairing bundle"), {
      target: {
        value: JSON.stringify({
          id: "device-b",
          publicBundle: {
            deviceId: "device-b",
            keyVersion: 1,
            encryptionKey: "public-encryption-key",
            signingKey: "public-signing-key",
          },
        }),
      },
    });
    await user.click(screen.getByRole("button", { name: "Register device" }));

    await waitFor(() =>
      expect(client.registerClyDevDevice).toHaveBeenCalledWith({
        id: "device-b",
        name: "Lab workstation",
        publicBundle: expect.objectContaining({ deviceId: "device-b" }),
      }),
    );
  });

  it("verifies a newer pasted key bundle for an existing trusted peer", async () => {
    const trustedPeer = {
      ...status.localDevice,
      id: "device-b",
      name: "Lab workstation",
      kind: "peer" as const,
      fingerprint: "1111-2222-3333-4444-5555-6666-7777-8888",
      keyVersion: 1,
      publicBundle: {
        ...status.localDevice.publicBundle,
        deviceId: "device-b",
        keyVersion: 1,
      },
    };
    const client = api({
      fetchClyDevSyncStatus: vi.fn().mockResolvedValue({
        ...status,
        devices: [trustedPeer],
        trustedDeviceCount: 1,
      }),
      verifyClyDevPeerKeyRotation: vi.fn().mockResolvedValue({}),
    });
    const user = userEvent.setup();
    render(<DeviceSyncPanel projectId="project-a" api={client as never} />);
    await user.click(screen.getByRole("button", { name: /device sync/i }));
    await screen.findByRole("dialog", { name: "Device sync" });

    fireEvent.change(screen.getByLabelText("Public pairing bundle"), {
      target: {
        value: JSON.stringify({
          id: "device-b",
          name: "Lab workstation",
          publicBundle: {
            deviceId: "device-b",
            keyVersion: 3,
            encryptionKey: "new-public-encryption-key",
            signingKey: "new-public-signing-key",
          },
        }),
      },
    });
    await user.type(
      screen.getByLabelText("New key fingerprint"),
      "AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-0000-1111",
    );
    await user.click(screen.getByRole("button", { name: "Verify key update" }));

    await waitFor(() =>
      expect(client.verifyClyDevPeerKeyRotation).toHaveBeenCalledWith(
        "device-b",
        expect.objectContaining({ keyVersion: 3 }),
        "AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-0000-1111",
      ),
    );
  });

  it("requires rotation confirmation and resets copied feedback on close", async () => {
    const client = api({
      rotateClyDevDeviceKeys: vi.fn().mockResolvedValue({}),
    });
    const user = userEvent.setup();
    render(<DeviceSyncPanel projectId="project-a" api={client as never} />);
    await user.click(screen.getByRole("button", { name: /device sync/i }));
    await screen.findByRole("dialog", { name: "Device sync" });

    await user.click(screen.getByRole("button", { name: "Rotate keys" }));
    expect(client.rotateClyDevDeviceKeys).not.toHaveBeenCalled();
    expect(
      screen.getByText(/registered devices must verify the new fingerprint/i),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Confirm rotation" }));
    await waitFor(() =>
      expect(client.rotateClyDevDeviceKeys).toHaveBeenCalledTimes(1),
    );

    await user.click(
      screen.getByRole("button", { name: "Copy pairing bundle" }),
    );
    expect(await screen.findByRole("button", { name: "Copied" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    await user.click(screen.getByRole("button", { name: /device sync/i }));
    expect(
      await screen.findByRole("button", { name: "Copy pairing bundle" }),
    ).toBeVisible();
  });
});
