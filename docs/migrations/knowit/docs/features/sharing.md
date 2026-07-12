# Sharing With Friends

**Branch:** `feature/sharing`

## What

Share a folder or research run with another user via a link. They can view the papers, structured notes, and landscape without needing the app installed.

## Why

Research is collaborative. After doing a literature review, you want to share findings with your lab, advisor, or co-author. A shareable link is the simplest way.

## How to Implement

### Privacy-first design
- Sharing is **opt-in per folder/run** — nothing is shared by default
- Shared content is a **read-only snapshot** at the time of sharing
- No real-time sync, no editing by viewers
- Link can be revoked at any time

### Backend

1. **Share tokens** — database table:
   ```sql
   CREATE TABLE IF NOT EXISTS shares (
       share_id TEXT PRIMARY KEY,
       resource_type TEXT NOT NULL,  -- 'run' or 'folder'
       resource_id TEXT NOT NULL,
       created_by TEXT,              -- user_id (null if no auth)
       created_at TEXT NOT NULL,
       expires_at TEXT,              -- null = never
       is_active INTEGER NOT NULL DEFAULT 1
   );
   ```

2. **Share endpoints:**
   - `POST /api/v1/shares` — create share link `{resource_type, resource_id}`
   - `GET /api/v1/shares/{share_id}` — view shared content (no auth required)
   - `DELETE /api/v1/shares/{share_id}` — revoke share
   - `GET /api/v1/shares` — list my active shares

3. **Shared view** — `GET /api/v1/shares/{share_id}`
   - Returns the snapshot: papers, extractions, landscape, folder contents
   - Static HTML page at `GET /share/{share_id}` served by the frontend
   - No write actions available
   - Share link format: `http://127.0.0.1:3000/share/abc123`

### Frontend

4. **Share button** — in folder sidebar and run header
   - "Share" button → generates link → copy to clipboard
   - Shows "Link copied!" toast
   - Active shares list with revoke button
   - Expiry options: "24 hours", "7 days", "Never"

5. **Shared view page** — `frontend/app/share/[shareId]/page.tsx`
   - Read-only view of the shared content
   - Same paper table, landscape panel, but no actions
   - "This research was shared via Research Field Mapper" footer
   - No login required to view

6. **Security notes for later:**
   - Currently no auth, so shares are link-access-only (anyone with the link can view)
   - When `feature/oauth-login` is done, restrict share creation to authenticated users
   - Consider share passwords as an option

## When You Know It's Done

- [ ] Can create a share link for a run or folder
- [ ] Shared link shows a read-only view of the content
- [ ] Can revoke a share link
- [ ] Shared view includes papers, extractions, and landscape
- [ ] No auth required to view shared content
- [ ] Share links are unguessable (UUID-based)

## Expected Results

Click "Share" on a folder → copy `http://127.0.0.1:3000/share/x7k2m9` → send to a friend → they open it → see all papers with structured notes and the landscape summary, exactly as you see it, but read-only.

## Dependencies

- `feature/oauth-login` (nice to have for attribution, not required for basic sharing)
- `feature/local-folders` (share targets)

## Files to Touch

```
backend/app/models/shares.py              (new)
backend/app/routes/shares.py              (new)
backend/app/storage/repositories.py       (share CRUD)
backend/app/storage/database.py           (shares table)
backend/app/main.py                       (register shares router)
frontend/app/share/[shareId]/page.tsx     (new)
frontend/app/components/ShareButton.tsx   (new)
frontend/app/page.tsx                     (share button wiring)
backend/tests/test_shares.py              (new)
```
