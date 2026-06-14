// =============================================================================
// Medgnosis API — QRDA Category I (patient-level) serializer
// HL7 CDA R2 patient-level quality report: one document per patient carrying the
// patient's measure population membership. US Realm Header + QRDA Cat I framework
// + QDM-based QRDA templates; a Measure Section (eMeasure reference + reporting
// period + per-population results) and a QDM Patient Data Section.
//
// This emits well-formed QRDA Cat I with the core templates. Full conformance
// (exact per-reporting-year templateId extensions, complete QDM data-element
// entries) is finalized against the Cypress Validation Utility (CVU+) in CI — the
// official ONC validator — which surfaces any remaining template gaps (Epic C3).
// =============================================================================

export interface QrdaCat1Patient {
  id: string;
  given?: string;
  family?: string;
  gender?: string;
  birthDate?: string;
}

export interface QrdaCat1MeasureResult {
  /** eCQM identifier or engine Measure id. */
  measureId: string;
  /** Measure UUID (externalDocument/id root). Optional; falls back to measureId. */
  measureUuid?: string;
  version?: string;
  populations: {
    initialPopulation?: number;
    denominator?: number;
    numerator?: number;
    denominatorExclusion?: number;
  };
}

export interface QrdaCat1Options {
  period: { start: string; end: string };
}

// Patient-level population type codes (HL7 measure population, codeSystem .5.4).
const POPULATION = { IPOP: 'IPOP', DENOM: 'DENOM', NUMER: 'NUMER', DENEX: 'DENEX' } as const;

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** ISO date → CDA YYYYMMDD (digits only of the date prefix). */
function ymd(date: string | undefined): string {
  if (!date) return '';
  return date.slice(0, 10).replace(/-/g, '');
}

function genderCode(gender: string | undefined): string {
  const g = (gender ?? '').toLowerCase();
  if (g === 'male' || g === 'm') return 'M';
  if (g === 'female' || g === 'f') return 'F';
  return 'UN';
}

/** Patient-level population observation (membership / count for one population). */
function populationObservation(code: string, value: number): string {
  return `
            <component>
              <observation classCode="OBS" moodCode="EVN">
                <templateId root="2.16.840.1.113883.10.20.24.3.98"/>
                <code code="ASSERTION" codeSystem="2.16.840.1.113883.5.4"/>
                <value xsi:type="CD" code="${esc(code)}" codeSystem="2.16.840.1.113883.5.4"/>
                <component>
                  <observation classCode="OBS" moodCode="EVN">
                    <code code="MSRAGG" codeSystem="2.16.840.1.113883.5.4" displayName="rate aggregation"/>
                    <value xsi:type="INT" value="${value}"/>
                  </observation>
                </component>
              </observation>
            </component>`;
}

function measureOrganizer(m: QrdaCat1MeasureResult): string {
  const uuid = m.measureUuid ?? m.measureId;
  const p = m.populations;
  return `
        <entry>
          <organizer classCode="CLUSTER" moodCode="EVN">
            <templateId root="2.16.840.1.113883.10.20.24.3.98"/>
            <id root="${esc(uuid)}"/>
            <statusCode code="completed"/>
            <reference typeCode="REFR">
              <externalDocument classCode="DOC" moodCode="EVN">
                <id root="${esc(uuid)}"/>
                <code code="57024-2" codeSystem="2.16.840.1.113883.6.1" displayName="Health Quality Measure Document"/>
                <text>${esc(m.measureId)}${m.version ? ' v' + esc(m.version) : ''}</text>
              </externalDocument>
            </reference>${populationObservation(POPULATION.IPOP, p.initialPopulation ?? 0)}${populationObservation(POPULATION.DENOM, p.denominator ?? 0)}${populationObservation(POPULATION.DENEX, p.denominatorExclusion ?? 0)}${populationObservation(POPULATION.NUMER, p.numerator ?? 0)}
          </organizer>
        </entry>`;
}

export function buildQrdaCat1(
  patient: QrdaCat1Patient,
  measureResults: QrdaCat1MeasureResult[],
  opts: QrdaCat1Options,
): string {
  const low = ymd(opts.period.start);
  const high = ymd(opts.period.end);
  const organizers = measureResults.map(measureOrganizer).join('');
  const given = esc(patient.given ?? '');
  const family = esc(patient.family ?? '');

  return `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <realmCode code="US"/>
  <typeId root="2.16.840.1.113883.1.3" extension="POCD_HD000040"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.1" extension="2015-08-01"/>
  <templateId root="2.16.840.1.113883.10.20.24.1.1" extension="2017-08-01"/>
  <templateId root="2.16.840.1.113883.10.20.24.1.2" extension="2017-08-01"/>
  <id root="2.16.840.1.113883.4.336" extension="${esc(patient.id)}"/>
  <code code="55182-0" codeSystem="2.16.840.1.113883.6.1" displayName="Quality Measure Report"/>
  <title>QRDA Category I — Patient ${esc(patient.id)}</title>
  <effectiveTime value="${high || low}"/>
  <confidentialityCode code="N" codeSystem="2.16.840.1.113883.5.25"/>
  <languageCode code="en"/>
  <recordTarget>
    <patientRole>
      <id root="2.16.840.1.113883.4.336" extension="${esc(patient.id)}"/>
      <patient>
        <name use="L">
          <given>${given}</given>
          <family>${family}</family>
        </name>
        <administrativeGenderCode code="${genderCode(patient.gender)}" codeSystem="2.16.840.1.113883.5.1"/>
        <birthTime value="${ymd(patient.birthDate)}"/>
      </patient>
    </patientRole>
  </recordTarget>
  <component>
    <structuredBody>
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.24.2.2"/>
          <code code="55186-1" codeSystem="2.16.840.1.113883.6.1" displayName="Measure Section"/>
          <title>Measure Section</title>
          <text>Patient-level results for ${measureResults.length} measure(s), reporting period ${low}–${high}.</text>
          <entry>
            <act classCode="ACT" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.24.3.98"/>
              <effectiveTime>
                <low value="${low}"/>
                <high value="${high}"/>
              </effectiveTime>
            </act>
          </entry>${organizers}
        </section>
      </component>
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.24.2.1"/>
          <code code="55188-7" codeSystem="2.16.840.1.113883.6.1" displayName="Patient Data"/>
          <title>Patient Data</title>
          <text>QDM patient-data elements for the reporting period.</text>
        </section>
      </component>
    </structuredBody>
  </component>
</ClinicalDocument>
`;
}
