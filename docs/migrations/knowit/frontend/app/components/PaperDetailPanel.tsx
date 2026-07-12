"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { Folder, PaperExtraction, RankedPaper } from "../types";
import { SourceBadge } from "./SourceBadge";

type PaperDetailPanelProps = {
  rankedPaper: RankedPaper | null;
  extraction: PaperExtraction | undefined;
  folders: Folder[];
  savedFolderIds: string[];
  folderMutationKey: string | null;
  onTogglePaperFolder: (folderId: string, shouldSave: boolean) => Promise<void>;
  onClose: () => void;
};

export function PaperDetailPanel({
  rankedPaper,
  extraction,
  folders,
  savedFolderIds,
  folderMutationKey,
  onTogglePaperFolder,
  onClose,
}: PaperDetailPanelProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  const paper = rankedPaper?.paper ?? null;
  const confidencePercent = Math.round((extraction?.confidence ?? 0) * 100);
  const notesPending = !extraction;
  const citation = useMemo(() => {
    if (!paper) {
      return "";
    }
    const authorText =
      paper.authors.length > 0 ? paper.authors.join(", ") : "Unknown authors";
    const year = paper.published_date
      ? (() => {
          const y = new Date(paper.published_date).getFullYear();
          return Number.isNaN(y) ? paper.published_date : y;
        })()
      : "n.d.";
    return `${authorText} (${year}). ${paper.title}. ${paper.paper_url}`;
  }, [paper]);

  useEffect(() => {
    if (!paper) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [paper]);

  useEffect(() => {
    if (!paper) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("disabled"));

      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, paper]);

  useEffect(() => {
    setCopyStatus("idle");
  }, [paper?.paper_id]);

  if (!paper || !rankedPaper) {
    return null;
  }

  async function handleCopyCitation() {
    if (!citation) {
      return;
    }

    try {
      await navigator.clipboard.writeText(citation);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  const googleScholarUrl = `https://scholar.google.com/scholar?q=${encodeURIComponent(
    paper.title,
  )}`;

  return (
    <div
      className="paper-detail-backdrop fixed inset-0 z-50 flex justify-end bg-black/25 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.button === 0 && event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <aside
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="paper-detail-title"
        className="paper-detail-panel flex h-full w-full flex-col overflow-hidden border-l border-[color:var(--line)] bg-[color:var(--panel)] shadow-2xl sm:max-w-[400px]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[color:var(--line)] bg-[color:var(--panel)] px-5 py-4">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <SourceBadge source={paper.source} />
              <span className="text-xs font-semibold text-[color:var(--muted)]">
                Rank {rankedPaper.rank_position}
              </span>
            </div>
            <h2
              id="paper-detail-title"
              className="text-lg font-semibold leading-6 text-[color:var(--foreground)]"
            >
              {paper.title}
            </h2>
            <p className="mt-2 text-sm leading-5 text-[color:var(--muted)]">
              {paper.authors.length > 0
                ? paper.authors.join(", ")
                : "Unknown authors"}
            </p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-normal text-[color:var(--muted)]">
              {formatDate(paper.published_date)} · {paper.categories.join(", ") || "No categories"}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-[color:var(--line)] bg-white px-2.5 py-1 text-lg leading-6 text-[color:var(--muted)] transition hover:bg-[color:var(--panel-strong)] hover:text-[color:var(--foreground)]"
            aria-label="Close paper details"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <section>
            <h3 className="text-sm font-semibold">Abstract</h3>
            <p className="mt-2 text-sm leading-6 text-[color:var(--foreground)]">
              {paper.abstract || "No abstract available."}
            </p>
          </section>

          <section className="mt-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Structured Notes</h3>
              <span className="text-xs font-semibold text-[color:var(--muted)]">
                {extraction?.provider_name ?? "Pending"}
              </span>
            </div>

            {notesPending ? (
              <PendingNotes />
            ) : (
              <div className="mt-3 grid gap-3">
                <NoteBlock label="Problem" value={extraction.problem} />
                <NoteBlock label="Method" value={extraction.method} />
                <NoteBlock
                  label="Contribution"
                  value={extraction.main_contribution}
                />
                <NoteBlock
                  label="Datasets or setting"
                  value={extraction.datasets_or_setting}
                />
                <NoteList label="Key results" items={extraction.key_results} />
                <NoteList label="Limitations" items={extraction.limitations} />
                {extraction.tags.length > 0 ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-normal text-[color:var(--muted)]">
                      Tags
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {extraction.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md bg-[color:var(--panel-strong)] px-2 py-1 text-xs font-semibold text-[color:var(--accent-strong)]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </section>

          <section className="mt-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Confidence</h3>
              <span className="text-sm font-semibold">
                {confidencePercent}%
              </span>
            </div>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-[color:var(--line)]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={confidencePercent}
              aria-label="Extraction confidence"
            >
              <div
                className="h-full rounded-full bg-[color:var(--accent)] transition-all duration-300"
                style={{ width: `${confidencePercent}%` }}
              />
            </div>
          </section>

          <section className="mt-5">
            <h3 className="text-sm font-semibold">Evidence</h3>
            <blockquote className="mt-2 rounded-md border border-[color:var(--line)] bg-[color:var(--panel-strong)] p-3 text-sm leading-6 text-[color:var(--foreground)]">
              {extraction?.source_quote_or_evidence ||
                "Evidence will appear when extraction finishes."}
            </blockquote>
          </section>

          <section className="mt-5">
            <h3 className="text-sm font-semibold">Ranking</h3>
            <p className="mt-2 text-sm leading-6 text-[color:var(--foreground)]">
              {rankedPaper.ranking_explanation}
            </p>
            <p className="mt-1 text-xs text-[color:var(--muted)]">
              Relevance score {rankedPaper.relevance_score.toFixed(1)}
              {paper.citation_count !== null
                ? ` · ${paper.citation_count} citations`
                : ""}
              {paper.reference_count !== null
                ? ` · ${paper.reference_count} references`
                : ""}
            </p>
          </section>
        </div>

        <div className="border-t border-[color:var(--line)] bg-[color:var(--panel)] px-5 py-4">
          <section className="mb-3 rounded-md border border-[color:var(--line)] bg-[color:var(--panel-strong)] p-3">
            <h3 className="text-sm font-semibold">Save to folder</h3>
            {folders.length === 0 ? (
              <p className="mt-1 text-xs leading-5 text-[color:var(--muted)]">
                Create a folder to save this paper.
              </p>
            ) : (
              <div className="mt-2 grid gap-2">
                {folders.map((folder) => {
                  const mutationKey = `${folder.folder_id}:${paper.paper_id}`;
                  return (
                    <label
                      key={folder.folder_id}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="min-w-0 truncate">{folder.name}</span>
                      <input
                        type="checkbox"
                        checked={savedFolderIds.includes(folder.folder_id)}
                        disabled={folderMutationKey === mutationKey}
                        onChange={(event) =>
                          onTogglePaperFolder(
                            folder.folder_id,
                            event.target.checked,
                          )
                        }
                        className="h-4 w-4 shrink-0 accent-[color:var(--accent)]"
                      />
                    </label>
                  );
                })}
              </div>
            )}
          </section>
          <div className="grid grid-cols-2 gap-2">
            <a
              href={paper.paper_url}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-[color:var(--line)] bg-white px-3 py-2 text-center text-sm font-semibold text-[color:var(--accent-strong)] transition hover:bg-[color:var(--panel-strong)]"
            >
              Abstract
            </a>
            {paper.pdf_url ? (
              <a
                href={paper.pdf_url}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-[color:var(--line)] bg-white px-3 py-2 text-center text-sm font-semibold text-[color:var(--accent-strong)] transition hover:bg-[color:var(--panel-strong)]"
              >
                PDF
              </a>
            ) : (
              <span className="rounded-md border border-[color:var(--line)] bg-[color:var(--panel-strong)] px-3 py-2 text-center text-sm font-semibold text-[color:var(--muted)]">
                No PDF
              </span>
            )}
            <a
              href={googleScholarUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-[color:var(--line)] bg-white px-3 py-2 text-center text-sm font-semibold text-[color:var(--accent-strong)] transition hover:bg-[color:var(--panel-strong)]"
            >
              Scholar
            </a>
          </div>
          <button
            type="button"
            onClick={handleCopyCitation}
            className="mt-2 w-full rounded-md bg-[color:var(--accent)] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[color:var(--accent-strong)]"
          >
            {copyStatus === "copied"
              ? "Citation copied"
              : copyStatus === "failed"
                ? "Copy failed"
                : "Copy citation"}
          </button>
        </div>
      </aside>
    </div>
  );
}

function NoteBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-normal text-[color:var(--muted)]">
        {label}
      </p>
      <p className="mt-1 text-sm leading-6 text-[color:var(--foreground)]">
        {value || "Not extracted."}
      </p>
    </div>
  );
}

function NoteList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-normal text-[color:var(--muted)]">
        {label}
      </p>
      {items.length > 0 ? (
        <ul className="mt-2 grid gap-2 text-sm leading-6 text-[color:var(--foreground)]">
          {items.map((item, index) => (
            <li key={`${label}-${index}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm leading-6 text-[color:var(--foreground)]">
          Not extracted.
        </p>
      )}
    </div>
  );
}

function PendingNotes() {
  return (
    <div className="mt-3 rounded-md border border-[color:var(--line)] bg-[color:var(--panel-strong)] p-3">
      <p className="text-sm font-semibold">Notes being generated...</p>
      <div className="mt-3 grid gap-2" aria-hidden="true">
        <span className="h-3 w-11/12 animate-pulse rounded-full bg-[color:var(--line)]" />
        <span className="h-3 w-4/5 animate-pulse rounded-full bg-[color:var(--line)]" />
        <span className="h-3 w-2/3 animate-pulse rounded-full bg-[color:var(--line)]" />
      </div>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) {
    return "No published date";
  }

  try {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}
