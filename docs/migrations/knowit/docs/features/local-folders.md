# Local Folders for Saved Papers

**Branch:** `feature/local-folders`

## What

Users can create named folders and save papers into them. Folders persist locally in SQLite. This is the foundation for organizing research across multiple runs.

## Why

Currently every research run is isolated. Users can't save interesting papers for later, group papers by sub-topic, or build a personal reading list. Folders add persistence across runs.

## How to Implement

### Backend

1. **Database schema** — add to `init_database()`:
   ```sql
   CREATE TABLE IF NOT EXISTS folders (
       folder_id TEXT PRIMARY KEY,
       name TEXT NOT NULL,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
   );

   CREATE TABLE IF NOT EXISTS folder_papers (
       folder_id TEXT NOT NULL,
       paper_id TEXT NOT NULL,
       added_at TEXT NOT NULL,
       PRIMARY KEY (folder_id, paper_id),
       FOREIGN KEY (folder_id) REFERENCES folders(folder_id) ON DELETE CASCADE,
       FOREIGN KEY (paper_id) REFERENCES papers(paper_id) ON DELETE CASCADE
   );
   ```

2. **Folder model** — `app/models/folders.py`:
   ```python
   class Folder(BaseModel):
       folder_id: str
       name: str
       created_at: datetime
       updated_at: datetime
       paper_count: int = 0
   ```

3. **Folder routes** — `app/routes/folders.py`:
   - `POST /api/v1/folders` — create folder
   - `GET /api/v1/folders` — list folders
   - `GET /api/v1/folders/{id}` — get folder with papers
   - `PUT /api/v1/folders/{id}` — rename folder
   - `DELETE /api/v1/folders/{id}` — delete folder
   - `POST /api/v1/folders/{id}/papers` — add paper to folder
   - `DELETE /api/v1/folders/{id}/papers/{paper_id}` — remove paper

4. **Repository functions** — `save_folder`, `get_folders`, `get_folder_with_papers`, `add_paper_to_folder`, `remove_paper_from_folder`, `delete_folder`

### Frontend

5. **Folder sidebar**
   - Left sidebar or collapsible panel listing folders
   - "New Folder" button with inline name input
   - Folder count badge showing number of papers
   - Click folder to view its papers in the main table

6. **Save paper action**
   - "Save to folder" button in the paper detail panel and table row
   - Dropdown to pick which folder(s)
   - A paper can be in multiple folders

7. **Folder view**
   - When a folder is selected, show only its papers in the table
   - Same sort/compact controls as the main table

## When You Know It's Done

- [ ] Can create, rename, and delete folders
- [ ] Can add a paper to a folder from the detail panel
- [ ] Can add a paper to multiple folders
- [ ] Clicking a folder shows only its papers
- [ ] Folder list persists across page reloads
- [ ] Removing a paper from a folder doesn't delete the paper
- [ ] Deleting a folder doesn't delete the papers
- [ ] Tests: `test_folders.py` covering all CRUD operations

## Expected Results

Run a search → find interesting papers → save to "RAG Papers" folder → run another search → add more to same folder → browse folder contents anytime.

## Dependencies

- `feature/paper-detail-panel` (save button goes in the panel)

## Files to Touch

```
backend/app/models/folders.py           (new)
backend/app/routes/folders.py           (new)
backend/app/storage/repositories.py     (folder CRUD)
backend/app/storage/database.py         (new tables)
backend/app/main.py                     (register folder router)
backend/tests/test_folders.py           (new)
frontend/app/components/FolderSidebar.tsx  (new)
frontend/app/page.tsx                   (folder state, save action)
```
