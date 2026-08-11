# Questionnaire Miro Board Spec

Final version after code implementation.

---

## Layout Suggestion

- Top row: 6 section header boxes
- Below each section: stack question cards vertically
- Branch arrows from "Supplementary Activities" down to cardio block
- Use colors: blue for single-select, green for multi-select, yellow for text inputs, orange for branch points

---

## Section 1 — About You (Page: Basics)

**Q1: Select Measurement System** (single)
- ○ Imperial (lbs, ft, in)
- ○ Metric (kg, cm)

**Q2: Height** (text)
- [text input]
- + Prefer not to answer

**Q3: Weight** (text)
- [text input]
- + Prefer not to answer

**Q4: Sex** (single)
- ○ Male
- ○ Female
- ○ Other
- + Prefer not to answer

**Q5: Current Training Status**
- ○ Not currently training / returning from a break
- ○ Training inconsistently
- ○ Training 1–2 days/week
- ○ Training 3–4 days/week
- ○ Training 5–6 days/week

**Q6: Experience Level**
- ○ Beginner — new to working out, unfamiliar with most movements
- ○ Intermediate — familiar and comfortable with basic exercises
- ○ Advanced — very familiar with working out

**Q7: Training History** (skip if Beginner)
- ○ Trained under 6 months total
- ○ Trained 6–12 months
- ○ Trained 1–2 years
- ○ Trained 2+ years
- ○ Returned after a break
- ○ Trained as a younger athlete

---

## Section 2 — Your Goals

**Q1: Goal** (multi-select)
- ☑ Strength — get stronger at lifting
- ☑ Muscle — build size and definition
- ☑ Endurance — last longer, recover faster
- ☑ Weight Loss — burn fat, keep muscle
- ☑ Mobility — move better, feel less stiff
- ☑ Appearance — look better, feel more confident
- ☑ General Fitness — balanced, all-around health

*Backend resolves primary style from selections*

---

## Section 3 — Your Schedule

**Q1: Days Per Week** (single)
- ○ 2 / 3 / 4 / 5 / 6

**Q2: Minutes Per Session** (single)
- ○ 20 / 30 / 45 / 60

---

## Section 4 — Your Setup

**Q1: Available Equipment** (multi)
- ☑ Barbell & Plates
- ☑ Dumbbells
- ☑ Cable Machine
- ☑ Machines
- ☑ Resistance Bands
- ☑ Bodyweight Only
- ☑ Kettlebells

---

## Section 5 — Your Style

**Q1: Primary Training Style** (single)
- ○ Traditional Weight Training — balanced mix of compounds and accessories, moderate reps. Good all-around choice.
- ○ Powerlifting — focused on squat, bench, and deadlift. Low reps, heavy weight, minimal accessories. Best if your main goal is getting stronger on those lifts.
- ○ Bodybuilding — higher volume, more exercises, higher rep ranges. Focuses on muscle size and definition rather than just lifting heavy.
- ○ HIIT — short bursts of high effort with rest intervals. Efficient for conditioning and fat loss.
- ○ Cardio — running, cycling, elliptical, or steady-state work. If your main focus is endurance or calorie burn.

**Q2: Supplementary Activities** (multi)
- ☑ Cardio
- ☑ HIIT
- ☑ None — just my primary style

**LOGIC:**
- IF "None" selected → skip all cardio questions, go to Split Style
- IF Cardio or HIIT selected → show cardio block below

---

### Cardio Block (conditional)

**Q3: How to Organize Cardio** (single)
- ○ As part of my lifting workouts — warmup or finisher
- ○ Separate from my lifting workouts — dedicated cardio plan

**LOGIC:**
- IF part of lifting workouts → show Cardio Timing + What Kind of Cardio
- IF separate → show Separate Cardio Plan block

---

#### Cardio Timing + Type (part of lifting)

**Q4: Cardio Timing** (single)
- ○ Warmup — 10 min before lifting
- ○ Warmup — 15 min before lifting
- ○ Warmup — 20 min before lifting
- ○ Finisher — 15 min after lifting
- ○ Finisher — 20 min after lifting

**Q5: What Kind of Cardio** (multi)
- ☑ HIIT — intervals and bursts
- ☑ Treadmill — Run
- ☑ Treadmill — Walk / Incline
- ☑ Elliptical
- ☑ Stationary Bike
- ☑ Rowing
- ☑ Stair Climber
- ☑ Swimming

---

#### Separate Cardio Plan

**Q4: How Many Cardio Days Per Week** (single)
- ○ 1 / 2 / 3 / 4 / 5 / 6 / 7

**Q5: Cardio Session Length** (single)
- ○ 20 min
- ○ 30 min
- ○ 45 min
- ○ 60 min

**Q6: What Kind of Cardio** (multi)
- ☑ HIIT — intervals and bursts
- ☑ Treadmill — Run
- ☑ Treadmill — Walk / Incline
- ☑ Elliptical
- ☑ Stationary Bike
- ☑ Rowing
- ☑ Stair Climber
- ☑ Swimming
- ☑ Distance Training — running or cycling goals

**Q7: Distance Goal** (single, optional)
- ○ None
- ○ 5k
- ○ 10k
- ○ Half Marathon
- ○ Marathon
- ○ Other distance

*Distance Training backend logic (sprints, varied runs, etc.) can be added later*

---

**Q8: Split Style** (single)
- ○ Full Body — every session hits all groups
- ○ Upper/Lower — alternating days
- ○ Push/Pull/Legs — three day types
- ○ Body Part Split — chest/tris, back/bis, legs, etc.

**Q9: Build Mode** (single)
- ○ Pre-built Template — we structure the week for you
- ○ Custom Builder — I choose the exercises

---

## Section 6 — Safety

**Q1: Limitations / Injuries** (multi)
- ☑ None
- ☑ Shoulder Issues
- ☑ Knee Issues
- ☑ Back Issues
- ☑ Wrist Issues
- ☑ Limited Mobility
- ☑ High-Impact Aversion

---

## Removed from original

- Workout Location (save for session notes later)
- Progression Method (backend decides, user sees explanation)
- Gym Type (redundant with equipment checklist)
- "Full Program" option removed from goals
- Primary Training Style kept, with descriptions
- Training History moved to About You, hidden for Beginners
- HIIT Finisher removed from Cardio Timing
- "Mixed" removed from cardio types (multi-select instead)
- "Mostly Lifting" option removed from How to Organize Cardio

---

*Implemented in `frontend/src/config/questionnaire.ts` and `frontend/src/pages/QuestionnaireScreen.tsx`*
