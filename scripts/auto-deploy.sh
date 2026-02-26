#!/usr/bin/env bash
# Medgnosis Auto-Deploy Daemon
# Watches for source changes and rebuilds/restarts production automatically.
# Only triggers a build when files have actually changed since the last deploy.
#
# Usage: runs as systemd service (medgnosis-auto-deploy.service)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HASH_FILE="/tmp/.medgnosis-last-deploy-hash"
LOCK_FILE="/tmp/.medgnosis-deploy.lock"
INTERVAL=60

cd "$REPO_ROOT"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

compute_hash() {
    # Hash all source files that affect the build
    find apps/api/src apps/web/src packages/shared/src packages/db/src \
        -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' -o -name '*.html' \) \
        -newer "$HASH_FILE" 2>/dev/null | head -1
}

deploy() {
    log "Changes detected — rebuilding..."

    # Prevent concurrent deploys
    if [ -f "$LOCK_FILE" ]; then
        log "Deploy already in progress, skipping."
        return
    fi
    touch "$LOCK_FILE"
    trap 'rm -f "$LOCK_FILE"' RETURN

    if sudo -u smudoshi npm run build --silent 2>&1; then
        log "Build succeeded. Restarting services..."
        /usr/bin/systemctl restart medgnosis-api medgnosis-worker
        sleep 2

        API_STATUS=$(systemctl is-active medgnosis-api 2>/dev/null || true)
        WORKER_STATUS=$(systemctl is-active medgnosis-worker 2>/dev/null || true)

        if [ "$API_STATUS" = "active" ] && [ "$WORKER_STATUS" = "active" ]; then
            touch "$HASH_FILE"
            log "Deploy complete. API=$API_STATUS Worker=$WORKER_STATUS"
        else
            log "WARNING: Services not healthy. API=$API_STATUS Worker=$WORKER_STATUS"
        fi
    else
        log "Build FAILED — services not restarted."
    fi
}

# Initialize hash file if missing
[ -f "$HASH_FILE" ] || touch "$HASH_FILE"

log "Auto-deploy daemon started (interval=${INTERVAL}s)"
log "Repository: $REPO_ROOT"
log "Watching: apps/api/src, apps/web/src, packages/shared/src, packages/db/src"

while true; do
    CHANGED=$(compute_hash)
    if [ -n "$CHANGED" ]; then
        deploy
    fi
    sleep "$INTERVAL"
done
