# Active Context

Updated when work in progress changes.

## Current Task
Design and implement the trainer-generated workout questionnaire flow: backend endpoint + frontend screen, shown on first login and repeatable from AI Trainer tab. Step-through UI with single-select tabs and multi-select chips. Three sections: body metrics (weight/height/sex/activity), training profile, nutrition opt-in. Returns workout draft + optional meal plan draft.

## Completed
- Fixed Workouts tab 500 root cause: production DB missing `contexts.order` column.
- Added missing `order` columns to production Postgres: `contexts`, `workout_templates`, `exercise_entries`.
- Backend CORS now allows both `capacitor://localhost` and `ionic://localhost`.
- Knowledge hierarchy established: `MEMORY-INDEX.md` + `memory/` directory with frontmatter/ADR standards.
- Removed dead `MUSCLEWIKI_BASE` code from backend; unified exercise source as ExerciseDB (Kaggle).

## Next Actions
- Backend: define `POST /api/trainer/generate` request/response schema and deterministic ExerciseDB selection rules.
- Frontend: build questionnaire screen and integrate into AI Trainer tab and first-login flow.
- Define draft lifecycle: generated workout stores as draft; user can accept, tweak in builder, or discard.

## Notes
- Knowledge hierarchy is documented in `MEMORY-INDEX.md`; always read it before starting work.
- All domain-specific lessons are in `memory/<topic>.md`.
- When a fix involves a non-obvious pattern, add it to the relevant `memory/` file.
