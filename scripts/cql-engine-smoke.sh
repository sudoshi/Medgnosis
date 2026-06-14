#!/usr/bin/env bash
# =============================================================================
# Medgnosis — CQL clinical-reasoning sidecar smoke (Phase 1 Task 1 spike)
# Loads docker/cql-engine/spike-bundle.json into a running HAPI CR engine and
# asserts Measure/$evaluate-measure returns a valid MeasureReport. Reproduces
# the spike that proved the engine works end-to-end.
#
# Prereq: a HAPI CR sidecar running and reachable at $CQL_ENGINE_URL, e.g.:
#   docker run -d --name medgnosis-cql-engine -m 1800m \
#     -e hapi.fhir.cr.enabled=true -e JAVA_OPTS="-Xmx1300m -Xms512m" \
#     -p 18080:8080 hapiproject/hapi:latest
# =============================================================================
set -euo pipefail

CQL_ENGINE_URL="${CQL_ENGINE_URL:-http://localhost:18080/fhir}"
BUNDLE="$(dirname "$0")/../docker/cql-engine/spike-bundle.json"

echo "[smoke] waiting for $CQL_ENGINE_URL/metadata ..."
curl --retry 48 --retry-delay 5 --retry-connrefused -sf "$CQL_ENGINE_URL/metadata" -o /dev/null

echo "[smoke] loading spike measure bundle ..."
curl -sf -X POST "$CQL_ENGINE_URL" -H 'Content-Type: application/fhir+json' \
  --data-binary "@$BUNDLE" -o /dev/null

echo "[smoke] running Measure/SpikeMeasure/\$evaluate-measure ..."
REPORT="$(curl -sf "$CQL_ENGINE_URL/Measure/SpikeMeasure/\$evaluate-measure?periodStart=2024-01-01&periodEnd=2024-12-31&reportType=population")"

echo "$REPORT" | python3 -c '
import sys, json
mr = json.load(sys.stdin)
rt = mr.get("resourceType")
assert rt == "MeasureReport", "expected MeasureReport, got %s: %s" % (rt, json.dumps(mr)[:400])
pops = {p["code"]["coding"][0]["code"]: p.get("count") for g in mr.get("group", []) for p in g.get("population", [])}
print("[smoke] populations:", pops)
assert pops.get("initial-population", 0) >= 1, "initial-population should be >= 1"
assert pops.get("numerator", 0) >= 1, "numerator should be >= 1"
print("[smoke] OK -- valid MeasureReport from evaluate-measure")
'
