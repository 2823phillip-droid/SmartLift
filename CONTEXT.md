# Active Context

Updated when work in progress changes.

## Current Task
- None pending. Last shipped: template editor back/cancel/saved go to Workouts tab.

## Completed
- Template pencil on template rows opens the full workout editor.
- Removed duplicate “ghost page” list (`quick_start` / `TemplateGroupListScreen`).
- Wired `onEditTemplate` through `WorkoutsScreen` → `SortableGroupRow` → `SortableTemplateRow`.
- Template editor back/cancel/saved navigate to Workouts.
- Removed all `192.168.1.111:8000` hardcoded fallbacks in app code; default is `https://smartlift-api.fly.dev/api`.
- Created `project-context` skill that loads `PROJECT.md`, `PERSONA.md`, `CONTEXT.md`, `TODO.md` at startup.
- Synced to MacBook `192.168.1.112`, built, `npx cap sync ios` completed.
- Committed and pushed to `origin/master`.

## Next Actions
- Verify on device: template pencil, back nav, API base = Fly.
- Keep MacBook static IP at `192.168.1.112`.
