import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Laptop,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatusIndicator } from "../components/design-system";
import { Button, Dialog } from "../components/primitives";
import { apiClient } from "../services/api-client";
import type {
  ClyDevDevice,
  ClyDevDevicePublicBundle,
  ClyDevSyncStatus,
} from "./types";

type DeviceSyncApi = Pick<
  typeof apiClient,
  | "fetchClyDevSyncStatus"
  | "stageClyDevSync"
  | "registerClyDevDevice"
  | "verifyClyDevDevice"
  | "verifyClyDevPeerKeyRotation"
  | "revokeClyDevDevice"
  | "rotateClyDevDeviceKeys"
  | "resolveClyDevSyncConflict"
>;

function lastSyncLabel(value: string | null) {
  if (!value) return "Never synced";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Last sync unavailable"
    : `Last synced ${date.toLocaleString()}`;
}

function pairingBundle(device: ClyDevDevice) {
  return JSON.stringify(
    {
      id: device.id,
      name: device.name,
      fingerprint: device.fingerprint,
      publicBundle: device.publicBundle,
    },
    null,
    2,
  );
}

export function DeviceSyncPanel({
  projectId,
  api = apiClient,
}: {
  projectId: string;
  api?: DeviceSyncApi;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ClyDevSyncStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState("");
  const [bundleText, setBundleText] = useState("");
  const [pairingFingerprint, setPairingFingerprint] = useState("");
  const [verification, setVerification] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [confirmingRotation, setConfirmingRotation] = useState(false);
  const localFingerprint = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextStatus = await api.fetchClyDevSyncStatus(projectId);
      if (
        localFingerprint.current &&
        localFingerprint.current !== nextStatus.localDevice.fingerprint
      ) {
        setCopied(false);
      }
      localFingerprint.current = nextStatus.localDevice.fingerprint;
      setStatus(nextStatus);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Device sync status could not load.",
      );
    } finally {
      setLoading(false);
    }
  }, [api, projectId]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2_000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const peers = useMemo(
    () => status?.devices.filter((device) => device.kind === "peer") ?? [],
    [status],
  );

  const pairingCandidate = useMemo(() => {
    try {
      const parsed = JSON.parse(bundleText) as {
        id?: string;
        publicBundle?: ClyDevDevicePublicBundle;
      };
      if (!parsed.id || !parsed.publicBundle) return null;
      return {
        id: parsed.id,
        publicBundle: parsed.publicBundle,
        peer: peers.find((device) => device.id === parsed.id) ?? null,
      };
    } catch {
      return null;
    }
  }, [bundleText, peers]);
  const isKeyUpdate = Boolean(
    pairingCandidate?.peer &&
      pairingCandidate.publicBundle.keyVersion >
        pairingCandidate.peer.keyVersion,
  );
  const isExistingBundle = Boolean(pairingCandidate?.peer && !isKeyUpdate);

  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Device sync action failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const register = () =>
    run(async () => {
      const parsed = JSON.parse(bundleText) as {
        id?: string;
        publicBundle?: ClyDevDevicePublicBundle;
        privateKey?: unknown;
        privateBundle?: unknown;
      };
      if (parsed.privateKey || parsed.privateBundle) {
        throw new Error("Pairing accepts public device keys only.");
      }
      if (!parsed.id || !parsed.publicBundle) {
        throw new Error(
          "Pairing bundle is missing its device ID or public keys.",
        );
      }
      const existing = peers.find((device) => device.id === parsed.id);
      if (existing) {
        if (existing.trustState !== "trusted") {
          throw new Error("Only a trusted device can update its public keys.");
        }
        if (parsed.publicBundle.keyVersion <= existing.keyVersion) {
          throw new Error(
            "This pairing bundle is already registered or older.",
          );
        }
        if (!pairingFingerprint.trim()) {
          throw new Error("Enter the new fingerprint from a separate channel.");
        }
        await api.verifyClyDevPeerKeyRotation(
          parsed.id,
          parsed.publicBundle,
          pairingFingerprint.trim(),
        );
      } else {
        if (!deviceName.trim()) throw new Error("Enter a device name.");
        await api.registerClyDevDevice({
          id: parsed.id,
          name: deviceName.trim(),
          publicBundle: parsed.publicBundle,
        });
      }
      setDeviceName("");
      setBundleText("");
      setPairingFingerprint("");
    });

  const close = () => {
    setOpen(false);
    setCopied(false);
    setConfirmingRotation(false);
  };

  const buttonLabel = status
    ? status.conflictCount
      ? `Device sync: ${status.conflictCount} conflicts`
      : status.pendingChanges
        ? `Device sync: ${status.pendingChanges} pending`
        : "Device sync: ready"
    : "Device sync";

  return (
    <>
      <Button
        variant="default"
        onClick={() => setOpen(true)}
        aria-label={buttonLabel}
      >
        <ShieldCheck size={14} aria-hidden="true" />
        Device sync
        {status?.pendingChanges ? <span>{status.pendingChanges}</span> : null}
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title="Device sync"
        description="Approved chat, context, and handoff state are encrypted for verified devices before transport."
        wide
        footer={
          <>
            <span className="cly-device-sync-last">
              {status
                ? lastSyncLabel(status.lastSyncAt)
                : "Sync status unavailable"}
            </span>
            <Button
              variant="ghost"
              onClick={() => void refresh()}
              disabled={loading || busy}
            >
              <RefreshCw size={13} aria-hidden="true" /> Refresh
            </Button>
            <Button
              variant="primary"
              disabled={
                loading ||
                busy ||
                !status ||
                status.keyStoreState !== "available" ||
                status.trustedDeviceCount === 0
              }
              onClick={() => void run(() => api.stageClyDevSync(projectId))}
            >
              <ShieldCheck size={13} aria-hidden="true" /> Prepare encrypted
              sync
            </Button>
          </>
        }
      >
        <div className="cly-device-sync" aria-live="polite">
          {loading && !status ? (
            <div className="cly-device-sync-loading" role="status">
              <RefreshCw className="animate-spin" size={16} /> Loading device
              trust and queue state…
            </div>
          ) : null}
          {error ? (
            <div className="cly-device-sync-error" role="alert">
              <AlertTriangle size={14} aria-hidden="true" /> {error}
            </div>
          ) : null}
          {status ? (
            <>
              <section
                className="cly-device-sync-summary"
                aria-label="Sync preview"
              >
                <div>
                  <strong>{status.pendingChanges} pending</strong>
                  <span>Encrypted queue</span>
                </div>
                <div>
                  <strong>{status.localOnlyItems} local only</strong>
                  <span>Never leaves this device</span>
                </div>
                <div>
                  <strong>{status.policyBlocked} policy blocked</strong>
                  <span>Needs a trusted destination</span>
                </div>
                <div>
                  <strong>{status.conflictCount} conflicts</strong>
                  <span>Requires review</span>
                </div>
              </section>

              {status.keyStoreState !== "available" ? (
                <div className="cly-device-sync-warning" role="status">
                  <KeyRound size={14} aria-hidden="true" />
                  Device keys are locked or unavailable.
                </div>
              ) : null}

              <section
                className="cly-device-sync-section"
                aria-labelledby="current-device-heading"
              >
                <header>
                  <div>
                    <h3 id="current-device-heading">This device</h3>
                    <p>
                      {confirmingRotation
                        ? "Pending transfers will be cleared. Registered devices must verify the new fingerprint."
                        : "Private keys stay in the operating-system credential store."}
                    </p>
                  </div>
                  {confirmingRotation ? (
                    <div className="cly-key-rotation-confirm" role="status">
                      <Button
                        variant="ghost"
                        onClick={() => setConfirmingRotation(false)}
                        disabled={busy}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() =>
                          void run(async () => {
                            await api.rotateClyDevDeviceKeys();
                            setConfirmingRotation(false);
                            setCopied(false);
                          })
                        }
                        disabled={busy}
                      >
                        Confirm rotation
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      onClick={() => setConfirmingRotation(true)}
                      disabled={busy}
                    >
                      <KeyRound size={13} /> Rotate keys
                    </Button>
                  )}
                </header>
                <div className="cly-device-row">
                  <Laptop size={16} aria-hidden="true" />
                  <div>
                    <strong>{status.localDevice.name}</strong>
                    <code>{status.localDevice.fingerprint}</code>
                  </div>
                  <StatusIndicator tone="success">
                    Key {status.localDevice.keyVersion}
                  </StatusIndicator>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      void navigator.clipboard
                        ?.writeText(pairingBundle(status.localDevice))
                        .then(() => setCopied(true));
                    }}
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    {copied ? "Copied" : "Copy pairing bundle"}
                  </Button>
                </div>
              </section>

              <section
                className="cly-device-sync-section"
                aria-labelledby="trusted-devices-heading"
              >
                <header>
                  <div>
                    <h3 id="trusted-devices-heading">Registered devices</h3>
                    <p>
                      Verify the fingerprint through a separate channel before
                      trusting a device.
                    </p>
                  </div>
                </header>
                {peers.length ? (
                  <div className="cly-device-list">
                    {peers.map((device) => (
                      <div className="cly-device-row" key={device.id}>
                        {device.trustState === "revoked" ? (
                          <ShieldOff size={16} aria-hidden="true" />
                        ) : (
                          <ShieldCheck size={16} aria-hidden="true" />
                        )}
                        <div>
                          <strong>{device.name}</strong>
                          <code>{device.fingerprint}</code>
                        </div>
                        <StatusIndicator
                          tone={
                            device.trustState === "trusted"
                              ? "success"
                              : device.trustState === "pending"
                                ? "warning"
                                : "danger"
                          }
                        >
                          {device.trustState}
                        </StatusIndicator>
                        {device.trustState === "pending" ? (
                          <div className="cly-device-verify">
                            <label>
                              <span className="cly-sr-only">
                                Verification code for {device.name}
                              </span>
                              <input
                                aria-label={`Verification code for ${device.name}`}
                                value={verification[device.id] ?? ""}
                                placeholder="AAAA-BBBB-…"
                                onChange={(event) =>
                                  setVerification((current) => ({
                                    ...current,
                                    [device.id]: event.target.value,
                                  }))
                                }
                              />
                            </label>
                            <Button
                              onClick={() =>
                                void run(() =>
                                  api.verifyClyDevDevice(
                                    device.id,
                                    verification[device.id] ?? "",
                                  ),
                                )
                              }
                            >
                              Verify
                            </Button>
                          </div>
                        ) : device.trustState === "trusted" ? (
                          <Button
                            variant="danger"
                            onClick={() =>
                              void run(() =>
                                api.revokeClyDevDevice(
                                  device.id,
                                  "Revoked by the local user",
                                ),
                              )
                            }
                          >
                            Revoke
                          </Button>
                        ) : (
                          <span>New state blocked</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="cly-device-sync-empty">
                    No trusted peer devices
                  </div>
                )}
                <div className="cly-device-pairing">
                  <label>
                    <span>
                      {isKeyUpdate ? "Registered device" : "Device name"}
                    </span>
                    <input
                      autoFocus
                      value={
                        isKeyUpdate
                          ? (pairingCandidate?.peer?.name ?? "")
                          : deviceName
                      }
                      onChange={(event) => setDeviceName(event.target.value)}
                      placeholder="Lab workstation"
                      disabled={isKeyUpdate}
                    />
                  </label>
                  <label>
                    <span>Public pairing bundle</span>
                    <textarea
                      value={bundleText}
                      onChange={(event) => setBundleText(event.target.value)}
                      placeholder="Paste public pairing JSON"
                    />
                  </label>
                  <label>
                    <span>New key fingerprint</span>
                    <input
                      value={pairingFingerprint}
                      onChange={(event) =>
                        setPairingFingerprint(event.target.value)
                      }
                      placeholder="Key updates only"
                      inputMode="text"
                    />
                  </label>
                  <Button
                    onClick={() => void register()}
                    disabled={
                      !bundleText.trim() ||
                      busy ||
                      isExistingBundle ||
                      (isKeyUpdate
                        ? !pairingFingerprint.trim()
                        : !deviceName.trim())
                    }
                  >
                    {isExistingBundle
                      ? "Already registered"
                      : isKeyUpdate
                        ? "Verify key update"
                        : "Register device"}
                  </Button>
                </div>
              </section>

              {status.conflicts.length ? (
                <section
                  className="cly-device-sync-section"
                  aria-labelledby="sync-conflicts-heading"
                >
                  <header>
                    <div>
                      <h3 id="sync-conflicts-heading">Conflicts</h3>
                      <p>
                        Concurrent edits never overwrite one another
                        automatically.
                      </p>
                    </div>
                  </header>
                  <div className="cly-device-list">
                    {status.conflicts
                      .filter((conflict) => conflict.state === "pending")
                      .map((conflict) => (
                        <div
                          className="cly-sync-conflict-row"
                          key={conflict.id}
                        >
                          <div>
                            <strong>
                              Concurrent {conflict.recordKind} changes
                            </strong>
                            <span>
                              Local revision {conflict.localRevision} · incoming
                              revision {conflict.incomingRevision}
                            </span>
                          </div>
                          <Button
                            onClick={() =>
                              void run(() =>
                                api.resolveClyDevSyncConflict(
                                  projectId,
                                  conflict.id,
                                  "keep_local",
                                ),
                              )
                            }
                          >
                            Keep this device
                          </Button>
                          <Button
                            variant="primary"
                            onClick={() =>
                              void run(() =>
                                api.resolveClyDevSyncConflict(
                                  projectId,
                                  conflict.id,
                                  "use_incoming",
                                ),
                              )
                            }
                          >
                            Use incoming
                          </Button>
                        </div>
                      ))}
                  </div>
                </section>
              ) : null}
            </>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}
