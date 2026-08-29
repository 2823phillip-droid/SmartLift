#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

REPO="$HOME/workout-logger"
LINUX_HOST="192.168.1.1"
LINUX_USER="phillip2823"

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  SMARTLIFT SYNC CHECK${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

cd "$REPO"

# 1. LOCAL GIT
echo -e "${YELLOW}[1] LOCAL GIT STATUS${NC}"
git fetch origin 2>/dev/null || true
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/master 2>/dev/null || echo "unknown")
echo "  Local HEAD:  $LOCAL"
echo "  Remote HEAD: $REMOTE"
if [ "$LOCAL" != "$REMOTE" ]; then
    echo -e "  ${RED}✗ LOCAL != REMOTE${NC}"
    NEEDS_PULL=true
else
    echo -e "  ${GREEN}✓ Synced to remote${NC}"
    NEEDS_PULL=false
fi

UNSTAGED=$(git diff --name-only)
UNTRACKED=$(git ls-files --others --exclude-standard)
if [ -n "$UNSTAGED" ] || [ -n "$UNTRACKED" ]; then
    echo -e "  ${YELLOW}! Uncommitted changes:${NC}"
    echo "$UNSTAGED" | while read -r f; do [ -n "$f" ] && echo "    M $f"; done
    echo "$UNTRACKED" | while read -r f; do [ -n "$f" ] && echo "    ? $f"; done
fi
echo ""

# 2. LINUX BOX GIT
echo -e "${YELLOW}[2] LINUX BOX GIT${NC}"
if ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$LINUX_USER@$LINUX_HOST" "cd $REPO && git rev-parse HEAD" &>/dev/null; then
    LINUX_HEAD=$(ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$LINUX_USER@$LINUX_HOST" "cd $REPO && git rev-parse HEAD")
    echo "  Linux HEAD: $LINUX_HEAD"
    if [ "$LINUX_HEAD" != "$REMOTE" ]; then
        echo -e "  ${RED}✗ Linux != Remote${NC}"
    else
        echo -e "  ${GREEN}✓ Synced to remote${NC}"
    fi
else
    echo -e "  ${YELLOW}! Could not reach Linux box (skipping)${NC}"
fi
echo ""

# 3. FLY BACKEND
echo -e "${YELLOW}[3] BACKEND (Fly.io)${NC}"
export PATH="$HOME/.fly/bin:$PATH"
NEEDS_BACKEND_DEPLOY=false

if command -v fly &>/dev/null; then
    FLY_STATUS=$(fly status -a smartlift-api 2>&1) || true
    if echo "$FLY_STATUS" | grep -q "no access token"; then
        echo -e "  ${YELLOW}! flyctl not authenticated in this session${NC}"
        echo "    Run: fly auth login"
    else
        DEPLOYED_AT=$(echo "$FLY_STATUS" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z' | head -1)
        LOCAL_COMMIT_TS=$(git log -1 --format='%ci' HEAD 2>/dev/null || echo "unknown")
        REMOTE_COMMIT_TS=$(git log -1 --format='%ci' origin/master 2>/dev/null || echo "unknown")

        echo "  Deployed at:     $DEPLOYED_AT"
        echo "  Local commit:    $(git log -1 --format='%h %s')"
        echo "  Local TS:        $LOCAL_COMMIT_TS"
        echo "  Remote commit:   $(git log -1 --format='%h %s' origin/master 2>/dev/null)"
        echo "  Remote TS:       $REMOTE_COMMIT_TS"

        if [ "$NEEDS_PULL" = "false" ] && [ -n "$DEPLOYED_AT" ] && [ "$DEPLOYED_AT" != "unknown" ]; then
            BACKEND_CHANGED=$(git diff --name-only origin/master HEAD | grep -q "^backend/" && echo "yes" || echo "no")
            if [ "$BACKEND_CHANGED" = "yes" ]; then
                DEPLOY_DATE=$(echo "$DEPLOYED_AT" | cut -d'T' -f1)
                LOCAL_DATE=$(echo "$LOCAL_COMMIT_TS" | awk '{print $1}')
                if [ "$DEPLOY_DATE" \< "$LOCAL_DATE" ]; then
                    echo -e "  ${RED}✗ Backend deploy is OLDER than latest commit${NC}"
                    NEEDS_BACKEND_DEPLOY=true
                else
                    echo -e "  ${GREEN}✓ Backend deploy is current${NC}"
                fi
            else
                echo -e "  ${GREEN}✓ No backend changes since last deploy${NC}"
            fi
        fi
    fi
else
    echo -e "  ${YELLOW}! flyctl not found at \$HOME/.fly/bin/fly${NC}"
fi
echo ""

# 4. FRONTEND BUILD / CAP SYNC
echo -e "${YELLOW}[4] FRONTEND BUILD & CAP SYNC${NC}"
NEEDS_BUILD=false

DIST_BUNDLE=$(ls frontend/dist/assets/index-*.js 2>/dev/null | head -1 || echo "")
IOS_BUNDLE=$(ls frontend/ios/App/App/public/assets/index-*.js 2>/dev/null | head -1 || echo "")

if [ -z "$DIST_BUNDLE" ]; then
    echo -e "  ${RED}✗ No built bundle in frontend/dist/${NC}"
    NEEDS_BUILD=true
else
    echo "  Dist bundle:  $(basename "$DIST_BUNDLE")"
    if [ -z "$IOS_BUNDLE" ]; then
        echo -e "  ${YELLOW}! No bundle synced to iOS project${NC}"
        NEEDS_BUILD=true
    else
        echo "  iOS bundle:   $(basename "$IOS_BUNDLE")"
        if [ "$(basename "$DIST_BUNDLE")" != "$(basename "$IOS_BUNDLE")" ]; then
            echo -e "  ${RED}✗ Bundle hash mismatch — iOS is running stale assets${NC}"
            NEEDS_BUILD=true
        else
            echo -e "  ${GREEN}✓ iOS bundle matches dist${NC}"
        fi
    fi
fi

if [ ! -f frontend/ios/App/App/capacitor.config.json ]; then
    echo -e "  ${YELLOW}! capacitor.config.json missing from ios project${NC}"
    NEEDS_BUILD=true
fi
echo ""

# 5. SUMMARY
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  SUMMARY${NC}"
echo -e "${CYAN}========================================${NC}"

if [ "$NEEDS_PULL" = "true" ]; then
    echo -e "  ${YELLOW}! Git needs pull on MacBook:${NC}"
    echo "    cd $REPO && git pull origin master"
fi
if [ "$NEEDS_BACKEND_DEPLOY" = "true" ]; then
    echo -e "  ${YELLOW}! Backend needs deploy to Fly:${NC}"
    echo "    cd $REPO/backend && fly deploy"
fi
if [ "$NEEDS_BUILD" = "true" ]; then
    echo -e "  ${YELLOW}! Frontend needs rebuild and cap sync:${NC}"
    echo "    cd $REPO/frontend && npm run build"
    echo "    cd $REPO && npx cap sync ios"
fi

if [ "$NEEDS_PULL" = "false" ] && [ "$NEEDS_BACKEND_DEPLOY" = "false" ] && [ "$NEEDS_BUILD" = "false" ]; then
    echo -e "  ${GREEN}✓ ALL SYSTEMS SYNCED — ready to build from Xcode${NC}"
fi
echo ""
