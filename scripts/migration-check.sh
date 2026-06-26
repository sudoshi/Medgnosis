#!/usr/bin/env bash
# =============================================================================
# Medgnosis — Migration list + dry-run gate
# Runs the read-only migration status gates (`db:migrate:list` and the
# `--dry-run` validator) against the DATABASE_URL already present in the
# environment, then reports applied vs pending counts. NO migration is applied.
#
# It exits non-zero when there are pending migrations, so CI / release scripts
# fail loudly on an un-migrated database — unless `--allow-pending` is given
# (e.g. a deploy that intends to migrate as its next step).
#
# Usage (load secrets from an env file WITHOUT echoing them):
#   set -a; . ./.env.production; set +a
#   ./scripts/migration-check.sh
#
# Or point the script at the env file directly:
#   ./scripts/migration-check.sh --env-file .env.production
#
# Flags:
#   --env-file <path>   Source <path> for env (DATABASE_URL) before running.
#   --allow-pending     Treat pending migrations as success (exit 0).
#   -h, --help          Show this help.
#
# DATABASE_URL is never printed; only the migration tool's own (non-secret)
# status lines and the applied/pending counts are emitted.
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ENV_FILE=""
ALLOW_PENDING=0

usage() {
  # Print the prose lines of the header doc block (between the two banner rules).
  sed -n '3,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --env-file)
      [ "$#" -ge 2 ] || { echo "[migration-check] --env-file requires a path" >&2; exit 2; }
      ENV_FILE="$2"
      shift 2
      ;;
    --env-file=*)
      ENV_FILE="${1#--env-file=}"
      shift
      ;;
    --allow-pending)
      ALLOW_PENDING=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "[migration-check] Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [ -n "$ENV_FILE" ]; then
  if [ ! -f "$ENV_FILE" ]; then
    echo "[migration-check] Env file not found: $ENV_FILE" >&2
    exit 2
  fi
  echo "[migration-check] Loading env from $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[migration-check] DATABASE_URL is not set." >&2
  echo "[migration-check] Provide it via --env-file <path> or:" >&2
  echo "[migration-check]   set -a; . ./.env.X; set +a; ./scripts/migration-check.sh" >&2
  exit 2
fi

cd "$REPO_ROOT"

# --- list gate: applied/pending status, applies nothing -----------------------
echo "[migration-check] Running migration list gate (db:migrate:list)..."
LIST_OUTPUT="$(npm run --silent db:migrate:list)"
echo "$LIST_OUTPUT"

# --- dry-run gate: re-validates plan + checksums, applies nothing -------------
echo "[migration-check] Running migration dry-run gate (db:migrate:dry-run)..."
DRY_RUN_OUTPUT="$(npm run --silent db:migrate:dry-run)"
echo "$DRY_RUN_OUTPUT"

# --- parse counts from the migration runner's own status lines ----------------
# Runner emits: "[migrate] Applied migrations: N"
#               "[migrate] Pending migrations: none"  (or)
#               "[migrate] Pending migrations (N):"
APPLIED_COUNT="$(printf '%s\n' "$LIST_OUTPUT" \
  | sed -nE 's/.*\[migrate\] Applied migrations: ([0-9]+).*/\1/p' \
  | tail -n 1)"

if printf '%s\n' "$LIST_OUTPUT" | grep -q '\[migrate\] Pending migrations: none'; then
  PENDING_COUNT=0
else
  PENDING_COUNT="$(printf '%s\n' "$LIST_OUTPUT" \
    | sed -nE 's/.*\[migrate\] Pending migrations \(([0-9]+)\):.*/\1/p' \
    | tail -n 1)"
fi

APPLIED_COUNT="${APPLIED_COUNT:-unknown}"
PENDING_COUNT="${PENDING_COUNT:-unknown}"

echo "[migration-check] Applied migrations: $APPLIED_COUNT"
echo "[migration-check] Pending migrations: $PENDING_COUNT"

if [ "$PENDING_COUNT" = "unknown" ]; then
  echo "[migration-check] Could not determine pending-migration count from runner output." >&2
  exit 1
fi

if [ "$PENDING_COUNT" -gt 0 ]; then
  if [ "$ALLOW_PENDING" -eq 1 ]; then
    echo "[migration-check] $PENDING_COUNT pending migration(s) found; allowed via --allow-pending."
    exit 0
  fi
  echo "[migration-check] $PENDING_COUNT pending migration(s) found; failing." >&2
  echo "[migration-check] Re-run with --allow-pending to permit pending migrations." >&2
  exit 1
fi

echo "[migration-check] Database is up to date; no pending migrations."
