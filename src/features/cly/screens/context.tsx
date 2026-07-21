import {
  AlertTriangle,
  ArchiveRestore,
  CheckCircle2,
  Eye,
  FileText,
  Lock,
  Pin,
  PinOff,
  ShieldAlert,
  Trash2,
  Unlock,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Panel,
} from "../components/primitives";
import type {
  AgentContextItem,
  ContextManifestPreview,
  ContextOriginClass,
  ContextTransmissionApproval,
  PersistedContextManifest,
} from "../domain/agent-context";
import { projectServices } from "../services/project-services";
import { useClyStore } from "../store/cly-store";

const actor = {
  actorId: "local-user",
  producerProcess: "cly-renderer",
  producerModel: null,
};

const originLabels: Record<ContextOriginClass, string> = {
  approved_fact: "Approved project memory",
  inferred_fact: "Inferred proposals",
  source_passage: "Source passages",
  file: "Project files",
  conversation: "Conversations",
  graph_object: "Research graph objects",
};

const originOrder = Object.keys(originLabels) as ContextOriginClass[];
const emptyAgentConfigurations = [] as const;

const describeTime = (value: string | null) =>
  value ? new Date(value).toLocaleString() : "Not checked";

const firstRevision = (item: AgentContextItem) =>
  item.approvedRevision ?? item.proposedRevisions[0] ?? null;

export function ContextScreen() {
  const projectId = useClyStore((state) => state.activeProjectId);
  const snapshot = useClyStore((state) => state.agentContext);
  const snapshotProjectId = useClyStore((state) => state.agentContextProjectId);
  const contextLoading = useClyStore((state) => state.agentContextLoading);
  const contextHydrationError = useClyStore((state) => state.agentContextError);
  const retryHydration = useClyStore((state) => state.loadFromApi);
  const legacyItems = useClyStore((state) => state.data.contextItems);
  const fixtureMode = useClyStore((state) => state.fixtureMode);
  const updateLegacyItem = useClyStore((state) => state.updateContextItem);
  const configurations = useClyStore(
    (state) => state.data.agentConfigurations ?? emptyAgentConfigurations,
  );
  const notify = useClyStore((state) => state.notify);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    () =>
      new Set(snapshot.packs[0]?.entries.map((entry) => entry.itemId) ?? []),
  );
  const [selectedPackId, setSelectedPackId] = useState<string | null>(
    () => snapshot.packs[0]?.id ?? null,
  );
  const [selectionProjectId, setSelectionProjectId] = useState<string | null>(
    snapshotProjectId,
  );
  const [preview, setPreview] = useState<ContextManifestPreview | null>(null);
  const [approval, setApproval] = useState<ContextTransmissionApproval | null>(
    null,
  );
  const [persistedManifest, setPersistedManifest] =
    useState<PersistedContextManifest | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [purpose, setPurpose] = useState("research-assistance");
  const [collaborators, setCollaborators] = useState("");
  const [residency, setResidency] = useState("");
  const [license, setLicense] = useState("");
  const [approvalRationale, setApprovalRationale] = useState("");
  const [approvalExpiresAt, setApprovalExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestGeneration = useRef(0);

  useEffect(
    () => () => {
      requestGeneration.current += 1;
    },
    [],
  );

  useEffect(() => {
    if (
      snapshotProjectId !== projectId ||
      selectionProjectId === snapshotProjectId
    )
      return;
    const pack = snapshot.packs[0] ?? null;
    setSelectedItemIds(
      new Set(pack?.entries.map((entry) => entry.itemId) ?? []),
    );
    setSelectedPackId(pack?.id ?? null);
    setPreview(null);
    setApproval(null);
    setPersistedManifest(null);
    setIdempotencyKey(null);
    setError(null);
    setSelectionProjectId(snapshotProjectId);
  }, [projectId, selectionProjectId, snapshot.packs, snapshotProjectId]);

  const selectedPack =
    snapshot.packs.find((pack) => pack.id === selectedPackId) ??
    snapshot.packs[0] ??
    null;
  const configuration =
    configurations.find(
      (candidate) => candidate.id === selectedPack?.configurationId,
    ) ?? configurations[0];
  const role =
    configuration?.roles.find(
      (candidate) => candidate.id === selectedPack?.roleId,
    ) ?? configuration?.roles[0];

  const manifestRequest =
    selectedPack && configuration && role
      ? {
          packId: selectedPack.id,
          configurationId: configuration.id,
          roleId: role.id,
          provider: role.provider,
          model: role.model,
          purpose,
          collaborators: collaborators
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          residency: residency.trim() || null,
          license: license.trim() || null,
        }
      : null;
  const manifestScopeKey = JSON.stringify([
    projectId,
    snapshotProjectId,
    manifestRequest,
    selectedPack?.revision,
    configuration?.revision,
  ]);

  useEffect(() => {
    void manifestScopeKey;
    requestGeneration.current += 1;
    setPreview(null);
    setApproval(null);
    setPersistedManifest(null);
    setIdempotencyKey(null);
    setBusy(false);
    setError(null);
  }, [manifestScopeKey]);

  const groups = useMemo(() => {
    const result = new Map<ContextOriginClass, AgentContextItem[]>();
    for (const origin of originOrder) result.set(origin, []);
    for (const item of snapshot.items) {
      const revision = firstRevision(item);
      if (revision) result.get(revision.originClass)?.push(item);
    }
    return result;
  }, [snapshot.items]);

  const perform = async (
    operation: () => Promise<unknown>,
    success: string,
  ) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
      notify(success);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Context update failed.";
      setError(message);
      notify("Context update failed", message);
    } finally {
      setBusy(false);
    }
  };

  const lifecycle = (
    item: AgentContextItem,
    action: "pin" | "unpin" | "lock" | "unlock" | "delete" | "restore",
  ) =>
    perform(
      () =>
        projectServices.context.setLifecycle(
          projectId,
          item.id,
          action,
          item.version,
          actor,
        ),
      `Context ${action} recorded`,
    );

  const markOutdated = (item: AgentContextItem) => {
    const approvedRevision = item.approvedRevision;
    if (!approvedRevision) return Promise.resolve();
    return perform(async () => {
      const existingRevisionIds = new Set(
        item.revisions.map((revision) => revision.id),
      );
      const proposed = await projectServices.context.proposeRevision(
        projectId,
        item.id,
        item.version,
        {
          originClass: approvedRevision.originClass,
          referenceId: approvedRevision.referenceId,
          content: approvedRevision.content,
          confidence: approvedRevision.confidence,
          evidenceRefs: approvedRevision.evidenceRefs,
          lastCheckedAt: approvedRevision.lastCheckedAt,
          producerProcess: actor.producerProcess,
          producerModel: actor.producerModel,
          verificationState: "stale",
          sensitivity: approvedRevision.sensitivity,
        },
        actor,
      );
      const staleRevision = proposed.revisions.find(
        (revision) =>
          !existingRevisionIds.has(revision.id) &&
          revision.verificationState === "stale",
      );
      if (!staleRevision)
        throw new Error("The outdated revision could not be identified.");
      await projectServices.context.approveRevision(
        projectId,
        item.id,
        staleRevision.id,
        proposed.version,
        actor,
      );
    }, "Context marked outdated");
  };

  const savePack = async () => {
    if (!configuration || !role) {
      setError(
        "Create an agent configuration and role before saving a context pack.",
      );
      return;
    }
    const entries = snapshot.items
      .filter((item) => selectedItemIds.has(item.id) && item.approvedRevision)
      .map((item) => {
        const approvedRevision = item.approvedRevision;
        if (!approvedRevision)
          throw new Error(
            "Only approved revisions can be saved in a context pack.",
          );
        const current = selectedPack?.entries.find(
          (entry) => entry.itemId === item.id,
        );
        return {
          itemId: item.id,
          revisionId: approvedRevision.id,
          representation: current?.representation ?? ("raw" as const),
          selectionReason:
            current?.selectionReason ?? "Selected in Context Composer",
          sensitivity: approvedRevision.sensitivity,
        };
      });
    await perform(
      () =>
        projectServices.context.savePack(projectId, {
          ...(selectedPack
            ? { id: selectedPack.id, expectedRevision: selectedPack.revision }
            : {}),
          name: selectedPack?.name ?? "Primary context pack",
          configurationId: configuration.id,
          roleId: role.id,
          entries,
          actor,
        }),
      "Exact context pack saved",
    );
  };

  const previewManifest = async () => {
    if (!manifestRequest) {
      setError("Save a context pack before previewing provider transmission.");
      return;
    }
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    setPreview(null);
    setApproval(null);
    setPersistedManifest(null);
    setIdempotencyKey(null);
    setBusy(true);
    setError(null);
    try {
      const next = await projectServices.context.preview(
        projectId,
        manifestRequest,
      );
      if (requestGeneration.current !== generation) return;
      setPreview(next);
      setApproval(null);
      setPersistedManifest(null);
      setIdempotencyKey(`context-${globalThis.crypto.randomUUID()}`);
    } catch (caught) {
      if (requestGeneration.current !== generation) return;
      setError(caught instanceof Error ? caught.message : "Preview failed.");
    } finally {
      if (requestGeneration.current === generation) setBusy(false);
    }
  };

  const createApproval = async () => {
    if (!preview || !role || preview.restrictedReferenceIds.length === 0)
      return;
    if (!approvalRationale.trim()) {
      setError("Enter a rationale before approving restricted transmission.");
      return;
    }
    const generation = requestGeneration.current;
    const previewSha256 = preview.sha256;
    setBusy(true);
    setError(null);
    try {
      const next = await projectServices.context.createTransmissionApproval(
        projectId,
        {
          manifestSha256: preview.sha256,
          provider: role.provider,
          model: role.model,
          restrictedReferenceIds: preview.restrictedReferenceIds,
          actorId: actor.actorId,
          rationale: approvalRationale.trim(),
          expiresAt: approvalExpiresAt
            ? new Date(approvalExpiresAt).toISOString()
            : null,
        },
      );
      if (
        requestGeneration.current !== generation ||
        next.manifestSha256 !== previewSha256
      )
        return;
      setApproval(next);
      notify(
        "Restricted transmission approved",
        "Approval is bound to this exact preview hash.",
      );
    } catch (caught) {
      if (requestGeneration.current !== generation) return;
      setError(
        caught instanceof Error
          ? caught.message
          : "Approval could not be recorded.",
      );
    } finally {
      if (requestGeneration.current === generation) setBusy(false);
    }
  };

  const persistPreview = async () => {
    if (!preview || !manifestRequest || !idempotencyKey) return;
    const restricted = preview.restrictedReferenceIds.length > 0;
    if (restricted && approval?.state !== "approved") {
      setError(
        "Restricted context requires an exact live approval before persistence.",
      );
      return;
    }
    const generation = requestGeneration.current;
    const previewSha256 = preview.sha256;
    setBusy(true);
    setError(null);
    try {
      const manifest = await projectServices.context.persist(projectId, {
        ...manifestRequest,
        idempotencyKey,
        expectedSha256: preview.sha256,
        transmissionApprovalId: approval?.id ?? null,
      });
      if (
        requestGeneration.current !== generation ||
        manifest.sha256 !== previewSha256
      )
        return;
      setPersistedManifest(manifest);
      notify("Immutable context manifest persisted", manifest.sha256);
    } catch (caught) {
      if (requestGeneration.current !== generation) return;
      setError(
        caught instanceof Error
          ? caught.message
          : "Manifest persistence failed.",
      );
    } finally {
      if (requestGeneration.current === generation) setBusy(false);
    }
  };

  const revokeApproval = async () => {
    const approvalId =
      approval?.id ?? persistedManifest?.transmissionApprovalId ?? null;
    if (!approvalId) return;
    const generation = requestGeneration.current;
    setBusy(true);
    setError(null);
    try {
      await projectServices.context.revokeTransmissionApproval(
        projectId,
        approvalId,
        {
          actorId: actor.actorId,
          rationale: "Revoked from Context Composer",
        },
      );
      if (requestGeneration.current !== generation) return;
      setApproval((current) =>
        current ? { ...current, state: "revoked" } : current,
      );
      notify("Transmission approval revoked");
    } catch (caught) {
      if (requestGeneration.current !== generation) return;
      setError(
        caught instanceof Error
          ? caught.message
          : "Approval revocation failed.",
      );
    } finally {
      if (requestGeneration.current === generation) setBusy(false);
    }
  };

  return (
    <div className="cly-page cly-page-wide cly-route-context">
      <PageHeader
        kicker="Workspace"
        title="Context Composer"
        description="Review approved memory, proposals, exact revisions, and the byte-identical provider payload."
        actions={
          <>
            <Button
              disabled={
                busy || contextLoading || Boolean(contextHydrationError)
              }
              onClick={() => void previewManifest()}
            >
              <Eye size={15} /> Preview transmission
            </Button>
            <Button
              variant="primary"
              disabled={
                busy || contextLoading || Boolean(contextHydrationError)
              }
              onClick={() => void savePack()}
            >
              Save exact pack
            </Button>
          </>
        }
      />

      {error ? (
        <div className="cly-inline-alert" role="alert">
          <AlertTriangle size={16} /> {error}
        </div>
      ) : null}

      {contextLoading ? (
        <Panel>
          <div className="cly-inline-alert" role="status" aria-live="polite">
            Loading durable project context…
          </div>
        </Panel>
      ) : contextHydrationError ? (
        <Panel>
          <div className="cly-inline-alert" role="alert">
            <AlertTriangle size={16} />
            <span>
              <strong>Durable context could not load</strong>
              <br />
              {contextHydrationError}
            </span>
          </div>
          <Button onClick={() => void retryHydration(projectId)}>
            Retry context loading
          </Button>
        </Panel>
      ) : snapshot.items.length === 0 && fixtureMode !== "empty" ? (
        <Panel>
          <h2 className="cly-section-heading">Demo context selection</h2>
          <p className="cly-muted">
            Fixture selections are local previews. Production projects use the
            durable revision controls shown in this workspace.
          </p>
          {legacyItems.map((item) => (
            <div className="cly-context-row" key={item.id}>
              <input
                type="checkbox"
                role="switch"
                aria-label={`${item.included ? "Exclude" : "Include"} ${item.name}`}
                aria-checked={item.included}
                checked={item.included}
                onChange={(event) =>
                  updateLegacyItem(item.id, { included: event.target.checked })
                }
              />
              <strong>{item.name}</strong>
              <span>{item.representation}</span>
              <span>{item.tokens.toLocaleString()}</span>
            </div>
          ))}
          <p>
            <strong>
              {legacyItems
                .filter((item) => item.included)
                .reduce((total, item) => total + item.tokens, 0)
                .toLocaleString()}{" "}
              tokens
            </strong>
          </p>
        </Panel>
      ) : snapshot.items.length === 0 ? (
        <EmptyState
          title="No durable context yet"
          description="Approved memory and inferred proposals created for this project will appear here without being merged together."
        />
      ) : (
        <div className="cly-context-durable-layout">
          <main aria-label="Project memory and context">
            {originOrder.map((origin) => {
              const items = groups.get(origin) ?? [];
              if (items.length === 0) return null;
              return (
                <section key={origin} aria-labelledby={`context-${origin}`}>
                  <h2 id={`context-${origin}`} className="cly-section-heading">
                    {originLabels[origin]} <Badge>{items.length}</Badge>
                  </h2>
                  <Panel>
                    {items.map((item) => {
                      const revision = firstRevision(item);
                      if (!revision) return null;
                      const proposalCount = item.proposedRevisions.length;
                      const selected = selectedItemIds.has(item.id);
                      const transmitted = snapshot.manifests.some((manifest) =>
                        manifest.entries.some(
                          (entry) => entry.itemId === item.id,
                        ),
                      );
                      return (
                        <article
                          className="cly-context-revision-card"
                          data-selected={selected}
                          key={item.id}
                        >
                          <div className="cly-context-revision-heading">
                            <label>
                              <input
                                type="checkbox"
                                checked={selected}
                                disabled={
                                  !item.approvedRevision ||
                                  Boolean(item.deletedAt)
                                }
                                onChange={(event) => {
                                  const next = new Set(selectedItemIds);
                                  if (event.target.checked) next.add(item.id);
                                  else next.delete(item.id);
                                  setSelectedItemIds(next);
                                }}
                              />
                              <strong>{item.label}</strong>
                            </label>
                            <div className="cly-cluster">
                              <Badge>{revision.verificationState}</Badge>
                              <Badge>{revision.sensitivity}</Badge>
                              {item.approvedRevision ? (
                                <Badge>
                                  <CheckCircle2 size={12} /> Approved r
                                  {item.approvedRevision.revision}
                                </Badge>
                              ) : (
                                <Badge>
                                  <ShieldAlert size={12} /> Proposal only
                                </Badge>
                              )}
                            </div>
                          </div>
                          <p>{revision.content}</p>
                          <dl className="cly-context-provenance-grid">
                            <div>
                              <dt>Origin</dt>
                              <dd>{originLabels[revision.originClass]}</dd>
                            </div>
                            <div>
                              <dt>Confidence</dt>
                              <dd>
                                {revision.confidence === null
                                  ? "Not scored"
                                  : `${Math.round(revision.confidence * 100)}%`}
                              </dd>
                            </div>
                            <div>
                              <dt>Last checked</dt>
                              <dd>{describeTime(revision.lastCheckedAt)}</dd>
                            </div>
                            <div>
                              <dt>Producer</dt>
                              <dd>
                                {revision.producerProcess}
                                {revision.producerModel
                                  ? ` · ${revision.producerModel}`
                                  : ""}
                              </dd>
                            </div>
                            <div>
                              <dt>Evidence</dt>
                              <dd>
                                {revision.evidenceRefs.length
                                  ? revision.evidenceRefs.join(", ")
                                  : "No linked evidence"}
                              </dd>
                            </div>
                            <div>
                              <dt>Transmission</dt>
                              <dd>
                                {revision.sensitivity === "local_only"
                                  ? "Excluded by construction"
                                  : transmitted
                                    ? "Persisted in immutable manifest"
                                    : "Not transmitted"}
                              </dd>
                            </div>
                          </dl>
                          {proposalCount > 0 && item.approvedRevision ? (
                            <div className="cly-context-proposals">
                              <strong>
                                {proposalCount} proposal
                                {proposalCount === 1 ? "" : "s"} retained
                                separately
                              </strong>
                              {item.proposedRevisions.map((proposal) => (
                                <div key={proposal.id}>
                                  <span>
                                    {proposal.content}{" "}
                                    <Badge>{proposal.verificationState}</Badge>
                                    <small>
                                      {proposal.producerProcess}
                                      {proposal.producerModel
                                        ? ` · ${proposal.producerModel}`
                                        : ""}
                                    </small>
                                  </span>
                                  <Button
                                    disabled={
                                      busy ||
                                      item.locked ||
                                      Boolean(item.deletedAt)
                                    }
                                    onClick={() =>
                                      void perform(
                                        () =>
                                          projectServices.context.approveRevision(
                                            projectId,
                                            item.id,
                                            proposal.id,
                                            item.version,
                                            actor,
                                          ),
                                        "Proposal approved as a new pointer",
                                      )
                                    }
                                  >
                                    Approve r{proposal.revision}
                                  </Button>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {item.previouslyApprovedRevisions.length > 0 ? (
                            <div className="cly-context-proposals">
                              <strong>Previously approved history</strong>
                              {item.previouslyApprovedRevisions.map(
                                (historical) => (
                                  <div key={historical.id}>
                                    <span>
                                      {historical.content}{" "}
                                      <Badge>
                                        Previously approved r
                                        {historical.revision}
                                      </Badge>
                                      <small>
                                        Immutable approval history ·{" "}
                                        {historical.producerProcess}
                                      </small>
                                    </span>
                                    <Button
                                      disabled={
                                        busy ||
                                        item.locked ||
                                        Boolean(item.deletedAt)
                                      }
                                      onClick={() =>
                                        void perform(
                                          () =>
                                            projectServices.context.approveRevision(
                                              projectId,
                                              item.id,
                                              historical.id,
                                              item.version,
                                              actor,
                                            ),
                                          `Revision r${historical.revision} restored`,
                                        )
                                      }
                                    >
                                      Restore r{historical.revision}
                                    </Button>
                                  </div>
                                ),
                              )}
                            </div>
                          ) : null}
                          <fieldset
                            className="cly-context-lifecycle-actions"
                            aria-label={`Lifecycle controls for ${item.label}`}
                          >
                            <Button
                              disabled={
                                busy || item.locked || Boolean(item.deletedAt)
                              }
                              onClick={() =>
                                void lifecycle(
                                  item,
                                  item.pinned ? "unpin" : "pin",
                                )
                              }
                            >
                              {item.pinned ? (
                                <PinOff size={14} />
                              ) : (
                                <Pin size={14} />
                              )}
                              {item.pinned ? "Unpin" : "Pin"}
                            </Button>
                            <Button
                              disabled={busy || Boolean(item.deletedAt)}
                              onClick={() =>
                                void lifecycle(
                                  item,
                                  item.locked ? "unlock" : "lock",
                                )
                              }
                            >
                              {item.locked ? (
                                <Unlock size={14} />
                              ) : (
                                <Lock size={14} />
                              )}
                              {item.locked ? "Unlock" : "Lock"}
                            </Button>
                            <Button
                              disabled={
                                busy ||
                                item.locked ||
                                Boolean(item.deletedAt) ||
                                !item.approvedRevision ||
                                item.approvedRevision.verificationState ===
                                  "stale"
                              }
                              onClick={() => void markOutdated(item)}
                            >
                              <AlertTriangle size={14} />
                              Mark outdated
                            </Button>
                            <Button
                              disabled={busy || item.locked}
                              onClick={() =>
                                void lifecycle(
                                  item,
                                  item.deletedAt ? "restore" : "delete",
                                )
                              }
                            >
                              {item.deletedAt ? (
                                <ArchiveRestore size={14} />
                              ) : (
                                <Trash2 size={14} />
                              )}
                              {item.deletedAt ? "Restore" : "Delete"}
                            </Button>
                          </fieldset>
                        </article>
                      );
                    })}
                  </Panel>
                </section>
              );
            })}
          </main>

          <aside aria-label="Context pack and provider preview">
            <Panel>
              <h2 className="cly-section-heading">Transmission scope</h2>
              <label>
                Purpose
                <input
                  aria-label="Transmission purpose"
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value)}
                />
              </label>
              <label>
                Collaborators
                <input
                  aria-label="Transmission collaborators"
                  placeholder="Comma-separated identities"
                  value={collaborators}
                  onChange={(event) => setCollaborators(event.target.value)}
                />
              </label>
              <label>
                Residency
                <input
                  aria-label="Transmission residency"
                  placeholder="Optional"
                  value={residency}
                  onChange={(event) => setResidency(event.target.value)}
                />
              </label>
              <label>
                License
                <input
                  aria-label="Transmission license"
                  placeholder="Optional"
                  value={license}
                  onChange={(event) => setLicense(event.target.value)}
                />
              </label>
            </Panel>
            <Panel>
              <h2 className="cly-section-heading">
                <FileText size={16} /> Ordered context pack
              </h2>
              {selectedPack ? (
                <>
                  <p>
                    <strong>{selectedPack.name}</strong>
                  </p>
                  <p className="cly-muted">
                    Policy: {selectedPack.configurationId} /{" "}
                    {selectedPack.roleId}
                  </p>
                  <ol>
                    {selectedPack.entries.map((entry) => (
                      <li key={entry.revisionId}>
                        <strong>{entry.referenceId}</strong>
                        <div>{entry.selectionReason}</div>
                        <small>
                          {entry.representation} · exact revision{" "}
                          {entry.revisionId}
                        </small>
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <p className="cly-muted">
                  Select approved revisions, then save a pack.
                </p>
              )}
            </Panel>
            {preview ? (
              <Panel>
                <h2 className="cly-section-heading">Provider transmission</h2>
                <dl className="cly-context-preview-summary">
                  <div>
                    <dt>Destination</dt>
                    <dd>
                      {role?.provider} / {role?.model}
                    </dd>
                  </div>
                  <div>
                    <dt>Selected</dt>
                    <dd>{preview.entries.length} revisions</dd>
                  </div>
                  <div>
                    <dt>Server estimate</dt>
                    <dd>{preview.totalTokens.toLocaleString()} tokens</dd>
                  </div>
                  <div>
                    <dt>SHA-256</dt>
                    <dd>
                      <code>{preview.sha256}</code>
                    </dd>
                  </div>
                </dl>
                {preview.privacyWarnings.map((warning) => (
                  <div
                    className="cly-inline-alert"
                    role="status"
                    key={`${warning.code}-${warning.referenceIds.join("-")}`}
                  >
                    <ShieldAlert size={15} />{" "}
                    <span>
                      <strong>{warning.code}</strong>
                      <br />
                      {warning.message}
                    </span>
                  </div>
                ))}
                {preview.excluded.length ? (
                  <details>
                    <summary>{preview.excluded.length} excluded</summary>
                    <ul>
                      {preview.excluded.map((entry) => (
                        <li key={`${entry.referenceId}-${entry.reason}`}>
                          <strong>{entry.referenceId}</strong>: {entry.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                <details>
                  <summary>Canonical payload sent byte-for-byte</summary>
                  <pre className="cly-context-canonical-preview">
                    {preview.canonicalPayload}
                  </pre>
                </details>
                {preview.restrictedReferenceIds.length > 0 ? (
                  <fieldset
                    className="cly-context-lifecycle-actions"
                    aria-label="Restricted transmission approval"
                  >
                    <legend>Restricted transmission approval</legend>
                    <label>
                      Rationale
                      <textarea
                        aria-label="Restricted approval rationale"
                        value={approvalRationale}
                        onChange={(event) =>
                          setApprovalRationale(event.target.value)
                        }
                      />
                    </label>
                    <label>
                      Optional expiry
                      <input
                        aria-label="Restricted approval expiry"
                        type="datetime-local"
                        value={approvalExpiresAt}
                        onChange={(event) =>
                          setApprovalExpiresAt(event.target.value)
                        }
                      />
                    </label>
                    <Button
                      disabled={busy || approval?.state === "approved"}
                      onClick={() => void createApproval()}
                    >
                      Approve exact restricted preview
                    </Button>
                    {approval ? (
                      <p role="status">
                        Approval {approval.id}: {approval.state}
                      </p>
                    ) : null}
                  </fieldset>
                ) : null}
                <div className="cly-context-lifecycle-actions">
                  <Button
                    variant="primary"
                    disabled={
                      busy ||
                      (preview.restrictedReferenceIds.length > 0 &&
                        approval?.state !== "approved")
                    }
                    onClick={() => void persistPreview()}
                  >
                    Persist immutable manifest
                  </Button>
                  {approval?.state === "approved" ||
                  persistedManifest?.transmissionApprovalId ? (
                    <Button
                      disabled={busy}
                      onClick={() => void revokeApproval()}
                    >
                      Revoke transmission approval
                    </Button>
                  ) : null}
                </div>
                {persistedManifest ? (
                  <p role="status">
                    Manifest {persistedManifest.id} persisted with SHA-256{" "}
                    <code>{persistedManifest.sha256}</code>.
                  </p>
                ) : null}
              </Panel>
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}
