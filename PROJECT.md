# Askeo / Workout-Logger Project

## Paths
- Repo root: /home/phillip2823/workout-logger
- Frontend: /home/phillip2823/workout-logger/frontend
- Backend: /home/phillip2823/workout-logger/backend

## Network
- MacBook SSH: `macbook` (configured in ~/.ssh/config)
- MacBook IP: 192.168.1.112 (DHCP-reserved, never hardcode elsewhere)
- Linux server: 192.168.1.111 (this machine)
- Local backend: removed; do not use.
- Production backend: https://askeo.fit/api

## Domain & DNS
- Public domain: askeo.fit (Namecheap)
- A record: @ → 66.241.124.80 (Fly.io) — ⚠️ shared IP, can rotate. Run `fly ips allocate-v4 -a smartlift-api` ($2/mo) for dedicated static IP, then update this record.
- AAAA record: @ → 2a09:8280:1::158:fa7:0 (Fly IPv6)
- Nameservers: Namecheap default (dns1/dns2.registrar-servers.com)
- SSL cert: managed by Fly (check with `fly certs list -a smartlift-api`)
- Roadmap: https://askeo.fit/roadmap
- Health check: https://askeo.fit/healthz
- NOTE: Fly internal app name is `smartlift-api` — do NOT rename. Users only see askeo.fit.

## Deploy
- Frontend build + sync: build `frontend/dist/` on Linux, rsync to `macbook:~/workout-logger/frontend/ios/App/App/public/`, then `npx cap sync ios`
- Backend deploy: use interactive shell on Linux because `FLY_API_TOKEN` is in `~/.bashrc`: `bash -ic 'cd /home/phillip2823/workout-logger && python3 -m py_compile backend/main.py && fly deploy -a smartlift-api --no-cache'`
- Frontend sync validation: see `memory/deploy.md`
- Remote git: https://github.com/2823phillip-droid/Askeo.git
- Workout-logger git remote: https://github.com/phillip28237/Askeo.git

## Auth
- Admin: phillip@askeo.fit / AskeoAdmin2026!
- Test user: 2823phillip@gmail.com

## Known non-blockers
- TypeScript noUnusedParameters is enabled.
- Some unrelated build noise exists; fix only when it blocks deploy.

## Rules
- Agent owns full deploy/sync end-to-end.
- Never ask user to run manual terminal commands for deploy.
- Use `macbook` SSH alias for all MacBook operations; never use raw IP.
- Do not fall back to local backend.
