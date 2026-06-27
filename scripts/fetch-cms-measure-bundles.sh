#!/usr/bin/env bash
# =============================================================================
# Medgnosis — Official CMS eCQM measure-bundle fetch/cache (Phase 5)
#
# Idempotently downloads the published QI-Core/FHIR eCQM measure bundles for the
# target reporting year from a CONFIGURABLE official source into a gitignored
# cache directory, then validates each bundle is JSON with resourceType=Bundle.
# Re-running is safe: an already-cached, structurally valid bundle is reported
# as "cached" and not re-downloaded unless --force is given.
#
# Source of truth for the portfolio is scripts/cms-measure-bundles.manifest.json
# (CMS122 diabetes, CMS165 hypertension, CMS130/CMS125/CMS124 cancer screening).
#
# The OFFICIAL source URL is operator-supplied and never hardcoded. The script
# fetches ${ECQM_BUNDLE_SOURCE_URL%/}/<reportingYear>/<bundleFile> per measure.
# Official content originates from the CMS eCQM program (MADiE measure export /
# eCQI Resource Center published measure bundles); see the runbook in
# docs/superpowers/runbooks/cms-measure-bundles.md for the canonical pointers.
#
# Usage:
#   ./scripts/fetch-cms-measure-bundles.sh --dry-run
#   ECQM_BUNDLE_SOURCE_URL=https://<official-host>/ecqm/bundles \
#     ./scripts/fetch-cms-measure-bundles.sh
#
# Flags:
#   --dry-run            List what WOULD be fetched (per measure: target URL +
#                        cache path) without any network access. No download.
#   --force              Re-download even if a valid bundle is already cached.
#   --year <YYYY>        Override the manifest reportingYear for this run.
#   --manifest <path>    Use an alternate manifest JSON file.
#   --cache-dir <path>   Override the cache root (default data/cms-bundles).
#   -h, --help           Show this help.
#
# Environment:
#   ECQM_BUNDLE_SOURCE_URL   Official base URL for measure bundles (required for
#                            a real fetch; ignored in --dry-run). NEVER a secret.
#   ECQM_BUNDLE_AUTH_HEADER  Optional, opaque "Header: value" forwarded verbatim
#                            to curl (-H). Read from the environment only; its
#                            value is NEVER printed or logged.
#
# No credentials are ever echoed. The script exits non-zero if any targeted
# measure fails to download or fails Bundle validation.
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_PREFIX="[fetch-cms-bundles]"

DRY_RUN=0
FORCE=0
YEAR_OVERRIDE=""
MANIFEST="${REPO_ROOT}/scripts/cms-measure-bundles.manifest.json"
CACHE_ROOT="${CMS_BUNDLE_CACHE_DIR:-${REPO_ROOT}/data/cms-bundles}"

usage() {
  # Print the prose lines of the header doc block (between the two banner rules).
  sed -n '3,46p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

log() { echo "${LOG_PREFIX} $*"; }
err() { echo "${LOG_PREFIX} $*" >&2; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --force) FORCE=1; shift ;;
    --year)
      [ "$#" -ge 2 ] || { err "--year requires a value"; exit 2; }
      YEAR_OVERRIDE="$2"; shift 2 ;;
    --year=*) YEAR_OVERRIDE="${1#--year=}"; shift ;;
    --manifest)
      [ "$#" -ge 2 ] || { err "--manifest requires a path"; exit 2; }
      MANIFEST="$2"; shift 2 ;;
    --manifest=*) MANIFEST="${1#--manifest=}"; shift ;;
    --cache-dir)
      [ "$#" -ge 2 ] || { err "--cache-dir requires a path"; exit 2; }
      CACHE_ROOT="$2"; shift 2 ;;
    --cache-dir=*) CACHE_ROOT="${1#--cache-dir=}"; shift ;;
    -h | --help) usage; exit 0 ;;
    *) err "Unknown argument: $1"; exit 2 ;;
  esac
done

command -v jq >/dev/null 2>&1 || { err "jq is required but not found on PATH."; exit 2; }

if [ ! -f "$MANIFEST" ]; then
  err "Manifest not found: $MANIFEST"
  exit 2
fi

if ! jq -e . "$MANIFEST" >/dev/null 2>&1; then
  err "Manifest is not valid JSON: $MANIFEST"
  exit 2
fi

# Reporting year: CLI override wins, else the manifest value.
YEAR="${YEAR_OVERRIDE:-$(jq -r '.reportingYear' "$MANIFEST")}"
case "$YEAR" in
  ''|*[!0-9]*) err "Invalid reporting year: '${YEAR}'"; exit 2 ;;
esac

MEASURE_COUNT="$(jq -r '.measures | length' "$MANIFEST")"
if [ "$MEASURE_COUNT" -eq 0 ]; then
  err "Manifest lists no measures."
  exit 2
fi

CACHE_DIR="${CACHE_ROOT%/}/${YEAR}"

log "Reporting year      : ${YEAR}"
log "Manifest            : ${MANIFEST}"
log "Cache directory     : ${CACHE_DIR}"
log "Measures in portfolio: ${MEASURE_COUNT}"
if [ "$DRY_RUN" -eq 1 ]; then
  log "Mode                : DRY RUN (no network, no writes)"
  # In dry-run the source URL is informational only; show placeholder if unset.
  log "Source base URL     : ${ECQM_BUNDLE_SOURCE_URL:-<unset: set ECQM_BUNDLE_SOURCE_URL for a real fetch>}"
else
  log "Mode                : FETCH"
  if [ -z "${ECQM_BUNDLE_SOURCE_URL:-}" ]; then
    err "ECQM_BUNDLE_SOURCE_URL is not set; required for a real fetch."
    err "Re-run with --dry-run to preview, or export the official base URL."
    exit 2
  fi
  log "Source base URL     : ${ECQM_BUNDLE_SOURCE_URL%/}"
fi
echo

# Validate a downloaded/cached bundle file is JSON with resourceType=Bundle.
# Returns 0 if valid, 1 otherwise. Never prints file contents.
validate_bundle() {
  local file="$1"
  [ -s "$file" ] || return 1
  local rt
  rt="$(jq -r 'if type=="object" then (.resourceType // "") else "" end' "$file" 2>/dev/null)" || return 1
  [ "$rt" = "Bundle" ]
}

FETCHED=0
CACHED=0
FAILED=0
declare -a SUMMARY_LINES=()

idx=0
while [ "$idx" -lt "$MEASURE_COUNT" ]; do
  short_id="$(jq -r ".measures[$idx].ecqmShortId" "$MANIFEST")"
  version="$(jq -r ".measures[$idx].version" "$MANIFEST")"
  bundle_file="$(jq -r ".measures[$idx].bundleFile" "$MANIFEST")"
  domain="$(jq -r ".measures[$idx].domain" "$MANIFEST")"
  idx=$((idx + 1))

  dest="${CACHE_DIR}/${bundle_file}"
  # Source URL only meaningful when set; in dry-run it may be unset.
  src="${ECQM_BUNDLE_SOURCE_URL:+${ECQM_BUNDLE_SOURCE_URL%/}/${YEAR}/${bundle_file}}"

  if [ "$DRY_RUN" -eq 1 ]; then
    log "WOULD FETCH ${short_id} (${version}, ${domain})"
    log "  from: ${src:-<ECQM_BUNDLE_SOURCE_URL>/${YEAR}/${bundle_file}}"
    log "  into: ${dest}"
    SUMMARY_LINES+=("${short_id}: would-fetch")
    continue
  fi

  # Idempotent: keep an already-valid cached bundle unless --force.
  if [ "$FORCE" -eq 0 ] && [ -f "$dest" ] && validate_bundle "$dest"; then
    log "CACHED ${short_id} (${version}) -> ${dest}"
    CACHED=$((CACHED + 1))
    SUMMARY_LINES+=("${short_id}: cached")
    continue
  fi

  mkdir -p "$CACHE_DIR"
  tmp="${dest}.part"
  rm -f "$tmp"

  # -f: fail on HTTP >=400; -sS: quiet but show errors; -L: follow redirects.
  # Auth header (if any) is passed from the environment and never echoed.
  curl_args=(-fSL --retry 2 --retry-delay 2 -o "$tmp")
  if [ -n "${ECQM_BUNDLE_AUTH_HEADER:-}" ]; then
    curl_args+=(-H "${ECQM_BUNDLE_AUTH_HEADER}")
  fi

  if ! curl "${curl_args[@]}" "$src" 2>/dev/null; then
    err "FAILED ${short_id}: download error from official source."
    rm -f "$tmp"
    FAILED=$((FAILED + 1))
    SUMMARY_LINES+=("${short_id}: failed-download")
    continue
  fi

  if ! validate_bundle "$tmp"; then
    err "FAILED ${short_id}: downloaded artifact is not a FHIR Bundle (resourceType!=Bundle or invalid JSON)."
    rm -f "$tmp"
    FAILED=$((FAILED + 1))
    SUMMARY_LINES+=("${short_id}: failed-validation")
    continue
  fi

  mv -f "$tmp" "$dest"
  log "FETCHED ${short_id} (${version}) -> ${dest}"
  FETCHED=$((FETCHED + 1))
  SUMMARY_LINES+=("${short_id}: fetched")
done

echo
log "==== Per-measure summary (reporting year ${YEAR}) ===="
for line in "${SUMMARY_LINES[@]}"; do
  log "  ${line}"
done

if [ "$DRY_RUN" -eq 1 ]; then
  echo
  log "Dry run complete: ${MEASURE_COUNT} measure(s) would be fetched. No network access performed."
  exit 0
fi

echo
log "Fetched: ${FETCHED}  Cached: ${CACHED}  Failed: ${FAILED}"

if [ "$FAILED" -gt 0 ]; then
  err "${FAILED} measure bundle(s) failed download or validation; failing."
  exit 1
fi

log "All ${MEASURE_COUNT} targeted measure bundle(s) present and valid in ${CACHE_DIR}."
