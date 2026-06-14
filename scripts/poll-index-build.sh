#!/usr/bin/env bash
# =============================================================================
# Poll progress of the observation code index build (CREATE INDEX CONCURRENTLY).
# Usage:  bash scripts/poll-index-build.sh
# Run repeatedly; while the build runs it prints the live phase + % scanned, and
# once finished it reports the index's validity + size. Read-only; safe anytime.
# =============================================================================
set -euo pipefail
DB="${DB:-medgnosis}"
IDX="${IDX:-idx_observation_code_patient}"

echo "── $(date '+%H:%M:%S') — observation index build ──"

# In-flight progress (pg_stat_progress_create_index; empty once the build ends).
psql -U claude_dev -h localhost -d "$DB" -x -c "
SELECT phase,
       blocks_done || ' / ' || blocks_total AS blocks,
       CASE WHEN blocks_total>0 THEN round(100.0*blocks_done/blocks_total,1)||'%' ELSE '—' END AS pct_scanned,
       tuples_done AS tuples
FROM pg_stat_progress_create_index
WHERE relid = 'phm_edw.observation'::regclass;" 2>&1 | grep -vE '^\(0 rows\)|^$' || true

# Final state (present once the index object exists).
psql -U claude_dev -h localhost -d "$DB" -tAc "
SELECT 'RESULT: ' || c.relname
       || ' | valid=' || i.indisvalid
       || ' | ready=' || i.indisready
       || ' | size='  || pg_size_pretty(pg_relation_size(c.oid))
FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid
WHERE c.relname = '$IDX';" 2>&1 | grep -E 'RESULT' || echo "(index object not created yet — still scanning/building)"
