// =============================================================================
// Patient identity matching primitives (pure — no DB, no side effects)
//
// These functions normalize a FHIR Patient into the inputs the deterministic
// matcher uses: system-scoped identifiers (strong) and a demographic floor key
// (name + DOB + sex), following the HL7 Identity Matching IG minimum data set.
// =============================================================================

import type { FhirResource } from '../types.js';

export interface NormalizedIdentifier {
  /** Assigning-authority system URI. Empty string when the source omitted it. */
  system: string;
  value: string;
  /** v2-0203 identifier type code (e.g. 'MR', 'SS') when present. */
  typeCode: string | null;
  /**
   * Usable for cross-source matching: requires both a system and a value.
   * Bare values (no assigning authority) cannot be safely compared across
   * source systems and are flagged weak.
   */
  strong: boolean;
}

export interface NormalizedDemographics {
  firstName: string;
  lastName: string;
  dateOfBirth: string; // YYYY-MM-DD
  sex: string | null;
}

const KEY_SEPARATOR = '';

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> =>
    typeof item === 'object' && item !== null) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function identifierTypeCode(identifier: Record<string, unknown>): string | null {
  const type = identifier['type'];
  if (typeof type !== 'object' || type === null) return null;
  const coding = recordArray((type as Record<string, unknown>)['coding']);
  for (const item of coding) {
    const code = cleanString(item['code']);
    if (code) return code;
  }
  return null;
}

export function extractPatientIdentifiers(patient: FhirResource): NormalizedIdentifier[] {
  const identifiers = recordArray(patient['identifier']);
  const result: NormalizedIdentifier[] = [];
  for (const identifier of identifiers) {
    const value = cleanString(identifier['value']);
    if (!value) continue;
    const system = cleanString(identifier['system']) ?? '';
    result.push({
      system,
      value,
      typeCode: identifierTypeCode(identifier),
      strong: system.length > 0 && value.length > 0,
    });
  }
  return result;
}

function preferredHumanName(value: unknown): Record<string, unknown> | null {
  const names = recordArray(value);
  const usable = (name: Record<string, unknown>): boolean =>
    cleanString(name['family']) !== null && cleanString(stringArray(name['given'])[0]) !== null;
  return (
    names.find((name) => cleanString(name['use']) === 'official' && usable(name))
    ?? names.find((name) => cleanString(name['use']) === 'usual' && usable(name))
    ?? names.find(usable)
    ?? null
  );
}

export function normalizeDemographics(patient: FhirResource): NormalizedDemographics {
  const birthDate = cleanString(patient['birthDate']);
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    throw new Error('FHIR Patient.birthDate (YYYY-MM-DD) is required for identity resolution');
  }
  const name = preferredHumanName(patient['name']);
  const firstName = cleanString(stringArray(name?.['given'])[0]);
  const lastName = cleanString(name?.['family']);
  if (!firstName || !lastName) {
    throw new Error('FHIR Patient.name must include given and family values for identity resolution');
  }
  return {
    firstName,
    lastName,
    dateOfBirth: birthDate,
    sex: cleanString(patient['gender']),
  };
}

export function demographicMatchKey(demographics: NormalizedDemographics): string {
  return [
    demographics.lastName.trim().toLowerCase(),
    demographics.firstName.trim().toLowerCase(),
    demographics.dateOfBirth.trim().toLowerCase(),
    (demographics.sex ?? '').trim().toLowerCase(),
  ].join(KEY_SEPARATOR);
}
