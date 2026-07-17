import {
  AlertTriangle,
  Check,
  CircleStop,
  ExternalLink,
  FileCode2,
  FileDiff,
  Files,
  FlaskConical,
  ListTree,
  Play,
  RefreshCw,
  ScrollText,
  TerminalSquare,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getDesktopApi } from "../../../lib/electron";
import type {
  ProjectGitDiffResponse,
  ProjectGitStatusResponse,
  WorkspaceSnapshot,
} from "../../../types/ide";
import { PaneHeader } from "../components/design-system";
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/primitives";
import { ClySplitPane, ClyTerminal } from "../components/toolkit";
import { apiClient } from "../services/api-client";
import type { ClyDevSessionEvent, ClyDevWorkbenchContext } from "./types";

type LiveTab = "files" | "changes" | "terminal" | "tests" | "logs" | "impact";
type WindowRole = "agent" | "workspace";

const liveTabs: Array<{ id: LiveTab; label: string; icon: React.ReactNode }> = [
  { id: "files", label: "Files", icon: <Files size={13} /> },
  { id: "changes", label: "Changes", icon: <FileDiff size={13} /> },
  { id: "terminal", label: "Terminal", icon: <TerminalSquare size={13} /> },
  { id: "tests", label: "Tests", icon: <FlaskConical size={13} /> },
  { id: "logs", label: "Logs", icon: <ScrollText size={13} /> },
  { id: "impact", label: "Impact", icon: <ListTree size={13} /> },
];

const postJson = async <T,>(url: string, body: unknown): Promise<T> => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(
      (await response.text()).trim() || `Request failed (${response.status}).`,
    );
  return response.json() as Promise<T>;
};

const emptySnapshot = (sessionId: string): WorkspaceSnapshot => ({
  sessionId,
  revision: 0,
  selectedFileId: null,
  selectedDiffId: null,
  pendingApprovalIds: [],
  workspaceMode: "inline",
  activeWorkbenchTabId: null,
});

const eventLabel = (event: ClyDevSessionEvent) =>
  event.type
    .replace(/\.recorded$/, "")
    .replaceAll(".", " ")
    .replaceAll("_", " ");

const eventProcessLines = (events: ClyDevSessionEvent[]) => {
  const records = events.filter((event) => event.type === "process.recorded");
  const latest = records.at(-1);
  if (!latest) return ["No command output has been recorded for this session."];
  const payload = latest.payload as Record<string, unknown>;
  return [
    `$ ${String(payload.command ?? "")}`,
    ...String(payload.stdout ?? "").split(/\r?\n/),
    ...String(payload.stderr ?? "").split(/\r?\n/),
    `[${String(payload.status ?? "complete")}; exit ${String(payload.exitCode ?? "n/a")}]`,
  ].filter(Boolean);
};

function useWorkspaceProjection(sessionId: string) {
  const desktop = getDesktopApi();
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot>(() =>
    emptySnapshot(sessionId),
  );

  useEffect(() => {
    let active = true;
    void desktop?.getWorkspaceSnapshot(sessionId).then((value) => {
      if (active) setSnapshot(value);
    });
    const unsubscribe = desktop?.onWorkspaceSnapshot((value) => {
      if (active && value.sessionId === sessionId) setSnapshot(value);
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [desktop, sessionId]);

  const dispatch = useCallback(
    async (
      type: "select_file" | "select_diff" | "activate_workbench_tab",
      payload: Record<string, unknown>,
    ) => {
      if (!desktop) return;
      const result = await desktop.dispatchWorkspaceIntent({
        mutationId: crypto.randomUUID(),
        sessionId,
        baseRevision: snapshot.revision,
        type,
        payload,
      });
      setSnapshot(result.snapshot);
    },
    [desktop, sessionId, snapshot.revision],
  );
  return { snapshot, dispatch };
}

export function LiveClyDevWorkbench({
  projectId,
  sessionId,
  windowRole,
}: {
  projectId: string;
  sessionId: string;
  windowRole: WindowRole;
}) {
  const [context, setContext] = useState<ClyDevWorkbenchContext | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [git, setGit] = useState<ProjectGitStatusResponse | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [diff, setDiff] = useState<ProjectGitDiffResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [surfaceError, setSurfaceError] = useState<string | null>(null);
  const [command, setCommand] = useState("");
  const [pendingCommand, setPendingCommand] = useState<{
    requestId: string;
    command: string;
    approvalId: string | null;
    argumentsHash: string | null;
    contextHash: string | null;
    expiresAt: string | null;
  } | null>(null);
  const [runningRequestId, setRunningRequestId] = useState<string | null>(null);
  const [editors, setEditors] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const { snapshot, dispatch } = useWorkspaceProjection(sessionId);
  const activeTab = liveTabs.some(
    (tab) => tab.id === snapshot.activeWorkbenchTabId,
  )
    ? (snapshot.activeWorkbenchTabId as LiveTab)
    : "files";
  const projectPath = context?.workspace.localOnly.worktreePath ?? null;
  const selectedFile = snapshot.selectedFileId ?? files[0] ?? null;
  const selectedChange =
    git?.changes.find((item) => item.path === snapshot.selectedDiffId) ??
    git?.changes[0] ??
    null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await apiClient.fetchClyDevWorkbench(projectId, sessionId);
      const root = next.workspace.localOnly.worktreePath;
      const [fileResult, gitResult] = await Promise.all([
        postJson<{ files: string[] }>("/api/project-files", {
          directory: ".",
          maxResults: 2000,
          projectId,
          projectPath: root,
        }),
        postJson<ProjectGitStatusResponse>("/api/project-git-status", {
          projectId,
          projectPath: root,
        }),
      ]);
      setContext(next);
      setFiles(fileResult.files);
      setGit(gitResult);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The live workbench could not load.",
      );
    } finally {
      setLoading(false);
    }
  }, [projectId, sessionId]);

  useEffect(() => void load(), [load]);
  useEffect(() => {
    void getDesktopApi()
      ?.detectEditors()
      .then((items) =>
        setEditors(
          items.filter((item) =>
            /(?:code|cursor)/i.test(`${item.id} ${item.name}`),
          ),
        ),
      );
  }, []);

  useEffect(() => {
    if (!projectPath || !selectedFile) {
      setFileContent("");
      return;
    }
    const controller = new AbortController();
    setSurfaceError(null);
    void postJson<{ content: string }>("/api/project-file", {
      filePath: selectedFile,
      projectId,
      projectPath,
    })
      .then((value) => {
        if (!controller.signal.aborted) setFileContent(value.content);
      })
      .catch((caught) => {
        if (!controller.signal.aborted)
          setSurfaceError(
            caught instanceof Error
              ? caught.message
              : "File preview unavailable.",
          );
      });
    return () => controller.abort();
  }, [projectId, projectPath, selectedFile]);

  useEffect(() => {
    if (!projectPath || !selectedChange) {
      setDiff(null);
      return;
    }
    let active = true;
    setSurfaceError(null);
    void postJson<ProjectGitDiffResponse>("/api/project-git-diff", {
      filePath: selectedChange.path,
      previousPath: selectedChange.previousPath,
      projectId,
      projectPath,
      status: selectedChange.status,
    })
      .then((value) => {
        if (active) setDiff(value);
      })
      .catch((caught) => {
        if (active)
          setSurfaceError(
            caught instanceof Error ? caught.message : "Diff unavailable.",
          );
      });
    return () => {
      active = false;
    };
  }, [projectId, projectPath, selectedChange]);

  const resolveApproval = async (
    approvalId: string,
    state: "approved" | "rejected",
  ) => {
    await apiClient.appendClyDevSessionEvent(projectId, sessionId, {
      schemaVersion: 1,
      payloadVersion: 1,
      idempotencyKey: `workbench:${approvalId}:${state}`,
      type: "approval.resolved",
      transferability: "transferable",
      occurredAt: new Date().toISOString(),
      actor: { kind: "user", id: "local-user" },
      payload: { approvalId, state, resolvedBy: "local-user" },
    });
  };

  const execute = async (next: {
    requestId: string;
    command: string;
    approvalId: string | null;
    argumentsHash: string | null;
    contextHash: string | null;
    expiresAt: string | null;
  }) => {
    setPendingCommand(null);
    setRunningRequestId(next.requestId);
    setSurfaceError(null);
    try {
      await apiClient.executeClyDevCommand(projectId, sessionId, {
        requestId: next.requestId,
        command: next.command,
        ...(next.approvalId ? { approvalId: next.approvalId } : {}),
      });
      setCommand("");
      await load();
    } catch (caught) {
      setSurfaceError(
        caught instanceof Error ? caught.message : "Command execution failed.",
      );
      await load();
    } finally {
      setRunningRequestId(null);
    }
  };

  const requestRun = async (requested: string) => {
    if (!requested.trim()) return;
    if (windowRole !== "agent") {
      await getDesktopApi()?.focusAgentWindow();
      return;
    }
    setSurfaceError(null);
    try {
      const response = await apiClient.requestClyDevCommand(
        projectId,
        sessionId,
        {
          command: requested.trim(),
        },
      );
      const next = {
        requestId: response.requestId,
        command: requested.trim(),
        approvalId: response.approval?.approvalId ?? null,
        argumentsHash: response.approval?.argumentsHash ?? null,
        contextHash: response.approval?.contextHash ?? null,
        expiresAt: response.approval?.expiresAt ?? null,
      };
      if (response.status === "approved") await execute(next);
      else setPendingCommand(next);
    } catch (caught) {
      setSurfaceError(
        caught instanceof Error ? caught.message : "Command request failed.",
      );
    }
  };

  if (loading && !context)
    return <LoadingState label="Loading live development workspace" />;
  if (error || !context)
    return (
      <ErrorState
        description={error ?? "Session workbench unavailable."}
        onRetry={() => void load()}
      />
    );

  const terminalLines = eventProcessLines(context.events);
  if (runningRequestId)
    terminalLines.push(
      "[command running — output will be durably recorded on completion]",
    );

  return (
    <section
      className="cly-live-workbench"
      aria-label="Live developer workspace"
    >
      <div
        className="cly-live-workbench-tabs"
        role="tablist"
        aria-label="Developer tools"
      >
        {liveTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() =>
              void dispatch("activate_workbench_tab", {
                activeWorkbenchTabId: tab.id,
              })
            }
          >
            {tab.icon} {tab.label}
          </button>
        ))}
        <span className="cly-live-workbench-spacer" />
        <Badge
          tone={context.snapshot.state === "failed" ? "danger" : "success"}
        >
          {context.snapshot.state}
        </Badge>
        <Button
          iconOnly
          variant="ghost"
          aria-label="Refresh live workspace"
          onClick={() => void load()}
        >
          <RefreshCw size={13} />
        </Button>
      </div>
      {surfaceError ? (
        <div className="cly-live-workbench-alert" role="alert">
          <AlertTriangle size={13} /> <span>{surfaceError}</span>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setSurfaceError(null)}
          >
            <X size={12} />
          </button>
        </div>
      ) : null}
      <div className="cly-live-workbench-surface">
        {activeTab === "files" ? (
          <ClySplitPane
            id={`cly-dev-files-${sessionId}`}
            secondarySize={70}
            primary={
              <aside className="cly-live-list" aria-label="Project files">
                <PaneHeader title="Files" detail={`${files.length} observed`} />
                {files.map((file) => (
                  <button
                    type="button"
                    key={file}
                    data-selected={selectedFile === file}
                    onClick={() =>
                      void dispatch("select_file", { selectedFileId: file })
                    }
                  >
                    <FileCode2 size={12} /> <span>{file}</span>
                  </button>
                ))}
              </aside>
            }
            secondary={
              <section className="cly-live-code-pane">
                <PaneHeader
                  title={selectedFile ?? "No file selected"}
                  detail="Live working-tree content"
                  actions={
                    selectedFile && editors[0] ? (
                      <Button
                        variant="ghost"
                        onClick={() =>
                          void getDesktopApi()?.openInEditor({
                            editorId: editors[0].id,
                            filePath: selectedFile,
                            line: 1,
                            projectId,
                            projectPath: projectPath ?? "",
                          })
                        }
                      >
                        <ExternalLink size={12} /> Open in {editors[0].name}
                      </Button>
                    ) : null
                  }
                />
                {selectedFile ? (
                  <section aria-label={`Contents of ${selectedFile}`}>
                    <pre>{fileContent}</pre>
                  </section>
                ) : (
                  <EmptyState
                    title="No project files"
                    description="This worktree has no observable text files."
                  />
                )}
              </section>
            }
          />
        ) : null}

        {activeTab === "changes" ? (
          git?.changes.length ? (
            <ClySplitPane
              id={`cly-dev-changes-${sessionId}`}
              secondarySize={70}
              primary={
                <aside
                  className="cly-live-list"
                  aria-label="Repository changes"
                >
                  <PaneHeader
                    title="Changes"
                    detail={`+${git.addedLines} −${git.removedLines}`}
                  />
                  {git.changes.map((change) => (
                    <button
                      type="button"
                      key={`${change.path}:${change.staged}`}
                      data-selected={selectedChange?.path === change.path}
                      onClick={() =>
                        void dispatch("select_diff", {
                          selectedDiffId: change.path,
                        })
                      }
                    >
                      <FileDiff size={12} />
                      <span>
                        {change.path}
                        <small>
                          {change.staged ? "Staged" : "Working tree"} ·{" "}
                          {change.status}
                        </small>
                      </span>
                    </button>
                  ))}
                </aside>
              }
              secondary={
                <section className="cly-live-code-pane">
                  <PaneHeader
                    title={selectedChange?.path ?? "Diff"}
                    detail={`${git.branch ?? "detached"} · repository state`}
                  />
                  <section
                    aria-label={
                      selectedChange
                        ? `Diff for ${selectedChange.path}`
                        : "Diff"
                    }
                  >
                    <pre>{diff?.diff ?? "Loading diff…"}</pre>
                  </section>
                </section>
              }
            />
          ) : (
            <EmptyState
              icon={<Check size={22} />}
              title="Working tree clean"
              description="No staged, unstaged, or untracked changes were found."
            />
          )
        ) : null}

        {activeTab === "terminal" ? (
          <section className="cly-live-terminal">
            <PaneHeader
              title="Approval-gated terminal"
              detail={projectPath ?? "Worktree unavailable"}
              actions={
                runningRequestId ? (
                  <Button
                    variant="danger"
                    onClick={() =>
                      void apiClient.cancelClyDevCommand(
                        projectId,
                        sessionId,
                        runningRequestId,
                      )
                    }
                  >
                    <CircleStop size={12} /> Cancel
                  </Button>
                ) : null
              }
            />
            <ClyTerminal lines={terminalLines} label="Durable command output" />
            <form
              className="cly-live-command"
              onSubmit={(event) => {
                event.preventDefault();
                void requestRun(command);
              }}
            >
              <label>
                <span className="cly-sr-only">Project command</span>
                <input
                  value={command}
                  onChange={(event) => setCommand(event.target.value)}
                  placeholder="Enter a project-scoped command"
                  disabled={Boolean(runningRequestId)}
                />
              </label>
              <Button
                type="submit"
                variant="primary"
                disabled={!command.trim() || Boolean(runningRequestId)}
              >
                <Play size={12} />{" "}
                {windowRole === "agent"
                  ? "Review and run"
                  : "Review in agent window"}
              </Button>
            </form>
          </section>
        ) : null}

        {activeTab === "tests" ? (
          <section className="cly-live-tests">
            <PaneHeader
              title="Discovered tests"
              detail={`${context.testCommands.length} package scripts`}
            />
            {context.testCommands.length ? (
              context.testCommands.map((test) => (
                <article key={test.id}>
                  <span>
                    <strong>{test.label}</strong>
                    <code>{test.command}</code>
                    <small>{test.script}</small>
                  </span>
                  <Button
                    disabled={Boolean(runningRequestId)}
                    onClick={() => void requestRun(test.command)}
                  >
                    <Play size={12} />{" "}
                    {windowRole === "agent" ? "Run" : "Open agent window"}
                  </Button>
                </article>
              ))
            ) : (
              <EmptyState
                title="No test commands discovered"
                description="Add a package test script to expose it here."
              />
            )}
            <div className="cly-live-test-history">
              <PaneHeader title="Durable results" />
              {context.events
                .filter((item) => item.type === "test.recorded")
                .toReversed()
                .map((item) => (
                  <div key={item.id}>
                    <FlaskConical size={12} />
                    <span>
                      <strong>{String(item.payload.commandId)}</strong>
                      <small>
                        {String(item.payload.passed)} passed ·{" "}
                        {String(item.payload.failed)} failed ·{" "}
                        {String(item.payload.durationMs)} ms
                      </small>
                    </span>
                  </div>
                ))}
            </div>
          </section>
        ) : null}

        {activeTab === "logs" ? (
          <section className="cly-live-logs" aria-label="Durable session log">
            <PaneHeader
              title="Session events"
              detail={`${context.events.length} recent durable events`}
            />
            {context.events.toReversed().map((item) => (
              <article key={item.id}>
                <code>{item.sequence}</code>
                <span>
                  <strong>{eventLabel(item)}</strong>
                  <small>
                    {item.actor.kind} · {item.actor.id}
                  </small>
                </span>
                <time>{new Date(item.occurredAt).toLocaleTimeString()}</time>
              </article>
            ))}
          </section>
        ) : null}

        {activeTab === "impact" ? (
          <section className="cly-live-impact">
            <PaneHeader
              title="Research impact"
              detail="Task-scoped durable provenance"
            />
            <dl>
              <div>
                <dt>Objective</dt>
                <dd>{context.task.objective}</dd>
              </div>
              <div>
                <dt>Research objects</dt>
                <dd>
                  {context.task.researchObjectIds.length
                    ? context.task.researchObjectIds.join(", ")
                    : "No linked research objects"}
                </dd>
              </div>
              <div>
                <dt>Repository</dt>
                <dd>{context.workspace.repository.id}</dd>
              </div>
              <div>
                <dt>Branch</dt>
                <dd>{context.workspace.worktree.branch}</dd>
              </div>
              <div>
                <dt>Commit</dt>
                <dd>
                  <code>{context.session.commit.sha}</code>
                </dd>
              </div>
              <div>
                <dt>Changed files</dt>
                <dd>
                  {git?.changes.map((item) => item.path).join(", ") ||
                    "No current changes"}
                </dd>
              </div>
            </dl>
          </section>
        ) : null}
      </div>

      <Dialog
        open={Boolean(pendingCommand)}
        title="Approve project command?"
        description="The command is bound to this exact session, context manifest, and worktree."
        onClose={() => setPendingCommand(null)}
        footer={
          pendingCommand ? (
            <>
              <Button
                onClick={() => {
                  if (pendingCommand.approvalId)
                    void resolveApproval(
                      pendingCommand.approvalId,
                      "rejected",
                    ).finally(() => setPendingCommand(null));
                  else setPendingCommand(null);
                }}
              >
                Reject
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  const next = pendingCommand;
                  if (!next.approvalId) return void execute(next);
                  void resolveApproval(next.approvalId, "approved").then(() =>
                    execute(next),
                  );
                }}
              >
                <Check size={12} /> Approve and run
              </Button>
            </>
          ) : null
        }
      >
        <div className="cly-command-approval-detail">
          <div>
            <span>Command</span>
            <code>{pendingCommand?.command}</code>
          </div>
          <div>
            <span>Worktree</span>
            <code>{projectPath}</code>
          </div>
          <div>
            <span>Session</span>
            <code>{sessionId}</code>
          </div>
          <div>
            <span>Arguments hash</span>
            <code>{pendingCommand?.argumentsHash ?? "Policy-authorized"}</code>
          </div>
          <div>
            <span>Context manifest hash</span>
            <code>{pendingCommand?.contextHash ?? "Policy-authorized"}</code>
          </div>
          {pendingCommand?.expiresAt ? (
            <div>
              <span>Approval expires</span>
              <code>{new Date(pendingCommand.expiresAt).toLocaleString()}</code>
            </div>
          ) : null}
        </div>
      </Dialog>
    </section>
  );
}
