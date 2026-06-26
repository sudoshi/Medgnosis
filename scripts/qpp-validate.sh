#!/usr/bin/env bash
# =============================================================================
# Medgnosis - QPP JSON local structural validation and sandbox handoff
#
# Local checks prove deterministic QPP JSON is generated and has the expected
# performance-data shape. Official QPP sandbox/API validation is opt-in because
# credentials and API access are external.
#
# Optional external hook:
#   QPP_VALIDATE_CMD='your-qpp-command "$QPP_FILE"' ./scripts/qpp-validate.sh
# =============================================================================
set -euo pipefail

OUT_DIR="${QPP_FIXTURE_DIR:-apps/api/test-fixtures/quality}"
QPP_FILE="${OUT_DIR}/qpp-submission-sample.json"

npx tsx apps/api/scripts/quality-reporting-samples.ts "$OUT_DIR" >/dev/null

python3 - "$QPP_FILE" <<'PY'
import json
import sys

path = sys.argv[1]
doc = json.load(open(path, encoding="utf-8"))
if not isinstance(doc.get("performanceYear"), int):
    raise SystemExit("performanceYear must be an integer")
sets = doc.get("measurementSets")
if not isinstance(sets, list) or not sets:
    raise SystemExit("measurementSets must be a non-empty array")
for idx, measurement_set in enumerate(sets):
    if measurement_set.get("category") != "quality":
        raise SystemExit(f"measurementSets[{idx}].category must be quality")
    if measurement_set.get("submissionMethod") != "electronicHealthRecord":
        raise SystemExit(f"measurementSets[{idx}].submissionMethod must be electronicHealthRecord")
    measurements = measurement_set.get("measurements")
    if not isinstance(measurements, list) or not measurements:
        raise SystemExit(f"measurementSets[{idx}].measurements must be non-empty")
    for m_idx, measurement in enumerate(measurements):
        if not isinstance(measurement.get("measureId"), str) or not measurement["measureId"]:
            raise SystemExit(f"measurement {m_idx}: measureId must be a string")
        value = measurement.get("value")
        if not isinstance(value, dict):
            raise SystemExit(f"measurement {m_idx}: value must be an object")
        if value.get("isEndToEndReported") is not True:
            raise SystemExit(f"measurement {m_idx}: isEndToEndReported must be true")
        for key in (
            "performanceMet",
            "eligiblePopulation",
            "eligiblePopulationExclusion",
            "eligiblePopulationException",
            "performanceNotMet",
        ):
            if not isinstance(value.get(key), int) or value[key] < 0:
                raise SystemExit(f"measurement {m_idx}: {key} must be a non-negative integer")
print(f"[qpp-validate] local JSON OK: {path}")
PY

if [ -n "${QPP_VALIDATE_CMD:-}" ]; then
  QPP_FILE="$QPP_FILE" bash -lc "$QPP_VALIDATE_CMD"
else
  echo "[qpp-validate] QPP_VALIDATE_CMD not set; skipped official QPP sandbox/API validation."
fi
