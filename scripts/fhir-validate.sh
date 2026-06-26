#!/usr/bin/env bash
# =============================================================================
# Medgnosis — FHIR conformance check
# Validates the golden fixture resources against US Core 7.0.0 (QI-Core 7.0.2
# IG loaded so QI-Core-derived constraints are exercised). Errors fail the run.
# Defaults to offline terminology to keep CI deterministic; set
# FHIR_VALIDATOR_TX and FHIR_VALIDATOR_TX_CACHE for deliberate live terminology.
# =============================================================================
set -euo pipefail

VALIDATOR="${VALIDATOR_JAR:-validator_cli.jar}"
FIXTURES_DIR="apps/api/test-fixtures/fhir"
TX_SERVER="${FHIR_VALIDATOR_TX:-n/a}"
TX_CACHE="${FHIR_VALIDATOR_TX_CACHE:-n/a}"

if [ ! -f "$VALIDATOR" ]; then
  echo "validator_cli.jar not found (set VALIDATOR_JAR or place it in CWD)." >&2
  exit 1
fi

java -jar "$VALIDATOR" \
  "$FIXTURES_DIR"/*.json \
  -version 4.0.1 \
  -ig hl7.fhir.us.core#7.0.0 \
  -ig hl7.fhir.us.qicore#7.0.2 \
  -level error \
  -tx="$TX_SERVER" \
  -txCache="$TX_CACHE"
