#!/usr/bin/env bash
# =============================================================================
# Medgnosis - QDM-derived QI-Core CQL smoke
# Starts/reuses a host-published HAPI clinical-reasoning sidecar, loads CMS122
# executable artifacts only, then feeds persisted phm_edw.qdm_event resources
# through the QDM -> QI-Core loader and evaluates the measure.
# =============================================================================
set -euo pipefail

ENGINE_CONTAINER="${ENGINE_CONTAINER:-medgnosis-cql-engine-smoke}"
ENGINE_PORT="${ENGINE_PORT:-18080}"
export CQL_ENGINE_URL="${CQL_ENGINE_URL:-http://localhost:${ENGINE_PORT}/fhir}"
export MEASURE_CODE="${MEASURE_CODE:-CMS122v12}"

REPO="cqframework/ecqm-content-qicore-2025"
MEASURE="${ENGINE_MEASURE_ID:-CMS122FHIRDiabetesAssessGreaterThan9Percent}"
CACHE="/tmp/${MEASURE}-bundle.json"
ARTIFACT_ONLY="/tmp/${MEASURE}-artifact-only.json"
export QDM_CQL_ARTIFACT_BUNDLE="${QDM_CQL_ARTIFACT_BUNDLE:-$ARTIFACT_ONLY}"

if curl -sf "$CQL_ENGINE_URL/metadata" -o /dev/null 2>/dev/null; then
  echo "[qdm-cql-smoke] engine already reachable at $CQL_ENGINE_URL"
else
  if [ -z "$(docker ps -q -f "name=^${ENGINE_CONTAINER}$")" ]; then
    docker rm -f "$ENGINE_CONTAINER" 2>/dev/null || true
    echo "[qdm-cql-smoke] starting ephemeral engine ($ENGINE_CONTAINER) on :$ENGINE_PORT ..."
    docker run -d --rm --name "$ENGINE_CONTAINER" \
      -p "${ENGINE_PORT}:8080" \
      -e hapi.fhir.cr.enabled=true \
      -e hapi.fhir.enforce_referential_integrity_on_write=false \
      -e hapi.fhir.allow_external_references=true \
      -e JAVA_OPTS="-Xmx1300m -Xms512m" \
      hapiproject/hapi:latest >/dev/null
  fi
  echo "[qdm-cql-smoke] waiting for $CQL_ENGINE_URL/metadata ..."
  curl --retry 60 --retry-delay 5 --retry-connrefused --retry-all-errors -sf "$CQL_ENGINE_URL/metadata" -o /dev/null
fi

if [ ! -f "$CACHE" ]; then
  echo "[qdm-cql-smoke] fetching ${MEASURE} bundle ..."
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
print("[qdm-cql-smoke] artifact-only bundle entries:", len(b["entry"]))
PY

echo "[qdm-cql-smoke] loading executable artifacts ..."
curl -sf -X POST "$CQL_ENGINE_URL" -H 'Content-Type: application/fhir+json' \
  --data-binary "@$ARTIFACT_ONLY" -o /dev/null

if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
  DATABASE_URL=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"' | sed 's/host.docker.internal/localhost/')
fi
if [ -z "${DATABASE_URL:-}" ]; then
  echo "[qdm-cql-smoke] ERROR: DATABASE_URL not set and repo-root .env has none" >&2
  exit 1
fi
export DATABASE_URL

echo "[qdm-cql-smoke] running QDM loader and measure evaluation ..."
node --import tsx/esm apps/api/src/scripts/qdm-cql-smoke.ts

echo "[qdm-cql-smoke] done. Stop the engine with: docker rm -f ${ENGINE_CONTAINER}"
