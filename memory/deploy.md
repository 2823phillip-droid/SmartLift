# Deploy: Frontend + Backend

last_updated: 2026-09-10
created: 2026-07-31
tags: [deploy, frontend, backend, fly, cap-sync, verification]
related: PROJECT.md, Askeo.md, debugging.md

## End-of-session routine (run when user says "save, sync, deploy")

### Step 1 — Save
- `git add` all modified files
- `git commit` with descriptive message
- `git push origin master`

### Step 2 — Sync source to MacBook
- `rsync -avz --delete /home/phillip2823/workout-logger/ macbook:~/workout-logger/`
- This syncs source code only (backend, frontend/src, memory, etc.)

### Step 3 — Frontend web build + iOS sync
**Only if frontend source changed** (`frontend/src/`, `frontend/package.json`, etc.):
1. `cd /home/phillip2823/workout-logger/frontend && npm run build`
2. `rsync -avz /home/phillip2823/workout-logger/frontend/dist/ macbook:~/workout-logger/frontend/dist/`
3. `ssh macbook "cd ~/workout-logger/frontend && source ~/.nvm/nvm.sh && nvm use 22 && npx cap sync ios"`
4. Verify: `ssh macbook "ls -la ~/workout-logger/frontend/ios/App/App/public/assets/index-*.js"` shows new timestamp

### Step 4 — Backend deploy
- `fly` CLI lives only on the MacBook (phillipwalters@192.168.1.112), not on this Linux VM. Run the deploy from the Linux VM via SSH to `macbook`:
  - Non-interactive: `ssh -o BatchMode=yes macbook "cd ~/workout-logger && /Users/phillipwalters/.fly/bin/fly deploy --remote-only"`
  - Interactive: `ssh macbook "cd ~/workout-logger/backend && /Users/phillipwalters/.fly/bin/fly deploy -a smartlift-api"`
  - Run `python3 -m py_compile backend/main.py` on Linux first to catch syntax errors before deploy.
- Verify: `curl -s https://askeo.fit/healthz` returns `{"status":"ok"}`. The health route is `/healthz`, NOT `/api/healthz`.
- Note: the shared ingress IP (`66.241.124.80`) can rotate; always verify `askeo.fit` resolves before relying on a hardcoded IP. IPv6 (`2a09:8280:1::158:fa7:0`) is dedicated and safe.

### Step 5 — Handoff to user
- Tell user to build/run from Xcode
- If frontend bundle hash changed, remind user to **Product > Clean Build Folder** first

## Validation checklist
- [ ] Git commit + push succeeded
- [ ] Source rsync to MacBook completed
- [ ] If frontend changed: web build succeeded, dist rsync'd, cap sync ios ran
- [ ] `frontend/ios/App/App/public/assets/index-<newhash>.js` exists with current timestamp
- [ ] Backend py_compile passed
- [ ] Fly deploy succeeded
- [ ] Health check returns OK
- [ ] User instructed to clean build in Xcode if frontend changed

## Common failures
- `fly: command not found` → ensure `~/.fly/bin` is on PATH
- `no access token available` → shell was non-interactive; use `bash -ic ...`
- Stale `index-<old>.js` → delete or cap sync overwrites
- `ionic://localhost` CORS block → backend missing origin in `allow_origins`
- Backend 500 masked as CORS → check backend logs, not just console
- 401 after fresh login → stale token in localStorage; logout + login clears it
- **iOS shows old questionnaire/UI after deploy** → missed `npm run build` + `npx cap sync ios`; the web bundle in Xcode project is stale

## Change log
- 2026-09-10 — Rewrote Step 4: documented SSH-to-MacBook deploy as primary command, corrected health URL to `/healthz`, added IPv6 dedicated-IP note
- 2026-09-10 — Updated frontmatter `last_updated` to 2026-09-10
- 2026-08-07 — Added explicit end-of-session routine with frontend build + cap sync step
- 2026-07-31 — Created from today's troubleshooting session
