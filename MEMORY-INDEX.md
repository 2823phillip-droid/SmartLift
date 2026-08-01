# SmartLift Project Knowledge System

This file explains where every type of project knowledge lives and when to use it.

## Top-level files (stable references)
- `PROJECT.md` — immutable-ish repo facts: paths, network addresses, deploy commands, auth credentials, non-negotiables
- `PERSONA.md` — role definition for agents working in this repo
- `TODO.md` — phased roadmap. Read this at the start of any session to understand current priorities
- `SMARTLIFT.md` — stack reference, endpoint list, known gotchas, users, backups. Updated when stack changes
- `CONTEXT.md` — what we’re working on right now, what shipped last, what’s next. Check this before asking the user about current state
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
`memory/decisions.md` | When revisiting a past technical decision
`memory/changelog.md` | When auditing what changed and when

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
1. Start every session by reading: `TODO.md`, then `CONTEXT.md`, then the relevant `memory/<topic>.md` files listed below.
2. Use `PROJECT.md` for stable repo facts and `SMARTLIFT.md` for stack/endpoint reference.
3. Record lessons in `memory/<topic>.md`, not in Hermes memory.
4. Hermes memory should only store lightweight pointers to this knowledge system, not duplicate its content.
5. Update `memory/changelog.md` whenever a knowledge file changes materially.
6. When unsure whether to record something, use the decision checklist below.

## Decision checklist
When unsure whether to record something:
1. Will the same issue reappear? -> Record it.
2. Is it a one-time environment quirk? -> Log in `changelog.md` only.
3. Does it change future behavior? -> Also record in `decisions.md`.
4. Is it user-facing (UX/flow change)? -> Also update `TODO.md` and `SMARTLIFT.md`.

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
Adding a new project to `~/.hermes/projects.md`:
```markdown
## Project Name
path: /absolute/path/to/repo
entry: relative/path/from/repo/root
knowledge: path/to/decisions-or-memory-index
```
Update the registry whenever a project moves, is renamed, or is archived.

## Global registry
Hermes maintains a project registry at `~/.hermes/projects.md` that maps all projects to their paths and entry points.
