# Active Context

Updated when work in progress changes.

## Current Task
Phase 4 continued — custom workout builder implemented and deployed to iOS. Backend is live on Fly. User is testing the new questionnaire and custom builder on iOS device.

## Completed
- Questionnaire redesign: shared questions + `build_mode` branch (template/custom)
- Frontend questionnaire config: added `build_mode`, custom mode skips `focus` question
- Custom workout builder: `CustomWorkoutBuilderScreen` with split selection, day tabs, exercise picker, manual reorder
- Builder saves to backend templates + exercises, routes to Workouts tab
- CrossFit removed from questionnaire, backend routing, and WORKOUT_STRUCTURES.md spec
- Removed "Custom" placeholder option from questionnaire (replaced with actual builder)
- Muscle group filter fixed to be case-insensitive against DB lowercase values
- Frontend builds successfully with Vite
- Deploy pipeline working: build on Linux → rsync `dist/` to MacBook `dist/` → `npx cap sync ios` from MacBook project root → Xcode run on device
- SSH alias `macbook` used for all MacBook operations; raw IP references removed from docs

## Next Actions
- User: test questionnaire on iOS device, test custom builder end-to-end
- Agent: validate template generation against real DB exercise library
- Agent: build AI coach layer (chat interface + week_schedule builder)
- Agent: add periodization logic to AI coach for split/progression recommendations

## Notes
- Knowledge hierarchy documented in `MEMORY-INDEX.md`; always read it before starting work.
- All domain-specific lessons are in `memory/<topic>.md`.
- Never fall back to local backend; production is `https://askeo.fit/api`.
- Always use `macbook` SSH alias, never raw IP.
- When building for iOS: sync Linux `dist/` to MacBook `dist/` first, then run `cap sync ios` from project root.
