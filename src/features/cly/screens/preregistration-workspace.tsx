import {
  Check,
  Clock3,
  FileDiff,
  FileLock2,
  GitCompareArrows,
  Plus,
  TriangleAlert,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button, Dialog, EmptyState } from "../components/primitives";
import {
  comparePreregistration,
  createPreregistrationTemplate,
} from "../domain/preregistration";
import type {
  AnalysisDeviation,
  Experiment,
  PreregistrationContent,
  PreregistrationSnapshot,
} from "../domain/types";
import { useClyStore } from "../store/cly-store";

const fieldLabels: Record<AnalysisDeviation["fieldPath"], string> = {
  "/hypothesis": "Hypothesis",
  "/primaryMetrics": "Primary metrics",
  "/exclusionRules": "Exclusion rules",
  "/analysisPlan": "Analysis plan",
  "/successCriteria": "Success criteria",
  "/dataset": "Dataset",
  "/intendedDesign": "Intended design",
};

const fieldEntries = Object.entries(fieldLabels) as Array<
  [AnalysisDeviation["fieldPath"], string]
>;

const valueText = (value: string | string[]) =>
  Array.isArray(value) ? value.join(", ") : value;

function SnapshotEditor({
  content,
  onChange,
}: {
  content: PreregistrationContent;
  onChange: (content: PreregistrationContent) => void;
}) {
  const update = <Key extends keyof PreregistrationContent>(
    key: Key,
    value: PreregistrationContent[Key],
  ) => onChange({ ...content, [key]: value });
  return (
    <div className="cly-prereg-form">
      <div className="cly-field cly-prereg-span-2">
        <label htmlFor="prereg-hypothesis">Hypothesis</label>
        <textarea
          id="prereg-hypothesis"
          className="cly-textarea"
          value={content.hypothesis}
          onChange={(event) => update("hypothesis", event.target.value)}
        />
      </div>
      <div className="cly-field">
        <label htmlFor="prereg-metrics">Primary metrics</label>
        <input
          id="prereg-metrics"
          className="cly-input"
          value={content.primaryMetrics.join(", ")}
          onChange={(event) =>
            update(
              "primaryMetrics",
              event.target.value.split(",").map((item) => item.trimStart()),
            )
          }
          placeholder="Weighted AUC, Brier score"
        />
      </div>
      <div className="cly-field">
        <label htmlFor="prereg-success">Success criteria</label>
        <input
          id="prereg-success"
          className="cly-input"
          value={content.successCriteria}
          onChange={(event) => update("successCriteria", event.target.value)}
        />
      </div>
      <div className="cly-field">
        <label htmlFor="prereg-dataset">Dataset</label>
        <input
          id="prereg-dataset"
          className="cly-input"
          value={content.dataset}
          onChange={(event) => update("dataset", event.target.value)}
        />
      </div>
      <div className="cly-field">
        <label htmlFor="prereg-design">Intended design</label>
        <input
          id="prereg-design"
          className="cly-input"
          value={content.intendedDesign}
          onChange={(event) => update("intendedDesign", event.target.value)}
        />
      </div>
      <div className="cly-field cly-prereg-span-2">
        <label htmlFor="prereg-exclusions">Exclusion rules</label>
        <textarea
          id="prereg-exclusions"
          className="cly-textarea"
          value={content.exclusionRules}
          onChange={(event) => update("exclusionRules", event.target.value)}
        />
      </div>
      <div className="cly-field cly-prereg-span-2">
        <label htmlFor="prereg-analysis">Analysis plan</label>
        <textarea
          id="prereg-analysis"
          className="cly-textarea"
          value={content.analysisPlan}
          onChange={(event) => update("analysisPlan", event.target.value)}
        />
      </div>
    </div>
  );
}

function SnapshotContent({ snapshot }: { snapshot: PreregistrationSnapshot }) {
  return (
    <dl className="cly-prereg-content">
      {fieldEntries.map(([path, label]) => {
        const key = path.slice(1) as keyof PreregistrationContent;
        return (
          <div key={path}>
            <dt>{label}</dt>
            <dd>{valueText(snapshot.content[key])}</dd>
          </div>
        );
      })}
    </dl>
  );
}

export function PreregistrationWorkspace({
  experiment,
}: {
  experiment: Experiment | null;
}) {
  const snapshots = useClyStore((state) => state.preregistrations);
  const loading = useClyStore((state) => state.preregistrationsLoading);
  const createSnapshot = useClyStore((state) => state.createPreregistration);
  const markEvaluated = useClyStore(
    (state) => state.markPreregistrationEvaluated,
  );
  const declareDeviation = useClyStore(
    (state) => state.declareAnalysisDeviation,
  );
  const acknowledgeDeviation = useClyStore(
    (state) => state.acknowledgeAnalysisDeviation,
  );
  const notify = useClyStore((state) => state.notify);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(
    null,
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorParentId, setEditorParentId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PreregistrationContent | null>(null);
  const [evaluationOpen, setEvaluationOpen] = useState(false);
  const [deviationOpen, setDeviationOpen] = useState(false);
  const [fieldPath, setFieldPath] =
    useState<AnalysisDeviation["fieldPath"]>("/analysisPlan");
  const [afterValue, setAfterValue] = useState("");
  const [rationale, setRationale] = useState("");
  const [comparisonOpen, setComparisonOpen] = useState(false);

  const experimentSnapshots = useMemo(
    () =>
      experiment
        ? snapshots
            .filter((snapshot) => snapshot.experimentId === experiment.id)
            .toSorted((left, right) => right.version - left.version)
        : [],
    [experiment, snapshots],
  );
  const latest = experimentSnapshots[0] ?? null;
  const selected =
    experimentSnapshots.find(
      (snapshot) => snapshot.id === selectedSnapshotId,
    ) ?? latest;
  const currentContent =
    selected && experiment
      ? {
          ...selected.content,
          hypothesis: experiment.hypothesis,
          dataset: experiment.dataset,
          intendedDesign: experiment.type,
        }
      : null;
  const comparison =
    selected && currentContent
      ? comparePreregistration(selected.content, currentContent)
      : [];

  if (!experiment) {
    return (
      <EmptyState
        title="Select an experiment"
        description="Choose an experiment row before creating a preregistration."
        icon={<FileLock2 size={24} />}
      />
    );
  }

  const beginSnapshot = (parent: PreregistrationSnapshot | null) => {
    setDraft(
      parent
        ? {
            ...parent.content,
            primaryMetrics: [...parent.content.primaryMetrics],
          }
        : createPreregistrationTemplate(experiment),
    );
    setEditorParentId(parent?.id ?? null);
    setEditorOpen(true);
  };

  const saveSnapshot = async () => {
    if (!draft) return;
    const normalizedDraft = {
      ...draft,
      primaryMetrics: draft.primaryMetrics
        .map((metric) => metric.trim())
        .filter(Boolean),
    };
    const snapshot = await createSnapshot(
      experiment.id,
      normalizedDraft,
      editorParentId,
    );
    if (!snapshot) return;
    setSelectedSnapshotId(snapshot.id);
    setEditorOpen(false);
    notify(
      editorParentId ? "Amendment saved" : "Preregistration saved",
      `Version ${snapshot.version} is locked with provenance.`,
    );
  };

  const openDeviation = (
    path: AnalysisDeviation["fieldPath"] = "/analysisPlan",
    value?: string | string[],
  ) => {
    setFieldPath(path);
    setAfterValue(value === undefined ? "" : valueText(value));
    setRationale("");
    setDeviationOpen(true);
  };

  const saveDeviation = async () => {
    if (!selected) return;
    const deviation = await declareDeviation(selected.id, {
      fieldPath,
      afterValue:
        fieldPath === "/primaryMetrics"
          ? afterValue
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
          : afterValue,
      rationale,
    });
    if (!deviation) return;
    setDeviationOpen(false);
    setComparisonOpen(false);
    notify(
      deviation.declarationTiming === "retrospective"
        ? "Retrospective deviation recorded"
        : "Pre-evaluation deviation recorded",
      "The original snapshot remains unchanged.",
    );
  };

  return (
    <div
      className="cly-prereg-workspace"
      data-testid="preregistration-workspace"
    >
      <aside
        className="cly-prereg-versions"
        aria-label="Preregistration versions"
      >
        <div className="cly-prereg-section-header">
          <div>
            <strong>Snapshots</strong>
            <span>{experiment.name}</span>
          </div>
        </div>
        {experimentSnapshots.length === 0 ? (
          <div className="cly-prereg-empty">
            <FileLock2 size={24} aria-hidden="true" />
            <strong>No snapshot</strong>
            <span>Use the concise template to lock the analysis intent.</span>
          </div>
        ) : (
          <div className="cly-prereg-version-list">
            {experimentSnapshots.map((snapshot) => (
              <button
                key={snapshot.id}
                type="button"
                className="cly-prereg-version-row"
                aria-pressed={selected?.id === snapshot.id}
                onClick={() => setSelectedSnapshotId(snapshot.id)}
              >
                <span>
                  <strong>Version {snapshot.version}</strong>
                  <small>{new Date(snapshot.createdAt).toLocaleString()}</small>
                </span>
                <Badge tone={snapshot.finalEvaluation ? "success" : "neutral"}>
                  {snapshot.finalEvaluation ? "Evaluated" : "Locked"}
                </Badge>
              </button>
            ))}
          </div>
        )}
      </aside>

      <section
        className="cly-prereg-detail"
        aria-label="Preregistration detail"
      >
        {selected ? (
          <>
            <div className="cly-prereg-section-header">
              <div>
                <span className="cly-page-kicker">Immutable snapshot</span>
                <h2>Version {selected.version}</h2>
                <span className="cly-mono">
                  {selected.contentHash.slice(0, 12)}
                </span>
              </div>
              <div className="cly-row">
                <Button onClick={() => setComparisonOpen((open) => !open)}>
                  <GitCompareArrows size={13} /> Compare current
                </Button>
                {selected.id === latest?.id ? (
                  <Button onClick={() => beginSnapshot(latest)}>
                    <FileDiff size={13} /> Amend
                  </Button>
                ) : null}
                {!selected.finalEvaluation ? (
                  <Button onClick={() => setEvaluationOpen(true)}>
                    <Check size={13} /> Record evaluation
                  </Button>
                ) : null}
              </div>
            </div>

            {comparisonOpen ? (
              <div className="cly-prereg-comparison" role="status">
                <GitCompareArrows size={16} aria-hidden="true" />
                <div>
                  <strong>
                    {comparison.length === 0
                      ? "Current experiment matches"
                      : `${comparison.length} current-state ${comparison.length === 1 ? "difference" : "differences"}`}
                  </strong>
                  <span>
                    Cly can compare hypothesis, dataset, and design from the
                    current experiment record.
                  </span>
                </div>
                {comparison[0] ? (
                  <Button
                    onClick={() =>
                      openDeviation(
                        comparison[0].fieldPath,
                        comparison[0].afterValue,
                      )
                    }
                  >
                    Declare first difference
                  </Button>
                ) : null}
              </div>
            ) : null}

            <SnapshotContent snapshot={selected} />

            <div className="cly-prereg-deviations">
              <div className="cly-prereg-section-header">
                <div>
                  <h3>Analysis deviations</h3>
                  <span>Declared changes never rewrite the snapshot.</span>
                </div>
                <Button onClick={() => openDeviation()}>
                  <Plus size={13} /> Declare deviation
                </Button>
              </div>
              {selected.deviations.length === 0 ? (
                <p className="cly-muted cly-small">No deviations declared.</p>
              ) : (
                <div className="cly-prereg-deviation-list">
                  {selected.deviations.map((deviation) => (
                    <article
                      key={deviation.id}
                      className="cly-prereg-deviation"
                    >
                      <div>
                        {deviation.declarationTiming === "retrospective" ? (
                          <TriangleAlert size={14} aria-hidden="true" />
                        ) : (
                          <Clock3 size={14} aria-hidden="true" />
                        )}
                        <span>
                          <strong>{fieldLabels[deviation.fieldPath]}</strong>
                          <small>{deviation.rationale}</small>
                        </span>
                      </div>
                      <Badge
                        tone={
                          deviation.declarationTiming === "retrospective"
                            ? "warning"
                            : "success"
                        }
                      >
                        {deviation.declarationTiming === "retrospective"
                          ? "Retrospective"
                          : "Pre-evaluation"}
                      </Badge>
                      {deviation.acknowledgement ? (
                        <span className="cly-small cly-muted">
                          Acknowledged by {deviation.acknowledgement.actorId}
                        </span>
                      ) : (
                        <Button
                          onClick={() =>
                            void acknowledgeDeviation(deviation.id)
                          }
                          disabled={loading}
                        >
                          Acknowledge
                        </Button>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <EmptyState
            title="Lock the analysis intent"
            description="Create a concise, immutable snapshot before evaluating results."
            action={
              <Button variant="primary" onClick={() => beginSnapshot(null)}>
                Create snapshot
              </Button>
            }
            icon={<FileLock2 size={24} />}
          />
        )}
      </section>

      <Dialog
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={
          editorParentId ? "Amend preregistration" : "Preregister analysis"
        }
        description={
          editorParentId
            ? "Save a new linked version. The prior snapshot stays unchanged."
            : "Review the concise template, then lock it with provenance."
        }
        wide
        footer={
          <>
            <Button onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => void saveSnapshot()}
              disabled={
                loading ||
                !draft ||
                Object.values(draft).some((value) =>
                  Array.isArray(value)
                    ? value.length === 0 || value.some((item) => !item.trim())
                    : !value.trim(),
                )
              }
            >
              {editorParentId ? "Save amendment" : "Lock snapshot"}
            </Button>
          </>
        }
      >
        {draft ? <SnapshotEditor content={draft} onChange={setDraft} /> : null}
      </Dialog>

      <Dialog
        open={evaluationOpen}
        onClose={() => setEvaluationOpen(false)}
        title="Record final evaluation"
        description="Deviations declared after this point are marked retrospective."
        footer={
          <>
            <Button onClick={() => setEvaluationOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={loading}
              onClick={async () => {
                if (!selected) return;
                const snapshot = await markEvaluated(selected.id);
                if (!snapshot) return;
                setEvaluationOpen(false);
                notify(
                  "Final evaluation recorded",
                  "Future deviations will be marked retrospective.",
                );
              }}
            >
              Record evaluation
            </Button>
          </>
        }
      >
        <div className="cly-callout" data-tone="warning">
          <TriangleAlert size={14} aria-hidden="true" />
          This timestamp is append-only and cannot be removed.
        </div>
      </Dialog>

      <Dialog
        open={deviationOpen}
        onClose={() => setDeviationOpen(false)}
        title="Declare analysis deviation"
        description={
          selected?.finalEvaluation
            ? "This will be recorded as retrospective."
            : "This will be recorded before final evaluation."
        }
        footer={
          <>
            <Button onClick={() => setDeviationOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={loading || !afterValue.trim() || !rationale.trim()}
              onClick={() => void saveDeviation()}
            >
              Record deviation
            </Button>
          </>
        }
      >
        <div className="cly-stack">
          <div className="cly-field">
            <label htmlFor="deviation-field">Field</label>
            <select
              id="deviation-field"
              className="cly-select"
              value={fieldPath}
              onChange={(event) => {
                const next = event.target
                  .value as AnalysisDeviation["fieldPath"];
                setFieldPath(next);
                setAfterValue("");
              }}
            >
              {fieldEntries.map(([path, label]) => (
                <option value={path} key={path}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="cly-prereg-before">
            <span>Preregistered value</span>
            <p>
              {selected
                ? valueText(
                    selected.content[
                      fieldPath.slice(1) as keyof PreregistrationContent
                    ],
                  )
                : ""}
            </p>
          </div>
          <div className="cly-field">
            <label htmlFor="deviation-after">New value</label>
            <textarea
              id="deviation-after"
              className="cly-textarea"
              value={afterValue}
              onChange={(event) => setAfterValue(event.target.value)}
              placeholder={
                fieldPath === "/primaryMetrics"
                  ? "Comma-separated metrics"
                  : undefined
              }
            />
          </div>
          <div className="cly-field">
            <label htmlFor="deviation-rationale">Rationale</label>
            <textarea
              id="deviation-rationale"
              className="cly-textarea"
              value={rationale}
              onChange={(event) => setRationale(event.target.value)}
              placeholder="Why was this change necessary?"
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
