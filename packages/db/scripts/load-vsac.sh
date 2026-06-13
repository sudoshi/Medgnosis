#!/usr/bin/env bash
# =============================================================================
# load-vsac.sh — one-shot transfer of VSAC reference data
#   parthenon app.vsac_* (plural)  ->  medgnosis phm_edw.vsac_* (singular)
# then seeds the measure_value_set bridge by base-CMS-number match.
#
# Both DBs live on the same host PG17 instance; auth via ~/.pgpass.
# Refuses to touch non-empty destination tables unless --reload is given.
# =============================================================================
set -euo pipefail

SRC_HOST="${VSAC_SRC_HOST:-127.0.0.1}"
SRC_DB="${VSAC_SRC_DB:-parthenon}"
DST_HOST="${VSAC_DST_HOST:-127.0.0.1}"
DST_DB="${VSAC_DST_DB:-medgnosis}"
PGUSER="${PGUSER:-claude_dev}"

SRC=(psql -h "$SRC_HOST" -U "$PGUSER" -d "$SRC_DB" -v ON_ERROR_STOP=1 -qAt)
DST=(psql -h "$DST_HOST" -U "$PGUSER" -d "$DST_DB" -v ON_ERROR_STOP=1 -qAt)

existing=$("${DST[@]}" -c "SELECT count(*) FROM phm_edw.vsac_value_set;")
if [[ "$existing" != "0" ]]; then
  if [[ "${1:-}" == "--reload" ]]; then
    echo "Reloading: truncating phm_edw VSAC tables (bridge included)..."
    "${DST[@]}" -c "TRUNCATE phm_edw.measure_value_set, phm_edw.vsac_measure_value_set,
                    phm_edw.vsac_measure, phm_edw.vsac_value_set_code, phm_edw.vsac_value_set;"
  else
    echo "ERROR: phm_edw.vsac_value_set already has $existing rows. Re-run with --reload to replace." >&2
    exit 1
  fi
fi

copy_table() {  # $1 src table  $2 dst table  $3 column list
  echo "Copying $1 -> $2 ..."
  "${SRC[@]}" -c "\\copy (SELECT $3 FROM $1) TO STDOUT" \
    | "${DST[@]}" -c "\\copy $2 ($3) FROM STDIN"
}

copy_table app.vsac_value_sets phm_edw.vsac_value_set \
  "value_set_oid, name, definition_version, expansion_version, expansion_id, qdm_category, purpose_clinical_focus, purpose_data_scope, purpose_inclusion, purpose_exclusion, source_files, ingested_at"

copy_table app.vsac_value_set_codes phm_edw.vsac_value_set_code \
  "value_set_oid, code, description, code_system, code_system_oid, code_system_version"

copy_table app.vsac_measures phm_edw.vsac_measure \
  "cms_id, cbe_number, program_candidate, title, expansion_version, ingested_at"

copy_table app.vsac_measure_value_sets phm_edw.vsac_measure_value_set \
  "cms_id, value_set_oid"

echo "Seeding measure_value_set bridge (base CMS number match)..."
"${DST[@]}" <<'SQL'
INSERT INTO phm_edw.measure_value_set (measure_id, value_set_oid, vsac_cms_id, mapping_method)
SELECT md.measure_id, mvs.value_set_oid, vm.cms_id, 'cms_base_auto'
FROM phm_edw.measure_definition md
JOIN phm_edw.vsac_measure vm
  ON regexp_replace(md.measure_code, 'v[0-9]+$', '')
   = regexp_replace(vm.cms_id,       'v[0-9]+$', '')
JOIN phm_edw.vsac_measure_value_set mvs ON mvs.cms_id = vm.cms_id
WHERE md.measure_code ~ '^CMS' AND md.active_ind = 'Y'
ON CONFLICT (measure_id, value_set_oid) DO NOTHING;
SQL

echo "--- Verification (asserted: source and destination must match exactly) ---"
verify_count() {  # $1 src table  $2 dst table
  local src_n dst_n
  src_n=$("${SRC[@]}" -c "SELECT count(*) FROM $1;")
  dst_n=$("${DST[@]}" -c "SELECT count(*) FROM $2;")
  if [[ "$src_n" != "$dst_n" ]]; then
    echo "FAIL: $2 has $dst_n rows, source $1 has $src_n" >&2
    exit 1
  fi
  echo "OK: $2 = $dst_n rows (matches source)"
}

verify_count app.vsac_value_sets        phm_edw.vsac_value_set
verify_count app.vsac_value_set_codes   phm_edw.vsac_value_set_code
verify_count app.vsac_measures          phm_edw.vsac_measure
verify_count app.vsac_measure_value_sets phm_edw.vsac_measure_value_set

bridged=$("${DST[@]}" -c "SELECT count(DISTINCT measure_id) FROM phm_edw.measure_value_set;")
if [[ "$bridged" -lt 1 ]]; then
  echo "FAIL: bridge seeded 0 measures" >&2
  exit 1
fi
echo "OK: bridge covers $bridged measures"
"${DST[@]}" <<'SQL'
SELECT 'unbridged CMS measures: ' || coalesce(string_agg(measure_code, ', '), '(none)')
FROM phm_edw.measure_definition md
WHERE md.measure_code ~ '^CMS' AND md.active_ind = 'Y'
  AND NOT EXISTS (SELECT 1 FROM phm_edw.measure_value_set b WHERE b.measure_id = md.measure_id);
SQL
echo "Done."
