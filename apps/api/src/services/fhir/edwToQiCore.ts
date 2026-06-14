// =============================================================================
// Medgnosis API — EDW → QI-Core projection helpers
// negationToFhir(): the QI-Core negation pattern (status=not-done vs
// doNotPerform). conceptInValueSet(): VSAC membership using the EDW→VSAC
// code-system translation from vsacService (never joins unmapped systems).
// =============================================================================

import { sql } from '@medgnosis/db';
import { EDW_TO_VSAC_CODE_SYSTEM } from '../vsacService.js';

interface Coding {
  system: string;
  code: string;
  display?: string;
}

interface QiCoreNegation {
  status?: 'not-done';
  statusReason?: { coding: Coding[] };
  doNotPerform?: boolean;
  reasonCode?: Array<{ coding: Coding[] }>;
}

// Request-type resources express negation with doNotPerform; event-type
// resources express it with status=not-done + statusReason.
const DO_NOT_PERFORM_RESOURCES = new Set(['MedicationRequest', 'ServiceRequest']);

export function negationToFhir(resourceType: string, reason: Coding): QiCoreNegation {
  if (DO_NOT_PERFORM_RESOURCES.has(resourceType)) {
    return { doNotPerform: true, reasonCode: [{ coding: [reason] }] };
  }
  return { status: 'not-done', statusReason: { coding: [reason] } };
}

/**
 * Is an EDW (code_system, code) a member of a VSAC value set? Translates the
 * EDW code_system label (SNOMED/ICD-10/...) to the VSAC label first; unmapped
 * systems (ICD-9, OTHER) are never joined and return false by design.
 */
export async function conceptInValueSet(
  valueSetOid: string,
  edwCodeSystem: string,
  code: string,
): Promise<boolean> {
  const vsacLabel = EDW_TO_VSAC_CODE_SYSTEM[edwCodeSystem];
  if (!vsacLabel) return false; // unmapped by design — never join
  const rows = await sql<{ found: number }[]>`
    SELECT 1 AS found
    FROM phm_edw.vsac_value_set_code
    WHERE value_set_oid = ${valueSetOid}
      AND code = ${code}
      AND code_system = ${vsacLabel}
    LIMIT 1
  `;
  return rows.length > 0;
}
