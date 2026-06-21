#!/usr/bin/env bash
#
# santempi-audit-watchdog.sh
#
# Backstop against the SanteDB MPI audit ship-queue runaway (2026-06-20): if the
# ATNA dispatcher (AUDIT_SHIP -> santedb-arr) ever stops draining, the file queue
# /santedb/queue/sys.audit grows unbounded and the mono FileSystemListener thread
# pins a CPU core enumerating millions of files.
#
# Every run this:
#   1. Bounded-counts the queue depth (stops counting at CRIT, so it never pays
#      the full-enumeration cost that is the very symptom it guards against).
#   2. WARN  -> logs a warning to the journal.
#   3. CRIT  -> archives the stuck queue aside, recreates an empty dir, and
#               restarts santempi (re-establishing the dispatcher). Cooldown
#               prevents restart loops.
#   4. Prunes ARR audit logs older than the retention window.
#
# Installed as a systemd timer (santempi-audit-watchdog.timer). Runs as root.

set -euo pipefail

QUEUE_DIR="/var/lib/docker/volumes/medgnosis_santempi_data/_data/queue/sys.audit"
ARR_LOG_DIR="/var/lib/docker/volumes/medgnosis_santedb_arr_logs/_data"
ARCHIVE_DIR="/var/lib/docker/volumes/medgnosis_santempi_data/_data/queue"
COOLDOWN_FILE="/var/lib/santempi-audit-watchdog/last-heal"
CONTAINER="medgnosis-santempi"

WARN_THRESHOLD="${WARN_THRESHOLD:-10000}"
CRIT_THRESHOLD="${CRIT_THRESHOLD:-100000}"
COOLDOWN_SECONDS="${COOLDOWN_SECONDS:-3600}"
ARR_RETENTION_DAYS="${ARR_RETENTION_DAYS:-90}"

log() { logger -t santempi-audit-watchdog -- "$*"; echo "santempi-audit-watchdog: $*"; }

mkdir -p "$(dirname "$COOLDOWN_FILE")"

# ---- ARR log retention (always) -------------------------------------------
if [[ -d "$ARR_LOG_DIR" ]]; then
  find "$ARR_LOG_DIR" -maxdepth 1 -name 'audit-*.log' -type f -mtime "+${ARR_RETENTION_DAYS}" -print -delete \
    | while read -r f; do log "pruned ARR log past ${ARR_RETENTION_DAYS}d: $(basename "$f")"; done
fi

# ---- Queue depth (bounded count) ------------------------------------------
if [[ ! -d "$QUEUE_DIR" ]]; then
  log "queue dir missing ($QUEUE_DIR) — santempi not running or volume gone; skipping"
  exit 0
fi

# Count at most CRIT+1 entries, then stop — avoids enumerating a runaway dir.
depth="$(find "$QUEUE_DIR" -maxdepth 1 -type f -printf '.' 2>/dev/null \
         | head -c "$((CRIT_THRESHOLD + 1))" | wc -c)"

if (( depth <= WARN_THRESHOLD )); then
  exit 0
fi

if (( depth <= CRIT_THRESHOLD )); then
  log "WARN: audit ship queue depth=${depth} (>${WARN_THRESHOLD}). Dispatcher may be lagging; check santedb-arr and 'docker logs ${CONTAINER} | grep \"Cannot dispatch\"'."
  exit 0
fi

# ---- CRITICAL: self-heal --------------------------------------------------
now="$(date +%s)"
last_heal="$(cat "$COOLDOWN_FILE" 2>/dev/null || echo 0)"
if (( now - last_heal < COOLDOWN_SECONDS )); then
  log "CRIT: audit ship queue depth>=${CRIT_THRESHOLD} but within cooldown ($(( COOLDOWN_SECONDS - (now - last_heal) ))s left); not re-healing."
  exit 0
fi

ts="$(date +%Y%m%d-%H%M%S)"
stuck="${ARCHIVE_DIR}/sys.audit.stuck-${ts}"
log "CRIT: audit ship queue depth>=${CRIT_THRESHOLD} — self-healing: archiving to ${stuck} and restarting ${CONTAINER}."

mv "$QUEUE_DIR" "$stuck"
mkdir -p "$QUEUE_DIR"
echo "$now" > "$COOLDOWN_FILE"

if docker restart "$CONTAINER" >/dev/null 2>&1; then
  log "restarted ${CONTAINER}; stuck queue preserved at ${stuck} (compress/remove after review)."
else
  log "ERROR: failed to restart ${CONTAINER} after archiving stuck queue ${stuck}."
fi
