# Decision Records (ADRs)

last_updated: 2026-07-31
created: 2026-07-31
tags: [decisions, adr]
related: memory/ directory

Format per entry: ADR-NNN, Title, Status, Date, Context, Options, Decision, Consequence.

---

## ADR-001 — Allow both capacitor://localhost and ionic://localhost in CORS

Status: accepted
Date: 2026-07-31
Tags: [cors, ios, backend]

**Context:** iOS Workouts tab failed with “Load failed”. Network inspection showed the device sends `ionic://localhost` as Origin, but backend only allowed `capacitor://localhost`.

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

**Context:** Session history suggested I didn’t know project context, causing repeated questions.

**Options considered:**
1. Load files at every session start
2. Create memory/index system

**Decision:** Created `project-context` skill that loads PROJECT.md, PERSONA.md, CONTEXT.md, TODO.md at startup. User later added SMARTLIFT.md.

**Consequence:** Still missed new `SMARTLIFT.md` on 2026-07-31, leading to MEMORY-INDEX.md / memory/ directory design.

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

**Consequence:** Backend logs become searchable for request path/status/latency. Frontend errors persist to `localStorage['smartlift_error_log']`.

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

## Change Log

- 2026-07-31 — Normalized all entries to ADR format with status/tags/consequence
