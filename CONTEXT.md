# Active Context

Updated when work in progress changes.

## Current Task
Phase 4 — AI Personalization Layer: questionnaire and template system are deployed. Backend is live on Fly. User is testing the new questionnaire on iOS device. Next step is to validate template generation against real exercise library data, then build the AI coach layer.

## Completed
- Questionnaire redesign: 13 questions, nutrition removed, added Training History + Starting Progression Method
- Frontend questionnaire config updated and deployed to iOS
- Backend `intake.py`: UserProfile updated with new fields, nutrition/age fields removed
- Backend `progression.py`: explicit progression_type support, body_part_split rotation handler, generate_meal_plan stubbed to None
- Backend `services/generation.py`: meal plan always returns None until nutrition flow built
- Backend `main.py`: Pydantic models updated with new fields
- Template system: 10 slot-based day templates (Chest, Back, Leg, Shoulder, Arm, Chest+Triceps, Back+Biceps, Upper Body, Lower Body, Full Body)
- Slot-based exercise picker with movement/tier/equipment filtering
- `/architecture` route live at askeo.fit/architecture — system design doc
- `/flowchart` route live at askeo.fit/flowchart — question-to-effect mapping
- `/roadmap` live at askeo.fit/roadmap
- Google auth fix confirmed working on iOS device
- Deploy pipeline: git-based (commit/push on Linux, pull/build/sync on Mac)
- Memory system: MEMORY-INDEX.md + memory/ directory with domain files

## Next Actions
- User: test questionnaire on iOS device, build a workout, verify template selection
- Agent: validate template generation against real DB exercise library
- Agent: build AI coach layer (chat interface + week_schedule builder)
- Agent: add periodization logic to AI coach for split/progression recommendations

## Notes
- Knowledge hierarchy is documented in `MEMORY-INDEX.md`; always read it before starting work.
- All domain-specific lessons are in `memory/<topic>.md`.
- When a fix involves a non-obvious pattern, add it to the relevant `memory/` file.
- Never fall back to local backend (`192.168.1.111:8000`); production is `https://askeo.fit/api`.
- Nutrition is out of scope for current release — separate flow later.
- AI coach is pure interface layer: explains questions, reconciles inputs, builds week_schedule, recommends switches. Backend generates workouts deterministically.
