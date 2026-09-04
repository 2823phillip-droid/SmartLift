#!/usr/bin/env bash
set -euo pipefail

APP="smartlift-api"
MAC="phillipwalters@192.168.1.112"
REPO=~/workout-logger
BACKUP_DIR="$REPO/backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

echo "==> Pre-flight checks"
ssh -o StrictHostKeyChecking=no "$MAC" "cd $REPO && git status --porcelain"
ssh -o StrictHostKeyChecking=no "$MAC" "cd $REPO/backend && python3 -m pytest tests/ -q"

echo "==> Backing up Postgres"
mkdir -p "$BACKUP_DIR"
ssh -o StrictHostKeyChecking=no "$MAC" bash -s <<'REMOTE'
set -euo pipefail
export PATH="$PATH:/opt/homebrew/bin:/opt/homebrew/Cellar/node/26.7.0/bin:/opt/homebrew/opt/libpq/bin:$HOME/.fly/bin"
source ~/.zshrc >/dev/null 2>&1 || true

DB_URL=$(fly ssh console -C 'printenv DATABASE_URL' --app smartlift-api)
nohup fly proxy 5432:5432 pgbouncer.9g6y30wgzj9rv5ml.flympg.net -a smartlift-api > /tmp/fly_proxy.log 2>&1 &
echo $! > /tmp/fly_proxy.pid
sleep 3

USER=$(echo "$DB_URL" | awk -F/ '{print $3}' | awk -F: '{print $1}')
PASS=$(echo "$DB_URL" | awk -F/ '{print $3}' | awk -F: '{print $2}' | awk -F@ '{print $1}')
DB=$(echo "$DB_URL" | awk -F/ '{print $4}' | awk -F? '{print $1}')
export PGPASSWORD="$PASS"
pg_dump -h 127.0.0.1 -U "$USER" -d "$DB" > "$BACKUP_DIR/db-$TIMESTAMP.sql" || true
head -n 5 "$BACKUP_DIR/db-$TIMESTAMP.sql" || true

kill "$(cat /tmp/fly_proxy.pid)" >/dev/null 2>&1 || true
REMOTE

echo "==> Pushing code"
ssh -o StrictHostKeyChecking=no "$MAC" "cd $REPO && git add -A && git commit -m 'deploy: $TIMESTAMP' || true && git push origin master"

PREV_COMMIT=$(ssh -o StrictHostKeyChecking=no "$MAC" "cd $REPO && git rev-parse HEAD")
echo "Previous commit: $PREV_COMMIT"

echo "==> Deploying backend"
if ! ssh -o StrictHostKeyChecking=no "$MAC" "export PATH=\"\\$PATH:/opt/homebrew/bin:/opt/homebrew/Cellar/node/26.7.0/bin:\\$HOME/.fly/bin\"; source ~/.zshrc >/dev/null 2>&1 || true; cd $REPO/backend && ~/.fly/bin/fly deploy --app $APP"; then
  echo "Deploy failed, rolling back..."
  ssh -o StrictHostKeyChecking=no "$MAC" "cd $REPO && git checkout $PREV_COMMIT && cd backend && ~/.fly/bin/fly deploy --app $APP"
  exit 1
fi

echo "==> Waiting for health"
for i in $(seq 1 30); do
  if curl -sk "https://${APP}.fly.dev/healthz" | grep -q '"status":"ok"'; then
    echo "Health OK"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "Health check failed"
    ssh -o StrictHostKeyChecking=no "$MAC" "cd $REPO && git checkout $PREV_COMMIT && cd backend && ~/.fly/bin/fly deploy --app $APP"
    exit 1
  fi
  sleep 5
done

echo "==> Smoke test"
if ! curl -sk "https://${APP}.fly.dev/api/coach/health" | grep -q '"llm_available":true'; then
  echo "Coach health failed"
  ssh -o StrictHostKeyChecking=no "$MAC" "cd $REPO && git checkout $PREV_COMMIT && cd backend && ~/.fly/bin/fly deploy --app $APP"
  exit 1
fi

echo "==> Syncing iOS"
ssh -o StrictHostKeyChecking=no "$MAC" "export PATH=\"\\$PATH:/opt/homebrew/bin:/opt/homebrew/Cellar/node/26.7.0/bin\" && cd $REPO && git pull origin master && npm run build && npx cap sync ios"

echo "==> Deploy complete"

