# Durable Lessons

This directory contains one-file-per-domain lessons learned through debugging and decision-making.

## Usage
- Read `../MEMORY-INDEX.md` first for the full knowledge map
- Open any file below when working in that domain
- Update a file immediately when you discover a new non-obvious pattern

## Files

| File | Domain | When to read |
|---|---|---|
| `deploy.md` | Frontend/backend deployment, validation, bundle sync | Before any push to device or production |
| `debugging.md` | WKWebView, Capacitor, iOS, CORS, Safari Web Inspector | When any iOS-side error appears |
| `backend-db.md` | Fly.io Postgres, SQLAlchemy, schema migrations | Before schema changes or when backend 500s on queries |
| `auth.md` | JWT, token persistence, refresh flow, 401/403 | When login breaks, tokens fail, or auth headers missing |
| `frontend-fetch.md` | `api.ts`, fetch, retry, timeout, AbortController | Before touching fetch logic or error handling |
| `decisions.md` | ADR records: context, options, decision, consequence | When revisiting a past technical decision |
| `trainer.md` | Trainer questionnaire schema, workout/meal generation rules, backend endpoints | When building or changing trainer-generated workout or meal plan features |
| `ai-coach-capabilities.md` | AI coach tools, prompts, validation rules, hard limits, domain guardrails | Before changing AI coach behavior, tools, or profile/workout modification logic |
| `changelog.md` | History of changes to the knowledge base | When auditing what changed and when |

## Adding a new domain
Create a new `memory/<topic>.md`. Add it to this README and to `../MEMORY-INDEX.md`.

## When to record a lesson
Use the quality checklist before adding anything:
1. Non-obvious — a future agent would repeat the mistake without this note
2. Durable — will matter in 3+ months
3. Actionable — prevents a class of errors, not just describes one
4. Linked — tagged and added to MEMORY-INDEX.md

If yes to all 4, add it. If no to any, skip or save in `changelog.md` only.

## Lesson lifecycle
Merge: move content into the canonical domain file, update `related` everywhere, add a `deprecated` note at the top of the old file pointing to the new location.
Rename: same as merge; new filename becomes canonical.
Delete: only after merge complete and at least one full session has elapsed with no references in `related`.

## Tagging conventions
use lowercase, single-word tags. pick the dominant domain first, then add a secondary system if needed:
  Primary tags: deploy, debugging, backend-db, auth, frontend-fetch, decisions, ios, capacitor, cors, postgres, schema, retry, token
Secondary tags: production, device, cache, validation, migration

## When to update changelog.md
Update `memory/changelog.md` only when:
- A memory file is created, merged, renamed, or deleted
- ADR records are added to `decisions.md` (batch monthly if needed)
- Frontmatter schema or file-format standards change
- The ADR format template itself changes

Minor typo fixes do not need a changelog entry.
