# Deploy: Frontend + Backend

last_updated: 2026-08-05
created: 2026-07-31
tags: [deploy, frontend, backend, fly, cap-sync, verification]
related: PROJECT.md, Askeo.md, debugging.md

## Linux → MacBook → iOS pipeline

1. On Linux: `cd /home/phillip2823/workout-logger/frontend && npx vite build`
2. Rsync `dist/` to MacBook: `rsync -avz --delete frontend/dist/ macbook:~/workout-logger/frontend/dist/`
3. SSH to MacBook: `cd ~/workout-logger/frontend && source ~/.nvm/nvm.sh && nvm use 22 && npx cap sync ios`
4. Verify `~/workout-logger/frontend/ios/App/App/public/assets/index-<newhash>.js` exists
5. In Xcode: **Product > Clean Build Folder**, then build and run to device
6. **Uninstall the app first** if the bundle hash changed; WKWebView caches aggressively

## Validation checklist
- [ ] `frontend/ios/App/App/public/index.html` contains new bundle hash
- [ ] Bundle file exists at `frontend/ios/App/App/public/assets/index-<hash>.js`
- [ ] No duplicate `dist/` or root `public/` folders on MacBook
- [ ] Xcode clean build completes without errors
- [ ] Device: app installed, user logs in, Workouts tab loads without errors

## Backend deploy
- On Linux, `flyctl` must run in an interactive shell because `FLY_API_TOKEN` lives in `~/.bashrc`, which is not sourced by non-interactive shells.
- Command: `bash -ic 'cd /home/phillip2823/workout-logger && python3 -m py_compile backend/main.py && fly deploy -a smartlift-api --no-cache'`
- Verify with: `curl -s https://askeo.fit/healthz`

## Common failures
- `fly: command not found` → ensure `~/.fly/bin` is on PATH
- `no access token available` → shell was non-interactive; use `bash -ic ...`
- Stale `index-<old>.js` → delete or cap sync overwrites
- `ionic://localhost` CORS block → backend missing origin in `allow_origins`
- Backend 500 masked as CORS → check backend logs, not just console
- 401 after fresh login → stale token in localStorage; logout + login clears it

## Change log
- 2026-07-31 — Created from today's troubleshooting session
