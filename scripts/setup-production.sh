#!/usr/bin/env bash
# Medgnosis Production Setup Script
# Installs systemd services, Apache vhost, and obtains SSL certificate.
# Must be run with sudo or as root.
#
# Usage: sudo ./scripts/setup-production.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "=== Medgnosis Production Setup ==="
echo "Repository: $REPO_ROOT"
echo ""

# ── Step 1: Install systemd services ──
echo "[1/5] Installing systemd services..."
cp scripts/medgnosis-api.service /etc/systemd/system/
cp scripts/medgnosis-worker.service /etc/systemd/system/
cp scripts/medgnosis-auto-deploy.service /etc/systemd/system/
systemctl daemon-reload
echo "    Systemd units installed."
echo ""

# ── Step 2: Enable and start services ──
echo "[2/5] Enabling and starting services..."
systemctl enable --now medgnosis-api medgnosis-worker medgnosis-auto-deploy
sleep 2

API_STATUS=$(systemctl is-active medgnosis-api 2>/dev/null || true)
WORKER_STATUS=$(systemctl is-active medgnosis-worker 2>/dev/null || true)
DEPLOY_STATUS=$(systemctl is-active medgnosis-auto-deploy 2>/dev/null || true)

echo "    medgnosis-api:         $API_STATUS"
echo "    medgnosis-worker:      $WORKER_STATUS"
echo "    medgnosis-auto-deploy: $DEPLOY_STATUS"
echo ""

# ── Step 3: Health check ──
echo "[3/5] Health check..."
HEALTH=$(curl -sf http://127.0.0.1:3081/health 2>/dev/null || echo '{"status":"unreachable"}')
echo "    $HEALTH"
echo ""

# ── Step 4: Install Apache vhost (HTTP only) ──
echo "[4/5] Installing Apache virtual host..."
cp scripts/medgnosis.acumenus.net.conf /etc/apache2/sites-available/
a2ensite medgnosis.acumenus.net.conf
systemctl reload apache2
echo "    HTTP vhost enabled."
echo ""

# ── Step 5: Obtain SSL certificate ──
echo "[5/5] Obtaining SSL certificate via Certbot..."
echo "    This will prompt you for email/agreement if first time."
echo ""
certbot --apache -d medgnosis.acumenus.net

# Replace Certbot's auto-generated SSL config with our custom one
echo ""
echo "    Replacing Certbot SSL config with custom reverse-proxy config..."
cp scripts/medgnosis.acumenus.net-le-ssl.conf /etc/apache2/sites-available/
systemctl reload apache2
echo "    Custom SSL vhost installed."
echo ""

# ── Done ──
echo "=== Setup Complete ==="
echo ""
echo "Services:"
echo "    medgnosis-api:         $(systemctl is-active medgnosis-api 2>/dev/null || true)"
echo "    medgnosis-worker:      $(systemctl is-active medgnosis-worker 2>/dev/null || true)"
echo "    medgnosis-auto-deploy: $(systemctl is-active medgnosis-auto-deploy 2>/dev/null || true)"
echo ""
echo "Health: $(curl -sf http://127.0.0.1:3081/health 2>/dev/null || echo 'unreachable')"
echo "Site:   https://medgnosis.acumenus.net"
echo ""
echo "Logs:   journalctl -u medgnosis-api -f"
echo "        journalctl -u medgnosis-auto-deploy -f"
