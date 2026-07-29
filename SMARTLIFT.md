# SmartLift Architecture / “Index”

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

## Known Gotchas
- Fly auto-stops machine between requests; start with `fly machine start 80e9614f60d108`
- Docker build context is repo root; must `COPY backend/requirements.txt ./`
- Pinned deps: `passlib[bcrypt]==1.7.4`, `bcrypt==4.0.1`, `httpx==0.28.1`, `psycopg2-binary==2.9.9`, `gunicorn==21.2.0`
- Frontend `initApiBaseFromSettings()` probes `/healthz` first, no LAN fallback
- `fetchWithTimeout` is 5s
- 6 duplicate exercise names exist in JSON; sync uses `seen` set to avoid unique constraint errors
- Sync JSON path must be `Path(__file__).resolve().parent / "dist" / "exercises-hasan.json"`

## Users
- Test: `phillip+flytest@test.com`
- Primary: `2823phillip@gmail.com` (id=2 in Fly Postgres)

## Backups / Recovery
- Original exercises JSON preserved at `backend/dist/exercises-hasan.json`
- Skill for cycling has GPS + weather; SmartLift does not share auth/session state with cycling
- Git remote: `https://github.com/2823phillip-droid/SmartLift.git`
- Local save tag exists: `fly-deploy-save-2026-07-29` (not pushed to GitHub, not required for deployment)

## Frontend Hints
- `.env` only used at build time; rebuild after changing VITE_API_BASE
- iOS webview may zoom GIFs too large—frontend `capacitor.config.json` plus viewer size control handles this
