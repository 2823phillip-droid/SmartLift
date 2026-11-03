# Deploy: Frontend + Backend

last_updated: 2026-10-05
created: 2026-07-31
tags: [deploy, frontend, backend, fly, cap-sync, verification]
related: PROJECT.md, Askeo.md, debugging.md
note: Updated 2026-10-05 — migration to Mac Studio M5 Max complete. All steps now run local via scripts/deploy.py

## Deployment (Mac Studio M5 Max, single machine)

Run the full pipeline locally with `scripts/deploy.py`. It does everything in sequence:
1. **Preflight** — git status check, backend syntax check (`py_compile`)
2. **Backup** — Fly remote snapshots of backend + frontend
3. **Push** — `git add` + `git commit` + `git push origin master`
4. **Fly deploy backend** — `fly deploy --app smartlift-api` from backend/
5. **Health check** — `curl -s https://askeo.fit/healthz` returns OK
6. **Build frontend** — `npm run build` in frontend/, then `npx cap sync ios`
7. **Smoke test** — verify API responds through Xcode Capacitor bridge

### Single-command deploy
```bash
cd /Users/phillipwalters/Projects/askeo/repo && python3 scripts/deploy.py
```

For just the backend (no frontend changes):
```bash
cd /Users/phillipwalters/Projects/askeo/repo/backend && fly deploy --app smartlift-api
```

### Testing from Xcode
After a successful `deploy.py`:
1. Open `frontend/ios/App.xcworkspace` in Xcode
2. Clean build (Product > Clean Build Folder): **especially if JS bundle hash changed**
3. Run on Simulator or connected device (Product > Run)
4. Or use the Simulator directly without pushing to a real device

### Standalone backend deploy (no frontend changes)
```bash
cd /Users/phillipwalters/Projects/askeo/repo/backend && fly deploy --app smartlift-api --remote-only
```

### Manual verification steps (if needed)
- Backend healthy: `curl -s https://askeo.fit/healthz` returns OK
- Frontend JS bundle updated: check `frontend/ios/App/App/public/assets/index-*.js` exists and is recent
- WebDir config: Capacitor reads from `dist/`, Xcode consumes from `frontend/ios/App/App/public/`

## Validation checklist
- [ ] Git commit + push succeeded (or skip if nothing changed)
- [ ] Backend py_compile passed
- [ ] Fly deploy succeeded (`smartlift-api`)
- [ ] Health check returns OK
- [ ] Frontend built and cap sync ios ran
- [ ] iOS bundle hash updated in `frontend/ios/App/App/public/assets/`
- [ ] User instructed to clean build in Xcode if frontend changed

## Common failures
- `fly: command not found` → ensure `~/.fly/bin` is on PATH (set in .zshrc)
- `no access token available` → run in interactive shell, not cron/background
- Stale `index-<old>.js` → cap sync overwrites; if stuck, delete old JS files first
- `ionic://localhost` CORS block → backend missing origin in `allow_origins`
- Backend 500 masked as CORS → check backend logs, not just console
- 401 after fresh login → stale token in localStorage; logout + login clears it
- **iOS shows old questionnaire/UI after deploy** → missed `npm run build` + `npx cap sync ios`; the web bundle in Xcode project is stale

## Change log
- 2026-10-05 — Rewrote: all steps moved to local `scripts/deploy.py` on Mac Studio M5 Max. Removed rsync, SSH, and MacBook references entirely.
- 2026-09-10 — Rewrote Step 4: documented SSH-to-MacBook deploy as primary command, corrected health URL to `/healthz`, added IPv6 dedicated-IP note
- 2026-09-10 — Updated frontmatter `last_updated` to 2026-09-10
- 2026-08-07 — Added explicit end-of-session routine with frontend build + cap sync step
- 2026-07-31 — Created from today's troubleshooting session

## Current Status (2026-11-02)

**LastPass & Credentials:**
- Production DATABASE_URL stored in LastPass as "SmartLift Production DATABASE_URL" (Password type)
- lpass CLI installed at `/opt/homebrew/bin/lpass`, login works

**WireGuard & DNS:**
- WireGuard tunnel up on Mac Studio (utun interfaces, flyctl agent running)
- flewctl agent started with `fly auth login` (Google OAuth)
- DNS not resolving Fly.io hostname (system DNS pointing to local router, not Fly.io DNS)
- SSH to Fly.io works via tunnel, can access production Postgres via SSH session
- Direct Postgres connections from Mac Studio failing (DNS issue)

**Production Database:**
- 15 exercises with NULL auto-tag fields identified (stretching exercises + squat variations)
- Classification script running for those exercises
- Backup process established: `~/Projects/askeo/backups/` on Mac Studio, manual `pg_dump` before/after changes
- Fly.io Postgres is unmanaged — no automated backups

**Documentation:**
- TODO.md updated with backup process, dynamic warmup feature, and today's accomplishments
- deploy.md updated with current status
- `.gitignore` updated to exclude `backups/`
- Backup directory created: `~/Projects/askeo/backups/`

**Next Steps:**
- Fix DNS issue on Mac Studio (so direct Postgres connections work)
- Complete classification of 15 exercises with NULL auto-tag fields
- Add warmup exercises for dynamic warmup feature
- Build dynamic warmup screen in frontend (for tomorrow)
