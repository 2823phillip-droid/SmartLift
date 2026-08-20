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
