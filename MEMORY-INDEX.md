# Askeo Project Knowledge System
last_updated: 2026-09-10

This file explains where every type of project knowledge lives and when to use it.

## Current state (as of this update)
- Backend: deployed to Fly (`smartlift-api`, machine 2862102a31e718, v213), healthy at `https://askeo.fit/healthz`
- Frontend: built (`index-DbEsCaNh.js`, 874971 bytes), synced to MacBook, cap sync ios done
- Active work: inline set editor + history effort fix + backend parity deploy (shipped 2026-09-10)
- Next: user testing on device, then continue with Phase 1/2 work
- Git: 4 commits ahead of origin/master on `master` (ba90450, 343d9e7, 7071008, cc0eb53) — all pushed

## Bootstrap order
Read in this order at the start of any session:

1. `CONTEXT.md` — what's happening right now, what shipped, what's next
2. `PROJECT.md` — deploy commands, network facts, auth credentials (the things you cannot afford to get wrong)
3. `TODO.md` — full priority list and phased roadmap
4. `memory/<task>.md` — whatever's relevant to the task at hand

Reference materials (read when relevant, not mandatory at startup):
- `PERSONA.md` — role definitions and task ownership
- `Askeo.md` — stack, endpoints, users, gotchas, iOS bundle ID
- `memory/README.md` — catalog of all durable lesson files
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
- `backend/roadmap.html` — live rendered roadmap at https://askeo.fit/roadmap
- Purpose: visual status page showing completed / active / waiting / blocked work, dependency blockers, and what the user vs agent must do next
- Safe edit workflow:
  1. Edit `backend/roadmap.html` directly for content changes
  2. Redeploy with `bash -ic 'cd /home/phillip2823/workout-logger && python3 -m py_compile backend/main.py && fly deploy -a smartlift-api --no-cache'`
  3. Verify the live page before marking done
- Warning: `backend/scripts/generate_roadmap.py` was removed because it flattened the color-coded multi-column layout. Do not regenerate `roadmap.html` automatically from `TODO.md` without explicit approval and manual verification.
- Bullet legend on page: ✓ = completed, ○ = incomplete/waiting, 🔗 amber box = dependency/blocker

## Session History
- SecureCRT logs on MacBook: `/Users/phillipwalters/Projects/SecureCRT/Logs/Hermes Sessions/`
- Naming: `YYYY-MM-DD.log` for the main session, `YYYY-MM-DD_N.log` for additional sessions
- Read via `macbook` SSH alias:
  ```
  ssh macbook 'tail -200 "/Users/phillipwalters/Projects/SecureCRT/Logs/Hermes Sessions/YYYY-MM-DD.log"'
  ```
- Use when you need session continuity — what shipped last, decisions made, open threads

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
4. Hermes memory should only store lightweight pointers to this knowledge system, not duplicate its content.
5. Update `memory/changelog.md` whenever a knowledge file changes materially.
6. When unsure whether to record something, use the decision checklist below.
7. **Never ask the user to run terminal commands for deploy/sync/device operations.** The agent owns these end-to-end via SSH to `macbook`.

## Decision checklist
When unsure whether to record something:
1. Will the same issue reappear? -> Record it.
2. Is it a one-time environment quirk? -> Log in `changelog.md` only.
3. Does it change future behavior? -> Also record in `decisions.md`.
4. Is it user-facing (UX/flow change)? -> Also update `TODO.md` and `Askeo.md`.

## Tagging conventions
Use lowercase, single-word tags. Pick the dominant domain first, then add a secondary system if needed:
  Primary tags: deploy, debugging, backend-db, auth, frontend-fetch, decisions, ios, capacitor, cors, postgres, schema, retry, token
Secondary tags: production, device, cache, validation, migration

The `related` field should list only files directly relevant. Prefer 1-3 links. Do not list every memory file.

## Ownership and contributor flow
- Any agent session may add lessons to `memory/` and update `decisions.md`
- Domain-specific additions go to the matching file (or a new `memory/<topic>.md`)
- Structural changes (new file format, registry schema, merging files) also update `MEMORY-INDEX.md` and `changelog.md`
- The global registry at `~/.hermes/projects.md` is maintained by the same rules: add project entries on project creation, update paths on rename

## Global registry maintenance
Hermes maintains a project registry at `~/.hermes/projects.md` that maps all projects to paths and entry points. Add a new project:
```markdown
## Project Name
path: /absolute/path/to/repo
entry: relative/path/from/repo/root
knowledge: path/to/decisions-or-memory-index
```
Update the registry whenever a project moves, is renamed, or is archived.

## Global registry
Hermes maintains a project registry at `~/.hermes/projects.md` that maps all projects to their paths and entry points.

## Pre-Build Check

Before building from Xcode or testing, verify the deploy pipeline is current:
1. Git: `git status` — no uncommitted changes that should be pushed
2. Backend: `curl -s https://askeo.fit/healthz` → `{"status":"ok"}`
3. Frontend bundle: check `frontend/ios/App/App/public/assets/index-*.js` on MacBook matches latest `frontend/dist/` build

Do not use `scripts/sync-check.sh` — it is not maintained for this environment.
