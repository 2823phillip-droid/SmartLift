# TODO
last_updated: 2026-10-14

## Current State (as of this update)

- **Git HEAD:** `eaeb80d` — "docs: update MEMORY-INDEX.md to 1ccaacaf / final state"
- **Build:** `index-T4rHju19.js` (frontend dist), synced to iOS at `frontend/ios/App/App/public/assets/`
- **Deploy status:** Backend deployed to Fly (commit `26e9a6b`, build-info timestamp `2026-10-14T15:10:48Z`). Health OK.
- **Session-targets endpoint:** WORKING. Returns 6 exercises with coaching messages. Fixed 7 attribute errors (library_id, sets_target, name, is_compound, prescription dict access).
- **iOS bundle in app:** `index-UMYqsEJ_.js` (previous) — user needs Clean Build Folder to pick up `index-T4rHju19.js` or latest.
- **Backend error logging:** `/app/logs/session_targets_error.log` on server — captures full traceback + session_id + user_id on every 500.

## Session Target Status (CURRENT — just fixed)

- [x] Session-targets endpoint returning 0 exercises — FIXED (use session.template.exercises)
- [x] 500 errors — FIXED (7 attribute errors resolved: library_id, sets_target, name, is_compound, prescription dict access)
- [x] Session targets now showing "This is the coach notes for Foundation." — VERIFIED (user confirmed on device)
- [ ] Coaching messages should be model-specific, not generic — NEXT (Phase 4)
- [ ] Model indicator should appear in coach notes header — NEXT (Phase 5)
- [ ] Set 1 coaching message should pull from last session data — NEXT (Phase 4)
- [ ] Cross-model weight adjustment on model switch — NEXT (Phase 4)

## What We Just Learned (Drawing file analysis)

The session-targets endpoint now works. The frontend displays "This is the coach notes for Foundation." — the generic message from `main.py:3922`. This works, but it's not the full picture. The design notes in the Drawing file (lines 28-56) describe the target architecture:

- **Model_Picker is the single source of truth.** Frontend never hardcodes model logic. It just calls Model_Picker and renders whatever comes back.
- **Set 1** pulls from last session, uses current model's logic. Weight and reps come from Model_Picker's response.
- **Set 2+** uses Model_Picker logic with previous set data (already working via per-set `computePrescription` + Foundation override in frontend).
- **Cross-model transitions** need weight adjustment. If last session was Linear (6-8 reps, heavy) and this is Foundation (8-10 reps, lighter), weight should decrease.
- **Model rotation** via Load Meter, Time, Workout count, Manual.

**Key insight:** The frontend is currently NOT fully model-agnostic. It has hardcoded Foundation messages in `ActiveWorkoutScreen.tsx` (lines 950-957: "Foundation: You hit 10 reps...") and the backend has a hardcoded generic message. The frontend should just render whatever Model_Picker returns.

## Bugs to fix

### Session Target Summary — CORE FIX (done, verifying)
- [x] Session-targets endpoint returning 0 exercises — FIXED
- [x] 500 errors (7 attribute errors) — FIXED and verified
- [x] "This is the coach notes for Foundation." showing — VERIFIED on device
- [ ] Session targets receive correct coaching messages per model — NEXT

### Previous bugs (resolved)
- [x] Session-targets 500 — NameError: WorkoutSessionExercise not defined
- [x] Session-targets 500 — ImportError: cannot import WorkoutSessionExercise
- [x] Session-targets returning 0 exercises — FIXED
- [x] Fallback prescription computation causing old linear messages — removed
- [x] logSet function using local computePrescription — patched to use model_picker data
- [x] Foundation coaching messages not showing — FIXED and verified
- [x] Set 2 weight reverts to session target on nav away/back — FIXED
- [x] Rest timer lost on nav away/back — FIXED

## Architecture Decision (from Drawing file discussion)

### Model_Picker as Single Source of Truth
- Frontend never hardcodes model-specific logic (no "Foundation:" prefixes in TypeScript)
- Model_Picker returns ALL data the frontend needs: suggested_weight, rep_floor, rep_cap, coaching_message, block_name, increment_rule, etc.
- Frontend just renders whatever Model_Picker returns
- Flipping the model = Model_Picker returns different data = frontend automatically renders differently

### Set 1 vs Set 2+ Architecture
- **Set 1 (Session Target):** Pulls from last session data, uses current model's logic. Model_Picker returns the Set 1 coaching message (incorporating last session weight/reps). Weight and reps from Model_Picker response.
- **Set 2+ (Set Target):** Uses Model_Picker logic with previous set data. Already working via per-set `computePrescription` + block override in frontend. But should ultimately come from Model_Picker too.

### Cross-Model Transitions
- Need to track which model the last session used
- If same model: continue progression from last weight/reps
- If different model: adjust weight based on new model's rep targets and philosophy

## Phase Plan

See `ReleaseNotes/progression_tasks.md` for the full detailed phase breakdown. This TODO tracks the working state.

## Modifications / Tweaks

### Coach messages
- [ ] Change "This workout" to "Next workout" in all coaching messages (backend `rules.py` + frontend `rules.ts`)

### Weight display
- [ ] Audit all frontend weight display paths for consistent kg/lbs conversion
- [ ] Allow user to override weight (coach suggests +5lbs, user can enter custom weight)

### Layout / UI
- [ ] Coach tab layout — header dead-pinned at top, only conversation box scrolls

## Backlog / Wishlist

### Social
- [ ] Friend system
- [ ] Share workouts
- [ ] Status updates

### Prebuilt Templates
- [ ] Remove automatic workout builder — DELETE `POST /api/trainer/generate` endpoint
- [ ] Retire `QuestionnaireScreen.tsx` template-generation logic

### Notifications
- [ ] Push notifications — workout reminders, rest timer alerts, coach messages

### Coach Tab Layout
- [ ] Header dead-pinned at top edge on every tab; only conversation box scrolls
