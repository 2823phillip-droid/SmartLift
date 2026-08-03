# Active Context

Updated when work in progress changes.

## Current Task
Phase 1 — Linear Progression backend implementation is complete and deployed. Next blocker is user-generated workout data: need 2–3 real workout sessions with RIR logging to validate linear progression defaults and calibrate stall detection for Phase 2.

## Completed
- Added `ProgressionTransition` model to `backend/models.py`.
- Extended `RuleRequestIn` with `exercise_entry_id` so prescription API knows which exercise is targeted.
- `POST /api/rules/next-prescription` now:
  - accepts `exercise_entry_id`
  - persists `AlgorithmState` per user + exercise
  - creates `ProgressionTransition` when phase changes
- Added read endpoints:
  - `GET /api/rules/algorithm-state/{exercise_entry_id}`
  - `GET /api/rules/transitions`
- Frontend `api.ts` exposes `nextPrescription(...)`, `getAlgorithmState(...)`, `listProgressionTransitions()`.
- `ActiveWorkoutScreen.tsx` now uses backend prescriptions in `ai_trainer` mode; falls back to local `rules.ts` on failure.
- Roadmap updated at `/home/phillip2823/workout-logger/backend/roadmap.html` with dependency notes.
- Backend compiled and deployed to `https://askeo.fit` via `fly deploy -a smartlift-api --no-cache`.
- TypeScript compiles clean (`npx tsc --noEmit`).

## Next Actions
- User: log 2–3 real workout sessions with effort + RIR per set.
- Agent: validate linear progression behavior against real data once available.
- Agent: add pytest coverage for `/api/rules/next-prescription` side effects.
- Agent: update `Askeo.md` Key Endpoints section with new rules routes.

## Notes
- Knowledge hierarchy is documented in `MEMORY-INDEX.md`; always read it before starting work.
- All domain-specific lessons are in `memory/<topic>.md`.
- When a fix involves a non-obvious pattern, add it to the relevant `memory/` file.
- Never fall back to local backend (`192.168.1.111:8000`); production is `https://askeo.fit/api`.
