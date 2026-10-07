# Askeo Project Knowledge System
last_updated: 2026-10-05
status: Mac Studio M5 Max only, master branch HEAD `439c55f`, clean working tree. All migration to local Studio complete — scripts/deploy.py handles the full 7-stage pipeline (preflight → backup → push → fly deploy backend → health check → cap sync ios → smoke test). Backend healthy at askeo.fit/healthz. iOS bundle ready in Xcode at frontend/ios/App/App/public/assets/.

This file explains where every type of project knowledge lives and when to use it.

## Current state (as of this update)

### Repo
- **Branch:** master
- **HEAD:** `49bef68` — "docs: update TODO build entry to v265 + smoke test details"
- **Remote (GitHub):** clean working tree, all changes pushed. Single Mac Studio M5 Max machine — no second machine to sync with.

### Frontend
- **Build target:** Capacitor iOS app, Xcode project on Mac Studio. Run from Xcode → Product > Run.

## Knowledge Files

See `memory/README.md` for the full catalog of domain files.

File | When to read
-----|-------------
`memory/deploy.md` | Before any frontend push or backend deploy
`memory/debugging.md` | When an issue involves WKWebView, CORS, or iOS-specific errors
`memory/backend-db.md` | Before touching schema, queries, or migrations
`memory/auth.md` | When debugging login, token, or 401/403 errors
`memory/frontend-fetch.md` | When touching api.ts or fetch logic
`memory/trainer.md` | **Archived** — historical reference only. See `prebuilt-templates.md` for current flow.
`memory/ai-coach-capabilities.md` | Before changing AI coach tools, prompts, or workout/profile modification logic
`memory/prebuilt-templates.md` | Before working on questionnaire, template selection, or AI coach generation
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
7. **Never ask the user to run terminal commands for deploy/sync/device operations.** The agent owns these end-to-end locally on the Mac Studio M5 Max.

## Decision checklist

When unsure whether to record something:
1. Will the same issue reappear? -> Record it.
2. Is it a one-time environment quirk? -> Log in `changelog.md` only.
3. Does it change future behavior? -> Also record in `decisions.md`.
4. Is it user-facing (UX/flow change)? -> Also update `TODO.md` and `Askeo.md`.

## Sync audit trail (Mac Studio M5 Max)

Use this when checking if things are clean:

| Check | Command | Expected |
|-------|---------|----------|
| Repo clean | `cd ~/Projects/askeo/repo && git status` | clean, up to date with origin/master |
| Backend reachable | `curl -s https://askeo.fit/healthz` | OK |
| Frontend dist current | check `frontend/ios/App/App/public/assets/index-*.js` exists | matches latest build |

## Ownership and contributor flow
- Any agent session may add lessons to `memory/` and update `decisions.md`
- Domain-specific additions go to the matching file (or a new `memory/<topic>.md`)
- Structural changes (new file format, registry schema, merging files) also update `MEMORY-INDEX.md` and `changelog.md`
- **The session lifecycle process in this file is owned by Memory — it is already being followed.** Every session starts with sync audit, resolves uncommitted changes immediately, cleans stale files before ending, and updates documentation in-session. This is not optional.

## Pre-Build Check

Before building from Xcode or testing, verify:
1. **Repo clean:** `git status` shows no uncommitted changes at HEAD
2. **Backend health:** `curl -s https://askeo.fit/healthz` returns OK
3. **No stale files:** no unexpected `.tsx`/`.py` files at repo root
4. **Frontend dist current:** `frontend/ios/App/App/public/assets/index-*.js` exists and matches latest build

Do not use `scripts/sync-check.sh` — it is not maintained for this environment.

---

## Session Lifecycle (mandatory for every Hermes session)

Every session — whether debugging, building, or investigating — follows this envelope. No exceptions.

### Start of session (before any work)
1. Read bootstrap: `CONTEXT.md`, `PROJECT.md`, `TODO.md`, `MEMORY-INDEX.md` (in that order). This is already in Usage rules §1 — honored every time.
2. **Run sync audit** (new — this is what was missing): check repo state (`git status` clean, up to date with origin/master), backend health (`curl -s askeo.fit/healthz` returns OK), frontend bundle current (JS in `frontend/ios/App/App/public/assets/` matches latest build). Report results to the user before doing any work. If anything is dirty, flag it explicitly and decide: fix it now, or document why it's pending.
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

---

## Production Fix Workflow

Moving forward, with a working app in users' hands, changes follow a **one-thing-at-a-time** model. Pick a single fix, validate it, then save. Do not batch multiple unrelated changes into one push.

### The cycle

1. **Identify** — User reports a bug or Hermes finds one during investigation. Write it into `TODO.md` "Bugs to fix" if it's not there already. One bug per row, with enough detail to reproduce.

2. **Investigate** — User says "investigate" (or Hermes picks it up as the next item). Find root cause. Identify the specific file(s) and line(s). Stop at understanding — do not start fixing yet.

3. **Implement** — Fix the specific issue. Scope: one bug, one commit. If investigation surfaces a second issue, that's a separate item — note it in TODO and come back later.

4. **Commit** — Commit with a descriptive message. Include the bug name and the fix in the message body. Push to origin/master from Linux.

5. **Sync to Mac** — Mac pulls the latest. Hermes owns this via SSH — user does not run terminal commands.

6. **Build** — Mac does Clean Build Folder + Run in Xcode (user action — only they can do this). Hermes waits.

7. **Validate** — User tests the specific fix on device. Reports back: fixed, or still broken, or new issue. Hermes does not declare victory — only the user's validation counts.
### Release or revert

- **If fixed:**
  1. Update `TODO.md` — move the bug to "Bugs fixed", mark `[x]`, include the fix commit hash and a one-line summary.
  2. Add `memory/changelog.md` entry for the date.
  3. Update `MEMORY-INDEX.md` status line to the current HEAD.
  4. Update Notion "Completed Fixes" — see Notion release format below.

- **If not fixed:** Revert the commit (`git revert`), push the revert, sync to Mac. The bug goes back to "Bugs to fix" untouched. No damage done.

### Notion release format (Completed Fixes section)

Each validated release gets one to-do block under the Notion "Completed Fixes" H2. Format:

- **Block type:** `to_do`, **unchecked** (no strikethrough — the fact it's under "Completed Fixes" is enough).
- **Title line:** `Release <commit-short-hash> — YYYY-MM-DD`
- **Body:** one bullet-style line per fix: `- <short description> (<commit-short-hash>)`
- **Ordering:** newest release on top. Next release inserts above the current one. The current one gets pushed down.

Example:
```
[ ] Release 633f4d6 — 2026-09-27
- effort persistence across navigation (f1c0c14)
- no set target after last set (14cef4f)
- average weight prompt typo (2429afb)
- set target message for increase (633f4d6)
- rest timer, elapsed time, set target persistence (10ac957)
```

How to do it (when the Notion API works): PATCH the to-do block's `rich_text` with the formatted text and `checked: false`. When the Notion API is blocked (Cloudflare), use the browser to edit the page directly.

### Rollback labeling

Every validated release gets a rollback anchor. The simplest approach:

- The commit that lands the fix is the release point.
- If a later change breaks things, `git revert` back to before that later change, or `git reset --hard` to the labeled release commit, then push --force-with-lease and sync.

The rollback label lives in the commit message. Look for commits starting with `rollback:` — those are the save points. The most recent one is `9787e7d` as of this writing.

### What this prevents

- Pushing 5 unrelated changes and having no idea which one broke the app
- "Did the bug fix land, or was it the other thing?" ambiguity
- Rolling back a whole batch because one item in it was bad
- Sessions that leave the app in an unknown state

### What this does NOT require

- Batching — each fix is its own cycle
- Perfect documentation mid-cycle — document at the end of the validated fix
- Asking permission — this is the operating model now

---

## Tagging conventions

Use lowercase, single-word tags. Pick the dominant domain first, then add a secondary system if needed:
  Primary tags: deploy, debugging, backend-db, auth, frontend-fetch, decisions, ios, capacitor, cors, postgres, schema, retry, token
Secondary tags: production, device, cache, validation, migration

The `related` field should list only files directly relevant. Prefer 1-3 links. Do not list every memory file.
