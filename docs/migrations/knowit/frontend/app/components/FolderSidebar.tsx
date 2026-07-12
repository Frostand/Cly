"use client";

import { FormEvent, useState } from "react";

import type { Folder } from "../types";

type FolderSidebarProps = {
  folders: Folder[];
  selectedFolderId: string | null;
  isLoading: boolean;
  errorMessage: string | null;
  onCreateFolder: (name: string) => Promise<void>;
  onSelectFolder: (folderId: string | null) => void;
  onRenameFolder: (folderId: string, name: string) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
};

export function FolderSidebar({
  folders,
  selectedFolderId,
  isLoading,
  errorMessage,
  onCreateFolder,
  onSelectFolder,
  onRenameFolder,
  onDeleteFolder,
}: FolderSidebarProps) {
  const [newFolderName, setNewFolderName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeActionFolderId, setActiveActionFolderId] = useState<string | null>(
    null,
  );

  async function handleCreateFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = newFolderName.trim();
    if (!trimmedName) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onCreateFolder(trimmedName);
      setNewFolderName("");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRename(folder: Folder) {
    const nextName = window.prompt("Rename folder", folder.name)?.trim();
    if (!nextName || nextName === folder.name) {
      return;
    }

    setActiveActionFolderId(folder.folder_id);
    try {
      await onRenameFolder(folder.folder_id, nextName);
    } finally {
      setActiveActionFolderId(null);
    }
  }

  async function handleDelete(folder: Folder) {
    const confirmed = window.confirm(`Delete "${folder.name}"? Saved papers will stay in the library.`);
    if (!confirmed) {
      return;
    }

    setActiveActionFolderId(folder.folder_id);
    try {
      await onDeleteFolder(folder.folder_id);
    } finally {
      setActiveActionFolderId(null);
    }
  }

  return (
    <aside className="rounded-lg border border-[color:var(--line)] bg-[color:var(--panel)] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Folders</h2>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            Local reading lists across runs.
          </p>
        </div>
        <span className="rounded-md bg-[color:var(--panel-strong)] px-2 py-1 text-xs font-semibold text-[color:var(--accent-strong)]">
          {folders.length}
        </span>
      </div>

      <form onSubmit={handleCreateFolder} className="mt-4 flex gap-2">
        <input
          value={newFolderName}
          onChange={(event) => setNewFolderName(event.target.value)}
          maxLength={120}
          className="min-w-0 flex-1 rounded-md border border-[color:var(--line)] bg-white px-3 py-2 text-sm"
          placeholder="New folder"
          aria-label="New folder name"
        />
        <button
          type="submit"
          disabled={isSubmitting || !newFolderName.trim()}
          className="rounded-md bg-[color:var(--accent)] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[color:var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Add
        </button>
      </form>

      {errorMessage ? (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-[color:var(--danger)]">
          {errorMessage}
        </p>
      ) : null}

      <div className="mt-4 grid gap-2">
        <button
          type="button"
          onClick={() => onSelectFolder(null)}
          className={
            selectedFolderId === null
              ? "flex items-center justify-between rounded-md border border-[color:var(--accent)] bg-[color:var(--panel-strong)] px-3 py-2 text-left text-sm font-semibold text-[color:var(--accent-strong)]"
              : "flex items-center justify-between rounded-md border border-[color:var(--line)] bg-white px-3 py-2 text-left text-sm font-semibold hover:bg-[color:var(--panel-strong)]"
          }
        >
          <span>Current run</span>
          <span className="text-xs text-[color:var(--muted)]">Live</span>
        </button>

        {isLoading ? (
          <p className="rounded-md border border-[color:var(--line)] bg-[color:var(--panel-strong)] px-3 py-2 text-sm text-[color:var(--muted)]">
            Loading folders.
          </p>
        ) : null}

        {!isLoading && folders.length === 0 ? (
          <p className="rounded-md border border-[color:var(--line)] bg-[color:var(--panel-strong)] px-3 py-2 text-sm text-[color:var(--muted)]">
            No folders yet.
          </p>
        ) : null}

        {folders.map((folder) => {
          const isSelected = selectedFolderId === folder.folder_id;
          const isBusy = activeActionFolderId === folder.folder_id;
          return (
            <div
              key={folder.folder_id}
              className={
                isSelected
                  ? "rounded-md border border-[color:var(--accent)] bg-[color:var(--panel-strong)]"
                  : "rounded-md border border-[color:var(--line)] bg-white"
              }
            >
              <button
                type="button"
                onClick={() => onSelectFolder(folder.folder_id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm"
              >
                <span className="min-w-0 truncate font-semibold">
                  {folder.name}
                </span>
                <span className="shrink-0 rounded-md bg-[color:var(--panel-strong)] px-2 py-0.5 text-xs font-semibold text-[color:var(--muted)]">
                  {folder.paper_count}
                </span>
              </button>
              <div className="flex border-t border-[color:var(--line)] text-xs">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleRename(folder)}
                  className="flex-1 px-3 py-1.5 font-semibold text-[color:var(--muted)] hover:bg-[color:var(--panel-strong)] disabled:opacity-50"
                >
                  Rename
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleDelete(folder)}
                  className="flex-1 border-l border-[color:var(--line)] px-3 py-1.5 font-semibold text-[color:var(--danger)] hover:bg-red-50 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
