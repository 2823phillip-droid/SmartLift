# Build Index

## Production (deployed to phone)
- iOS build folder: frontend/ios/App/App/public/
- Build date: 2026-09-27
- Git commit: 47fd026 (latest HEAD)
- JS bundle: index-CKfyY5UP.js (859,718 bytes)
- CSS bundle: index-Cp3limsD.css (57,001 bytes)
- Status: READY — synced from existing dist build on 2026-09-29

## Work in Progress (not built, not committed)
- Files: backend/main.py, backend/models.py, backend/classify_exercises.py
- Purpose: Exercise classification planning (is_compound / is_helper_activity fields)
- Status: Investigation/prep only — stashed on Linux as stash@{0}

## Build Metadata
- See frontend/dist/BUILD_METADATA.json for full build info
- See frontend/ios/App/App/public/BUILD_METADATA.json for deployed build info

## Build Commands
- Frontend build: npm run build (tsc -b && vite build)
- iOS sync: npx cap sync ios
- Backend deploy: flyctl deploy (from backend/)
