# Session Lifecycle — Askeo/Workout-Logger

Mandatory envelope every Hermes session follows. Not optional. Governed by `MEMORY-INDEX.md` §Session Lifecycle.

## Start of session (before any work)

1. Read bootstrap: `CONTEXT.md`, `PROJECT.md`, `TODO.md`, `MEMORY-INDEX.md` (in that order). Already in Usage rules §1.
2. **Run sync audit** — check 6 items, report results to user before doing any work:

   | Check | Command | Expected |
   |-------|---------|----------|
   | Linux git status | `cd ~/workout-logger && git status` | clean, up to date with origin/master |
   | Mac git status | `ssh macbook 'cd ~/workout-logger && git status'` | clean, up to date with origin/master |
   | Both at same commit | compare `git rev-parse HEAD` on both | identical hash |
   | Backend reachable | `curl -s https://askeo.fit/healthz` | `{"status":"ok"}` |
   | Frontend dist on Mac | check `frontend/ios/App/App/public/assets/index-*.js` exists | matches latest `frontend/dist/` |
   | No stale root files | `ls *.tsx *.py` at repo root on Mac | no matches |

   If anything is dirty, flag it explicitly. Decide: fix it now, or document why it's pending.

3. Update `MEMORY-INDEX.md` status line to actual HEAD if it changed.
4. Establish a clear goal. If none exists (e.g. "look at logs"), establish one before acting.

## During session

5. **Uncommitted changes get resolved immediately.** Code fixes, config changes, new files that matter — committed and pushed before the session moves on. No "I'll commit it later." This is what caused the 5-file drift problem (Sept 18 session).
6. **Stale/temp files get cleaned up before session end.** Debug scripts, backups, root-level duplicates — deleted if they don't belong, committed if they do. Nothing sits in ambiguous state.
7. **Documentation updates happen in-session, not after.** If a `memory/` file changes, update `changelog.md` in the same session. If `TODO.md` shifts, update it before moving on. If a decision is made, record it in `decisions.md`. The "I'll document it later" pattern is what creates gaps.
8. **State changes reported to user at the time they happen**, not batched at end. Backend URL meaning changes, new stale file appears, git diverges — say it when it happens.

## End of session (before saying "ready for you to test" or similar)

9. **Run sync audit again** — same 6 checks. If anything is dirty, either clean it up or explicitly tell the user what's pending and why.
10. **Update `MEMORY-INDEX.md` status line** to actual current HEAD if it changed.
11. **Report final state to user** — what changed, what's committed, what's deployed (or not), what's still pending. The user should never have to ask "what state are we in?"
12. **Never end with uncommitted tracked changes on either machine.** If something can't be committed (needs user decision, needs more work), stash it and say so explicitly.

## What this prevents

- Uncommitted changes accumulating across sessions (the 5-file drift problem, Sept 18 2026)
- Stale files appearing without anyone noticing (root `ActiveWorkoutScreen.tsx` was being compiled by Xcode)
- "We thought we were synced but weren't" (Linux was 11 commits behind origin/master)
- Documentation that doesn't match reality (MEMORY-INDEX.md status line pointing at wrong HEAD)
- Sessions that leave the project in an untestable state without saying so

## What is NOT required

- Recording every file touched — only changes that matter to project state
- Committing debug scripts or temp files — these get deleted, not committed
- Updating changelog.md for every micro-edit — only material knowledge-base changes
- Asking user permission to follow this process — it's mandatory, not optional

## How to use this at session start

1. Read bootstrap: `CONTEXT.md`, `PROJECT.md`, `TODO.md`, `MEMORY-INDEX.md` (MEMORY-INDEX.md §Bootstrap order)
2. **Read session log:** `/home/phillip2823/workout-logger/memory/session-log.md` — chronological record of sessions that changed project state. Read the most recent entry to understand current state + what's pending.
3. Run sync audit (MEMORY-INDEX.md §Sync audit trail) — don't assume state from session log is current
4. If you need more detail on a specific past session, search the session DB via `session_search(query="...")` or read the reference file in this directory

## Known issues this process caught

- Sept 18 2026: 5 uncommitted files on Linux (api.ts, HistoryScreen.tsx, SettingsScreen.tsx, vite.config.ts, backend/Dockerfile) sat across sessions with nobody knowing if intentional or drift. Resolved: 2 real fixes committed (token recovery in api.ts, JSX brace in HistoryScreen.tsx), 3 drift reverted (Dockerfile BUILD_TIMESTAMP, SettingsScreen placeholder, vite.config __API_BASE_URL__ — all redundant with .env or cosmetic).
- Sept 18 2026: Root `ActiveWorkoutScreen.tsx` was a stale duplicate compiled by Xcode instead of the patched frontend copy. Already cleaned in prior session.
- Backend URL confusion: `askeo.fit` and `smartlift-api.fly.dev` are aliases — same Fly app (server 57f2b87, IP 66.241.124.80). `.env` sets the runtime URL on both machines, making any hardcoded default in api.ts irrelevant. This was verified by DNS resolution + Fly server header check.
