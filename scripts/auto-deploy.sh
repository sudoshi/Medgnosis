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
HEALTH_URL="http://localhost:3081/health"

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
        # Apache serves apps/web/dist statically; the build umask (007) strips
        # world-read, so make the fresh dist readable or the frontend 403s.
        chmod -R o+rX "$REPO_ROOT/apps/web/dist" 2>/dev/null || true
        /usr/bin/systemctl restart medgnosis-api
        # worker may be masked in this environment — restart only if available
        /usr/bin/systemctl restart medgnosis-worker 2>/dev/null || true

        # Boot/health gate: poll the real HTTP health endpoint. `systemctl
        # is-active` reads "activating" during a crash-loop and "active" for an
        # up-but-broken process — only a 200 confirms the app actually serves.
        # (A websocket route-registration crash once shipped because the daemon
        # keyed success on is-active alone.)
        HEALTHY=""
        for _ in $(seq 1 15); do
            if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$HEALTH_URL" 2>/dev/null || true)" = "200" ]; then
                HEALTHY=1; break
            fi
            sleep 2
        done

        API_STATUS=$(systemctl is-active medgnosis-api 2>/dev/null || true)
        WORKER_STATUS=$(systemctl is-active medgnosis-worker 2>/dev/null || true)

        # Advance the hash only on a real 200 — otherwise the daemon retries next
        # interval (self-heals once a fix lands) instead of marking a broken
        # deploy "complete".
        if [ -n "$HEALTHY" ]; then
            touch "$HASH_FILE"
            log "Deploy complete — health 200. API=$API_STATUS Worker=$WORKER_STATUS"
        else
            log "ERROR: API failed HTTP health check after restart — NOT marked healthy. API=$API_STATUS Worker=$WORKER_STATUS. Inspect: journalctl -u medgnosis-api -n 50"
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
