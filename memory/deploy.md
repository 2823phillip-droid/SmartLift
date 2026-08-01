# Deploy: Frontend + Backend

last_updated: 2026-08-01
created: 2026-07-31
tags: [deploy, frontend, backend, fly, cap-sync, verification]
related: PROJECT.md, SMARTLIFT.md, debugging.md

## Linux → MacBook → iOS pipeline

1. Build on Linux: `cd /home/phillip2823/workout-logger/frontend && npm run build`
2. Sync dist to MacBook: `rsync -avz --progress frontend/dist/ phillipwalters@192.168.1.112:~/workout-logger/frontend/dist/`
3. SSH to MacBook and run `npx cap sync ios` from `~/workout-logger/frontend`
4. Verify `~/workout-logger/frontend/ios/App/App/public/index.html` points to the new bundle hash
5. Remove any root-level `dist/` or `public/` folders on MacBook if they appear; only `ios/App/App/public/` matters to Xcode
6. In Xcode: **Product > Clean Build Folder**, then build and run to device
7. **Uninstall the app first** if the bundle hash changed; WKWebView caches aggressively

## Validation checklist
- [ ] `frontend/ios/App/App/public/index.html` contains new bundle hash
- [ ] Bundle file exists at `frontend/ios/App/App/public/assets/index-<hash>.js`
- [ ] No duplicate `dist/` or root `public/` folders on MacBook
- [ ] Xcode clean build completes without errors
- [ ] Device: app installed, user logs in, Workouts tab loads without errors

## Backend deploy
- On Linux, `flyctl` must run in an interactive shell because `FLY_API_TOKEN` lives in `~/.bashrc`, which is not sourced by non-interactive shells.
- Command: `bash -ic 'cd /home/phillip2823/workout-logger && python3 -m py_compile backend/main.py && fly deploy -a smartlift-api --no-cache'`
- Verify with: `curl -s https://smartlift-api.fly.dev/healthz`

## Common failures
- `fly: command not found` → ensure `~/.fly/bin` is on PATH
- `no access token available` → shell was non-interactive; use `bash -ic ...`
- Stale `index-<old>.js` → delete or cap sync overwrites
- `ionic://localhost` CORS block → backend missing origin in `allow_origins`
- Backend 500 masked as CORS → check backend logs, not just console
- 401 after fresh login → stale token in localStorage; logout + login clears it

## Change log
- 2026-07-31 — Created from today's troubleshooting session
