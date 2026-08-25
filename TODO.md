# TODO

## Phase 1 — Linear Progression: backend complete, validation pending user data

### Backend implementation
- [x] Wire frontend → backend prescription API (`POST /api/rules/next-prescription`)
- [x] Persist `AlgorithmState` per exercise server-side
- [x] Log `ProgressionTransition` on phase change
- [x] Add read endpoints: `GET /api/rules/algorithm-state/{id}`, `GET /api/rules/transitions`
- [ ] Validate linear progression against real user data with RIR (blocked on user logging 2–3 sessions)

### Frontend integration
- [x] `api.ts` helpers for prescription, algorithm state, transitions
- [x] `ActiveWorkoutScreen.tsx` calls backend in `ai_trainer` mode with local fallback
- [ ] Surface backend prescription errors to user in UI
- [ ] Add transition history view in app

### Verification
- [ ] pytest coverage for `/api/rules/next-prescription` side effects
- [ ] Confirm `AlgorithmState` + `ProgressionTransition` rows created on phase change
- [ ] End-to-end test: identical inputs → identical outputs unless RPE/RIR changes

### Verified / preserved (do not break)
- [x] Template pencil opens full workout editor
- [x] Back from template editor returns to Workouts tab
- [x] Fly-only API base (`https://askeo.fit/api`); no local LAN fallback
- MacBook sync target: `macbook:~/workout-logger/frontend/ios/App/App/public/` (do not use IP directly)
- [x] `workout_mode` persists across app restarts via localStorage fallback

---

## Phase 2 — Rule Engine: Deterministic coaching scripts

### Canonical rules (single source of truth)
- [ ] Define canonical rule specification in one place: inputs, outputs, progression types, safety boundaries
- [ ] Define standard fitness model schema consumed by all rule implementations
- [ ] Determinism requirement: identical inputs -> identical outputs unless user state changes
- [ ] Additive-only gate: rules remain deterministic even as AI profile is layered on top in Phase 4

### Backend implementation
- [ ] Implement canonical rule module in Python (FastAPI/Starlette)
- [ ] Double progression: when all sets hit top rep band for target reps, increase weight next session; if miss, repeat
- [ ] Linear progression: fixed increment per successful session; stall rule after N failures
- [ ] Percentage / 1RM-based: compute working weight from stored or estimated 1RM; advance/regress based on completion quality
- [ ] Periodization: weekly/mesocycle plan block hooks; scheduled deload week triggers reduced volume/intensity
- [ ] Autoregulation (RPE/RIR): derive effective load and next-session prescriptions from reported RPE/RIR; allow micro-load/step back
- [ ] Deloading: automatic deload trigger + manual deload with preserved rhythm
- [ ] Backend computes next planned workout prescription from history + assigned rule script

### Frontend / on-device implementation
- [ ] Port canonical rules to TypeScript for use inside the app
- [ ] Active workout autoregulation runs locally with no network dependency
- [ ] After each set completion, run autoregulation locally and update next set UI immediately
- [ ] Capture RPE/RIR inputs inline during workout before moving to next set
- [ ] Offline-first behavior: queue completed workout payload when offline, resume sync on reconnect
- [ ] Preserve completed sets and local outputs through background/suspend without dependence on in-memory only state
- [ ] No external network calls inside autoregulation during active workout
- [ ] Deload/manual override path available locally if autoregulation suggests aggressive load

### Frontend UX for rule engine
- [x] Coach: block-level orchestration (`compute_coach_state`) in backend + TypeScript port
- [ ] Settings/defaults: user selects preferred rule script per exercise group or per workout
- [ ] Exercise detail shows current rule-derived prescription: weight, reps, sets, rest, progression step, estimated 1RM
- [ ] During active workout: show next prescribed set (adaptive to completed sets if autoregulated)
- [ ] Post-workout: capture RPE and RIR inputs before completion so backend can compute next prescription
- [ ] Template editor exposes rule-engine placement: default/static values vs dynamic prescriptions

### Data model prerequisites
- [ ] Capture required session data for rule engine: exercise_order, sets_target, reps_target, weight_target, rest_seconds, datetime_completed, rpe, rir
- [ ] Confirm existing `workout_end_summary` / active workout POST payload carries enough state for progression rules to compute next workout
- [ ] Define schema for `rule_script` / `rule_assignment` in Postgres (or extend `settings` payload) so a user/workout can be assigned a deterministic script

### Coaching UX extensions (recommended follow-ups)
- [ ] Per-template default progression + muscle-group rules editor: let template authors set a default progression type and override per muscle-group rule in template editor
- [ ] Exercise-level RPE/RIR targets override in template: allow template to specify preferred RPE/RIR targets that feed into autoregulation during active workout
- [ ] Deload auto-skip for movements flagged with deload override=false: respect per-exercise deload preference so certain exercises skip deload when selected
- [ ] Visual timer badge on exercises when next deload is within 7 days: show countdown badge on exercise cards so user knows deload is approaching
- [ ] Editable Coach settings per user (block durations, deload thresholds, progression order) — implemented 2026-07-29
- [ ] Backend `POST /api/coach/override` + `GET /api/coach/state` endpoints — implemented 2026-07-29
- [ ] Force control buttons wired to backend overrides so changes persist across devices — implemented 2026-07-29
- [ ] Coach settings UI in SettingsScreen (`CoachSettingsSection`) — implemented 2026-07-29
- [ ] Persist Coach state via existing `settings` save on workout end so it survives app reinstalls — implemented 2026-07-29
- [ ] **Coach Recap on Ready screen: fix session lookup so it finds last completed session of same template** (currently returns empty even when completed session exists)
- [ ] **Coach Recap weight display: convert backend `actual_weight` from kg to lbs in PreWorkoutScreen before displaying** (PostWorkoutScreen already does this correctly)
- [ ] **Coach message wording: change "This workout" to "Next workout" in all coaching messages** (backend `rules.py:198` and frontend `rules.ts` multiple locations)
- [ ] **Auto-update draft weight after logging a set to match coach prescription in ai_trainer mode** (currently stays at logged weight instead of moving to recommended next weight)
- [ ] **Prevent reps_target=0 from propagating through template editor** (`TemplateEditorScreen.tsx:288` uses `?? 10` but `??` doesn't catch explicit 0; `addSet` initializes `{reps: 0}`)

### Verification
- [ ] Unit tests for each rule type against synthetic session history
- [ ] End-to-end test: user with known history receives correct next-session prescription
- [ ] Confirm deterministic behavior: same input sequence always yields same next prescription unless RPE/RIR changes it
- [ ] Verify backend and frontend implementations produce identical outputs on identical inputs

### Data integrity / unit bugs (global)
- [ ] **Migrate existing `ExerciseEntry.start_weight` values from lbs to kg on backend** (seeded data stored in lbs, frontend assumes kg → shows 254 instead of 115)
- [ ] **Audit all frontend weight display paths for consistent kg/lbs conversion** (start_weight, draft prefill, `getNextSetTarget()`, coach prescription inputs, recap screens)
- [ ] **Backend should enforce canonical unit for `start_weight` and `actual_weight`** (document whether kg or lbs is source of truth; migrate legacy data)

---

## Phase 4 — AI Personalization Layer
### Trainer-generated workout flow
- [x] Backend: `POST /api/trainer/generate` accepts questionnaire answers and returns a populated workout draft
- [x] Frontend: step-through questionnaire, one question per screen, progress indicator
- [x] Frontend: options shown as single-select tabs or multi-select chips; minimize typing
- [x] Section 1 — Training profile: Goal (multi-select), Equipment (single), Primary Style (single), Additional Activities (multi), Modality Mix (single), Location (text), Training History (single), Progression Method (single), Days/week (single), Minutes (single), Experience (single), Split Style (single), Limitations (multi-select chips)
- [x] Frontend: preface each section with "This is why we ask" context
- [x] Frontend: questionnaire shown on first login and available anytime from AI Trainer tab
- [x] Frontend: user picks "Trainer builds it" or "I'll build it myself"
- [x] Frontend: accepted generated workout persists as draft; user can tweak before saving
- [x] Frontend: re-run questionnaire available from AI Trainer tab to generate new workout
- [x] Backend: slot-based template system with 10 day templates
- [x] Backend: body_part_split rotation (chest/tris → back/bis → legs → shoulders → arms)
- [x] Backend: explicit progression_type overrides experience-based default
- [ ] Nutrition questionnaire and meal plan generation — separate future flow

### Core model
- [ ] Define standard fitness model schema shared by all users; Phase 2 deterministic scripts consume this schema
- [ ] AI layer does not replace scripts; it builds a user-specific profile/key that modulates schema variables before scripts run
- [ ] Scripts remain the constant execution layer; AI output is input normalization and profile calibration only

### Additive-only gate
- [ ] AI personalization is opt-in and additive only
- [ ] If AI profile does not show verifiable improvement over deterministic baseline, default deterministic behavior remains the user-facing path
- [ ] User can reset AI profile to default or disable AI personalization at any time

### AI profile engine
- [ ] Collect user progress signals: adherence, completion rate, RPE/RIR trends, stall frequency, recovery indicators, workout consistency
- [ ] Design deterministic feature extraction from workout history so AI input is stable and reproducible
- [ ] Choose local or backend AI profile generation:
  - Option A: On-device lightweight model/profile generator runs offline after each workout
  - Option B: Backend analyzes history and pushes updated profile key; frontend applies it locally
- [ ] Profile outputs: calibrated starting 1RM estimate, progression sensitivity, volume tolerance, recovery multiplier, preferred RIR target, stress/fatigue adjustment

### Integration with existing layers
- [ ] Planned workout -> AI profile applied to schema -> Phase 2 deterministic script computes prescription -> on-device autoregulation runs during workout
- [ ] Active workout autoregulation uses both the user's AI profile and live session feedback
- [ ] Post-workout sync updates history, which may trigger AI profile recalculation on next run

### Data & privacy
- [ ] Store AI profile per user in Postgres; version it so changes are auditable and reversible
- [ ] No PII leaves device beyond workout history needed for backend profile generation; if local-only, profile never leaves device

### Verification
- [ ] Baseline: deterministic script without AI profile produces expected prescription
- [ ] With AI profile: same script produces differentiated prescription based solely on profile differences
- [ ] Profile stability: repeated runs on same history yield same profile unless new data changes it
- [ ] User-facing: show which variables were adjusted by AI and why, with option to override manually
