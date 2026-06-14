#!/usr/bin/env bash
# =============================================================================
# Medgnosis — real CMS eCQM smoke (Phase 1 Task 3 / Task 6 test-deck proof)
# Fetches the official CMS122 QI-Core measure bundle (Measure + Libraries w/ ELM
# + ValueSets + MADiE test patients) from cqframework/ecqm-content-qicore-2025,
# loads it into the HAPI CR sidecar, evaluates a known test-deck patient, and
# asserts the computed populations match the published expected result.
#
# Proven 2026-06-13: subject ip=1/denom=1/num=1 (matches deck);
#                    population ip=52/denom=52/excl=19/num=32 (score 0.97).
#
# Prereq: a HAPI CR sidecar reachable at $CQL_ENGINE_URL, started with
# referential-integrity tolerance (CMS test bundles carry Practitioner/example):
#   docker compose --profile cql up -d cql-engine
# =============================================================================
set -euo pipefail

CQL_ENGINE_URL="${CQL_ENGINE_URL:-http://localhost:18080/fhir}"
REPO="cqframework/ecqm-content-qicore-2025"
MEASURE="CMS122FHIRDiabetesAssessGreaterThan9Percent"
DIR="bundles/measure/${MEASURE}"
PERIOD_START="2026-01-01"
PERIOD_END="2026-12-31"
SUBJECT="Patient/090ad2fc-274b-4fef-bc5a-2077dbdc28f5"   # MADiE test-deck case
CACHE="/tmp/${MEASURE}-bundle.json"

echo "[smoke] waiting for $CQL_ENGINE_URL/metadata ..."
curl --retry 48 --retry-delay 5 --retry-connrefused -sf "$CQL_ENGINE_URL/metadata" -o /dev/null

if [ ! -f "$CACHE" ]; then
  echo "[smoke] fetching CMS122 measure bundle ..."
  curl -fsSL "https://raw.githubusercontent.com/${REPO}/main/${DIR}/${MEASURE}-bundle.json" -o "$CACHE"
fi

echo "[smoke] loading measure bundle (Measure + Libraries + ValueSets + test data) ..."
curl -sf -X POST "$CQL_ENGINE_URL" -H 'Content-Type: application/fhir+json' \
  --data-binary "@$CACHE" -o /dev/null

echo "[smoke] evaluating $MEASURE for $SUBJECT ..."
REPORT="$(curl -sf "${CQL_ENGINE_URL}/Measure/${MEASURE}/\$evaluate-measure?periodStart=${PERIOD_START}&periodEnd=${PERIOD_END}&subject=${SUBJECT}&reportType=subject")"

echo "$REPORT" | python3 -c '
import sys, json
mr = json.load(sys.stdin)
assert mr.get("resourceType") == "MeasureReport", "expected MeasureReport: %s" % json.dumps(mr)[:300]
pops = {p["code"]["coding"][0]["code"]: p.get("count") for g in mr.get("group", []) for p in g.get("population", [])}
print("[smoke] computed:", pops)
expected = {"initial-population": 1, "denominator": 1, "denominator-exclusion": 0, "numerator": 1}
for k, v in expected.items():
    assert pops.get(k) == v, "population %s: expected %s, got %s" % (k, v, pops.get(k))
print("[smoke] OK -- real CMS122 eCQM matches the MADiE test deck")
'
