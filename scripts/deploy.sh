#!/bin/bash
set -e

REPO="$HOME/workout-logger"
cd "$REPO"

echo ""
echo "Running pre-flight sync check..."
./scripts/sync-check.sh
echo ""

# Determine what needs action from sync-check output
NEEDS_PULL=false
NEEDS_PUSH=false
NEEDS_BACKEND=false
NEEDS_BUILD=false

if git rev-parse HEAD != git rev-parse origin/master 2>/dev/null; then
    AHEAD_BEHIND=$(git rev-list --left-right --count origin/master...HEAD 2>/dev/null || echo "0 0")
    BEHIND=$(echo "$AHEAD_BEHIND" | awk "{print \$1}")
    AHEAD=$(echo "$AHEAD_BEHIND" | awk "{print \$2}")
    if [ "$BEHIND" -gt 0 ] && [ "$AHEAD" -eq 0 ]; then
        NEEDS_PULL=true
    elif [ "$AHEAD" -gt 0 ]; then
        NEEDS_PUSH=true
    else
        NEEDS_PULL=true
        NEEDS_PUSH=true
    fi
fi

# Check backend
if [ "$NEEDS_PULL" = "false" ]; then
    export PATH="$HOME/.fly/bin:$PATH"
    DEPLOYED_AT=$(fly status -a smartlift-api 2>&1 | grep -oE "[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z" | head -1 || echo "")
    LOCAL_DATE=$(git log -1 --format="%ci" HEAD 2>/dev/null || echo "")
    if [ -n "$DEPLOYED_AT" ] && [ -n "$LOCAL_DATE" ]; then
        DEPLOY_DATE=$(echo "$DEPLOYED_AT" | cut -d"T" -f1)
        LOCAL_DATE_ONLY=$(echo "$LOCAL_DATE" | awk "{print \$1}")
        if git diff --name-only origin/master HEAD | grep -q "^backend/"; then
            if [ "$DEPLOY_DATE" \< "$LOCAL_DATE_ONLY" ]; then
                NEEDS_BACKEND=true
            fi
        fi
    fi
fi

# Check frontend
DIST_BUNDLE=$(ls frontend/dist/assets/index-*.js 2>/dev/null | head -1 || echo "")
IOS_BUNDLE=$(ls frontend/ios/App/App/public/assets/index-*.js 2>/dev/null | head -1 || echo "")
if [ -z "$DIST_BUNDLE" ]; then
    NEEDS_BUILD=true
elif [ -n "$IOS_BUNDLE" ] && [ "$(basename "$DIST_BUNDLE")" != "$(basename "$IOS_BUNDLE")" ]; then
    NEEDS_BUILD=true
fi

# Act
CHANGED=false

if [ "$NEEDS_PULL" = "true" ]; then
    echo "Pulling latest from GitHub..."
    git pull origin master
    CHANGED=true
fi

if [ "$NEEDS_BACKEND" = "true" ]; then
    echo "Deploying backend to Fly..."
    export PATH="$HOME/.fly/bin:$PATH"
    cd "$REPO"
    fly deploy -a smartlift-api
    CHANGED=true
fi

if [ "$NEEDS_BUILD" = "true" ]; then
    echo "Building frontend..."
    export PATH=$PATH:/opt/homebrew/bin
    cd "$REPO/frontend"
    npm run build
    echo "Syncing to iOS..."
    cd "$REPO"
    npx cap sync ios
    CHANGED=true
fi

echo ""
echo "========================================"
echo "  DEPLOY COMPLETE"
echo "========================================"
if [ "$CHANGED" = "true" ]; then
    echo "  Changes applied. Open Xcode and press Run."
else
    echo "  Nothing to do — all systems synced."
    echo "  Open Xcode and press Run when ready."
fi
echo "========================================"
echo ""
