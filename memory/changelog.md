# Knowledge Base Changelog

Tracks changes to all files in `memory/` and top-level project docs.

Format: DATE | FILE | TYPE | SUMMARY

---

## 2026-07-31
| File | Type | Summary |
|---|---|---|
| `memory/README.md` | created | Directory index with file catalog and usage rules |
| `memory/deploy.md` | created | Frontend rsync/cap sync pipeline, bundle hash validation, backend deploy, checklist |
| `memory/debugging.md` | created | iOS WKWebView/CORS/Capacitor lessons, Network tab triage, cache invalidation |
| `memory/backend-db.md` | created | Fly Postgres migration pattern, schema drift warning, known columns |
| `memory/auth.md` | created | Token persistence, refresh flow, 401 triage, CORS/auth interaction |
| `memory/frontend-fetch.md` | created | api.ts request flow, 30s timeout rule, error handling, WKWebView gotcha |
| `memory/decisions.md` | normalized | All entries reformatted as ADRs with status/tags/consequence |
| `Askeo.md` | updated | Added iOS debugging/cache gotchas, CORS origins list, knowledge hierarchy section |
| `PROJECT.md` | updated | Replaced stale rsync command; added `--no-cache`; reference to memory/deploy.md |
| `TODO.md` | updated | Marked health/schema/rolls as complete |
| `CONTEXT.md` | updated | Recorded Workouts tab fix, knowledge hierarchy creation, next actions |
| `~/.hermes/projects.md` | created | Global project registry mapping all projects to paths/entries |
| Hermes memory | updated | Project registry path + Askeo knowledge hierarchy reference |
| `memory/README.md` | updated | Added lesson quality checklist, merge/rename lifecycle, tagging conventions, example tags |
| `MEMORY-INDEX.md` | updated | Added decision checklist, tagging rules, contributor flow, global registry maintenance guide |
| `memory/changelog.md` | updated | What counts as material change, ownership model |
| `memory/trainer.md` | created | Trainer questionnaire schema, workout/meal generation rules, backend endpoint design |
| `TODO.md` | updated | Trainer workflow split into Section 1 body metrics, Section 2 training profile, Section 3 nutrition opt-in |
|| `backend/roadmap.html` | updated | Added explicit per-phase dependency mapping |
|| `backend/roadmap.html` | updated | Marked completed Phase 1 agent tasks as done; validation remains blocked by user RIR data |
|| `backend/roadmap.html` | updated | Fixed color coding: user/waiting tasks now amber with open bullets; added missing blocked/pending Phase 1 agent tasks |
|| `memory/deploy.md` | updated | Documented Linux interactive-shell requirement for flyctl due to ~/.bashrc token sourcing |
|| `PROJECT.md` | updated | Documented interactive-shell deploy command to prevent future token-auth failures |
|| `memory/changelog.md` | updated | Recorded deploy lesson and roadmap correction |
|| Hermes memory | updated | Trimmed to user preferences + bootstrap pointer; all durable state moved to repo docs |

---

## 2026-08-01
|| File | Type | Summary ||
|---|---|---|
|| `backend/models.py` | updated | Added missing `__tablename__ = "app_settings"` to `AppSetting` which caused 502 on startup |
|| `CONTEXT.md` | updated | Phase 1 backend complete; validation blocked on user RIR data |
|| `TODO.md` | updated | Phase 1 renamed to Linear Progression; backend/frontend tasks marked complete |
|| `Askeo.md` | updated | Added `/api/rules/next-prescription`, `/api/rules/algorithm-state/{id}`, `/api/rules/transitions` endpoints |
|| `backend/models.py` | created | Added `ProgressionTransition` model; extended `AlgorithmState` with `exercise_entry_id` and progression fields |
|| `backend/main.py` | updated | Next prescription persists state + transitions; added 2 new GET endpoints |
|| `frontend/src/api.ts` | updated | Added `nextPrescription`, `getAlgorithmState`, `listProgressionTransitions` helpers |
|| `frontend/src/pages/ActiveWorkoutScreen.tsx` | updated | Backend prescription integration in `ai_trainer` mode with local fallback |
|| `backend/roadmap.html` | updated | Added explicit per-phase dependency mapping |

---

## 2026-07-29
|| File | Type | Summary |
|---|---|---|
|| `TODO.md` | updated | Phase 2 coaching UX items marked implemented via coach settings/save/override endpoints |
