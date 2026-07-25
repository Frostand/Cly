import {
  AlertTriangle,
  CheckCircle2,
  FileDiff,
  GitPullRequest,
  Link2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ImpactFinding,
  ImpactLinkStatus,
  ImpactResearchObject,
  PrImpactReview,
} from "../../domain/pr-impact-review";
import { useClyStore } from "../../store/cly-store";
import {
  DisclosureRow,
  InlineMetadata,
  StatusIndicator,
  Toolbar,
  WorkspaceHeader,
} from "../design-system";
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  LoadingState,
  Segmented,
} from "../primitives";

type ViewState = "loading" | "error" | "ready";
type SourceMode = "Local diff" | "Pull request";

const isCanonicalLocalPath = (value: string | undefined) =>
  Boolean(
    value &&
      (value.startsWith("/") ||
        /^[A-Za-z]:[\\/]/.test(value) ||
        value.startsWith("\\\\")),
  );

function linkBadge(status: ImpactLinkStatus) {
  if (status === "verified") return <Badge tone="success">Verified</Badge>;
  if (status === "inferred") {
    return <Badge tone="warning">Inferred — review required</Badge>;
  }
  return <Badge tone="danger">Missing provenance</Badge>;
}

function ObjectList({
  label,
  objects,
  empty = "unknown",
}: {
  label: string;
  objects: ImpactResearchObject[];
  empty?: string;
}) {
  return (
    <div className="cly-impact-object-group">
      <span>{label}</span>
      {objects.length ? (
        <ul>
          {objects.map((object) => (
            <li key={`${label}-${object.id}`}>
              <span>
                <strong>{object.label}</strong>
                <small>{object.type}</small>
              </span>
              {linkBadge(object.linkStatus)}
            </li>
          ))}
        </ul>
      ) : (
        <p>{empty}</p>
      )}
    </div>
  );
}

function FindingEvidence({ finding }: { finding: ImpactFinding }) {
  return (
    <DisclosureRow
      title={finding.summary}
      detail={finding.provenanceLabel}
      metadata={
        <>
          {finding.severity === "blocking" ? (
            <StatusIndicator tone="danger" emphasis>
              Blocking
            </StatusIndicator>
          ) : null}
          {linkBadge(finding.linkStatus)}
        </>
      }
      tone={finding.severity === "blocking" ? "danger" : "warning"}
    >
      <div className="cly-impact-evidence-grid">
        <div>
          <h4>Changed files and commits</h4>
          <ul className="cly-impact-coordinate-list">
            {finding.changedFiles.map((file) => (
              <li key={`${finding.id}-${file.path}`}>
                <code>{file.path}</code>
                <span>{file.status}</span>
              </li>
            ))}
            {finding.changedCommits.length ? (
              finding.changedCommits.map((commit) => (
                <li key={`${finding.id}-${commit.sha}`}>
                  <code>{commit.sha.slice(0, 12)}</code>
                  <span>{commit.subject}</span>
                </li>
              ))
            ) : (
              <li>
                <code>uncommitted</code>
                <span>Local working-tree change</span>
              </li>
            )}
          </ul>
        </div>
        <div>
          <h4>Supporting research objects</h4>
          <ul className="cly-impact-linked-list">
            {finding.researchObjects.map((object) => (
              <li key={`${finding.id}-${object.id}-${object.type}`}>
                <span>
                  <strong>{object.label}</strong>
                  <small>
                    {object.type} · {object.id}
                  </small>
                </span>
                {linkBadge(object.linkStatus)}
              </li>
            ))}
          </ul>
        </div>
        <div className="cly-impact-relationships">
          <h4>Supporting relationships</h4>
          {finding.relationships.length ? (
            <ul className="cly-impact-linked-list">
              {finding.relationships.map((relationship) => (
                <li key={`${finding.id}-${relationship.id}`}>
                  <span>
                    <strong>{relationship.type}</strong>
                    <small>
                      {relationship.fromObjectId} → {relationship.toObjectId}
                    </small>
                  </span>
                  {linkBadge(relationship.linkStatus)}
                </li>
              ))}
            </ul>
          ) : (
            <p>missing provenance</p>
          )}
        </div>
      </div>
    </DisclosureRow>
  );
}

function ReviewContent({
  review,
  onOpenApproval,
}: {
  review: PrImpactReview;
  onOpenApproval: () => void;
}) {
  if (review.noResearchImpact) {
    return (
      <EmptyState
        title="No research impact detected"
        description="The changed files have no project-scoped research links or research-sensitive patterns. Software checks still apply."
        icon={<FileDiff size={24} />}
      />
    );
  }

  return (
    <>
      {review.provenanceStatus === "partial" ? (
        <div className="cly-impact-partial" role="status">
          <AlertTriangle size={15} aria-hidden="true" />
          <div>
            <strong>Partial provenance</strong>
            <span>{review.partialReasons.join(" · ")}</span>
          </div>
        </div>
      ) : null}

      <section className="cly-impact-summary" aria-label="Research context">
        <div>
          <span>Research motivation</span>
          <strong>{review.researchMotivation.value}</strong>
          {linkBadge(review.researchMotivation.linkStatus)}
        </div>
        <div>
          <span>Linked objective</span>
          <strong>{review.linkedObjective.value}</strong>
          {linkBadge(review.linkedObjective.linkStatus)}
        </div>
        <ObjectList label="Methods changed" objects={review.methodsChanged} />
        <ObjectList
          label="Experiments that may need rerunning"
          objects={review.experimentsMayNeedRerun}
        />
        <ObjectList label="Affected claims" objects={review.affected.claims} />
        <ObjectList
          label="Affected figures and artifacts"
          objects={review.affected.figuresAndArtifacts}
        />
        <ObjectList
          label="Affected datasets"
          objects={review.affected.datasets}
        />
      </section>

      <section
        className="cly-impact-disciplines"
        aria-label="Review disciplines"
      >
        {review.sections.map((section) => (
          <section key={section.category} className="cly-impact-discipline">
            <header>
              <div>
                <h2>{section.title}</h2>
                <span>
                  {section.findings.length} finding
                  {section.findings.length === 1 ? "" : "s"}
                </span>
              </div>
              {section.findings.some(
                (finding) => finding.severity === "blocking",
              ) ? (
                <StatusIndicator tone="danger" emphasis>
                  Required before merge
                </StatusIndicator>
              ) : null}
            </header>
            {section.findings.length ? (
              section.findings.map((finding) => (
                <FindingEvidence finding={finding} key={finding.id} />
              ))
            ) : (
              <p className="cly-impact-no-findings">
                No project-scoped impact detected for this discipline.
              </p>
            )}
          </section>
        ))}
      </section>

      <section className="cly-impact-followup">
        <div>
          <h2>Risks and unresolved assumptions</h2>
          {[...review.risks, ...review.unresolvedAssumptions].length ? (
            <ul>
              {[...review.risks, ...review.unresolvedAssumptions].map(
                (item) => (
                  <li key={item}>{item}</li>
                ),
              )}
            </ul>
          ) : (
            <p>None identified from available project provenance.</p>
          )}
        </div>
        <div>
          <h2>Validation checklist</h2>
          <ul className="cly-impact-checklist">
            {review.validationChecklist.map((item) => (
              <li key={item.id} data-status={item.status}>
                {item.status === "complete" ? (
                  <CheckCircle2 size={14} aria-hidden="true" />
                ) : (
                  <span aria-hidden="true" />
                )}
                <span>{item.label}</span>
                <small>{item.status.replace("-", " ")}</small>
              </li>
            ))}
          </ul>
          {review.requiresHumanApproval ? (
            <Button variant="primary" onClick={onOpenApproval}>
              <ShieldAlert size={14} aria-hidden="true" />
              Review scientific conflicts
            </Button>
          ) : null}
        </div>
      </section>

      {review.downstreamImpact.length ? (
        <section className="cly-impact-downstream">
          <header>
            <h2>After-merge downstream impact</h2>
            <span>Objects become needs review only after merge</span>
          </header>
          <ul>
            {review.downstreamImpact.map((object) => (
              <li key={object.id}>
                <span>
                  <strong>{object.label}</strong>
                  <small>{object.recommendedAction}</small>
                </span>
                <StatusIndicator tone="warning">
                  {object.state === "needs-review"
                    ? "Needs review"
                    : "Would need review"}
                </StatusIndicator>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="cly-impact-caveats" aria-label="Review caveats">
        {review.caveats.map((caveat) => (
          <p key={caveat}>{caveat}</p>
        ))}
      </section>
    </>
  );
}

export function PrImpactReviewScreen({
  initialReview,
  initialState,
}: {
  initialReview?: PrImpactReview;
  initialState?: ViewState;
} = {}) {
  const activeProjectId = useClyStore((state) => state.activeProjectId);
  const activeProject = useClyStore((state) =>
    state.data.projects.find((project) => project.id === state.activeProjectId),
  );
  const fixtureMode = useClyStore((state) => state.fixtureMode);
  const [status, setStatus] = useState<ViewState>(initialState ?? "loading");
  const [review, setReview] = useState<PrImpactReview | null>(
    initialReview ?? null,
  );
  const [error, setError] = useState("The project diff could not be analyzed.");
  const [sourceMode, setSourceMode] = useState<SourceMode>("Local diff");
  const [scope, setScope] = useState<"working-tree" | "staged">("working-tree");
  const [prNumber, setPrNumber] = useState("60");
  const [baseRef, setBaseRef] = useState("main");
  const [headRef, setHeadRef] = useState("");
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [approvalStatus, setApprovalStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const hasLinkedRepository = isCanonicalLocalPath(activeProject?.path);

  const source = useMemo<PrImpactReview["source"]>(() => {
    if (sourceMode === "Pull request") {
      return {
        kind: "pull-request",
        number: Number(prNumber),
        baseRef,
        headRef,
        state: "open",
      };
    }
    return { kind: "local", scope };
  }, [baseRef, headRef, prNumber, scope, sourceMode]);

  const analyze = useCallback(async () => {
    if (!hasLinkedRepository) {
      setReview(null);
      setStatus("ready");
      return;
    }
    setStatus("loading");
    setError("The project diff could not be analyzed.");
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(activeProjectId)}/pr-impact-review`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source }),
        },
      );
      if (!response.ok) throw new Error("Impact review request failed.");
      setReview((await response.json()) as PrImpactReview);
      setStatus("ready");
    } catch {
      setError(
        "Cly could not analyze this repository. Check that it is a local Git repository and try again.",
      );
      setStatus("error");
    }
  }, [activeProjectId, hasLinkedRepository, source]);

  useEffect(() => {
    if (initialState || initialReview) return;
    if (!hasLinkedRepository) {
      setReview(null);
      setStatus("ready");
      return;
    }
    if (!__CLY_INCLUDE_TEST_FIXTURES__) {
      void analyze();
      return;
    }
    if (["active", "large", "risks", "new"].includes(fixtureMode)) {
      void import("./fixtures").then(({ populatedPrImpactReviewFixture }) => {
        setReview(populatedPrImpactReviewFixture);
        setStatus("ready");
      });
      return;
    }
    if (fixtureMode === "errors" || fixtureMode === "offline") {
      setStatus("error");
      return;
    }
    if (fixtureMode === "empty") {
      void analyze();
      return;
    }
    void import("./fixtures").then(({ emptyPrImpactReviewFixture }) => {
      setReview(emptyPrImpactReviewFixture);
      setStatus("ready");
    });
  }, [analyze, fixtureMode, hasLinkedRepository, initialReview, initialState]);

  const effectiveStatus = initialState ?? status;
  const effectiveReview = initialReview ?? review;

  const submitApproval = async () => {
    if (!effectiveReview || !reviewNote.trim()) return;
    setApprovalStatus("saving");
    const confirmedLinkIds = effectiveReview.sections
      .flatMap((section) => section.findings)
      .flatMap((finding) => finding.relationships)
      .filter((relationship) => relationship.linkStatus === "inferred")
      .map((relationship) => relationship.id);
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(effectiveReview.projectId)}/pr-impact-review/approvals`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            reviewId: effectiveReview.reviewId,
            actorId: "local-reviewer",
            decision: "approved",
            confirmedLinkIds,
            note: reviewNote.trim(),
          }),
        },
      );
      if (!response.ok) throw new Error(await response.text());
      setApprovalStatus("saved");
      setApprovalOpen(false);
    } catch {
      setApprovalStatus("error");
    }
  };

  return (
    <div className="cly-page cly-impact-page">
      <WorkspaceHeader
        eyebrow="Integrity"
        title="Research impact review"
        description="Review local Git changes against project-scoped research provenance before merge."
        metadata={
          <>
            <StatusIndicator tone="success">Local analysis</StatusIndicator>
            <span>No repository content transmitted</span>
          </>
        }
        actions={
          <Button
            onClick={() => void analyze()}
            disabled={effectiveStatus === "loading" || !hasLinkedRepository}
            title={
              hasLinkedRepository
                ? undefined
                : "Choose a local project folder before analyzing changes."
            }
          >
            <RefreshCw size={13} aria-hidden="true" /> Analyze
          </Button>
        }
      />

      <Toolbar label="Impact review source" className="cly-impact-toolbar">
        <Segmented
          label="Diff source"
          value={sourceMode}
          options={["Local diff", "Pull request"] as const}
          onChange={setSourceMode}
        />
        {sourceMode === "Local diff" ? (
          <label>
            <span>Scope</span>
            <select
              value={scope}
              onChange={(event) => setScope(event.target.value as typeof scope)}
            >
              <option value="working-tree">Working tree</option>
              <option value="staged">Staged changes</option>
            </select>
          </label>
        ) : (
          <>
            <label>
              <span>PR number</span>
              <input
                value={prNumber}
                inputMode="numeric"
                onChange={(event) => setPrNumber(event.target.value)}
              />
            </label>
            <label>
              <span>Base ref</span>
              <input
                value={baseRef}
                onChange={(event) => setBaseRef(event.target.value)}
              />
            </label>
            <label>
              <span>Head ref</span>
              <input
                value={headRef}
                placeholder="Local PR head ref"
                onChange={(event) => setHeadRef(event.target.value)}
              />
            </label>
          </>
        )}
        <InlineMetadata>
          {sourceMode === "Pull request" ? (
            <GitPullRequest size={13} />
          ) : (
            <FileDiff size={13} />
          )}
          <span>Refs must already exist locally</span>
        </InlineMetadata>
      </Toolbar>

      {!hasLinkedRepository && !initialReview && !initialState ? (
        <EmptyState
          title="Connect a local repository"
          description="Choose a local project folder before reviewing Git changes. Cly will not scan or transmit a folder until you select it."
          icon={<FileDiff size={24} />}
        />
      ) : effectiveStatus === "loading" ? (
        <LoadingState label="Analyzing research impact" />
      ) : effectiveStatus === "error" ? (
        <ErrorState
          title="Impact review unavailable"
          description={error}
          onRetry={() => void analyze()}
        />
      ) : effectiveReview ? (
        <ReviewContent
          review={effectiveReview}
          onOpenApproval={() => setApprovalOpen(true)}
        />
      ) : (
        <EmptyState
          title="No review available"
          description="Run analysis to inspect a local diff or pull request."
        />
      )}

      {approvalStatus === "saved" ? (
        <div className="cly-impact-approval-result" role="status">
          <CheckCircle2 size={14} />
          <span>
            <strong>Human review recorded</strong>
            Inferred links remain inferred until their relationships are
            reviewed separately.
          </span>
        </div>
      ) : null}

      <Dialog
        open={approvalOpen}
        title="Record scientific review"
        description="This records an attributable decision for this exact diff. It does not verify inferred relationships or establish scientific correctness."
        onClose={() => setApprovalOpen(false)}
        footer={
          <>
            <Button onClick={() => setApprovalOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!reviewNote.trim() || approvalStatus === "saving"}
              onClick={() => void submitApproval()}
            >
              Record approval
            </Button>
          </>
        }
      >
        <label className="cly-dialog-field">
          <span>Review note</span>
          <textarea
            aria-label="Review note"
            rows={5}
            value={reviewNote}
            onChange={(event) => setReviewNote(event.target.value)}
            placeholder="Describe the methodology, statistical, leakage, reproducibility, and claim-impact checks performed."
          />
        </label>
        <div className="cly-impact-approval-warning">
          <Link2 size={14} aria-hidden="true" />
          Confirming impact is not the same as confirming a provenance
          relationship.
        </div>
        {approvalStatus === "error" ? (
          <p role="alert">The human review could not be recorded.</p>
        ) : null}
      </Dialog>
    </div>
  );
}
