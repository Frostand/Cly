import { Archive, GitBranch, Link2, Plus, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  PaneHeader,
  StatusIndicator,
  Toolbar,
} from "../components/design-system";
import {
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  LoadingState,
  Metric,
  PageHeader,
  SearchInput,
  toneForStatus,
} from "../components/primitives";
import { ClySplitPane } from "../components/toolkit";
import {
  PROJECT_LIFECYCLE_OBJECT_TYPES,
  type ProjectLifecycleObject,
  type ProjectLifecycleObjectType,
  type ProjectLifecycleStatus,
} from "../domain/research-bridge";
import { apiClient } from "../services/api-client";
import { useClyStore } from "../store/cly-store";

const lifecycleTypes = new Set<string>(PROJECT_LIFECYCLE_OBJECT_TYPES);
const statuses: ProjectLifecycleStatus[] = [
  "draft",
  "active",
  "blocked",
  "completed",
  "archived",
];

const isLifecycleObject = (
  object: NonNullable<
    ReturnType<typeof useClyStore.getState>["data"]["researchObjects"]
  >[number],
): object is ProjectLifecycleObject => lifecycleTypes.has(object.type);

const labelForType = (type: ProjectLifecycleObjectType) =>
  `${type.charAt(0).toUpperCase()}${type.slice(1)}`;

const statusOf = (object: ProjectLifecycleObject): ProjectLifecycleStatus =>
  statuses.includes(object.payload.status) ? object.payload.status : "draft";

type RetryableMutation = () => Promise<void>;

export function ObjectivesScreen() {
  const data = useClyStore((state) => state.data);
  const activeProjectId = useClyStore((state) => state.activeProjectId);
  const loading = useClyStore((state) => state.researchDataLoading);
  const loadError = useClyStore((state) => state.researchDataError);
  const fixtureMode = useClyStore((state) => state.fixtureMode);
  const loadFromApi = useClyStore((state) => state.loadFromApi);
  const objects = useMemo(
    () => (data.researchObjects ?? []).filter(isLifecycleObject),
    [data.researchObjects],
  );
  const relationships = data.researchRelationships ?? [];
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createType, setCreateType] =
    useState<ProjectLifecycleObjectType>("objective");
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState<ProjectLifecycleStatus>("draft");
  const [editOwner, setEditOwner] = useState("");
  const [linkTargetId, setLinkTargetId] = useState("");
  const [saving, setSaving] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [retryMutation, setRetryMutation] = useState<RetryableMutation | null>(
    null,
  );

  const visible = objects.filter((object) =>
    `${object.type} ${object.title} ${object.description}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const selected =
    objects.find((object) => object.id === selectedId) ?? objects[0] ?? null;
  const missingTypes = PROJECT_LIFECYCLE_OBJECT_TYPES.filter(
    (type) => !objects.some((object) => object.type === type),
  );
  const selectedLinks = selected
    ? relationships.filter(
        (relationship) =>
          relationship.fromObjectId === selected.id ||
          relationship.toObjectId === selected.id,
      )
    : [];

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  useEffect(() => {
    if (!selected) return;
    setEditTitle(selected.title);
    setEditDescription(selected.description);
    setEditStatus(statusOf(selected));
    setEditOwner(selected.payload.ownerId ?? "");
    setLinkTargetId(
      objects.find((object) => object.id !== selected.id)?.id ?? "",
    );
  }, [objects, selected]);

  const runMutation = async (mutation: RetryableMutation) => {
    setSaving(true);
    setMutationError(null);
    try {
      await mutation();
      setRetryMutation(null);
    } catch (cause) {
      setMutationError(
        cause instanceof Error
          ? cause.message
          : "Project record could not be saved.",
      );
      setRetryMutation(() => mutation);
    } finally {
      setSaving(false);
    }
  };

  const refresh = async () => {
    await loadFromApi(activeProjectId);
  };

  const createRecord = async () => {
    const type = createType;
    const title = createTitle.trim();
    const description = createDescription.trim();
    if (!title) return;
    await runMutation(async () => {
      const created = await apiClient.createObject(activeProjectId, {
        type,
        title,
        description,
        payload: {
          kind: type,
          status: "draft",
        } as ProjectLifecycleObject["payload"],
      });
      setDialogOpen(false);
      setCreateTitle("");
      setCreateDescription("");
      setSelectedId(created.id);
      await refresh();
    });
  };

  const saveSelected = async (status: ProjectLifecycleStatus = editStatus) => {
    if (!selected) return;
    const snapshot = selected;
    await runMutation(async () => {
      await apiClient.updateObject(activeProjectId, snapshot.id, {
        expectedVersion: snapshot.version,
        title: editTitle.trim(),
        description: editDescription.trim(),
        payload: {
          status,
          ownerId: editOwner.trim() || null,
        },
      });
      await refresh();
    });
  };

  const linkSelected = async () => {
    if (!selected || !linkTargetId) return;
    const sourceId = selected.id;
    const targetId = linkTargetId;
    await runMutation(async () => {
      await apiClient.createRelationship(activeProjectId, {
        fromObjectId: sourceId,
        toObjectId: targetId,
        type: "depends-on",
      });
      await refresh();
    });
  };

  if (fixtureMode === "empty" && loading && objects.length === 0) {
    return (
      <div className="cly-page cly-route-objectives">
        <LoadingState label="Loading project structure" />
      </div>
    );
  }

  if (fixtureMode === "empty" && loadError && objects.length === 0) {
    return (
      <div className="cly-page cly-route-objectives">
        <ErrorState
          title="Project structure could not be loaded"
          description={loadError}
          onRetry={() => void refresh()}
        />
      </div>
    );
  }

  return (
    <div className="cly-page cly-page-wide cly-route-objectives">
      <PageHeader
        kicker="Cly Research"
        title="Objectives"
        description="Manage the questions, objectives, hypotheses, methods, risks, work, people, and agents connected in this project graph."
        actions={
          <Button variant="primary" onClick={() => setDialogOpen(true)}>
            <Plus size={14} /> New record
          </Button>
        }
      />

      <div className="cly-metric-row">
        <Metric
          label="Active"
          value={objects.filter((item) => statusOf(item) === "active").length}
        />
        <Metric
          label="Blocked"
          value={objects.filter((item) => statusOf(item) === "blocked").length}
        />
        <Metric
          label="Versions"
          value={objects.reduce((sum, item) => sum + item.version, 0)}
        />
        <Metric label="Graph links" value={relationships.length} />
      </div>

      {mutationError ? (
        <div className="cly-lifecycle-error" role="alert">
          <span>{mutationError}</span>
          {retryMutation ? (
            <Button
              disabled={saving}
              onClick={() => void runMutation(retryMutation)}
            >
              <RefreshCw size={13} /> Try again
            </Button>
          ) : null}
        </div>
      ) : null}

      {objects.length === 0 ? (
        <EmptyState
          title="No structured project records yet"
          description="Start with the research question or objective. Every record remains project-scoped, versioned, and linkable in the graph."
          action={
            <Button variant="primary" onClick={() => setDialogOpen(true)}>
              <Plus size={14} /> Add the first record
            </Button>
          }
        />
      ) : (
        <>
          {missingTypes.length ? (
            <div className="cly-lifecycle-partial" role="status">
              <span>
                <strong>Project structure is partial</strong>
                {missingTypes.map(labelForType).join(", ")} not recorded yet.
              </span>
              <Button
                variant="ghost"
                onClick={() => {
                  setCreateType(missingTypes[0]);
                  setDialogOpen(true);
                }}
              >
                Add {labelForType(missingTypes[0]).toLowerCase()}
              </Button>
            </div>
          ) : null}
          <ClySplitPane
            id="project-lifecycle-workspace"
            className="cly-platform-split"
            secondarySize={40}
            primary={
              <div className="cly-platform-list-pane">
                <Toolbar label="Project structure controls">
                  <SearchInput
                    value={query}
                    onChange={setQuery}
                    placeholder="Search project records…"
                  />
                  <span className="cly-platform-count">
                    {visible.length} records
                  </span>
                </Toolbar>
                <div className="cly-objective-list">
                  {visible.map((object) => (
                    <button
                      type="button"
                      key={object.id}
                      className="cly-objective-row"
                      data-selected={object.id === selected?.id}
                      onClick={() => setSelectedId(object.id)}
                    >
                      <span className="cly-objective-index">
                        {labelForType(object.type)}
                      </span>
                      <span className="cly-objective-copy">
                        <strong>{object.title}</strong>
                        <small>
                          {object.description || "No description yet"}
                        </small>
                        <small>Version {object.version}</small>
                      </span>
                      <StatusIndicator tone={toneForStatus(statusOf(object))}>
                        {statusOf(object)}
                      </StatusIndicator>
                    </button>
                  ))}
                  {visible.length === 0 ? (
                    <EmptyState
                      title="No matching project records"
                      description="Clear the search or add a new structured record."
                    />
                  ) : null}
                </div>
              </div>
            }
            secondary={
              selected ? (
                <article className="cly-platform-inspector">
                  <PaneHeader
                    title={`${labelForType(selected.type)} · v${selected.version}`}
                    detail={selected.id}
                    actions={
                      <StatusIndicator tone={toneForStatus(statusOf(selected))}>
                        {statusOf(selected)}
                      </StatusIndicator>
                    }
                  />
                  <div className="cly-platform-inspector-body">
                    <div className="cly-lifecycle-form">
                      <label className="cly-field">
                        <span>Title</span>
                        <input
                          className="cly-input"
                          value={editTitle}
                          onChange={(event) => setEditTitle(event.target.value)}
                        />
                      </label>
                      <label className="cly-field">
                        <span>Description</span>
                        <textarea
                          className="cly-textarea"
                          value={editDescription}
                          onChange={(event) =>
                            setEditDescription(event.target.value)
                          }
                        />
                      </label>
                      <label className="cly-field">
                        <span>Lifecycle state</span>
                        <select
                          className="cly-select"
                          value={editStatus}
                          onChange={(event) =>
                            setEditStatus(
                              event.target.value as ProjectLifecycleStatus,
                            )
                          }
                        >
                          {statuses.map((status) => (
                            <option key={status}>{status}</option>
                          ))}
                        </select>
                      </label>
                      <label className="cly-field">
                        <span>Owner record ID</span>
                        <input
                          className="cly-input"
                          value={editOwner}
                          onChange={(event) => setEditOwner(event.target.value)}
                          placeholder="Optional collaborator or agent ID"
                        />
                      </label>
                      <div className="cly-lifecycle-actions">
                        <Button
                          variant="primary"
                          disabled={saving || !editTitle.trim()}
                          onClick={() => void saveSelected()}
                        >
                          Save changes
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={saving || statusOf(selected) === "archived"}
                          onClick={() => void saveSelected("archived")}
                        >
                          <Archive size={13} /> Archive
                        </Button>
                      </div>
                    </div>
                    <section>
                      <h3>Graph linkage</h3>
                      <div className="cly-lifecycle-link-controls">
                        <select
                          aria-label="Link target"
                          className="cly-select"
                          value={linkTargetId}
                          onChange={(event) =>
                            setLinkTargetId(event.target.value)
                          }
                        >
                          {objects
                            .filter((object) => object.id !== selected.id)
                            .map((object) => (
                              <option key={object.id} value={object.id}>
                                {labelForType(object.type)} · {object.title}
                              </option>
                            ))}
                        </select>
                        <Button
                          disabled={saving || !linkTargetId}
                          onClick={() => void linkSelected()}
                        >
                          <Link2 size={13} /> Add dependency
                        </Button>
                      </div>
                      {selectedLinks.length ? (
                        <ul className="cly-lifecycle-links">
                          {selectedLinks.map((link) => (
                            <li key={link.id}>
                              <GitBranch size={13} />
                              <span>{link.type}</span>
                              <code>
                                {link.fromObjectId === selected.id
                                  ? link.toObjectId
                                  : link.fromObjectId}
                              </code>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>
                          No graph links yet. Add a dependency to connect this
                          record.
                        </p>
                      )}
                    </section>
                  </div>
                </article>
              ) : null
            }
          />
        </>
      )}

      <Dialog
        open={dialogOpen}
        title="New project record"
        description="The record will be scoped to this project and start at version 1."
        onClose={() => setDialogOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={saving || !createTitle.trim()}
              onClick={() => void createRecord()}
            >
              Create record
            </Button>
          </>
        }
      >
        <div className="cly-lifecycle-form">
          <label className="cly-field">
            <span>Record type</span>
            <select
              aria-label="Record type"
              className="cly-select"
              value={createType}
              onChange={(event) =>
                setCreateType(event.target.value as ProjectLifecycleObjectType)
              }
            >
              {PROJECT_LIFECYCLE_OBJECT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {labelForType(type)}
                </option>
              ))}
            </select>
          </label>
          <label className="cly-field">
            <span>Title</span>
            <input
              autoFocus
              className="cly-input"
              value={createTitle}
              onChange={(event) => setCreateTitle(event.target.value)}
            />
          </label>
          <label className="cly-field">
            <span>Description</span>
            <textarea
              className="cly-textarea"
              value={createDescription}
              onChange={(event) => setCreateDescription(event.target.value)}
            />
          </label>
        </div>
      </Dialog>
    </div>
  );
}
