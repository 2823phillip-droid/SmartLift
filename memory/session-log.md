# Session Log — Askeo / Workout-Logger

last_updated: 2026-09-18 (updated at end of each session)
purpose: chronological record of Hermes sessions that changed project state. Read this to catch up on recent work before starting a new session.

This file is the curated index. Full session transcripts are in the Hermes session DB and can be searched via `session_search(query="...")`. Individual session notes for debugging sessions are in `../.hermes/skills/software-development/smartlift-deploy-debug/references/` (97 session reference files as of 2026-09-18).

## Format

Each entry: DATE — goal (one line) → outcome, HEAD at end of session, key files touched, known issues left for next session.

---

## 2026-09-18 — Project cleanup + sync process definition (HEAD: 95b47a7)

**Goal:** Clean project state, define session lifecycle process, resolve 5 uncommitted files with unclear provenance.

**Outcome:** Done. Both machines at 95b47a7, clean working trees, no untracked files.

**What happened:**
- Read "Last Session" logs from Mac Downloads folder — found stale root ActiveWorkoutScreen.tsx was being compiled by Xcode instead of patched frontend version (already fixed in prior session), simulator 500s on /rules/next-prescription
- Audited Linux: 11 commits behind origin/master, 5 uncommitted files (api.ts, HistoryScreen.tsx, SettingsScreen.tsx, vite.config.ts, backend/Dockerfile) with no record of why they existed
- Audited Mac: clean, at d2e4013, stale root files already cleaned
- Backend URL audit: askeo.fit and smartlift-api.fly.dev are aliases — same Fly app (server 57f2b87, IP 66.241.124.80). .env sets runtime URL on both machines, making hardcoded defaults in api.ts irrelevant
- Resolved 5 files: 2 real fixes committed (api.ts token recovery from localStorage on 401/403, HistoryScreen.tsx JSX closing brace), 3 drift reverted (Dockerfile BUILD_TIMESTAMP — never used, SettingsScreen placeholder — cosmetic only, vite.config __API_BASE_URL__ — redundant with .env)
- Rewrote MEMORY-INDEX.md with current state, sync definition, sync workflow, pre-build check, Session Lifecycle process
- Created session-lifecycle.md skill reference with full process detail + known issues this process caught
- Added Recent sessions section to ~/.hermes/memories/MEMORY.md for future session catch-up
- Both machines pulled to origin/master, verified clean

**Known issues left:** Backend deployed at 60019a7 (behind frontend HEAD 95b47a7). POST /api/rules/next-prescription returns 500 — app falls back to local rules. This is the progression bug we were investigating before cleanup.

**Files touched:** MEMORY-INDEX.md, memory/changelog.md, memory/session-log.md (this file), ~/.hermes/memories/MEMORY.md, memory/session-lifecycle.md (new — copied from .hermes/skills/project-context/references/), .hermes/skills/project-context/references/session-lifecycle.md (updated to point to repo copy), .hermes/skills/software-development/smartlift-deploy-debug/references/session-2026-09-18-project-cleanup-and-sync-process.md (created)

---

## 2026-09-17 — Stale file discovery + simulator log capture (HEAD: d2e4013)

**Goal:** Investigate why Xcode Run wasn't picking up the ActiveWorkoutScreen.tsx fix, capture iOS simulator logs.

**Outcome:** Found root cause (stale duplicate file), fixed it, captured simulator logs showing 500s. Session interrupted before full cleanup.

**What happened:**
- Found two copies of ActiveWorkoutScreen.tsx: stale root copy (62582 bytes, Sep 17, pre-fix, NOT in git) and patched frontend copy (62879 bytes, Sep 18, commit d2e4013). Xcode was compiling the root copy — that's why Run didn't help
- Replaced root copy with patched frontend version, verified MD5 match
- Captured iOS simulator logs from "Last Session" in Downloads folder — repeating 500 errors on /api/rules/next-prescription, 401 errors, app falling back to local rules
- Diagnosed: backend /rules/next-prescription endpoint returning 500 (internal_server_error) — need to check Fly logs for actual traceback
- User interrupted: "we need to clean and organize the project as a whole" — session stopped before committing cleanup

**Known issues left at session end:** 5 uncommitted files on Linux (still there at start of Sept 18 session), Linux 11 commits behind origin/master, no documented sync process, no session log

**Files touched:** ActiveWorkoutScreen.tsx (root, replaced with patched version), frontend/src/pages/ActiveWorkoutScreen.tsx (patched in commit d2e4013)

---

## 2026-09-18 — Documentation reorganization: session log in repo, MEMORY.md trimmed to pointer (HEAD: 1ec2e16)

**Goal:** Move session history out of ~/.hermes/memories/MEMORY.md (which fills up fast) into a versioned repo file that MEMORY.md points to. Future sessions read MEMORY.md → get pointed to session-log.md → read recent entries to catch up.

**Outcome:** Done. Both machines at 1ec2e16, clean working trees.

**What happened:**
- Created `memory/session-log.md` in repo — chronological record of sessions that changed project state, versioned alongside the code
- Created `memory/session-lifecycle.md` in repo — copies the Session Lifecycle process from .hermes/skills/ into the repo where it's versioned and referenced by MEMORY-INDEX.md
- Trimmed ~/.hermes/memories/MEMORY.md from 5715 bytes to 4247 bytes — removed the inline "Recent sessions" section, now it's a pure pointer to `memory/session-log.md`
- Added `.hermes/` to `.gitignore` — Hermes local config stays out of the repo cleanly
- Updated session-lifecycle.md to point to repo copy of session-log.md
- Both machines verified clean at HEAD 1ec2e16

**Known issues left:** Backend deployed at 60019a7 (behind frontend HEAD 1ec2e16). POST /api/rules/next-prescription returns 500 — app falls back to local rules. This is the progression bug we were investigating before cleanup.

**Files touched:** memory/session-log.md, memory/session-lifecycle.md, .gitignore, MEMORY-INDEX.md, ~/.hermes/memories/MEMORY.md

- One entry per session that changed project state meaningfully (code, config, process, docs)
- Investigation-only sessions ("look at logs", "read the code") get a brief entry if they surfaced something important
- HEAD at end of session is recorded so future sessions can diff against it
- Known issues left for next session are called out explicitly
- Full transcripts: `session_search(query="...")` in Hermes DB
- Debug session notes: `.hermes/skills/software-development/smartlift-deploy-debug/references/session-YYYY-MM-DD-*.md`

## How to use this at session start

1. Read `MEMORY.md` (auto-injected — has pointer to this file)
2. Read the most recent entry here to understand current state + what's pending
3. If you need more detail on a specific past session, search the session DB or read the reference file
4. Before starting work, run the sync audit (MEMORY-INDEX.md §Session Lifecycle) — don't assume state from this log is current
