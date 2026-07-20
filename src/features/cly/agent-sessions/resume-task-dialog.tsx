import {
  AlertTriangle,
  Check,
  GitBranch,
  Laptop,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { StatusIndicator } from "../components/design-system";
import { Button, Dialog } from "../components/primitives";
import { apiClient } from "../services/api-client";
import type {
  ClyDevHandoffEnvelope,
  ClyDevHandoffInspection,
  ClyDevReceivedHandoff,
  ClyDevTargetProvider,
} from "./types";

type ResumeApi = Pick<
  typeof apiClient,
  "fetchReceivedClyDevHandoffs" | "inspectClyDevHandoff" | "resumeClyDevHandoff"
>;

const providers: Array<ClyDevTargetProvider & { label: string }> = [
  { id: "openai-codex", label: "OpenAI Codex" },
  { id: "anthropic-claude", label: "Anthropic Claude" },
];

function parseEnvelope(value: string): ClyDevHandoffEnvelope | null {
  try {
    const parsed = JSON.parse(value) as ClyDevHandoffEnvelope;
    return parsed?.protocol === "cly.dev.handoff" ? parsed : null;
  } catch {
    return null;
  }
}

export function ResumeTaskDialog({
  projectId,
  open,
  onClose,
  onResumed,
  api = apiClient,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onResumed?: () => void;
  api?: ResumeApi;
}) {
  const [received, setReceived] = useState<ClyDevReceivedHandoff[]>([]);
  const [envelopeText, setEnvelopeText] = useState("");
  const [targetProviderId, setTargetProviderId] =
    useState<ClyDevTargetProvider["id"]>("openai-codex");
  const [inspection, setInspection] = useState<ClyDevHandoffInspection | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const envelope = useMemo(() => parseEnvelope(envelopeText), [envelopeText]);
  const targetProvider = useMemo(
    () => ({ id: targetProviderId }) satisfies ClyDevTargetProvider,
    [targetProviderId],
  );

  useEffect(() => {
    if (!open) return;
    let active = true;
    setBusy(true);
    setError(null);
    void api
      .fetchReceivedClyDevHandoffs(projectId)
      .then((items) => {
        if (!active) return;
        setReceived(items);
        if (items[0]) {
          setEnvelopeText(
            (current) => current || JSON.stringify(items[0].envelope, null, 2),
          );
        }
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Encrypted handoffs could not be loaded.",
          );
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [api, open, projectId]);

  const inspect = async () => {
    if (!envelope) return;
    setBusy(true);
    setError(null);
    try {
      setInspection(
        await api.inspectClyDevHandoff(projectId, envelope, targetProvider),
      );
    } catch (cause) {
      setInspection(null);
      setError(
        cause instanceof Error
          ? cause.message
          : "The handoff could not be inspected.",
      );
    } finally {
      setBusy(false);
    }
  };

  const resume = async () => {
    if (!envelope || !inspection?.compatible || inspection.stale.length) return;
    setBusy(true);
    setError(null);
    try {
      await api.resumeClyDevHandoff(projectId, envelope, targetProvider);
      onResumed?.();
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The task could not be resumed.",
      );
      await inspect();
    } finally {
      setBusy(false);
    }
  };

  const reviewRequired = Boolean(
    inspection && (!inspection.compatible || inspection.stale.length),
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Resume a Cly Dev handoff"
      description="Review provider, Git, research, permissions, and environment compatibility before Cly creates resumable local state."
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={
              busy ||
              !envelope ||
              (inspection !== null &&
                (!inspection.compatible || inspection.stale.length > 0))
            }
            onClick={() => void (inspection ? resume() : inspect())}
          >
            {inspection ? "Resume task" : "Inspect handoff"}
          </Button>
        </>
      }
    >
      <div className="cly-resume-task-form" aria-live="polite">
        {received.length ? (
          <label>
            <span>Encrypted handoff received on this device</span>
            <select
              value={
                received.find(
                  (item) =>
                    item.envelope.integrity.digest ===
                    envelope?.integrity.digest,
                )?.envelopeId ?? ""
              }
              onChange={(event) => {
                const selected = received.find(
                  (item) => item.envelopeId === event.target.value,
                );
                if (selected) {
                  setEnvelopeText(JSON.stringify(selected.envelope, null, 2));
                  setInspection(null);
                }
              }}
            >
              {received.map((item) => (
                <option key={item.envelopeId} value={item.envelopeId}>
                  {item.envelope.payload.task.title} · {item.receivedAt}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          <span>Versioned handoff JSON</span>
          <textarea
            autoFocus
            rows={6}
            value={envelopeText}
            onChange={(event) => {
              setEnvelopeText(event.target.value);
              setInspection(null);
            }}
            aria-invalid={Boolean(envelopeText && !envelope)}
            placeholder="Paste a local export, or receive one through encrypted device sync."
          />
        </label>
        <label>
          <span>Resume with provider</span>
          <select
            value={targetProviderId}
            onChange={(event) => {
              setTargetProviderId(
                event.target.value as ClyDevTargetProvider["id"],
              );
              setInspection(null);
            }}
          >
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </select>
        </label>
        <p className="cly-resume-restriction">
          <ShieldCheck size={13} aria-hidden="true" /> Credentials, restricted
          datasets, machine paths, live processes, and uncommitted files remain
          local. Historical approvals are evidence only; resumed effects require
          current authority.
        </p>
        {error ? (
          <p className="cly-resume-error" role="alert">
            <AlertTriangle size={13} aria-hidden="true" /> {error}
          </p>
        ) : null}
        {envelope ? (
          <section className="cly-resume-preview" aria-label="Handoff preview">
            <div>
              <Laptop size={14} aria-hidden="true" />
              <span>
                <strong>{envelope.payload.task.title}</strong>
                <small>{envelope.payload.goal.objective}</small>
              </span>
              <StatusIndicator tone="info">
                Schema {envelope.schemaVersion}
              </StatusIndicator>
            </div>
            <div className="cly-resume-identity">
              <span>
                <GitBranch size={12} aria-hidden="true" />{" "}
                {envelope.payload.repository.branch}
              </span>
              <code>{envelope.payload.repository.commitSha}</code>
            </div>
            <small>
              {envelope.payload.summaries.length} summaries ·{" "}
              {envelope.payload.plan.steps.length} plan steps ·{" "}
              {envelope.payload.contextManifest.entries.length} context refs ·{" "}
              {envelope.payload.tests.length} test records · raw conversation{" "}
              {envelope.payload.conversationSync}
            </small>
          </section>
        ) : envelopeText ? (
          <p className="cly-resume-error" role="alert">
            <AlertTriangle size={13} aria-hidden="true" /> Enter a valid
            cly.dev.handoff envelope.
          </p>
        ) : null}
        {inspection ? (
          <section
            aria-label="Resume readiness"
            className="cly-resume-readiness"
          >
            <header>
              {reviewRequired ? (
                <AlertTriangle size={14} aria-hidden="true" />
              ) : (
                <Check size={14} aria-hidden="true" />
              )}
              <span>
                <strong>
                  {reviewRequired ? "Review required" : "Ready to resume"}
                </strong>
                <small>
                  {reviewRequired
                    ? "Cly will not execute or overwrite newer state."
                    : "Repository, research, provider, and authority checks passed."}
                </small>
              </span>
              <StatusIndicator tone={reviewRequired ? "warning" : "success"}>
                {reviewRequired ? "Blocked" : "Compatible"}
              </StatusIndicator>
            </header>
            <div className="cly-resume-checks">
              {inspection.explanations.map((item) => (
                <article key={`${item.code}:${item.message}`}>
                  <AlertTriangle size={12} aria-hidden="true" />
                  <span>
                    <strong>{item.message}</strong>
                    <small>{item.recoveryAction}</small>
                  </span>
                </article>
              ))}
              {!inspection.explanations.length ? (
                <article data-status="pass">
                  <Check size={12} aria-hidden="true" />
                  <span>All compatibility checks passed.</span>
                </article>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </Dialog>
  );
}
