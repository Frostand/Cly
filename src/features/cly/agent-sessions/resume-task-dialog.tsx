import { AlertTriangle, Check, GitBranch, Laptop } from "lucide-react";
import { useMemo, useState } from "react";
import { StatusIndicator } from "../components/design-system";
import { Button, Dialog } from "../components/primitives";
import { ApiRequestError, apiClient } from "../services/api-client";
import type {
  ClyDevHandoffInspection,
  ClyDevResumeAction,
  ClyDevResumeDestination,
} from "./types";

type ResumeApi = Pick<
  typeof apiClient,
  "pairClyDevDevice" | "inspectClyDevHandoff" | "resumeClyDevHandoff"
>;

const actionLabel: Record<ClyDevResumeAction, string> = {
  fetch: "Fetch from remote",
  clone: "Clone repository",
  "create-branch": "Create branch",
  "create-worktree": "Create worktree",
  "inspect-changes": "Inspect local changes",
  defer: "Defer",
  "return-to-source": "Return to source machine",
};

const platform = (): ClyDevResumeDestination["machine"]["platform"] =>
  navigator.userAgent.includes("Windows")
    ? "win32"
    : navigator.userAgent.includes("Linux")
      ? "linux"
      : "darwin";

const inspectionFromError = (error: unknown) =>
  error instanceof ApiRequestError &&
  error.details &&
  typeof error.details === "object" &&
  "readiness" in error.details
    ? (error.details as ClyDevHandoffInspection)
    : null;

export function ResumeTaskDialog({
  open,
  onClose,
  onResumed,
  onRecoveryAction,
  api = apiClient,
}: {
  open: boolean;
  onClose: () => void;
  onResumed?: (result: ClyDevHandoffInspection) => void;
  onRecoveryAction?: (action: ClyDevResumeAction) => void;
  api?: ResumeApi;
}) {
  const [handoffId, setHandoffId] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [repositoryPath, setRepositoryPath] = useState("");
  const [deviceId] = useState(() => `device-${crypto.randomUUID()}`);
  const [inspection, setInspection] = useState<ClyDevHandoffInspection | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const destination = useMemo<ClyDevResumeDestination>(
    () => ({
      path: repositoryPath,
      repositoryPath,
      worktreePath: repositoryPath,
      requiredTools: ["git"],
      machine: { id: deviceId, platform: platform() },
    }),
    [deviceId, repositoryPath],
  );

  const inspect = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.pairClyDevDevice({ deviceId, pairingCode });
      setInspection(
        await api.inspectClyDevHandoff(handoffId, {
          deviceId,
          destination,
        }),
      );
    } catch (caught) {
      const details = inspectionFromError(caught);
      if (details) setInspection(details);
      else
        setError(
          caught instanceof Error
            ? caught.message
            : "The handoff could not be inspected.",
        );
    } finally {
      setBusy(false);
    }
  };
  const resume = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.resumeClyDevHandoff(handoffId, {
        deviceId,
        destination,
      });
      onResumed?.(result);
      onClose();
    } catch (caught) {
      const details = inspectionFromError(caught);
      if (details) setInspection(details);
      else
        setError(
          caught instanceof Error
            ? caught.message
            : "The task could not be resumed.",
        );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Resume task on this machine"
      description="Cly restores task context only after Git and environment checks pass."
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {inspection && !inspection.readiness.blocking ? (
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => void resume()}
            >
              Resume task
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={
                busy ||
                !handoffId.trim() ||
                !/^\d{6}$/.test(pairingCode) ||
                !repositoryPath.trim()
              }
              onClick={() => void inspect()}
            >
              Inspect destination
            </Button>
          )}
        </>
      }
    >
      <div className="cly-resume-task-form">
        <label>
          <span>Handoff ID</span>
          <input
            value={handoffId}
            onChange={(event) => setHandoffId(event.target.value)}
          />
        </label>
        <label>
          <span>Pairing code</span>
          <input
            inputMode="numeric"
            maxLength={6}
            value={pairingCode}
            onChange={(event) =>
              setPairingCode(event.target.value.replace(/\D/g, ""))
            }
          />
        </label>
        <label>
          <span>Local repository or worktree</span>
          <input
            value={repositoryPath}
            onChange={(event) => setRepositoryPath(event.target.value)}
          />
        </label>
        <p className="cly-resume-restriction">
          <AlertTriangle size={13} aria-hidden="true" /> Uncommitted files and
          restricted context are never copied between machines.
        </p>
        {error ? (
          <p className="cly-resume-error" role="alert">
            {error}
          </p>
        ) : null}
        {inspection ? (
          <section
            aria-label="Resume readiness"
            className="cly-resume-readiness"
          >
            <header>
              <Laptop size={14} aria-hidden="true" />
              <span>
                <strong>{inspection.envelope.task.title}</strong>
                <small>
                  {inspection.envelope.sourceMachine.id} ·{" "}
                  {inspection.envelope.repository.remoteUrl ??
                    inspection.envelope.repository.id}
                </small>
              </span>
              <StatusIndicator
                tone={inspection.readiness.blocking ? "danger" : "success"}
              >
                {inspection.readiness.blocking ? "Blocked" : "Ready"}
              </StatusIndicator>
            </header>
            <div className="cly-resume-identity">
              <span>
                <GitBranch size={12} /> {inspection.envelope.worktree.branch}
              </span>
              <code>{inspection.envelope.commit.sha}</code>
            </div>
            <div className="cly-resume-checks">
              {inspection.readiness.checks.map((check) => (
                <div key={check.id} data-status={check.status}>
                  {check.status === "pass" ? (
                    <Check size={12} />
                  ) : (
                    <AlertTriangle size={12} />
                  )}
                  <span>{check.summary}</span>
                </div>
              ))}
            </div>
            {inspection.readiness.actions.length ? (
              <fieldset className="cly-resume-actions">
                <legend className="cly-sr-only">Safe recovery actions</legend>
                {inspection.readiness.actions.map((action) => (
                  <Button
                    key={action}
                    variant="ghost"
                    onClick={() => {
                      if (action === "defer") onClose();
                      onRecoveryAction?.(action);
                    }}
                  >
                    {actionLabel[action]}
                  </Button>
                ))}
              </fieldset>
            ) : null}
          </section>
        ) : null}
      </div>
    </Dialog>
  );
}
