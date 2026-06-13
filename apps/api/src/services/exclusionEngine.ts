// =============================================================================
// Medgnosis API — Clinical exclusion engine
// Replaces hash-seeded gap_status='excluded' (migration 017's deterministic
// hash — mechanically valid, clinically meaningless) with exclusions computed
// from the measure's denominator_exclusion value sets (hospice, palliative,
// advanced illness, frailty — imported from VSAC).
// Conservative semantics: an exclusion needs clinical evidence; an excluded
// row WITHOUT evidence reverts to 'open' (surface, never hide, unverified gaps).
// care_gap and fact_patient_bundle_detail update in one transaction so the
// next measure refresh propagates consistently.
// =============================================================================

import { sql } from '@medgnosis/db';

export interface ExclusionRecomputeResult {
  newlyExcluded: number;
  revertedToOpen: number;
  durationMs: number;
}

// The correlated-subquery fragment used for BOTH the exclude and revert updates.
// Joins condition_diagnosis → condition → vsac_value_set_code → measure_value_set
// to test whether the patient has an active denominator_exclusion diagnosis for
// the specific measure.  cg is the outer table alias (phm_edw.care_gap).
const CLINICAL_EXCLUSION_EVIDENCE = `
  SELECT 1
  FROM phm_edw.condition_diagnosis cd
  JOIN phm_edw.condition c ON c.condition_id = cd.condition_id
  JOIN phm_edw.vsac_value_set_code vc
    ON vc.code = c.condition_code AND vc.code_system = 'SNOMEDCT'
  JOIN phm_edw.measure_value_set mv
    ON mv.value_set_oid = vc.value_set_oid
   AND mv.population_role = 'denominator_exclusion'
  WHERE cd.patient_id = cg.patient_id
    AND mv.measure_id = cg.measure_id
    AND cd.active_ind = 'Y'
    AND (cd.resolution_date IS NULL OR cd.resolution_date > CURRENT_DATE)
`;

export async function recomputeClinicalExclusions(): Promise<ExclusionRecomputeResult> {
  const t0 = performance.now();

  const { newlyExcluded, revertedToOpen } = await sql.begin(async (tx) => {
    // 1. Mark patients with active denominator_exclusion evidence as excluded.
    const excluded = await tx.unsafe(`
      UPDATE phm_edw.care_gap cg
      SET gap_status = 'excluded',
          comments = COALESCE(comments || ' | ', '') || 'excluded: clinical (VSAC denominator_exclusion)',
          updated_at = NOW()
      WHERE LOWER(cg.gap_status) <> 'excluded'
        AND EXISTS (${CLINICAL_EXCLUSION_EVIDENCE})
    `);

    // 2. Revert hash-seeded exclusions that have no clinical evidence.
    //    An unverified gap must be visible (open), never silently hidden.
    const reverted = await tx.unsafe(`
      UPDATE phm_edw.care_gap cg
      SET gap_status = 'open',
          comments = COALESCE(comments || ' | ', '') || 'reverted: hash-seeded exclusion without clinical evidence',
          updated_at = NOW()
      WHERE LOWER(cg.gap_status) = 'excluded'
        AND NOT EXISTS (${CLINICAL_EXCLUSION_EVIDENCE})
    `);

    // 3. Sync bundle_detail so the next measure refresh reads the corrected statuses.
    await tx.unsafe(`
      UPDATE phm_star.fact_patient_bundle_detail d
      SET gap_status = cg.gap_status
      FROM phm_edw.care_gap cg
      JOIN phm_star.dim_patient dp ON dp.patient_id = cg.patient_id AND dp.is_current
      JOIN phm_star.dim_measure dm ON dm.measure_id = cg.measure_id
      WHERE d.patient_key = dp.patient_key
        AND d.measure_key = dm.measure_key
        AND LOWER(d.gap_status) <> LOWER(cg.gap_status)
    `);

    return { newlyExcluded: excluded.count ?? 0, revertedToOpen: reverted.count ?? 0 };
  });

  const durationMs = Math.round(performance.now() - t0);
  console.info(
    `[exclusions] recomputed: +${newlyExcluded} clinical, ${revertedToOpen} hash-seeded reverted to open (${durationMs}ms)`,
  );
  return { newlyExcluded, revertedToOpen, durationMs };
}
