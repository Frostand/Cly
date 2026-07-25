import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Scale,
  Send,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  DisclosureRow,
  InlineMetadata,
  PaneHeader,
} from "../components/design-system";
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  LoadingState,
  Metric,
  PageHeader,
  Panel,
  Section,
} from "../components/primitives";
import { ClySplitPane } from "../components/toolkit";
import {
  type DatasetObligation,
  type DatasetObligationInput,
  OBLIGATION_DISCLAIMER,
  type ObligationAlert,
  type ObligationEvaluation,
  type ObligationOperation,
} from "../domain/obligations";
import { useClyStore } from "../store/cly-store";

const emptyInput: DatasetObligationInput = {
  consentProtocolScope: "",
  approvedPurposes: [],
  permittedCollaborators: [],
  externalProcessing: "review",
  permittedProviders: [],
  residency: [],
  retentionExpiresAt: null,
  deletionDueAt: null,
  license: "",
  owner: "",
  reviewDate: null,
  provenanceSource: "",
  notes: "",
  actorId: "local-user",
};

const fromObligation = (
  obligation: DatasetObligation | undefined,
): DatasetObligationInput =>
  obligation
    ? {
        consentProtocolScope: obligation.consentProtocolScope,
        approvedPurposes: obligation.approvedPurposes,
        permittedCollaborators: obligation.permittedCollaborators,
        externalProcessing: obligation.externalProcessing,
        permittedProviders: obligation.permittedProviders,
        residency: obligation.residency,
        retentionExpiresAt: obligation.retentionExpiresAt,
        deletionDueAt: obligation.deletionDueAt,
        license: obligation.license,
        owner: obligation.owner,
        reviewDate: obligation.reviewDate,
        provenanceSource: obligation.provenanceSource,
        notes: obligation.notes,
        actorId: "local-user",
      }
    : emptyInput;

const csv = (values: string[]) => values.join(", ");
const parseCsv = (value: string) => [
  ...new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  ),
];
const dateValue = (value: string | null) => value?.slice(0, 10) ?? "";
const severityTone = (severity: ObligationAlert["severity"]) =>
  severity === "critical"
    ? "danger"
    : severity === "warning"
      ? "warning"
      : "info";

export function DataObligationsScreen() {
  const activeProjectId = useClyStore((state) => state.activeProjectId);
  const sources = useClyStore((state) => state.data.sources);
  const graphNodes = useClyStore((state) => state.data.graphNodes);
  const obligations = useClyStore((state) => state.datasetObligations);
  const alerts = useClyStore((state) => state.obligationAlerts);
  const loading = useClyStore((state) => state.obligationsLoading);
  const error = useClyStore((state) => state.obligationsError);
  const load = useClyStore((state) => state.loadObligations);
  const save = useClyStore((state) => state.saveDatasetObligation);
  const evaluate = useClyStore((state) => state.evaluateObligations);
  const approve = useClyStore((state) => state.approveObligationOperation);
  const transitionAlert = useClyStore(
    (state) => state.transitionObligationAlert,
  );
  const setScreen = useClyStore((state) => state.setScreen);
  const notify = useClyStore((state) => state.notify);
  const datasetIds = new Set(obligations.map((item) => item.datasetObjectId));
  const datasets = sources.filter(
    (source) => source.type === "Dataset" || datasetIds.has(source.id),
  );
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(
    () => datasets[0]?.id ?? null,
  );
  const selectedObligation = obligations.find(
    (item) => item.datasetObjectId === selectedDatasetId,
  );
  const [form, setForm] = useState<DatasetObligationInput>(() =>
    fromObligation(selectedObligation),
  );
  const [transitioningAlert, setTransitioningAlert] =
    useState<ObligationAlert | null>(null);
  const [transitionNote, setTransitionNote] = useState("");
  const [provider, setProvider] = useState("openai");
  const [providerEvaluation, setProviderEvaluation] =
    useState<ObligationEvaluation | null>(null);
  const [approvalRationale, setApprovalRationale] = useState("");

  useEffect(() => {
    if (activeProjectId) void load(activeProjectId);
  }, [activeProjectId, load]);

  useEffect(() => {
    if (!selectedDatasetId && datasets[0]) {
      setSelectedDatasetId(datasets[0].id);
    }
  }, [datasets, selectedDatasetId]);

  useEffect(() => {
    setForm(fromObligation(selectedObligation));
  }, [selectedObligation]);

  const objectNames = useMemo(
    () => new Map(graphNodes.map((node) => [node.id, node.label])),
    [graphNodes],
  );
  const openAlerts = alerts.filter((alert) => alert.state === "open");
  const criticalCount = openAlerts.filter(
    (alert) => alert.severity === "critical",
  ).length;
  const update = <K extends keyof DatasetObligationInput>(
    key: K,
    value: DatasetObligationInput[K],
  ) => setForm((current) => ({ ...current, [key]: value }));

  const saveForm = async () => {
    if (!selectedDatasetId) return;
    const saved = await save(selectedDatasetId, form);
    if (saved) {
      notify(
        "Obligation saved",
        `Revision ${saved.revision} recorded with provenance.`,
      );
    }
  };

  const providerOperation: ObligationOperation = {
    kind: "provider-transmission",
    integration: "agent-chat",
    objectIds: [],
    purpose: "research-assistance",
    collaborators: [],
    provider,
    residency: null,
    license: null,
    external: true,
  };
  const evaluateProvider = async () => {
    setProviderEvaluation(await evaluate(providerOperation));
    setApprovalRationale("");
  };
  const approveProvider = async () => {
    const result = await approve(providerOperation, {
      actorId: "local-user",
      rationale: approvalRationale,
    });
    if (result) {
      setProviderEvaluation(result);
      notify(
        "Provider approval recorded",
        "The approval applies only to this evaluated operation and current obligation revisions.",
      );
    }
  };

  if (!activeProjectId) {
    return (
      <div className="cly-page cly-page-wide cly-route-obligations">
        <PageHeader
          kicker="Integrity"
          title="Research Data Obligations"
          description="Review dataset terms and inherited workflow restrictions."
        />
        <EmptyState
          icon={<Database size={24} />}
          title="Choose a research project first"
          description="Select a local project folder before reviewing dataset obligations."
          action={
            <Button onClick={() => setScreen("overview")}>Open overview</Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="cly-page cly-page-wide cly-route-obligations">
      <PageHeader
        kicker="Integrity"
        title="Research Data Obligations"
        description="Review dataset terms and inherited workflow restrictions."
        actions={
          <Button onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        }
      />
      <div className="cly-callout" data-tone="warning" role="note">
        <strong>{OBLIGATION_DISCLAIMER}</strong>
      </div>
      <div className="cly-metric-row">
        <Metric
          label="Datasets"
          value={datasets.length}
          detail="In this project"
        />
        <Metric
          label="Recorded obligations"
          value={obligations.length}
          detail="Durable and revisioned"
        />
        <Metric
          label="Open alerts"
          value={openAlerts.length}
          detail={`${criticalCount} critical`}
        />
      </div>
      {loading && obligations.length === 0 ? (
        <LoadingState label="Loading data obligations" />
      ) : error && datasets.length === 0 ? (
        <ErrorState description={error} onRetry={() => void load()} />
      ) : datasets.length === 0 ? (
        <EmptyState
          icon={<Database size={24} />}
          title="No datasets in this project"
          description="Import a source as a dataset before recording obligations."
          action={
            <Button onClick={() => setScreen("sources")}>Open sources</Button>
          }
        />
      ) : (
        <ClySplitPane
          id="data-obligations"
          className="cly-obligations-layout"
          secondarySize={62}
          primaryMin="280px"
          secondaryMin="520px"
          label="Resize datasets and obligation editor"
          primary={
            <Panel>
              <PaneHeader
                title="Datasets"
                detail="Select a dataset to review its terms."
              />
              <div className="cly-list">
                {datasets.map((dataset) => {
                  const obligation = obligations.find(
                    (item) => item.datasetObjectId === dataset.id,
                  );
                  return (
                    <button
                      type="button"
                      className="cly-list-row"
                      key={dataset.id}
                      data-selected={selectedDatasetId === dataset.id}
                      aria-pressed={selectedDatasetId === dataset.id}
                      onClick={() => setSelectedDatasetId(dataset.id)}
                    >
                      <span>
                        <span className="cly-list-title">{dataset.title}</span>
                        <span className="cly-list-detail">
                          {obligation
                            ? `${obligation.owner} · revision ${obligation.revision}`
                            : "No obligation recorded"}
                        </span>
                      </span>
                      <Badge tone={obligation ? "success" : "warning"}>
                        {obligation ? "Recorded" : "Missing"}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </Panel>
          }
          secondary={
            <Panel>
              <PaneHeader
                title={
                  datasets.find((item) => item.id === selectedDatasetId)
                    ?.title ?? "Dataset obligation"
                }
                detail={
                  selectedObligation
                    ? `Revision ${selectedObligation.revision} · updated by ${selectedObligation.updatedBy}`
                    : "Required fields are validated before saving."
                }
                actions={
                  <Button
                    variant="primary"
                    disabled={loading || !selectedDatasetId}
                    onClick={() => void saveForm()}
                  >
                    Save obligation
                  </Button>
                }
              />
              <div className="cly-panel-body cly-obligation-form">
                <div className="cly-field cly-field-wide">
                  <label htmlFor="obligation-scope">
                    Consent / protocol scope
                  </label>
                  <textarea
                    id="obligation-scope"
                    className="cly-textarea"
                    value={form.consentProtocolScope}
                    onChange={(event) =>
                      update("consentProtocolScope", event.target.value)
                    }
                    required
                  />
                </div>
                <TextField
                  id="obligation-purposes"
                  label="Approved purposes (comma-separated)"
                  value={csv(form.approvedPurposes)}
                  onChange={(value) =>
                    update("approvedPurposes", parseCsv(value))
                  }
                />
                <TextField
                  id="obligation-collaborators"
                  label="Permitted collaborators (comma-separated)"
                  value={csv(form.permittedCollaborators)}
                  onChange={(value) =>
                    update("permittedCollaborators", parseCsv(value))
                  }
                />
                <label className="cly-field" htmlFor="obligation-external">
                  <span>External processing</span>
                  <select
                    id="obligation-external"
                    className="cly-select"
                    value={form.externalProcessing}
                    onChange={(event) =>
                      update(
                        "externalProcessing",
                        event.target
                          .value as DatasetObligationInput["externalProcessing"],
                      )
                    }
                  >
                    <option value="allowed">Allowed</option>
                    <option value="review">Human review required</option>
                    <option value="blocked">Blocked</option>
                  </select>
                </label>
                <TextField
                  id="obligation-providers"
                  label="Permitted providers (comma-separated)"
                  value={csv(form.permittedProviders)}
                  onChange={(value) =>
                    update("permittedProviders", parseCsv(value))
                  }
                />
                <TextField
                  id="obligation-residency"
                  label="Residency locations (comma-separated)"
                  value={csv(form.residency)}
                  onChange={(value) => update("residency", parseCsv(value))}
                />
                <DateField
                  id="obligation-retention"
                  label="Retention ends"
                  value={form.retentionExpiresAt}
                  onChange={(value) => update("retentionExpiresAt", value)}
                />
                <DateField
                  id="obligation-deletion"
                  label="Deletion due"
                  value={form.deletionDueAt}
                  onChange={(value) => update("deletionDueAt", value)}
                />
                <TextField
                  id="obligation-license"
                  label="License / agreement"
                  value={form.license}
                  onChange={(value) => update("license", value)}
                  required
                />
                <TextField
                  id="obligation-owner"
                  label="Owner"
                  value={form.owner}
                  onChange={(value) => update("owner", value)}
                  required
                />
                <DateField
                  id="obligation-review"
                  label="Review date"
                  value={form.reviewDate}
                  onChange={(value) => update("reviewDate", value)}
                />
                <TextField
                  id="obligation-provenance"
                  label="Provenance / source"
                  value={form.provenanceSource}
                  onChange={(value) => update("provenanceSource", value)}
                  required
                />
                <div className="cly-field cly-field-wide">
                  <label htmlFor="obligation-notes">Notes</label>
                  <textarea
                    id="obligation-notes"
                    className="cly-textarea"
                    value={form.notes}
                    onChange={(event) => update("notes", event.target.value)}
                  />
                </div>
              </div>
            </Panel>
          }
        />
      )}

      <Section
        title="Obligation alerts"
        subtitle="Each alert identifies its source, affected objects, rationale, and required resolution."
      >
        {alerts.length === 0 ? (
          <div className="cly-callout">
            <CheckCircle2 size={14} aria-hidden="true" /> No obligation alerts.
          </div>
        ) : (
          <Panel>
            {alerts.map((alert) => (
              <DisclosureRow
                key={alert.id}
                title={alert.rationale}
                detail={alert.sourceDatasetTitle ?? "Evaluation safeguard"}
                tone={severityTone(alert.severity)}
                metadata={
                  <>
                    <Badge tone={severityTone(alert.severity)}>
                      {alert.severity}
                    </Badge>
                    <InlineMetadata>{alert.state}</InlineMetadata>
                  </>
                }
              >
                <div className="cly-stack">
                  <div>
                    <strong>Why</strong>
                    <p className="cly-muted">{alert.rationale}</p>
                  </div>
                  <div>
                    <strong>Resolution</strong>
                    <p className="cly-muted">{alert.resolution}</p>
                  </div>
                  <div>
                    <strong>Affected objects</strong>
                    <p className="cly-muted">
                      {alert.affectedObjectIds
                        .map((id) => objectNames.get(id) ?? id)
                        .join(", ") || "Project-wide operation"}
                    </p>
                  </div>
                  {alert.state === "open" ? (
                    <Button onClick={() => setTransitioningAlert(alert)}>
                      {alert.severity === "critical"
                        ? "Resolve"
                        : "Acknowledge"}
                    </Button>
                  ) : null}
                </div>
              </DisclosureRow>
            ))}
          </Panel>
        )}
      </Section>

      <Section
        title="Provider transmission check"
        subtitle="Test the same fail-closed evaluator used before agent content is sent."
      >
        <Panel>
          <div className="cly-panel-body cly-stack">
            <div className="cly-row">
              <label className="cly-field" htmlFor="provider-check">
                <span>Provider</span>
                <select
                  id="provider-check"
                  className="cly-select"
                  value={provider}
                  onChange={(event) => {
                    setProvider(event.target.value);
                    setProviderEvaluation(null);
                  }}
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="opencode">OpenCode</option>
                  <option value="cursor">Cursor</option>
                </select>
              </label>
              <Button onClick={() => void evaluateProvider()}>
                <Send size={13} /> Evaluate transmission
              </Button>
            </div>
            {providerEvaluation ? (
              <EvaluationResult evaluation={providerEvaluation} />
            ) : null}
            {providerEvaluation?.decision === "review" ? (
              <div className="cly-stack">
                <div className="cly-field">
                  <label htmlFor="provider-approval-rationale">
                    Approval rationale
                  </label>
                  <textarea
                    id="provider-approval-rationale"
                    className="cly-textarea"
                    value={approvalRationale}
                    onChange={(event) =>
                      setApprovalRationale(event.target.value)
                    }
                    placeholder="Record why this exact provider operation is acceptable."
                  />
                </div>
                <Button
                  variant="primary"
                  disabled={!approvalRationale.trim()}
                  onClick={() => void approveProvider()}
                >
                  Record approval
                </Button>
              </div>
            ) : null}
          </div>
        </Panel>
      </Section>

      <Dialog
        open={Boolean(transitioningAlert)}
        onClose={() => setTransitioningAlert(null)}
        title={
          transitioningAlert?.severity === "critical"
            ? "Resolve obligation conflict"
            : "Acknowledge obligation alert"
        }
        description="This action is recorded in project provenance. Acknowledgement does not override a hard conflict."
        footer={
          <>
            <Button onClick={() => setTransitioningAlert(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!transitionNote.trim()}
              onClick={async () => {
                if (!transitioningAlert) return;
                const updated = await transitionAlert(transitioningAlert.id, {
                  state:
                    transitioningAlert.severity === "critical"
                      ? "resolved"
                      : "acknowledged",
                  actorId: "local-user",
                  note: transitionNote,
                });
                if (updated) {
                  setTransitioningAlert(null);
                  setTransitionNote("");
                }
              }}
            >
              Record action
            </Button>
          </>
        }
      >
        <div className="cly-field">
          <label htmlFor="alert-transition-note">Rationale</label>
          <textarea
            id="alert-transition-note"
            className="cly-textarea"
            value={transitionNote}
            onChange={(event) => setTransitionNote(event.target.value)}
          />
        </div>
      </Dialog>
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  required = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <div className="cly-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="cly-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      />
    </div>
  );
}

function DateField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="cly-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="cly-input"
        type="date"
        value={dateValue(value)}
        onChange={(event) => onChange(event.target.value || null)}
      />
    </div>
  );
}

function EvaluationResult({
  evaluation,
}: {
  evaluation: ObligationEvaluation;
}) {
  const blocked = evaluation.decision === "block";
  const review = evaluation.decision === "review";
  return (
    <div
      className="cly-callout"
      data-tone={blocked ? "danger" : review ? "warning" : undefined}
      role="status"
    >
      <div className="cly-row">
        {blocked ? (
          <ShieldAlert size={15} aria-hidden="true" />
        ) : review ? (
          <AlertTriangle size={15} aria-hidden="true" />
        ) : (
          <Scale size={15} aria-hidden="true" />
        )}
        <strong>
          {blocked
            ? "Transmission blocked"
            : review
              ? "Human approval required"
              : evaluation.approval
                ? "Approved transmission"
                : "No conflicts found"}
        </strong>
      </div>
      {evaluation.alerts.map((alert) => (
        <p className="cly-small" key={alert.id}>
          {alert.rationale} {alert.resolution}
        </p>
      ))}
      {!evaluation.complete ? (
        <p className="cly-small">
          Evaluation was incomplete, so Cly defaulted to blocking the operation.
        </p>
      ) : null}
    </div>
  );
}
