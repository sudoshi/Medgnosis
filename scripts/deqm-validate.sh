#!/usr/bin/env bash
# =============================================================================
# Medgnosis — DEQM conformance check (Phase 2 Epic C3)
# Validates the golden DEQM Gaps-in-Care document Bundle (a Composition +
# per-measure individual MeasureReport + CAREGAP DetectedIssue carrying the
# gap status) against Da Vinci DEQM 5.0.0. Errors fail the run.
#
# Regenerate the fixture after changing the builder:
#   ( cd apps/api && npx tsx scripts/deqm-sample.ts \
#       test-fixtures/fhir/deqm/gaps-in-care-sample.json )
# =============================================================================
set -euo pipefail

VALIDATOR="${VALIDATOR_JAR:-validator_cli.jar}"
FIXTURE="apps/api/test-fixtures/fhir/deqm/gaps-in-care-sample.json"

if [ ! -f "$VALIDATOR" ]; then
  echo "validator_cli.jar not found (set VALIDATOR_JAR or place it in CWD)." >&2
  exit 1
fi

java -jar "$VALIDATOR" \
  "$FIXTURE" \
  -version 4.0.1 \
  -ig hl7.fhir.us.davinci-deqm#5.0.0 \
  -level error
