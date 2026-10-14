# TODO
last_updated: 2026-10-14

## Current State (as of this update)

- **Git HEAD:** `0f0730b` — "feat: add 6 model classes (Linear, Foundation, Hypertrophy, StrengthA, StrengthB, Maintenance) with compute() methods"
- **Build:** `index-D9MNLi7W.js` (frontend dist), synced to iOS at `frontend/ios/App/App/public/assets/`
- **Deploy status:** Backend deployed to Fly (commit `0f0730b`, build-info timestamp `2026-10-14T17:10:24Z`). Health OK.
- **Session-targets endpoint:** WORKING. Returns 6 exercises with coaching messages. Fixed 7 attribute errors (library_id, sets_target, name, is_compound, prescription dict access).
- **iOS bundle in app:** `index-D9MNLi7W.js` — synced to iOS, user needs Clean Build Folder to pick up latest.
- **Backend error logging:** `/app/logs/session_targets_error.log` on server — captures full traceback + session_id + user_id on every 500.

## Session Target Status (CURRENT — just fixed)

- [x] Session-targets endpoint returning 0 exercises — FIXED
- [x] 500 errors — FIXED (7 attribute errors resolved)
- [x] "This is the coach notes for Foundation." showing — VERIFIED on device
- [ ] Coaching messages come from backend model classes — Phase 2 models built (6 classes in progression.py); Phase 3 will wire session_targets to use them
- [ ] Session targets use model-generated coaching messages (not hardcoded) — NEXT (Phase 3)
- [ ] Set 1 coaching message pulls from last session data — NEXT (Phase 5)
- [ ] Cross-model weight adjustment on model switch — NEXT (Phase 5)
- [ ] Model indicator appears in coach notes header — NEXT (Phase 5)

## What We Just Learned (Drawing file analysis + current state)

The session-targets endpoint works. The frontend displays "This is the coach notes for Foundation." — a hardcoded message from `main.py:3922`. The frontend is now model-agnostic (Phase 1 done): it removed the hardcoded Foundation override from `logSet` and fixed Set 2+ coaching message display. The frontend uses whatever `prescriptions[exercise.id].coaching_message` contains.

But the backend doesn't have model classes yet. The `model_picker` function in `progression.py` returns 5 raw values (rep_floor, rep_cap, increment, suggested_weight, should_increase) — no coaching_message, no block_name. The `session_targets` endpoint hardcodes the coaching message. The frontend's `rules.ts` has the real progression logic (`doubleRule`, `linearRule`) and coaching message generation — but this is about to be moved to the backend.

**Architecture insight (from Drawing file):** Model_Picker is the single source of truth. Frontend never hardcodes model logic. But for this to work, the models need to exist in the backend first. Model_Picker delegates to models. Models return full prescriptions. Session-targets uses model prescriptions. Frontend uses model_picker's prescriptions.

**Phase order:**
1. Phase 0: DONE — session-targets endpoint fixed
2. Phase 1: DONE — frontend model-agnostic
3. Phase 2: IN PROGRESS — build backend model classes (Linear, Foundation, Hypertrophy, Strength A/B, Maintenance)
4. Phase 3: AFTER Phase 2 — model_picker delegates to models, session_targets uses model prescriptions
5. Phase 4: AFTER Phase 3 — frontend uses model_picker's prescription for per-set messages
6. Phase 5: AFTER Phase 4 — detailed per-model session/set target logic
7. Phase 6-9: Onboarding, block state, rotation, coach polish, deployment

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

### Architecture Decision (from Drawing file discussion)

**Model_Picker as Thin Selector:**
- Model_Picker determines *which* model to use (block_state, load meter, time, workout count, manual) and delegates to that model for ALL data
- Each model has a `compute()` method that returns everything: suggested_weight, rep_floor, rep_cap, coaching_message, block_name, increment_rule, should_increase
- Frontend renders whatever the model returns — zero model-specific if/statements
- Flipping the model = Model_Picker picks a different model = model.compute() returns different data = frontend automatically renders differently
- Session-targets passes last-session data into `Model.compute()` so Set 1 coaching message includes last-session context
- Per-set compute flow passes previous set data into `Model.compute()` for Set 2+ coaching messages

**Set 1 vs Set 2+ Architecture:**
- **Set 1 (Session Target):** Pulls from last session data, uses current model's logic. Model_Picker picks the model, model.compute() returns Set 1 coaching message (incorporating last session weight/reps). Weight and reps from model.compute() response.
- **Set 2+ (Set Target):** Uses Model_Picker logic with previous set data. Per-set compute flow calls model.compute() with previous_set_data. Already partially working via per-set computePrescription + block override in frontend, but should ultimately use model.compute() for the coaching message.

**Cross-Model Transitions:**
- Need to track which model the last session used
- If same model: continue progression from last weight/reps
- If different model: model.compute() adjusts weight based on new model's rep targets and philosophy

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
