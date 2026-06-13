// =============================================================================
// Unit tests — code_system_contract DQ detector
// Tests the EDW↔VSAC label-alignment detector added to runDqScan().
// Uses vi.hoisted mock pattern to intercept both sql tagged-template calls
// (upserts, overlap queries) and sql.unsafe calls (table scans).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock setup ────────────────────────────────────────────────────────────────
// sql is called as a tagged template (sql`...`) AND as sql.unsafe('raw SQL').
// upsertFinding always calls the tagged template; the code-system scan uses
// sql.unsafe for table-qualified FROM clauses.

const { mockSqlFn, mockUnsafe, mockJson } = vi.hoisted(() => {
  const mockUnsafe = vi.fn().mockResolvedValue([]);
  const mockJson = vi.fn((v: unknown) => v);
  const mockSqlFn = vi.fn().mockResolvedValue([]);
  return { mockSqlFn, mockUnsafe, mockJson };
});

vi.mock('@medgnosis/db', () => ({
  sql: Object.assign(mockSqlFn, { unsafe: mockUnsafe, json: mockJson }),
}));

// EDW_TO_VSAC_CODE_SYSTEM is imported from vsacService — no mock needed because
// vsacService only re-exports a plain object (no DB calls at module level).
import { runDqScan } from '../dqDetectors.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Reset all mocks and set default returns to empty arrays. */
function resetMocks(): void {
  vi.clearAllMocks();
  mockSqlFn.mockResolvedValue([]);
  mockUnsafe.mockResolvedValue([]);
}

// runDqScan makes these sql (tagged template) calls in order:
//   1. vital_sign impossible-values scan
//   2. vital_sign weight-jump window scan
//   3. provider edge-whitespace scan
//   4. code_system GROUP BY for 'condition'     ← our detector starts here
//   5. upsert(s) for condition findings (if any)
//   6. overlap query (if n>100 and vsacLabel not null) for condition
//   7. upsert(s) for condition overlap findings (if any)
//   8. code_system GROUP BY for 'procedure'
//   9. upsert(s) / overlap for procedure (if any)
//  10. mislabel count query
//  11. upsert for mislabel finding (if any)
//
// sql.unsafe is called:
//   a. once per table for the GROUP BY FROM clause: phm_edw.<tbl>
//   b. once per sample-join FROM clause: phm_edw.<tbl> (inside overlap query)
//   c. once per sample-join SELECT col alias: condition_code / procedure_code

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('code_system_contract detector — no findings on clean data', () => {
  it('returns zero code_system_contract hits when both tables have only SNOMED with good overlap', async () => {
    resetMocks();

    // Calls 1-3: existing detectors — empty (no vitals/provider anomalies)
    mockSqlFn
      .mockResolvedValueOnce([]) // vital_sign impossible-values
      .mockResolvedValueOnce([]) // vital_sign weight-jumps
      .mockResolvedValueOnce([]) // provider edge-whitespace
      // Call 4: condition GROUP BY — one system: SNOMED, 324 rows
      .mockResolvedValueOnce([{ code_system: 'SNOMED', row_count: 324 }])
      // Call 5: upsert for condition — NOT called (no warning fired yet)
      // Call 6: overlap query for condition SNOMED → SNOMEDCT — good overlap
      .mockResolvedValueOnce([{ overlap_count: 45 }])
      // No upsert call (overlap > 0)
      // Call 7: procedure GROUP BY — one system: SNOMED, 415 rows
      .mockResolvedValueOnce([{ code_system: 'SNOMED', row_count: 415 }])
      // Call 8: overlap query for procedure SNOMED → SNOMEDCT — good overlap
      .mockResolvedValueOnce([{ overlap_count: 38 }])
      // Call 9: mislabel count — zero numeric-code rows with ICD-10 label
      .mockResolvedValueOnce([{ mislabel_count: 0 }]);

    const result = await runDqScan();
    expect(result.byDetector['code_system_contract']).toBeUndefined();
  });
});

describe('code_system_contract detector — unmapped label warning', () => {
  it('fires a warning when condition has a code_system value not in EDW_TO_VSAC_CODE_SYSTEM', async () => {
    resetMocks();

    // upsertFinding returns a row (new finding inserted)
    const upsertReturn = [{ finding_id: 999 }];

    mockSqlFn
      .mockResolvedValueOnce([]) // vitals
      .mockResolvedValueOnce([]) // weight jumps
      .mockResolvedValueOnce([]) // providers
      // condition GROUP BY: one unknown system
      .mockResolvedValueOnce([{ code_system: 'CPT', row_count: 50 }])
      // upsert for unmapped_label warning
      .mockResolvedValueOnce(upsertReturn)
      // procedure GROUP BY: normal SNOMED
      .mockResolvedValueOnce([{ code_system: 'SNOMED', row_count: 415 }])
      // overlap for procedure SNOMED — fine
      .mockResolvedValueOnce([{ overlap_count: 30 }])
      // mislabel count
      .mockResolvedValueOnce([{ mislabel_count: 0 }]);

    const result = await runDqScan();
    expect(result.byDetector['code_system_contract']).toBe(1);
  });
});

describe('code_system_contract detector — null-mapped system warning', () => {
  it('fires a warning when condition has OTHER (null-mapped) rows', async () => {
    resetMocks();

    const upsertReturn = [{ finding_id: 1001 }];

    mockSqlFn
      .mockResolvedValueOnce([]) // vitals
      .mockResolvedValueOnce([]) // weight jumps
      .mockResolvedValueOnce([]) // providers
      // condition GROUP BY: OTHER (null-mapped in EDW_TO_VSAC_CODE_SYSTEM)
      .mockResolvedValueOnce([{ code_system: 'OTHER', row_count: 12 }])
      // upsert for null_mapped_system_has_rows warning
      .mockResolvedValueOnce(upsertReturn)
      // procedure GROUP BY: SNOMED fine
      .mockResolvedValueOnce([{ code_system: 'SNOMED', row_count: 415 }])
      // overlap for procedure
      .mockResolvedValueOnce([{ overlap_count: 20 }])
      // mislabel count
      .mockResolvedValueOnce([{ mislabel_count: 0 }]);

    const result = await runDqScan();
    expect(result.byDetector['code_system_contract']).toBe(1);
  });

  it('does NOT fire when OTHER has zero rows (nothing to reconcile)', async () => {
    resetMocks();

    mockSqlFn
      .mockResolvedValueOnce([]) // vitals
      .mockResolvedValueOnce([]) // weight jumps
      .mockResolvedValueOnce([]) // providers
      // condition GROUP BY: OTHER with 0 rows
      .mockResolvedValueOnce([{ code_system: 'OTHER', row_count: 0 }])
      // No upsert expected
      // procedure GROUP BY: SNOMED fine
      .mockResolvedValueOnce([{ code_system: 'SNOMED', row_count: 415 }])
      // overlap
      .mockResolvedValueOnce([{ overlap_count: 20 }])
      // mislabel
      .mockResolvedValueOnce([{ mislabel_count: 0 }]);

    const result = await runDqScan();
    expect(result.byDetector['code_system_contract']).toBeUndefined();
  });
});

describe('code_system_contract detector — mapped-but-zero-overlap warning', () => {
  it('fires when a mapped system (SNOMED→SNOMEDCT) has >100 rows but zero overlap', async () => {
    resetMocks();

    const upsertReturn = [{ finding_id: 1002 }];

    mockSqlFn
      .mockResolvedValueOnce([]) // vitals
      .mockResolvedValueOnce([]) // weight jumps
      .mockResolvedValueOnce([]) // providers
      // condition GROUP BY: SNOMED, >100 rows
      .mockResolvedValueOnce([{ code_system: 'SNOMED', row_count: 324 }])
      // overlap query → zero overlap
      .mockResolvedValueOnce([{ overlap_count: 0 }])
      // upsert for mapped_zero_overlap warning
      .mockResolvedValueOnce(upsertReturn)
      // procedure GROUP BY: SNOMED, >100 rows
      .mockResolvedValueOnce([{ code_system: 'SNOMED', row_count: 415 }])
      // overlap for procedure → also zero
      .mockResolvedValueOnce([{ overlap_count: 0 }])
      // upsert for procedure mapped_zero_overlap
      .mockResolvedValueOnce(upsertReturn)
      // mislabel count
      .mockResolvedValueOnce([{ mislabel_count: 0 }]);

    const result = await runDqScan();
    expect(result.byDetector['code_system_contract']).toBe(2);
  });

  it('skips the overlap check when row count is ≤100 (below threshold)', async () => {
    resetMocks();

    mockSqlFn
      .mockResolvedValueOnce([]) // vitals
      .mockResolvedValueOnce([]) // weight jumps
      .mockResolvedValueOnce([]) // providers
      // condition GROUP BY: SNOMED but only 80 rows — below >100 threshold
      .mockResolvedValueOnce([{ code_system: 'SNOMED', row_count: 80 }])
      // NO overlap query should fire
      // procedure GROUP BY: SNOMED also ≤100
      .mockResolvedValueOnce([{ code_system: 'SNOMED', row_count: 80 }])
      // NO overlap query
      // mislabel count
      .mockResolvedValueOnce([{ mislabel_count: 0 }]);

    const result = await runDqScan();
    // No warnings — and no unexpected extra mock calls
    expect(result.byDetector['code_system_contract']).toBeUndefined();
    // overlap query mock (call 6+) should NOT have been called
    // The 6th call is the mislabel query; overlap fn would have been calls 5 and 7
    // Total tagged-template calls: 3 (existing) + 2 (GROUP BYs) + 1 (mislabel) = 6
    expect(mockSqlFn).toHaveBeenCalledTimes(6);
  });
});

describe('code_system_contract detector — ICD-10 default mislabel (info)', () => {
  it('fires an informational finding when condition has numeric codes labeled ICD-10', async () => {
    resetMocks();

    const upsertReturn = [{ finding_id: 1003 }];

    mockSqlFn
      .mockResolvedValueOnce([]) // vitals
      .mockResolvedValueOnce([]) // weight jumps
      .mockResolvedValueOnce([]) // providers
      // condition GROUP BY: SNOMED only (no ICD-10 system rows)
      .mockResolvedValueOnce([{ code_system: 'SNOMED', row_count: 324 }])
      // overlap for condition
      .mockResolvedValueOnce([{ overlap_count: 20 }])
      // procedure GROUP BY: SNOMED
      .mockResolvedValueOnce([{ code_system: 'SNOMED', row_count: 415 }])
      // overlap for procedure
      .mockResolvedValueOnce([{ overlap_count: 15 }])
      // mislabel count: 5 numeric-coded rows labeled ICD-10
      .mockResolvedValueOnce([{ mislabel_count: 5 }])
      // upsert for mislabel info finding
      .mockResolvedValueOnce(upsertReturn);

    const result = await runDqScan();
    expect(result.byDetector['code_system_contract']).toBe(1);
  });

  it('does NOT fire when mislabel count is zero', async () => {
    resetMocks();

    mockSqlFn
      .mockResolvedValueOnce([]) // vitals
      .mockResolvedValueOnce([]) // weight jumps
      .mockResolvedValueOnce([]) // providers
      .mockResolvedValueOnce([{ code_system: 'SNOMED', row_count: 324 }]) // condition
      .mockResolvedValueOnce([{ overlap_count: 20 }])
      .mockResolvedValueOnce([{ code_system: 'SNOMED', row_count: 415 }]) // procedure
      .mockResolvedValueOnce([{ overlap_count: 15 }])
      .mockResolvedValueOnce([{ mislabel_count: 0 }]); // mislabel

    const result = await runDqScan();
    expect(result.byDetector['code_system_contract']).toBeUndefined();
  });
});

describe('code_system_contract detector — upsert dedup (DO NOTHING path)', () => {
  it('does not bump the counter when upsert returns empty (finding already exists)', async () => {
    resetMocks();

    mockSqlFn
      .mockResolvedValueOnce([]) // vitals
      .mockResolvedValueOnce([]) // weight jumps
      .mockResolvedValueOnce([]) // providers
      // condition: unknown system
      .mockResolvedValueOnce([{ code_system: 'CPT', row_count: 50 }])
      // upsert → empty (DO NOTHING, finding already exists in dq_finding)
      .mockResolvedValueOnce([])
      // procedure: SNOMED fine
      .mockResolvedValueOnce([{ code_system: 'SNOMED', row_count: 415 }])
      .mockResolvedValueOnce([{ overlap_count: 20 }])
      .mockResolvedValueOnce([{ mislabel_count: 0 }]);

    const result = await runDqScan();
    // Upsert returned [] → finding already existed → counter NOT bumped
    expect(result.byDetector['code_system_contract']).toBeUndefined();
  });
});
