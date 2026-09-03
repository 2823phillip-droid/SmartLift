#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Staging and committing local changes"
git add -A
git commit -m "sync: $(date +%Y-%m-%d\ %H:%M:%S)" || true

echo "==> Pushing to origin"
git push origin master

echo "==> Syncing iOS on MacBook"
ssh phillipwalters@192.168.1.112 'export PATH="$PATH:/opt/homebrew/bin:/opt/homebrew/Cellar/node/26.7.0/bin" && cd ~/workout-logger && git pull origin master && npm run build && npx cap sync ios'

echo "==> Deploying backend to Fly.io"
ssh phillipwalters@192.168.1.112 'export PATH="$PATH:/opt/homebrew/bin" && source ~/.zshrc 2>/dev/null || true && cd ~/workout-logger/backend && ~/.fly/bin/fly deploy --app smartlift-api'

echo "==> Done"
