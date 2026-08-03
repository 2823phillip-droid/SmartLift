# Askeo Architecture / “Index”

## Stack
- Backend: FastAPI + SQLAlchemy 2.0 + Pydantic v2
- WSGI: gunicorn with uvicorn workers
- Database: PostgreSQL (Fly managed Postgres; SQLite fallback via DATABASE_URL)
- Frontend: Capacitor + Vite + TypeScript
- iOS deploy: `npm run build && npx cap sync ios`
- Backend deploy: `fly deploy -a smartlift-api --no-cache`
- Machine ID: 80e9614f60d108

## Exercise Library (current)
- Source: `hasaneyldrm/exercises-dataset` GitHub repo
- File: `backend/dist/exercises-hasan.json`
- Seeded into: Fly Postgres table `exercise_library`
- Count: 1,318 unique exercises
- Fields: name, category, body_part, muscle_group, secondary_muscles, target, equipment, instructions, instruction_steps, gif_url, image_url, video_url, media_id, attribution
- Media provider: GitHub raw CDN (`https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/...`)
- Sync endpoint: `POST /api/exercise-library/sync` (requires auth)
- Tag quality: upstream JSON has systematic tag mismatches; backend applies `tag_overrides` on sync with longest-match precedence
- GIF viewing: opens in webview via `@capacitor/browser`

## Key Endpoints
- `/healthz` — health check
- `/api/auth/login`, `/api/auth/signup` — auth (JWT)
- `/api/exercise-library` — list exercises (optionally query `?q=`)
- `/api/exercise-library/sync` — import exercises JSON into DB
- `/api/workout-library` — workout templates
- `/api/workout-library/import` — import from exercise library
- `/api/rules/next-prescription` — compute next session prescription + persist AlgorithmState
- `/api/rules/algorithm-state/{exercise_entry_id}` — read AlgorithmState for an exercise
- `/api/rules/transitions` — list ProgressionTransition rows

## Known gotchas
- WKWebView will cache the first `index-<hash>.js` it sees; full app uninstall required to clear after bundle hash changes
- `ionic://localhost` is a valid Origin on modern iOS WebViews — backend must allow both `capacitor://localhost` and `ionic://localhost`
- `contexts.order` column drift between local SQLite and production Postgres — verify production schema before declaring success on `/api/contexts` changes
- `fetchWithTimeout` in api.ts is 30s; do NOT lower to 2500ms without device cold-start testing
- Backend 500s from SQLAlchemy can surface in WKWebVie as CORS errors — check backend logs, not just browser console
- 401 persists across app restarts until stored token is cleared; logout + login clears it

## Users
- Test: `2823phillip@gmail.com` (id=2 in Fly Postgres)
- Admin: `phillip@askeo.fit / AskeoAdmin2026!`

## Domain & DNS Architecture
- **Public domain**: `askeo.fit` (purchased on Namecheap)
- **SSL cert**: managed by Fly.io — cert issued for `askeo.fit`
- **Fly internal app name**: `smartlift-api` (do NOT rename — internal only, users never see it)
- **A record**: `@` → `66.241.124.80` (Fly.io IP, set in Namecheap DNS)
  - ⚠️ **This IP is currently shared and can rotate without notice.** Run `fly ips allocate-v4 -a smartlift-api` ($2/mo) to get a dedicated static IP, then update the A record. Do not skip this — a rotated IP will break the domain.
- **AAAA record**: `@` → `2a09:8280:1::158:fa7:0` (Fly IPv6, set in Namecheap DNS)
- **Nameservers**: Namecheap default (`dns1.registrar-servers.com`, `dns2.registrar-servers.com`)
- **Public API base**: `https://askeo.fit/api`
- **Roadmap**: `https://askeo.fit/roadmap`
- **Health check**: `https://askeo.fit/healthz`

### How to update domain settings later
- **DNS changes**: Namecheap dashboard → Domain List → Manage `askeo.fit` → Advanced DNS
- **SSL/renewal**: handled automatically by Fly; check status with `fly certs list -a smartlift-api`
- **Change public domain**: update Namecheap A/AAAA records + add new cert in Fly + update `frontend/.env` and `frontend/src/api.ts`
- **Rename the app publicly**: requires changing domain purchase, DNS, Fly cert, frontend branding, OAuth consent screen — treat as a full rebrand

## Backups / Recovery
- Original exercises JSON preserved at `backend/dist/exercises-hasan.json`
- Git remotes: `origin` → `2823phillip-droid/Askeo.git`; `workout-logger` remote → `phillip28237/Askeo.git`
- Local save tag exists: `fly-deploy-save-2026-07-29` (not pushed to GitHub, not required for deployment)

## Frontend Hints
- `.env` only used at build time; rebuild after changing VITE_API_BASE
- iOS webview may zoom GIFs too large—frontend `capacitor.config.json` plus viewer size control handles this
- Frontend error capture: `localStorage['askeo_error_log']`, up to 50 entries, visible in Debug Log screen

## Knowledge Hierarchy
- `MEMORY-INDEX.md` — index of all project knowledge files
- `memory/` — durable lessons by domain (debugging, deploy, backend-db, auth, frontend-fetch, decisions)
- `TODO.md` — roadmap/priorities
- `CONTEXT.md` — current active task
- `PROJECT.md` — immutable deploy/network/auth facts
