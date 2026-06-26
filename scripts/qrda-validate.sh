#!/usr/bin/env bash
# =============================================================================
# Medgnosis - QRDA local structural validation and Cypress CVU+ handoff
#
# Local checks prove deterministic QRDA Cat I/Cat III samples are generated and
# well-formed XML. Official Cypress CVU+ validation is opt-in because the CVU+
# runtime is not committed to this repository.
#
# Optional external hooks:
#   QRDA_CVU_CAT1_CMD='your-cvu-cat1-command "$QRDA_FILE"' ./scripts/qrda-validate.sh
#   QRDA_CVU_CAT3_CMD='your-cvu-cat3-command "$QRDA_FILE"' ./scripts/qrda-validate.sh
# =============================================================================
set -euo pipefail

OUT_DIR="${QRDA_FIXTURE_DIR:-apps/api/test-fixtures/quality}"
CAT1="${OUT_DIR}/qrda-cat1-sample.xml"
CAT3="${OUT_DIR}/qrda-cat3-sample.xml"

npx tsx apps/api/scripts/quality-reporting-samples.ts "$OUT_DIR" >/dev/null

python3 - "$CAT1" "$CAT3" <<'PY'
import sys
import xml.etree.ElementTree as ET

for path in sys.argv[1:]:
    tree = ET.parse(path)
    root = tree.getroot()
    if not root.tag.endswith("ClinicalDocument"):
        raise SystemExit(f"{path}: expected ClinicalDocument root, got {root.tag}")
    text = open(path, encoding="utf-8").read()
    for required in ("templateId", "Measure Section", "ClinicalDocument"):
        if required not in text:
            raise SystemExit(f"{path}: missing {required}")
    print(f"[qrda-validate] local XML OK: {path}")
PY

if [ -n "${QRDA_CVU_CAT1_CMD:-}" ]; then
  QRDA_FILE="$CAT1" bash -lc "$QRDA_CVU_CAT1_CMD"
else
  echo "[qrda-validate] QRDA_CVU_CAT1_CMD not set; skipped official Cat I CVU+ validation."
fi

if [ -n "${QRDA_CVU_CAT3_CMD:-}" ]; then
  QRDA_FILE="$CAT3" bash -lc "$QRDA_CVU_CAT3_CMD"
else
  echo "[qrda-validate] QRDA_CVU_CAT3_CMD not set; skipped official Cat III CVU+ validation."
fi
