#!/usr/bin/env bash
# =============================================================================
# Medgnosis — live CQL reconcile smoke (Phase 2 Epic A gate)
# Proves the export -> load -> evaluate -> reconcile loop on REAL Medgnosis data:
#   1. brings up an (ephemeral, host-published) HAPI clinical-reasoning sidecar
#   2. loads the CMS122 executable artifacts ONLY (Measure + Libraries +
#      ValueSets — test patients stripped, so population eval reflects only the
#      exported Medgnosis cohort)
#   3. runs apps/api/scripts/live-reconcile.ts which exports a bounded diabetes
#      cohort as QI-Core, loads it, evaluates $evaluate-measure, and prints the
#      SQL-vs-CQL reconcile.
#
# The compose `cql-engine` service is internal-only (no published port), so this
# smoke runs its own port-published mirror container (same env) to let the
# host-side reconcile reach the engine. Exact SQL/CQL agreement is NOT a gate
# requirement — the deliverable is a real end-to-end run + a quantified delta.
#
# Usage (from repo root):  bash scripts/cql-live-reconcile.sh
# Stop the engine after:   docker rm -f medgnosis-cql-engine-smoke
# =============================================================================
set -euo pipefail

ENGINE_CONTAINER="medgnosis-cql-engine-smoke"
ENGINE_PORT="${ENGINE_PORT:-18080}"
export CQL_ENGINE_URL="${CQL_ENGINE_URL:-http://localhost:${ENGINE_PORT}/fhir}"
export MEASURE_CODE="${MEASURE_CODE:-CMS122v12}"
REPO="cqframework/ecqm-content-qicore-2025"
MEASURE="CMS122FHIRDiabetesAssessGreaterThan9Percent"
CACHE="/tmp/${MEASURE}-bundle.json"
ARTIFACT_ONLY="/tmp/cms122-artifact-only.json"

# ── 1. Engine ────────────────────────────────────────────────────────────────
if curl -sf "$CQL_ENGINE_URL/metadata" -o /dev/null 2>/dev/null; then
  echo "[live-reconcile] engine already reachable at $CQL_ENGINE_URL"
else
  if [ -z "$(docker ps -q -f "name=^${ENGINE_CONTAINER}$")" ]; then
    docker rm -f "$ENGINE_CONTAINER" 2>/dev/null || true
    echo "[live-reconcile] starting ephemeral engine ($ENGINE_CONTAINER) on :$ENGINE_PORT ..."
    docker run -d --rm --name "$ENGINE_CONTAINER" \
      -p "${ENGINE_PORT}:8080" \
      -e hapi.fhir.cr.enabled=true \
      -e hapi.fhir.enforce_referential_integrity_on_write=false \
      -e hapi.fhir.allow_external_references=true \
      -e JAVA_OPTS="-Xmx1300m -Xms512m" \
      hapiproject/hapi:latest >/dev/null
  fi
  echo "[live-reconcile] waiting for $CQL_ENGINE_URL/metadata (HAPI cold start ~60-90s) ..."
  curl --retry 60 --retry-delay 5 --retry-connrefused -sf "$CQL_ENGINE_URL/metadata" -o /dev/null
fi

# ── 2. Load the CMS122 executable artifacts (strip MADiE test data) ───────────
if [ ! -f "$CACHE" ]; then
  echo "[live-reconcile] fetching CMS122 measure bundle ..."
  curl -fsSL "https://raw.githubusercontent.com/${REPO}/main/bundles/measure/${MEASURE}/${MEASURE}-bundle.json" -o "$CACHE"
fi
python3 - "$CACHE" "$ARTIFACT_ONLY" <<'PY'
import json, sys
src, dst = sys.argv[1], sys.argv[2]
b = json.load(open(src))
keep = {"Measure", "Library", "ValueSet", "CodeSystem"}
b["entry"] = [e for e in b.get("entry", []) if e.get("resource", {}).get("resourceType") in keep]
b["type"] = "transaction"
json.dump(b, open(dst, "w"))
print("[live-reconcile] artifact-only bundle entries:", len(b["entry"]))
PY
echo "[live-reconcile] loading CMS122 executable artifacts ..."
curl -sf -X POST "$CQL_ENGINE_URL" -H 'Content-Type: application/fhir+json' --data-binary "@$ARTIFACT_ONLY" -o /dev/null

# ── 3. DATABASE_URL (host form) ───────────────────────────────────────────────
# DATABASE_URL lives in the repo-root .env with the Docker host alias
# (host.docker.internal). This host-side script needs the localhost form.
if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
  DATABASE_URL=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"' | sed 's/host.docker.internal/localhost/')
fi
if [ -z "${DATABASE_URL:-}" ]; then
  echo "[live-reconcile] ERROR: DATABASE_URL not set and repo-root .env has none" >&2
  exit 1
fi
export DATABASE_URL

# ── 4. Export -> load -> evaluate -> reconcile ────────────────────────────────
echo "[live-reconcile] running cohort export + reconcile ..."
( cd apps/api && npx tsx scripts/live-reconcile.ts )

echo "[live-reconcile] done. Stop the engine with: docker rm -f ${ENGINE_CONTAINER}"
