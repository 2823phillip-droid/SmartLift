# Askeo / Workout-Logger Project

## Paths
- Repo root: /Users/phillipwalters/Projects/askeo/repo/
- Frontend: /Users/phillipwalters/Projects/askeo/repo/frontend/
- Backend: /Users/phillipwalters/Projects/askeo/repo/backend/

## Network
- Production backend: https://askeo.fit/api
- Fly dev URL: https://smartlift-api.fly.dev/api (same Fly app, same server)

## Domain & DNS
- Public domain: askeo.fit (Namecheap)
- A record: @ → 66.241.124.80 (Fly.io) — shared ingress IP, can rotate.
- AAAA record: @ → 2a09:8280:1::158:fa7:0 (Fly IPv6)
- Nameservers: Namecheap default (dns1/dns2.registrar-servers.com)
- SSL cert: managed by Fly (check with `fly certs list -a smartlift-api`)
- Roadmap: https://askeo.fit/roadmap
- Todo: https://askeo.fit/todo
- Health endpoint is `/healthz` (not `/api/healthz`). Production URL: `https://askeo.fit/healthz`.
- NOTE: Fly internal app name is `smartlift-api` — do NOT rename. Users only see askeo.fit.

## Deploy (Mac Studio M5 Max, single machine)
Deploy runs entirely local on the Mac Studio via `scripts/deploy.py` (7 stages): preflight → fly backup snapshots → push git → fly deploy backend → health check → cap sync ios → smoke test. The frontend build is built in-process and synced to Capacitor's `frontend/ios/App/App/public/` — Xcode reads from this folder. The Fly app does NOT serve the frontend; it only serves the API.
- Backend: `fly deploy --app smartlift-api` (run from backend/)
- Frontend: `npx cap sync ios` after `npm run build`, then test via Xcode → Product > Run (Simulator or connected device)
- Health verification: `curl -s https://askeo.fit/healthz` returns `{"status":"ok"}`. The health route is `/healthz`, NOT `/api/healthz`.
- Remote git: https://github.com/2823phillip-droid/SmartLift.git

## Auth
- Admin: phillip@askeo.fit / [REDACTED]
- Test user: 2823phillip@gmail.com

## Known non-blockers
- TypeScript noUnusedParameters is enabled.
- Some unrelated build noise exists; fix only when it blocks deploy.

## Rules
- Agent owns full deploy/sync end-to-end.
- Never ask user to run manual terminal commands for deploy.
- Do not fall back to local backend.
