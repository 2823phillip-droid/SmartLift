# Active Context
last_updated: 2026-10-05

Updated when work in progress changes.

## Current Task
Post-migration Xcode testing. The Mac Studio M5 Max migration is complete — all documentation updated to reflect single-machine reality. Now testing the iOS build from Xcode on the Studio.

## Completed
- Full documentation audit and rewrite (PROJECT.md, deploy.md, MEMORY-INDEX.md)
- All references to Linux server / MacBook SSH removed from docs
- `scripts/deploy.py` confirmed as full local 7-stage pipeline
- iOS bundle verified in `frontend/ios/App/App/public/assets/` — current

## Next Actions
- User tests Xcode build on device or simulator
- After testing: address any bugs found, continue the app

## Notes
- Knowledge hierarchy documented in `MEMORY-INDEX.md`; always read it before starting work.
- All domain-specific lessons are in `memory/<topic>.md`.
- Never fall back to local backend; production is `https://askeo.fit/api`.
- Health endpoint is `/healthz` (NOT `/api/healthz`).
- Everything runs locally on the Mac Studio now.
