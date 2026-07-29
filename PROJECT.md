# SmartLift / Workout-Logger Project

## Paths
- Repo root: /home/phillip2823/workout-logger
- Frontend: /home/phillip2823/workout-logger/frontend
- Backend: /home/phillip2823/workout-logger/backend

## Network
- MacBook SSH: phillipwalters@192.168.1.112
- Local backend: removed; do not use.
- Production backend: https://smartlift-api.fly.dev/api

## Deploy
- Frontend build + sync: rsync -avz --progress frontend/src/ phillipwalters@192.168.1.112:~/workout-logger/frontend/src/ && ssh phillipwalters@192.168.1.112 'source ~/.nvm/nvm.sh && nvm use 22 && npm run build && npx cap sync ios'
- Backend deploy: fly deploy -a smartlift-api
- Remote git: https://github.com/2823phillip-droid/SmartLift.git
- Workout-logger git remote: https://github.com/phillip28237/SmartLift.git

## Auth
- Admin: phillip@smartlift.app / SmartLiftAdmin2026!
- Test user: 2823phillip@gmail.com

## Known non-blockers
- TypeScript noUnusedParameters is enabled.
- Some unrelated build noise exists; fix only when it blocks deploy.

## Rules
- Do not fall back to local backend.
- Agent owns full deploy/sync end-to-end.
- Never ask user to run manual terminal commands for deploy.
