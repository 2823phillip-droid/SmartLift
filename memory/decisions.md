---
last_updated: 2026-08-06
created: 2026-07-31
tags: [decisions, adr]
related: memory/ directory
---

# Decision Records (ADRs)

Format per entry: ADR-NNN, Title, Status, Date, Context, Options, Decision, Consequence.

---

## ADR-001 — Allow both capacitor://localhost and ionic://localhost in CORS

Status: accepted
Date: 2026-07-31
Tags: [cors, ios, backend]

**Context:** iOS Workouts tab failed with "Load failed". Network inspection showed the device sends `ionic://localhost` as Origin, but backend only allowed `capacitor://localhost`.

**Options considered:**
1. Ask user to force `capacitor://localhost` in WebView
2. Add `ionic://localhost` to allowed origins
3. Use regex to allow all custom schemes

**Decision:** Add `ionic://localhost` to explicit allow_origins list.

**Consequence:** Both Capacitor origins work. If future WebView versions change origin, we can add more.

---

## ADR-002 — Inspect backend logs for 500 root cause

Status: accepted
Date: 2026-07-31
Tags: [debugging, backend, database, postgres]

**Context:** Backend `/api/contexts` returned 500 after deployment. Local dev (SQLite) worked. Device WKWebView reported it as CORS error.

**Options considered:**
1. Add more CORS debugging in frontend
2. Check production DB schema vs model

**Decision:** Inspect Fly logs for backend traceback.

**Consequence:** Found `column contexts.order does not exist`. Added column via `fly ssh console` + SQLAlchemy migration. Pattern saved under `memory/backend-db.md` (never rely on `create_all()` for production).

---

## ADR-003 — Use curl with device Origin headers before user debugging

Status: adopted
Date: 2026-07-31
Tags: [debugging, process, ios]

**Context:** Device-side debugging is slow and noisy; Safari Web Inspector requires a Mac cable.

**Options considered:**
1. Require user to use Safari Web Inspector for every issue
2. Inspect network failures via curl from Linux first

**Decision:** Use curl with device Origin headers to eliminate variables before asking user to debug.

**Consequence:** Confirmed CORS headers returned correctly before contacting user. Reduced noise.

---

## ADR-004 — project-context skill as canonical knowledge loader

Status: adopted
Date: 2026-07-10
Tags: [process, memory, skills]

**Context:** Session history suggested I didn't know project context, causing repeated questions.

**Options considered:**
1. Load files at every session start
2. Create memory/index system

**Decision:** Created `project-context` skill that loads PROJECT.md, PERSONA.md, CONTEXT.md, TODO.md at startup. User later added Askeo.md.

**Consequence:** Still missed new `Askeo.md` on 2026-07-31, leading to MEMORY-INDEX.md / memory/ directory design.

---

## ADR-005 — Slot-based structured error capture

Status: accepted
Date: 2026-07-31
Tags: [backend, frontend, logging]

**Context:** Want production stability without `print()` in request handlers.

**Options considered:**
1. Standard Python logging
2. Structured JSON slots with request correlation IDs
3. Console capture for WKWebView debugging

**Decision:** Use structured log slots + console capture interceptor in `main.tsx` for client-side errors.

**Consequence:** Backend logs become searchable for request path/status/latency. Frontend errors persist to `localStorage['askeo_error_log']`.

---

## ADR-006 — Coach settings UI in SettingsScreen

Status: accepted
Date: 2026-07-29
Tags: [frontend, ux, coach]

**Context:** Need user-facing coach settings editor.

**Options considered:**
1. Dedicated Settings tab
2. Popover modal
3. Settings section inside SettingsScreen

**Decision:** `CoachSettingsSection` inside existing SettingsScreen.

**Consequence:** Global settings consolidation; avoids navigation sprawl.

---

## ADR-007 — Coach settings persistence via existing settings endpoint

Status: accepted
Date: 2026-07-29
Tags: [backend, coach, persistence]

**Context:** User-level coach settings need to survive app reinstalls.

**Options considered:**
1. New `/api/coach/settings` table
2. Store as JSON in existing `settings` table by key

**Decision:** Use existing `settings.key/value` payload pattern.

**Consequence:** Coach settings survive app reinstall and are addressable per-user.

---

## ADR-008 — Backend override endpoints for coach settings

Status: accepted
Date: 2026-07-29
Tags: [backend, coach, api]

**Context:** Coach settings need backend persistence across devices.

**Options considered:**
1. Client-only state
2. Backend override endpoints

**Decision:** Backend `POST /api/coach/override` + `GET /api/coach/state`.

**Consequence:** Changes persist across devices and reinstalls.

---

## ADR-009 — Coach state persistence on workout end

Status: accepted
Date: 2026-07-29
Tags: [backend, coach, persistence]

**Context:** Coach state needs to persist across sessions.

**Options considered:**
1. Immediate backend write on every change
2. Batch save on workout end

**Decision:** Save coach state via existing `settings` save on workout end.

**Consequence:** Coach state survives app reinstall; reduced write load.

---

## ADR-010 — AI coach is pure interface layer

Status: accepted
Date: 2026-08-04
Tags: [ai, coach, architecture, backend]

**Context:** Need to define AI coach's role in workout generation.

**Options considered:**
1. AI generates workouts directly
2. AI is pure interface: explains, reconciles, recommends; backend generates

**Decision:** AI coach is pure interface layer. It explains questions, reconciles form/voice inputs into structured data, builds `week_schedule`, and recommends split/progression switches. Backend `generate_workout()` is the only workout generator.

**Consequence:** Backend stays deterministic; AI sets strategy, backend handles tactics. `week_schedule` is the only structured data the AI contributes beyond the questionnaire.

---

## ADR-011 — Body Part Split as focus option

Status: accepted
Date: 2026-08-04
Tags: [trainer, templates, backend]

**Context:** User wants classic bodybuilding split (chest/tris, back/bis, legs, shoulders, arms). Existing options didn't cover it.

**Options considered:**
1. Add as new template variant of push_pull_legs
2. Add as independent `focus` value with own rotation logic
3. Leave it to AI coach to build custom schedule

**Decision:** Add `body_part_split` as independent `focus` value. Backend rotates through chest/tris→back/bis→legs→shoulders→arms templates.

**Consequence:** Body part split generates correct day templates without AI intervention. AI coach can still recommend switching away from it after N months.

---

## ADR-012 — Progression type as explicit questionnaire field

Status: accepted
Date: 2026-08-04
Tags: [trainer, questionnaire, progression]

**Context:** User wants control over progression method, not inference from experience.

**Options considered:**
1. Infer from experience (beginner=linear, intermediate=double, advanced=percentage)
2. Add explicit progression_type question
3. Let AI coach set progression based on history

**Decision:** Add explicit `progression_type` question (linear/double/percentage). Backend uses it if present, falls back to experience-based default otherwise.

**Consequence:** User has direct control. AI coach can recommend progression switches as part of periodization later.

---

## ADR-013 — Nutrition removed from current scope

Status: accepted
Date: 2026-08-04
Tags: [nutrition, scope, backend]

**Context:** Nutrition questionnaire and meal plan generation were in scope but competed with core workout features.

**Options considered:**
1. Keep nutrition in current build
2. Remove now, build separately later
3. Stub it out with placeholders

**Decision:** Remove nutrition from questionnaire. Stub `generate_meal_plan()` to return `None`. Preserve commented code for re-enable.

**Consequence:** Cleaner questionnaire (13 questions). Meal plan always null in response. Nutrition is a separate future flow.

---

## ADR-014 — Frontend deploy via git instead of rsync

Status: adopted
Date: 2026-08-04
Tags: [deploy, frontend, process]

**Context:** rsync pipeline was fragile. Mac's `dist/` folder frequently stale.

**Options considered:**
1. Continue rsync with hash verification
2. Switch to git-based deploy: commit on Linux, pull on Mac
3. Build entirely on Mac from source

**Decision:** Git-based deploy: `git commit + push` on Linux, `git pull + npm run build + npx cap sync ios` on Mac.

**Consequence:** Single source of truth (git). Mac always has latest source. Build happens on Mac with correct Node version.

---

## ADR-015 — Agent owns all deploy/sync/device operations

Status: accepted
Date: 2026-08-06
Tags: [process, deploy, ios, ssh]

**Context:** User repeatedly had to remind the agent to execute MacBook operations instead of asking. PERSONA.md and PROJECT.md contained contradictory instructions about who runs terminal commands.

**Options considered:**
1. Ask user every time (current broken state)
2. Agent executes via SSH, user only sets goals and validates
3. Hybrid: agent asks for approval before each operation

**Decision:** Agent owns full deploy/sync/Xcode end-to-end. Use `macbook` SSH alias for all MacBook operations. Never ask user to run manual terminal commands for deploy.

**Consequence:** Eliminates repeated "that's your job" corrections. Single source of truth: `macbook` SSH alias with DHCP-reserved IP 192.168.1.112. IP changes only require updating `~/.ssh/config`.

---

## Change Log

- 2026-07-31 — Normalized all entries to ADR format with status/tags/consequence
- 2026-08-04 — Added ADR-010 through ADR-014
- 2026-08-06 — Added ADR-015 (agent deploy ownership)
