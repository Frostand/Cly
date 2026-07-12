# OAuth Login (Google + GitHub)

**Branch:** `feature/oauth-login`

## What

Add sign-in with Google and GitHub OAuth. Users get a profile (name, avatar) and their data is scoped to their identity.

## Why

Currently the app has no concept of user identity — all data is shared in a single SQLite database. Login enables:
- Multi-user data isolation (different users see only their runs/folders)
- Attribution for shared content
- Foundation for sync/sharing features

## Privacy Considerations

Per `AGENTS.md`, this is a local-first app. Login should be an enhancement, not a requirement:
- App still works without login (guest mode with local data)
- Login adds identity + data isolation, not telemetry or cloud storage
- OAuth tokens stored locally, never sent to third parties beyond the OAuth provider

## How to Implement

### Backend

1. **New dependencies** — add to `requirements.txt`:
   ```
   authlib>=1.3.0
   python-jose>=3.3.0   # JWT
   ```

2. **OAuth configuration** — environment variables:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GITHUB_CLIENT_ID=...
   GITHUB_CLIENT_SECRET=...
   SESSION_SECRET_KEY=...  # for JWT signing
   ```
   All optional — if not set, login routes return 501 Not Implemented.

3. **User & session tables** — add to `init_database()`:
   ```sql
   CREATE TABLE IF NOT EXISTS users (
       user_id TEXT PRIMARY KEY,
       email TEXT UNIQUE,
       name TEXT NOT NULL,
       avatar_url TEXT,
       oauth_provider TEXT NOT NULL,   -- 'google' or 'github'
       oauth_subject TEXT NOT NULL,    -- provider's unique ID
       created_at TEXT NOT NULL,
       last_login_at TEXT NOT NULL
   );

   CREATE TABLE IF NOT EXISTS sessions (
       session_id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL,
       created_at TEXT NOT NULL,
       expires_at TEXT NOT NULL,
       FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
   );
   ```

4. **Auth routes** — `app/routes/auth.py`:
   - `GET /api/v1/auth/login/google` — redirect to Google OAuth
   - `GET /api/v1/auth/login/github` — redirect to GitHub OAuth
   - `GET /api/v1/auth/callback/google` — handle Google callback
   - `GET /api/v1/auth/callback/github` — handle GitHub callback
   - `GET /api/v1/auth/me` — return current user from session cookie
   - `POST /api/v1/auth/logout` — clear session

5. **Session management:**
   - JWT stored in httpOnly, Secure, SameSite=Lax cookie
   - Session validity: 7 days
   - `GET /api/v1/auth/me` returns `User | null` (null = guest)

6. **Auth middleware** — `app/middleware/auth.py`:
   - Dependency injection: `def get_current_user(request) -> User | None`
   - Routes can require auth: `user = get_current_user()` raises 401 if guest
   - Guest mode: all existing routes work without auth, data goes to a `guest` user slot

7. **Data scoping:**
   - Add `user_id TEXT NOT NULL DEFAULT 'guest'` to `runs`, `folders`, `shares` tables
   - Repository queries filter by `user_id`
   - Migration: existing data gets `user_id = 'guest'`

### Frontend

8. **Auth context** — `frontend/app/context/AuthContext.tsx`:
   ```typescript
   type User = { user_id: string; email: string; name: string; avatar_url: string | null };
   type AuthContext = { user: User | null; loading: boolean; login: (provider) => void; logout: () => void };
   ```

9. **Login page** — `frontend/app/login/page.tsx`:
   - "Continue with Google" button (styled per Google brand guidelines)
   - "Continue with GitHub" button (styled per GitHub brand guidelines)
   - "Continue as guest" link → back to home
   - Redirect to `/` after successful login

10. **User menu in header:**
    - Avatar + name in the top-right
    - Dropdown: "My Runs", "My Folders", "Sign out"
    - Guest mode: "Sign in" link

11. **Route protection:**
    - `/login` — public
    - `/` — public (guest or user)
    - `/share/[id]` — public
    - Future: `/settings` — auth required

12. **Login gate for certain actions:**
    - Saving to folders: guest can save locally, user can persist across sessions
    - Sharing: guest can create time-limited shares, user can manage shares
    - Clear messaging: "Sign in to save papers across sessions"

## When You Know It's Done

- [ ] Google OAuth flow works (redirect → consent → callback → session)
- [ ] GitHub OAuth flow works
- [ ] User info is stored in the users table
- [ ] Session JWT is set as httpOnly cookie
- [ ] `GET /api/v1/auth/me` returns current user or null
- [ ] Existing runs/folders work in guest mode without auth
- [ ] User's data is scoped to their user_id
- [ ] Login page has both provider buttons and guest option
- [ ] User avatar/name appears in header when signed in
- [ ] Sign out clears session
- [ ] App still fully functional without login (guest mode)

## Expected Results

Open app → see "Sign in" in header → click "Continue with Google" → Google consent screen → back to app → avatar appears → create a run → data is scoped to that user → sign out → data from that session is only visible when signed back in. Guest can still use the app without signing in.

## Dependencies

- None (standalone feature)
- `feature/sharing` builds on this for attribution
- Data migration: adds `user_id` to existing tables

## Files to Touch

```
backend/app/routes/auth.py              (new)
backend/app/middleware/auth.py          (new)
backend/app/models/users.py             (new)
backend/app/storage/database.py         (add users, sessions tables; add user_id to runs/folders)
backend/app/storage/repositories.py     (filter by user_id)
backend/requirements.txt                (add authlib, python-jose)
.env.example                            (add OAuth placeholders)
frontend/app/login/page.tsx             (new)
frontend/app/context/AuthContext.tsx     (new)
frontend/app/layout.tsx                  (wrap with AuthProvider)
frontend/app/page.tsx                    (user menu, login gate)
frontend/app/globals.css                 (login page styles)
backend/tests/test_auth.py              (new)
```
