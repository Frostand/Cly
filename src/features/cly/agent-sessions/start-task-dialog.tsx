import { CirclePlay, Link2, LoaderCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Dialog } from "../components/primitives";

export interface ProductionTaskStartInput {
  title: string;
  objective?: string;
  linearIssue?: string;
  provider: { id: "openai-codex" | "anthropic-claude"; model: string };
  researchObjectIds: string[];
  budget?: { maxTotalTokens?: number };
}

interface ResearchReference {
  id: string;
  title: string;
  kind: string;
}

const providers = [
  {
    id: "anthropic-claude" as const,
    label: "Anthropic Claude (task execution)",
    model: "claude-sonnet-4-6",
  },
  {
    id: "openai-codex" as const,
    label: "OpenAI Codex (read-only)",
    model: "gpt-5",
  },
];

export function StartTaskDialog({
  open,
  projectName,
  references,
  onClose,
  onStart,
}: {
  open: boolean;
  projectName: string;
  references: ResearchReference[];
  onClose: () => void;
  onStart: (input: ProductionTaskStartInput) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [linearIssue, setLinearIssue] = useState("");
  const [providerId, setProviderId] =
    useState<ProductionTaskStartInput["provider"]["id"]>("anthropic-claude");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [additionalIds, setAdditionalIds] = useState("");
  const [maxTotalTokens, setMaxTotalTokens] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedProvider = useMemo(
    () =>
      providers.find((provider) => provider.id === providerId) ?? providers[0],
    [providerId],
  );

  const submit = async () => {
    const normalizedTitle =
      title.trim() ||
      objective.trim().split(/\r?\n/)[0] ||
      linearIssue.trim() ||
      "Cly Dev task";
    const normalizedObjective = objective.trim();
    if (!normalizedObjective && !linearIssue.trim()) {
      setError(
        "Provide an objective or a Linear issue before starting a provider run.",
      );
      return;
    }
    const extra = additionalIds
      .split(/[,\n]/)
      .map((value) => value.trim())
      .filter(Boolean);
    const parsedBudget = maxTotalTokens.trim()
      ? Number(maxTotalTokens)
      : undefined;
    if (
      parsedBudget !== undefined &&
      (!Number.isInteger(parsedBudget) || parsedBudget < 0)
    ) {
      setError("Token budget must be a whole number of tokens.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onStart({
        title: normalizedTitle,
        ...(normalizedObjective ? { objective: normalizedObjective } : {}),
        ...(linearIssue.trim() ? { linearIssue: linearIssue.trim() } : {}),
        provider: { id: selectedProvider.id, model: model.trim() },
        researchObjectIds: [...new Set([...selectedIds, ...extra])],
        ...(parsedBudget === undefined
          ? {}
          : { budget: { maxTotalTokens: parsedBudget } }),
      });
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The provider task could not start.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Start a Cly Dev task"
      description={`Cly derives the registered ${projectName} worktree and Git commit locally, then records the objective, provider run, and selected research links durably.`}
      wide
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={
              busy ||
              (!objective.trim() && !linearIssue.trim()) ||
              !model.trim()
            }
            onClick={() => void submit()}
          >
            {busy ? (
              <LoaderCircle className="cly-spin" size={14} />
            ) : (
              <CirclePlay size={14} />
            )}
            Start provider run
          </Button>
        </>
      }
    >
      <div className="cly-resume-task-form" aria-live="polite">
        <label>
          <span>Task title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Fix the calibration regression"
          />
        </label>
        <label>
          <span>Objective</span>
          <textarea
            autoFocus
            rows={5}
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
            placeholder="State the outcome, constraints, and tests that demonstrate success."
          />
        </label>
        <label>
          <span>Linear issue (optional)</span>
          <input
            value={linearIssue}
            onChange={(event) => setLinearIssue(event.target.value)}
            placeholder="CLY-123 or a Linear issue URL"
          />
        </label>
        <div className="cly-task-start-grid">
          <label>
            <span>Local provider</span>
            <select
              value={providerId}
              onChange={(event) => {
                const next = providers.find(
                  (provider) => provider.id === event.target.value,
                );
                if (!next) return;
                setProviderId(next.id);
                setModel(next.model);
              }}
            >
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Installed model ID</span>
            <input
              value={model}
              onChange={(event) => setModel(event.target.value)}
            />
          </label>
          <label>
            <span>Total token budget (optional)</span>
            <input
              inputMode="numeric"
              value={maxTotalTokens}
              onChange={(event) => setMaxTotalTokens(event.target.value)}
              placeholder="No request limit"
            />
          </label>
        </div>
        {references.length ? (
          <fieldset className="cly-task-start-references">
            <legend>
              <Link2 size={13} aria-hidden="true" /> Record against research
              objects
            </legend>
            {references.map((reference) => (
              <label key={reference.id}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(reference.id)}
                  onChange={(event) =>
                    setSelectedIds((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.add(reference.id);
                      else next.delete(reference.id);
                      return next;
                    })
                  }
                />
                <span>
                  {reference.title}{" "}
                  <small>
                    {reference.kind} · {reference.id}
                  </small>
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}
        <label>
          <span>Additional research object IDs</span>
          <input
            value={additionalIds}
            onChange={(event) => setAdditionalIds(event.target.value)}
            placeholder="Comma-separated IDs, if the object is not listed above"
          />
        </label>
        <p className="cly-resume-restriction">
          The provider boundary checks local authentication, model availability,
          capabilities, approvals, and budget before it can act. Paths,
          credentials, and uncommitted files stay local. OpenAI Codex sessions
          are read-only until its local bridge can intercept effects before
          execution.
        </p>
        {error ? (
          <p className="cly-resume-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
