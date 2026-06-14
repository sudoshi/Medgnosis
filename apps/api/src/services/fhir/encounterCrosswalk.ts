// =============================================================================
// Medgnosis API — EDW encounter_type → qualifying FHIR visit crosswalk
// phm_edw.encounter.encounter_type is free-text/local (ambulatory, outpatient,
// urgentcare, wellness, home, emergency, ...). eCQMs like CMS122 require a
// qualifying visit coded in a CPT/SNOMED value set (e.g. Office Visit
// 2.16.840.1.113883.3.464.1003.101.12.1001). This crosswalk projects each local
// type onto a FHIR Encounter.class (v3-ActCode) and, where the setting is a
// qualifying primary-care visit, a representative value-set code so the CQL
// engine counts it. Non-qualifying settings (home/emergency/snf/hospice/virtual)
// get the correct class but NO qualifying type code — so CMS122 correctly does
// not count them as a denominator-qualifying visit.
// =============================================================================

const CPT = 'http://www.ama-assn.org/go/cpt';
const SNOMED = 'http://snomed.info/sct';

export interface EncounterTypeMapping {
  /** FHIR Encounter.class code (v3-ActCode). */
  classCode: string;
  /** Qualifying Encounter.type coding (a CMS122 visit value-set member), if any. */
  typeCoding?: { system: string; code: string; display: string };
}

// CPT 99213 = Office/outpatient visit, established patient — a member of the
// CMS122 "Office Visit" value set. SNOMED 185349003 "Encounter for check up" is
// the same value set's wellness-flavored member.
const OFFICE_VISIT = { system: CPT, code: '99213', display: 'Office or other outpatient visit, established patient' };
const CHECK_UP = { system: SNOMED, code: '185349003', display: 'Encounter for check up (procedure)' };

export const ENCOUNTER_TYPE_CROSSWALK: Record<string, EncounterTypeMapping> = {
  ambulatory: { classCode: 'AMB', typeCoding: OFFICE_VISIT },
  outpatient: { classCode: 'AMB', typeCoding: OFFICE_VISIT },
  urgentcare: { classCode: 'AMB', typeCoding: OFFICE_VISIT },
  wellness: { classCode: 'AMB', typeCoding: CHECK_UP },
  home: { classCode: 'HH' },
  emergency: { classCode: 'EMER' },
  virtual: { classCode: 'VR' },
  snf: { classCode: 'IMP' },
  hospice: { classCode: 'IMP' },
};

export function crosswalkEncounter(rawType: unknown): EncounterTypeMapping {
  const key = String(rawType ?? '').trim().toLowerCase();
  return ENCOUNTER_TYPE_CROSSWALK[key] ?? { classCode: 'AMB' };
}
