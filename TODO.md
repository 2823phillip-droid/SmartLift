# TODO

## Phase 1 — Foundation: Frontend shipped, Backend stable, L&F solid

### Backend / Fly
- [ ] Confirm `smartlift-api` Fly app health endpoint returning 200 consistently: `GET /healthz`
- [ ] Add structured request/response logging to backend for production debugging
- [ ] Add global exception handler + request timeout config in FastAPI/Starlette
- [ ] Verify frontend retry/backoff on transient 5xx / network drops (already has `withRetry`)
- [ ] Confirm Postgres `smartlift-db` connection pool and Fly autoscaling behave during cold starts
- [ ] Backend deploy verified: `fly deploy -a smartlift-api` rolls cleanly without downtime

### Auth hardening
- [ ] Add rate limiting on login/signup endpoints in backend
- [ ] Implement failed-login backoff / account lockout after threshold failures
- [ ] Support token rotation / refresh flow; expired tokens trigger reauth without full login
- [ ] Ensure logout fully invalidates token server-side and client-side

### Frontend iOS build & App Store foundation
- [ ] TypeScript build is clean in CI/Xcode path: only expected missing-cap-types remain, no app-blocking errors
- [ ] `npx cap sync ios` completes cleanly after every future frontend change
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

---

## Phase 2 — Rule Engine: Deterministic coaching scripts

### Shared rule definitions (used by backend + local offline)
- [ ] Define canonical rule specification in one place: inputs, outputs, progression types, safety boundaries
- [ ] Implement canonical rule module in Python (backend)
- [ ] Port/compile same rule module to TypeScript for frontend offline use inside `ActiveWorkoutScreen`
- [ ] Phase 3 is not a second script; it is the Phase 2 rule surface embedded in the app

### Data model prerequisites
- [ ] Capture required session data for rule engine: exercise_order, sets_target, reps_target, weight_target, rest_seconds, datetime_completed, rpe,rir
- [ ] Confirm existing `workout_end_summary` / active workout POST payload carries enough state for progression rules to compute next workout
- [ ] Define schema for `rule_script` / `rule_assignment` in Postgres (or extend `settings` payload) so a user/workout can be assigned a deterministic script

### Backend rule engine
- [ ] Double progression: when all sets hit top rep band for target reps, increase weight next session; if miss, repeat
- [ ] Linear progression: fixed increment per successful session; stall rule after N failures
- [ ] Percentage / 1RM-based: compute working weight from stored or estimated 1RM; advance/regress based on completion quality
- [ ] Periodization: weekly/mesocycle plan block hooks; scheduled deload week triggers reduced volume/intensity
- [ ] Autoregulation (RPE/RIR): derive effective load and next-session prescriptions from reported RPE/RIR; allow micro-load/step back
- [ ] Deloading: automatic deload trigger + manual deload with preserved rhythm

### Frontend UX for rule engine
- [ ] Settings/defaults: user selects preferred rule script per exercise group or per workout
- [ ] Exercise detail shows current rule-derived prescription: weight, reps, sets, rest, progression step, estimated 1RM
- [ ] During active workout: show next prescribed set (adaptive to completed sets if autoregulated)
- [ ] Post-workout: capture RPE and RIR inputs before completion so backend can compute next prescription
- [ ] Template editor exposes rule-engine placement: default/static values vs dynamic prescriptions

### Verification
- [ ] Unit tests for each rule type against synthetic session history
- [ ] End-to-end test: user with known history receives correct next-session prescription
- [ ] Confirm deterministic behavior: same input sequence always yields same next prescription unless RPE/RIR changes it

---

## Phase 3 — Local-only Autoregulation Script

### Core requirement
- [ ] Deterministic autoregulation runs entirely on the phone during the active workout using the same canonical rules as Phase 2
- [ ] Live coaching and live deviation must work without backend connectivity
- [ ] Backend is not used for live autoregulation; it is only used for sync/history later

### Behavior contract
- [ ] Inputs available offline inside the app: planned sets_target, reps_target, weight_target, rest_seconds, completed_sets, reps_completed, weight_completed, RPE, RIR
- [ ] Outputs used in app UI: next_set_prescription (sets/reps/weight/rest adjusted), coaching_message, workload_status
- [ ] If connectivity returns, post completed workout/payload to backend; do not block autoregulation on network

### Frontend implementation
- [ ] Embed canonical rule implementation in app code path used during `ActiveWorkoutScreen`
- [ ] After each set completion, run autoregulation locally and update next set UI immediately
- [ ] Capture RPE/RIR inputs inline during workout before moving to next set
- [ ] Offline detection: show connectivity state, queue payload when offline, resume sync on reconnect
- [ ] Preserve completed sets and local outputs through background/suspend without dependence on in-memory only state

### Safety / guardrails
- [ ] No external network calls inside autoregulation during active workout
- [ ] Determinism verified: identical workout state + identical input sequence produces identical live recommendation
- [ ] Deload/manual override path available locally if autoregulation suggests aggressive load

---

## Phase 4 — AI Personalization Layer

### Core model
- [ ] Define standard fitness model schema shared by all users; Phase 2/3 deterministic scripts consume this schema
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
- [ ] Planned workout -> AI profile applied to schema -> Phase 2/3 deterministic script computes prescription -> on-device autoregulation runs during workout
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
