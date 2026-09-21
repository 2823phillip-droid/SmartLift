# Askeo Project Knowledge System
last_updated: 2026-09-19
status: synced — both machines at `5453a9e`, clean working trees. Mac has fresh build in `frontend/ios/App/App/public/` (the folder Xcode reads). `frontend/public/` is a decoy — Xcode ignores it.

This file explains where every type of project knowledge lives and when to use it.

## Current state (as of this update)

### Rollback points

Always tag before touching global layout (App.tsx) or root routing. The tag gives a one-command landing point if a change breaks multiple tabs.

**To create a rollback point before making changes:**
```bash
git tag rollback-$(date +%Y%m%d)-<short-description> <current-commit>
git push origin rollback-$(date +%Y%m%d)-<short-description>
```

**To roll back (Linux):**
```bash
git reset --hard rollback-<date>-<description>
git push --force origin master   # only if broken commits were pushed
# rebuild + rsync to restore Mac public/
```

**To roll back (Mac):**
```bash
ssh macbook 'cd ~/workout-logger && git fetch origin && git reset --hard rollback-<date>-<description>'
```

| Tag | Commit | What it represents | Created |
|-----|--------|--------------------|---------|
| `rollback-before-header-fix` | `1b1fd64` | pb-60 coach tab (conversation scrolls internally, chat input above tab bar). All tabs: header uses `sticky top-0`, root is `min-h-screen`, page can still scroll as one. | 2026-09-20 |

Update this table after each new rollback point is created. Remove stale entries only when they're no longer the "previous known-good" reference.

### Repo
- **Branch:** master
- **HEAD (both machines):** `5453a9e` — "feat: restore AI Coach tab with chat functionality"
- **Remote (GitHub origin/master):** `5453a9e` — both machines at same commit, Linux clean, Mac clean (fresh Vite build in `frontend/ios/App/App/public/` — the folder Xcode reads)
- **Remote URL:** `git@github.com:2823phillip-droid/SmartLift.git` (Mac) / `https://github.com/2823phillip-droid/SmartLift.git` (Linux)
- **Untracked files:** None.

### Backend (deployed, Fly)
- **App:** `smartlift-api` (internal name; users see `askeo.fit`)
- **Deployed commit:** `60019a7` (Sep 16, 2026) — different from frontend HEAD; backend deploy not yet updated for `60019a7`
- **Public URL:** `https://askeo.fit/api` — primary
- **Fly dev URL:** `https://smartlift-api.fly.dev/api` — alias, same Fly app, same server (`57f2b87`)
- **Health:** `https://askeo.fit/healthz`
- **Machine ID:** `2862102a31e718`
- **Current bug:** `POST /api/rules/next-prescription` returns 500 (`internal_server_error`) — app degrades to local rules fallback. NOT yet fixed.

### Frontend (built on Mac, not yet redeployed to Fly)
- **Build target:** Capacitor iOS app, Xcode project on Mac
- **API base (runtime):** `.env` sets `VITE_API_BASE=https://smartlift-api.fly.dev/api` — both machines. The `.env` value wins at runtime over any hardcoded fallback in `api.ts`.
- **Domains:** `askeo.fit` and `smartlift-api.fly.dev` resolve to same IP (`66.241.124.80`) and same Fly server. Which URL is used doesn't change which backend is hit.
- **Dist bundle:** `frontend/dist/` built on Mac, copied into `frontend/ios/App/App/public/` for Xcode to consume. Not served by Fly. **Important:** the Xcode project reads `public/` from `frontend/ios/App/App/public/`, NOT from `frontend/public/` — there are two `public/` folders and the `frontend/public/` one is a decoy that Xcode ignores.

### Sync definition: "fully synced" means ALL of:
1. GitHub origin/master is source of truth. Both machines at same commit.
2. No uncommitted tracked changes on either machine (untracked scratch files OK if they don't affect build).
3. Identical source tree on both — no duplicate stale files at wrong paths.
4. Frontend `.env` agrees with deployed backend URL (both `smartlift-api.fly.dev` or both `askeo.fit` — they're aliases but should be consistent).
5. Backend deployed commit matches what frontend expects (only matters when backend code changed).

### Sync workflow (run BEFORE testing anything):
```bash
# On Linux (or whichever machine has work):
cd ~/workout-logger
git status                          # review — commit or stash anything needed
git pull origin master              # get latest from remote
git push origin master              # push local commits

# On Mac:
cd ~/workout-logger
git pull origin master              # pull remote
# verify: git status clean
# rebuild in Xcode (Run) — user action
```

### Known stale artifacts cleaned up
- Root-level `ActiveWorkoutScreen.tsx` (stale pre-fix copy, was being compiled by Xcode) — removed, replaced with patched frontend version, now deleted since frontend copy is canonical
- Root `main.py`, `rules.py` (backend leftovers at frontend root) — removed
- Debug scripts (`_fetch_*.py`, `_stream_webcontent.py`, `fetch_logs.sh`, `_mac_fix_*.py`) — removed

## Bootstrap order

Read in this order at the start of any session:

1. `CONTEXT.md` — what's happening right now, what shipped, what's next
2. `PROJECT.md` — deploy commands, network facts, auth credentials (the things you cannot afford to get wrong)
3. `TODO.md` — full priority list and phased roadmap
4. `memory/<task>.md` — whatever's relevant to the task at hand

Reference materials (read when relevant, not mandatory at startup):
- `PERSONA.md` — role definitions and task ownership
- `Askeo.md` — stack, endpoints, users, gotchas, iOS bundle ID
- `memory/changelog.md` — history of knowledge-base changes

## Top-level files (stable references)
- `PERSONA.md` — role definition for agents working in this repo
- `TODO.md` — phased roadmap. Read this at the start of any session to understand current priorities
- `Askeo.md` — stack reference, endpoint list, known gotchas, users, backups. Updated when stack changes
- `CONTEXT.md` — what we're working on right now, what shipped last, what's next. Check this before asking the user about current state
- `PROJECT.md` — deploy commands, network facts, auth credentials. Immutable-ish operational facts
- `MEMORY-INDEX.md` — this file

## Durable lessons

See `memory/README.md` for the full catalog of domain files.

File | When to read
-----|-------------
`memory/deploy.md` | Before any frontend push or backend deploy
`memory/debugging.md` | When an issue involves WKWebView, CORS, or iOS-specific errors
`memory/backend-db.md` | Before touching schema, queries, or migrations
`memory/auth.md` | When debugging login, token, or 401/403 errors
`memory/frontend-fetch.md` | When touching api.ts or fetch logic
`memory/trainer.md` | When building or changing trainer-generated workout or meal plan features
`memory/ai-coach-capabilities.md` | Before changing AI coach tools, prompts, or workout/profile modification logic
`memory/decisions.md` | When revisiting a past technical decision
`memory/changelog.md` | When auditing what changed and when

## Roadmap
- `TODO.md` — phased roadmap source of truth for priorities and planning
- Backend: `backend/roadmap.html` — live rendered roadmap at `https://askeo.fit/roadmap`
- Purpose: visual status page showing completed / active / waiting / blocked work
- Safe edit workflow:
  1. Edit `backend/roadmap.html` directly for content changes
  2. Redeploy with `bash -ic 'cd ~/workout-logger && python3 -m py_compile backend/main.py && fly deploy -a smartlift-api --no-cache'` (from Mac via SSH)
  3. Verify the live page before marking done
- Warning: `backend/scripts/generate_roadmap.py` was removed. Do not regenerate `roadmap.html` automatically from `TODO.md` without explicit approval and manual verification.
- Bullet legend: ✓ = completed, ○ = incomplete/waiting, 🔗 amber box = dependency/blocker

## Session History
- Hermes session DB: `/home/phillip2823/.hermes/memories/` (SQLite + memory files)
- Hermes logs: `~/.hermes/logs/`
- Mac SSH logs (if needed): `/Users/phillipwalters/Projects/SecureCRT/Logs/` (SecureCRT)

## File format standards

All files in `memory/` use this header:
```
last_updated: YYYY-MM-DD
created: YYYY-MM-DD
tags: [tag1, tag2]
related: other-file.md, ...
```

Decision records in `memory/decisions.md` follow ADR format:
```
## ADR-XXX — Title
Status: accepted|rejected|deprecated
Date: YYYY-MM-DD
Tags: [tag1, tag2]
Context:
Options considered:
Decision:
Consequence:
```

## Usage rules
1. Start every session by reading: `CONTEXT.md`, then `PROJECT.md`, then `TODO.md`, then the relevant `memory/<topic>.md` files.
2. Use `Askeo.md` for stack/endpoint reference and `PROJECT.md` for deploy/network facts.
3. Record lessons in `memory/<topic>.md`, not in Hermes memory.
4. Hermes memory (`~/.hermes/memories/MEMORY.md`) holds only a lightweight pointer to this knowledge system.
5. Update `memory/changelog.md` whenever a knowledge file changes materially.
6. When unsure whether to record something, use the decision checklist below.
7. **Never ask the user to run terminal commands for deploy/sync/device operations.** The agent owns these end-to-end via SSH to Mac.

## Decision checklist

When unsure whether to record something:
1. Will the same issue reappear? -> Record it.
2. Is it a one-time environment quirk? -> Log in `changelog.md` only.
3. Does it change future behavior? -> Also record in `decisions.md`.
4. Is it user-facing (UX/flow change)? -> Also update `TODO.md` and `Askeo.md`.

## Sync audit trail

Use this when checking if things are clean:

| Check | Command | Expected |
|-------|---------|----------|
| Linux git status | `cd ~/workout-logger && git status` | clean, up to date with origin/master |
| Mac git status | `ssh macbook 'cd ~/workout-logger && git status'` | clean, up to date with origin/master |
| Both at same commit | compare `git rev-parse HEAD` on both | identical hash |
| Backend reachable | `curl -s https://askeo.fit/healthz` | `{"status":"ok"}` |
| Frontend dist on Mac | check `frontend/ios/App/App/public/assets/index-*.js` exists | matches latest `frontend/dist/` |
| No stale root files | `ls *.tsx *.py` at repo root on Mac | no matches (files shouldn't exist) |

## Tagging conventions

Use lowercase, single-word tags. Pick the dominant domain first, then add a secondary system if needed:
  Primary tags: deploy, debugging, backend-db, auth, frontend-fetch, decisions, ios, capacitor, cors, postgres, schema, retry, token
Secondary tags: production, device, cache, validation, migration

The `related` field should list only files directly relevant. Prefer 1-3 links. Do not list every memory file.

## Ownership and contributor flow
- Any agent session may add lessons to `memory/` and update `decisions.md`
- Domain-specific additions go to the matching file (or a new `memory/<topic>.md`)
- Structural changes (new file format, registry schema, merging files) also update `MEMORY-INDEX.md` and `changelog.md`
- **The session lifecycle process in this file is owned by Memory — it is already being followed.** Every session starts with sync audit, resolves uncommitted changes immediately, cleans stale files before ending, and updates documentation in-session. This is not optional.

## Pre-Build Check

Before building from Xcode or testing, verify:
1. **Git clean on both machines:** `git status` shows no uncommitted changes on Linux or Mac
2. **Same commit:** `git rev-parse HEAD` matches on both machines
3. **Backend health:** `curl -s https://askeo.fit/healthz` returns `{"status":"ok"}`
4. **No stale files:** no unexpected `.tsx`/`.py` files at repo root on Mac
5. **Frontend dist current:** `frontend/ios/App/App/public/assets/index-*.js` on Mac exists and matches `frontend/dist/`

Do not use `scripts/sync-check.sh` — it is not maintained for this environment.

---

## Session Lifecycle (mandatory for every Hermes session)

Every session — whether debugging, building, or investigating — follows this envelope. No exceptions.

### Start of session (before any work)
1. Read bootstrap: `CONTEXT.md`, `PROJECT.md`, `TODO.md`, `MEMORY-INDEX.md` (in that order). This is already in Usage rules §1 — honored every time.
2. **Run sync audit** (new — this is what was missing): check the 6 items in the Sync audit trail table above. Report results to the user before doing any work. If anything is dirty, flag it explicitly and decide: fix it now, or document why it's pending.
3. Update `MEMORY-INDEX.md` status line to reflect actual HEAD if it changed since last read.
4. Check if the session has a clear goal. If not (e.g. "look at logs", "investigate something"), establish one before acting.

### During session
5. **Uncommitted changes get resolved immediately.** If a change gets made that should be in git (code fix, config change, new file that matters), it gets committed and pushed before the session moves on to something else. No "I'll commit it later" — later never comes. This is what caused the 5 uncommitted files drift.
6. **Stale/temp files get cleaned up before session end.** Debug scripts, backup files, root-level duplicates — if they don't belong in the repo, they get deleted. If they do belong, they get committed. Nothing sits in an ambiguous state.
7. **Documentation updates happen as part of the work, not after.** If a file in `memory/` changes, update `changelog.md` in the same session. If `TODO.md` shifts, update it before moving on. If a decision is made, record it in `decisions.md`. The "I'll document it later" pattern is what creates gaps.
8. **State changes get reported to the user at the time they happen**, not batched at the end. If the backend URL meaning changes, if a new stale file appears, if git diverges — say it when it happens so the user can course-correct.

### End of session (before saying "ready for you to test" or similar)
9. **Run sync audit again** — same 6 checks as start. If anything is now dirty, either clean it up or explicitly tell the user what's pending and why.
10. **Update `MEMORY-INDEX.md` status line** to the actual current HEAD if it changed.
11. **Report final state to the user** — not just "done", but: what changed, what's committed, what's deployed (or not), what's still pending. The user should never have to ask "what state are we in?" because the answer was just given.
12. **Never end a session with uncommitted tracked changes on either machine.** If something can't be committed (needs user decision, needs more work), stash it and say so explicitly. The 5 uncommitted files from the prior session are the cautionary example — they sat for an unknown amount of time with nobody knowing if they were intentional or drift.

### What this prevents
- Uncommitted changes accumulating across sessions (the 5-file drift problem)
- Stale files appearing without anyone noticing (the root `ActiveWorkoutScreen.tsx` problem)
- "We thought we were synced but weren't" (the Linux-behind-Master problem)
- Documentation that doesn't match reality (the `MEMORY-INDEX.md` status line lying about the state)
- Sessions that leave the project in an untestable state without saying so

### What is NOT required
- Recording every file touched — only changes that matter to the project state
- Committing debug scripts or temp files — these get deleted, not committed
- Updating `changelog.md` for every micro-edit — only material knowledge-base changes
- Asking the user for permission to follow this process — it's mandatory, not optional

## Tagging conventions

Use lowercase, single-word tags. Pick the dominant domain first, then add a secondary system if needed:
  Primary tags: deploy, debugging, backend-db, auth, frontend-fetch, decisions, ios, capacitor, cors, postgres, schema, retry, token
Secondary tags: production, device, cache, validation, migration

The `related` field should list only files directly relevant. Prefer 1-3 links. Do not list every memory file.
