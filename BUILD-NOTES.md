# Build Notes

Each entry records what a build did, so we know what each one contains without digging through Slack.

## Build Notes Format

- **Build ID:** auto-generated hash from filename (e.g. `Nmg6VaBi` from `index-Nmg6VaBi.js`)
- **Date:** when built
- **Commit:** git commit at build time
- **Minified:** yes/no
- **What changed:** what this build includes/fixes

---

## Build Log

### Build `Nmg6VaBi` — 2026-09-22
- **Commit:** `aef3fbc` (feat: restore AI Coach tab with chat functionality) + `82aeb3c` (fix: global regex for {increment})
- **Minified:** NO (unminified, 1.9MB — larger than normal but preserves the fix)
- **What changed:**
  - `rules.ts`: Replaced chained `.replace()` calls with global regex `replace(/\{[^}]+\}/g, ...)` in both `fill()` functions — fixes double `{increment}` bug where second occurrence stayed literal
  - `rules.ts`: Replaced `linearMessage(prev, nextWeight)` call with inline template literal — function was undefined (removed in a later commit but call remained), which would crash at runtime
  - Source at `aef3fbc` (Sep 18 known-good) — Coach tab + linear progression working
- **Verified:** Coaching message reads "progress your weight by 5 lbs." — both `{increment}` occurrences filled correctly

### Build `C-6oBpx6` — 2026-09-21
- **Commit:** `ef1280e` (fix: coaching message placeholders)
- **Minified:** YES (856KB)
- **Status:** BROKEN — still showed literal `{increment}` in coaching message
- **Why broken:** Vite's minifier converted global regex back to chained `.replace()` calls, undoing the fix
- **Deleted:** Removed from iOS public path after `Nmg6VaBi` was built

### Build `Ciq0Nx1U` — 2026-09-16
- **Commit:** pre-Coach-tab state
- **Minified:** YES (882KB)
- **Status:** Working but predates Coach tab (`aef3fbc`)
- **Deleted:** Removed from iOS public path after `Nmg6VaBi` was built

### Build `Bfjda9_y` — ~2026-09-20
- **Commit:** unknown (intermediate)
- **Minified:** YES (843KB)
- **Status:** Working — correct "progress your weight by 5 lbs." output
- **Location:** `frontend/public/assets/` (decoy — Xcode ignores this path)
- **Note:** This was the build the user referenced as "working" but it's not in the Xcode path

---

## Build Rules Going Forward

1. **Always record:** commit hash, minified or not, what changed
2. **Verify after build:** grep for known coaching message strings to confirm fix survived
3. **Check index.html:** confirm it references the right JS chunk
4. **Clean old builds:** remove stale index-*.js files from iOS public path before copying new ones
5. **If minified build breaks a fix:** try unminified first to confirm fix works, then investigate minifier behavior

---

## Build Log

### Build `DICzOLs5` — 2026-11-23
- **Commit:** `9e3d9b7` (remove: debug logging from resolveRest() that was flooding console)
- **Minified:** YES (890KB)
- **What changed:**
  - Rest timer override system complete
  - Global rest timer setting in Settings UI
  - Template editor: per-exercise toggle (ON=override, OFF=use global), shows DB value for overridden exercises
  - Active workout: resolves rest time per exercise using is_overridden flag + global setting
  - Exercise list displays resolved rest time (not DB value)
  - Debug logging removed from resolveRest()
- **Verified:** Exercise list shows correct rest times (override=75, global=30) when global timer changed
