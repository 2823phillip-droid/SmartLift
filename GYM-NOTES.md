# Gym Session Notes

Use this file to drop quick observations while you're using the app at the gym.
Don't worry about formatting — bullet points, screenshots, timestamps, whatever works.
I'll triage these later and turn them into actual tasks.

---

## 2026-08-19 (first session)

- On starting a workout, app showed "welcome to week 2" — week counter incremented even though user hasn't completed anything yet. Appears to advance week on workout start rather than completion.
- Coach suggested starting bench press at 254 lbs — way too high. After user logged set 1 at 115 lbs x 6 reps, coach suggested 259 lbs for set 2. Starting weight and progression logic appear broken.
- App is logging/displaying the coach-suggested weight (254) as the actual performed sets, even though user entered 115 lbs for all 3 sets. Display is showing wrong weight history.
- Progression logic did read RIR/effort and suggested a 2.5 lb bump, but 2.5 lb increases aren't feasible with standard plates — minimum practical increment is 5 lbs (2.5 per side). Formula also seems too conservative overall; needs review.
- With effort level 4 and RIR of 1, progression still only suggested 2.5 lbs. At high effort + low RIR, likely should repeat same weight next session instead of increasing — only bump when user hits top of rep range cleanly.
- Dips set 2: button lag caused multiple taps on complete, resulting in 7 duplicate entries recorded for a single set. No edit or delete UI exists for sets, so user could not correct it. Tap-handling / debounce issue on set completion, plus missing set-deletion flow.
- Design question: machine exercises with independent weight stacks per side (e.g., cable fly machine) — app should log per-arm weight. Add a note/instruction on those workout screens so user logs per-side value.
- Overall feedback: user likes the product; a few issues need tuning.
- Question: for linear progression, should every exercise start at 6 reps? Needs confirmation of intended rep scheme.
- Required: set up Fly auth / read-only DB access so agent can inspect live workout logs directly for faster debugging.

---

## 2026-08-24 (second session)

- Ready screen coach recap can't find last workout, even after cancelling and retrying. Recap filters for `ended_at != null && status === "completed"` on same `template_id`.
- Active workout screen: coach/history says "last time you did 120" (correctly converted from kg to lbs via `toLbs()`), but starting draft weight shows 52.
- 52 comes from backend `ExerciseEntry.start_weight` stored in lbs (e.g. 23.6 lbs for some exercise), frontend applies `kgToLbs()` and displays 52 lbs. Same root cause as 254 lbs bug.
- `PreWorkoutScreen` recap displays `actual_weight` directly as lbs without converting from kg — shows wrong weight in recap (e.g. 54 instead of 120).
- `PostWorkoutScreen` correctly uses `formatWeight()` which converts kg→lbs for imperial users.
- Weight unit bugs are global: `start_weight`, draft prefill, `getNextSetTarget()`, and coach prescription inputs all mix kg/lbs assumptions.

---

## 2026-08-24 (continued)

- After logging a set, coach panel recommends increasing to 50 lbs, but draft weight input stays at 45 lbs (the weight just logged). Should auto-follow prescription in ai_trainer mode.
- Coach "Next Session Target" message says "This workout we'll start at..." — should say "Next workout" because recommendation is for the next session, not the current one.
- Coach message shows "shoot for 0 reps" for some exercises. Root cause: template editor allows reps=0 (`Number(e.target.value) || 0` at line 692), and `addSet` initializes `{weight: 0, reps: 0}`. When saving, `reps_target: ex.sets[0]?.reps ?? 10` uses nullish coalescing which doesn't catch explicit 0, so reps_target=0 propagates to backend and appears in coaching messages.
- App appears to reset streak to 0 and total volume to ~13,980 — far lower than expected. Either volume recalculation is affected by the kg/lbs double-conversion bug, or the app is reading from a truncated/different dataset. Needs investigation alongside the unit audit.

---

## 2026-08-27 (current session)

- Working out at YMCA in Nashville. Has a separate shoulder workout template from the Clarksville YMCA. Question: should exercise memory/progression span across separate shoulder workout templates, or stay isolated per template? If both templates contain Overhead Press, should the coach see the same history and apply the same progression for both?
- Streak on home page shows 0. User asks: is streak supposed to be consecutive workout days in a row? (Note: this is likely related to the reset issue from 2026-08-24 session.)

