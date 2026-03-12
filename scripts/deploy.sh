#!/usr/bin/env bash
# =============================================================================
# Medgnosis — Docker Deploy Script
# Usage:
#   ./scripts/deploy.sh              # Full rebuild + restart
#   ./scripts/deploy.sh --api        # Rebuild API only
#   ./scripts/deploy.sh --frontend   # Rebuild nginx (frontend) only
#   ./scripts/deploy.sh --restart    # Restart without rebuild
#   ./scripts/deploy.sh --logs       # Tail all container logs
#   ./scripts/deploy.sh --status     # Show service health
#   ./scripts/deploy.sh --down       # Stop all containers
# =============================================================================

set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE="docker compose"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[deploy]${NC} $1"; }
ok()   { echo -e "${GREEN}[  ok  ]${NC} $1"; }
warn() { echo -e "${YELLOW}[ warn ]${NC} $1"; }
err()  { echo -e "${RED}[error ]${NC} $1"; }

# ── Pre-flight checks ──
preflight() {
    if ! command -v docker &>/dev/null; then
        err "Docker is not installed. See https://docs.docker.com/engine/install/"
        exit 1
    fi

    if ! docker info &>/dev/null; then
        err "Docker daemon is not running."
        exit 1
    fi

    local docker_version
    docker_version=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "0.0.0")
    local major minor
    major=$(echo "$docker_version" | cut -d. -f1)
    minor=$(echo "$docker_version" | cut -d. -f2)
    if (( major < 20 || (major == 20 && minor < 10) )); then
        err "Docker >= 20.10 required (found $docker_version). host.docker.internal needs this version."
        exit 1
    fi

    if [ ! -f .env ]; then
        warn ".env file not found. Copying from .env.example..."
        cp .env.example .env
        warn "Edit .env with your database credentials before deploying."
        exit 1
    fi
}

# ── Wait for healthchecks ──
wait_healthy() {
    local service=$1
    local max_wait=${2:-120}
    local waited=0
    local container="medgnosis-${service}-1"

    log "Waiting for $service to be healthy..."
    while [ $waited -lt $max_wait ]; do
        local health
        health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "unknown")

        if [ "$health" = "healthy" ]; then
            ok "$service is healthy"
            return 0
        fi
        sleep 2
        waited=$((waited + 2))
    done
    warn "$service did not become healthy within ${max_wait}s"
    return 1
}

# ── Status table ──
status() {
    log "Service status:"
    echo ""
    $COMPOSE ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
    echo ""
}

# ── Main ──
case "${1:-}" in
    --api)
        preflight
        log "Rebuilding API..."
        $COMPOSE build api
        $COMPOSE up -d api worker
        wait_healthy api
        status
        ;;
    --frontend)
        preflight
        log "Rebuilding frontend..."
        $COMPOSE build nginx
        $COMPOSE up -d nginx
        wait_healthy nginx
        status
        ;;
    --restart)
        preflight
        log "Restarting all services..."
        $COMPOSE restart
        wait_healthy redis 30
        wait_healthy solr 60
        wait_healthy api
        wait_healthy nginx
        status
        ;;
    --logs)
        $COMPOSE logs -f --tail=100
        ;;
    --status)
        status
        ;;
    --down)
        log "Stopping all services..."
        $COMPOSE down
        ok "All services stopped."
        ;;
    --help|-h)
        echo "Usage: $0 [--api|--frontend|--restart|--logs|--status|--down|--help]"
        echo ""
        echo "  (no flag)    Full rebuild + restart all services"
        echo "  --api        Rebuild and restart API + worker only"
        echo "  --frontend   Rebuild and restart nginx (frontend) only"
        echo "  --restart    Restart all without rebuilding"
        echo "  --logs       Tail all container logs"
        echo "  --status     Show service health status"
        echo "  --down       Stop all containers"
        exit 0
        ;;
    "")
        preflight
        log "Full rebuild + deploy..."
        $COMPOSE build
        $COMPOSE up -d
        log "Waiting for services..."
        wait_healthy redis 30
        wait_healthy solr 60
        wait_healthy api
        wait_healthy nginx
        echo ""
        ok "Medgnosis is running!"
        status
        ;;
    *)
        err "Unknown flag: $1. Use --help for usage."
        exit 1
        ;;
esac
