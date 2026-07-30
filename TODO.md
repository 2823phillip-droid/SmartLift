# TODO

## Phase 1 — Foundation: Frontend shipped, Backend stable, L&F solid

### Backend / Fly
- [ ] Confirm `smartlift-api` Fly app health endpoint returning 200 consistently: `GET /healthz`
- [x] Add structured request/response logging to backend for production debugging
- [x] Add global exception handler + request timeout config in FastAPI/Starlette
- [x] Verify frontend retry/backoff on transient 5xx / network drops (already has `withRetry`)
- [ ] Confirm Postgres `smartlift-db` connection pool and Fly autoscaling behave during cold starts
- [ ] Backend deploy verified: `fly deploy -a smartlift-api` rolls cleanly without downtime

### Auth hardening
- [x] Add rate limiting on login/signup endpoints in backend
- [x] Implement failed-login backoff / account lockout after threshold failures
- [x] Support token rotation / refresh flow; expired tokens trigger reauth without full login
- [x] Ensure logout fully invalidates token server-side and client-side

### Frontend iOS build & App Store foundation
- [x] TypeScript build is clean in CI/Xcode path: only expected missing-cap-types remain, no app-blocking errors
- [x] `npx cap sync ios` completes cleanly after every future frontend change
- [ ] Core auth flow end-to-end: login → home → workouts → build → start → active → post → done
- [ ] Workout draft persists across tab switches; Cancel exits without clearing draft
- [ ] Template pencil opens full template editor; back from editor lands on Workouts tab
- [ ] Active workout can complete and lands back in app state
- [ ] Exercise library video/GIF playback works in app via webview or native modal
- [ ] Profile screen wired to real backend user data; no hardcoded values
- [ ] Landing page / home shows real stats loaded from backend

### Exercise library / ExerciseDB
- [ ] Resolve ExerciseDB licensing: determine if current `hasaneyldrm/exercises-dataset` usage is permitted for app distribution; if not, purchase/arrange commercial license or replace source
- [ ] Evaluate MuscleWiki as primary exercise media source: video URLs, licensing, import workflow (`POST /api/exercise-library/sync`)
- [ ] Confirm 1,318 exercises sync reliably into Postgres `exercise_library` after any tag/media schema changes
- [ ] Verify upstream `hasaneyldrm/exercises-dataset` tag mismatches are corrected in backend via `tag_overrides`; re-run sync to ensure stability
- [ ] Confirm frontend video/GIF playback path in app: webview for GIFs, modal player when `video_url` exists
- [ ] Decide and enforce editability model: exercise names are static/non-editable in library
- [ ] Global rest timer placement: Settings only, not per-library/exercise

### Look & Feel polish
- [ ] Light/dark consistency review across all screens: header, tab bar, cards, buttons
- [ ] Loading and empty states present on: History, Library, Templates, Workouts, Post Workout
- [ ] Error states friendly: failed loads, offline mode indication, retry affordances
- [ ] Touch targets ≥44pt on all interactive controls; verify on device
- [ ] Font scale and spacing work on smaller screens (SE/standard) and large screens

### App Store submission basics
- [ ] Privacy policy URL live and reachable
- [ ] App name, subtitle, keywords, copyright finalized
- [ ] Test account credentials documented: `2823phillip@gmail.com`
- [ ] Build archive rises through TestFlight without validation errors
- [ ] Add at least 2 screenshots per device type required by App Store Connect

### Legal
- [ ] Add terms of service screen presented during signup; require explicit acceptance before account creation
- [ ] Include medical disclaimer in terms/privacy policy: app does not diagnose, treat, cure, or prevent disease; users with medical conditions should consult a doctor before using
- [ ] Have attorney review and approve terms/privacy policy before App Store submission
- [ ] Ensure privacy policy covers data collected, storage, retention, and user deletion request flow
- [ ] Implement backend endpoint for user data export and account deletion; expose in Profile/Settings

### Verified / preserved (do not break)
- [x] Template pencil opens full workout editor
- [x] Back from template editor returns to Workouts tab
- [x] Fly-only API base (`https://smartlift-api.fly.dev/api`); no local LAN fallback
- [x] MacBook static IP remains `192.168.1.112` for rsync/ssh/cap sync
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

### Verification
- [ ] Unit tests for each rule type against synthetic session history
- [ ] End-to-end test: user with known history receives correct next-session prescription
- [ ] Confirm deterministic behavior: same input sequence always yields same next prescription unless RPE/RIR changes it
- [ ] Verify backend and frontend implementations produce identical outputs on identical inputs

---

## Phase 4 — AI Personalization Layer

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
