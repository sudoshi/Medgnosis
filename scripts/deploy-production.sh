#!/usr/bin/env bash
# Medgnosis Production Deploy Script
# Rebuilds all artifacts and restarts the production services.
# Dev servers on :3002/:5175 are NOT affected.
#
# Usage: ./scripts/deploy-production.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "=== Medgnosis Production Deploy ==="
echo "Repository: $REPO_ROOT"
echo ""

# Step 1: Build
echo "[1/3] Building all workspaces..."
npm run build
echo "    Build complete."
echo ""

# Step 2: Restart services
echo "[2/3] Restarting production services..."
sudo systemctl restart medgnosis-api medgnosis-worker
echo "    Services restarted."
echo ""

# Step 3: Verify
echo "[3/3] Verifying..."
sleep 2

API_STATUS=$(systemctl is-active medgnosis-api 2>/dev/null || true)
WORKER_STATUS=$(systemctl is-active medgnosis-worker 2>/dev/null || true)

echo "    medgnosis-api:    $API_STATUS"
echo "    medgnosis-worker: $WORKER_STATUS"

# Health check
HEALTH=$(curl -sf http://127.0.0.1:3081/health 2>/dev/null || echo '{"status":"unreachable"}')
echo "    Health check:     $HEALTH"
echo ""

if [ "$API_STATUS" = "active" ] && [ "$WORKER_STATUS" = "active" ]; then
    echo "Deploy successful! Site: https://medgnosis.acumenus.net"
else
    echo "WARNING: One or more services are not active. Check: journalctl -u medgnosis-api -n 50"
    exit 1
fi
