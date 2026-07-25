# SmartLift Backend

FastAPI + SQLite service powering workout templates, sessions, set logs, and body-weight tracking.

## Stack

- FastAPI / Uvicorn
- SQLAlchemy 2.x
- SQLite (auto-created on first run)
- Pydantic v2 single settings schema (read at startup from env)

## Quick Start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

OpenAPI docs: `http://localhost:8000/docs`

## Environment

`backend/.env` values are loaded at startup (fail loud if missing):

```bash
DATABASE_URL=sqlite:///./smartlift.db
JWT_SECRET=<random 32+ char string>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
API_BASE_URL=http://localhost:8000  # public / tunnel URL used by frontend
```

## Key Models

- `User`, `Template`, `TemplateExercise`, `WorkoutSession`
- `SetLog`, `CoachMessage`, `BodyWeightEntry`, `Settings`

Cascade deletes:
- `contexts` → `templates`
- `templates` → `exercises`, `sessions`
- `sessions` → `set-logs`, `coach-messages`

## Key Routes

| Method | Route | Purpose |
|--------|-------|---------|
| GET /api/workouts/history | List past sessions grouped by workout/date/exercise |
| POST /api/workouts/start | Create session from template |
| POST /api/workouts/active/{id}/log | Add set to active session |
| POST /api/workouts/active/{id}/coach | Coach message |
| GET/POST/DELETE /api/body-weight | Body-weight entries |
| GET/PUT /api/settings | App settings (includes `api_base` for tunnel URL) |
| POST /api/auth/register, /token | JWT auth |

## Tunnel / Public URL

Cloudflare Quick Tunnel exposes the backend without opening ports.

```bash
cloudflared tunnel --url http://localhost:8000
```

The tunnel URL is ephemeral. Update it via:

```bash
curl -X PUT http://127.0.0.1:8000/api/settings/api_base \
  -H "Content-Type: application/json" \
  -d '{"key":"api_base","value":"<NEW_TUNNEL_URL>/api"}'
```

The frontend reads the stored URL on startup.

## Development Notes

- Frontend URL is read from the backend setting `api_base`.
- Demo / seeded data uses `is_selected` flags on `contexts` and initial `body_weight` entries.
- Prefer adding endpoints under `/api/` with consistent JSON responses.

## License

Private — all rights reserved.
