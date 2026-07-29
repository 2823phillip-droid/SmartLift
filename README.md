# SmartLift — AI Trainer

Revenue-generating fitness SaaS built as a mobile-first web app wrapped with Capacitor.
Personal training with an AI coach, workout history, and template management.

## Stack

| Layer       | Tech                              |
|-------------|-----------------------------------|
| Backend     | FastAPI / Python (uvicorn)        |
| Frontend    | Vite + React + TypeScript        |
| Mobile      | Capacitor (iOS focus)             |
| Styling     | Tailwind CSS v4                   |
| Database    | SQLite via SQLAlchemy             |
| Tunnel      | Cloudflare Quick Tunnel (free)    |

## Project Structure

```
workout-logger/
├── backend/           # FastAPI server
│   └── main.py
├── frontend/          # Vite + React app
│   ├── src/
│   ├── dist/          # Production build (Capacitor webDir)
│   ├── capacitor.config.ts
│   └── index.html
└── docs/              # This file and setup guides
```

## Quick Start

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

Backend starts at `http://localhost:8000`.

### Frontend (web)

```bash
cd frontend
npm install
npm run dev    # dev server at :5173
npm run build  # production build to dist/
```

### API Configuration

The frontend reads its backend URL from `frontend/.env`:

```
VITE_API_BASE=https://smartlift-api.fly.dev/api
```

Defaults to Fly in production if unset. Use Settings only to override.

---

## Cloudflare Tunnel

Quick tunnel is used so the mobile app can reach the backend over the internet
without exposing ports.

```bash
cloudflared tunnel --url http://localhost:8000
```

The tunnel URL is ephemeral — it changes every time cloudflared restarts.

Current tunnel URL is stored in the backend database setting `api_base`.

When the tunnel rotates, update it with:

```bash
curl -X PUT http://127.0.0.1:8000/api/settings/api_base \
  -H "Content-Type: application/json" \
  -d '{"key":"api_base","value":"<NEW_URL>/api"}'
```

---

## iOS Build

### Prerequisites

- MacBook Pro or Mac Studio
- Xcode (free from Mac App Store)
- Node.js >= 22 (installed via nvm)
- SSH key access to the Mac

### Deployment Flow

1. Build the frontend on Linux: `npm run build`
2. Transfer source to Mac via tarball/SCP (or git)
3. On Mac: `npm install && npm run build`
4. On Mac: `npx cap add ios` (first time only)
5. On Mac: `npx cap sync ios`
6. On Mac: `npx cap open ios` — opens Xcode workspace
7. In Xcode: select iPhone target, select personal team, hit Play

### Device Pairing

- Connect iPhone via USB
- Xcode will prompt: "follow the instructions on your iPhone"
- Wake the iPhone → trust prompt on lock screen → tap **Trust**
- If Developer Mode is needed: Settings → Privacy & Security → Developer Mode → restart

### Signing

Free Apple ID works for personal device testing. Re-signing required every 7 days.
For TestFlight / App Store: enroll in Apple Developer Program ($99/yr).

### Bundle Identifier

Current: `com.phillipwalters.workoutlogger`
Config: `frontend/capacitor.config.ts` → `appId`

### Safe Area / Notch

The app uses `viewport-fit=cover` plus CSS `env(safe-area-inset-*)` padding
to avoid notch clipping on modern iPhones. See `frontend/src/App.tsx` and
`frontend/src/index.css`.

---

## Database

SQLite, auto-created on first run. Cascade deletes are enabled for:

- `contexts` → `templates` → `exercises`
- `templates` → `sessions`
- `sessions` → `set-logs`, `coach-messages`

---

## Roadmap

Short-term (dev/testing done):
- [x] Backend API with templates, sessions, logs, coach messages
- [x] iOS build via Capacitor
- [x] Cloudflare tunnel for remote access
- [x] Safe area / notch handling

Next (business build-out):
- [ ] User authentication (JWT)
- [ ] Multi-tenant backend (SQLite → Postgres)
- [ ] Stripe subscriptions
- [ ] AI coaching endpoint (currently a UI stub)
- [ ] Mac Studio: local AI model for coaching
- [ ] Meal prep tracking / nutrition logging
- [ ] TestFlight / App Store launch
- [ ] Git remote for easier Mac syncing

---

## Environment

- MacBook SSH: `phillipwalters@192.168.1.112`
- Production backend: `https://smartlift-api.fly.dev/api`
- Git remote (workout-logger): `https://github.com/phillip28237/SmartLift.git`

## License

Private — all rights reserved.
