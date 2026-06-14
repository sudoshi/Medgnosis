// =============================================================================
// Medgnosis API — QRDA Category III serializer
// Aggregate (summary) quality report for CMS electronic submission. HL7 CDA R2
// with the QRDA Cat III templates; one Measure Reference & Results organizer per
// measure carrying Aggregate Count observations for each population.
//
// This emits well-formed QRDA Cat III with the core templates and counts. Full
// conformance (exact per-reporting-year templateId extensions, required header
// participants) is finalized against the Cypress Validation Utility (CVU+) in CI
// — the official ONC validator — which surfaces any remaining template gaps.
// =============================================================================

export interface MeasurePopulationCounts {
  /** eCQM identifier, e.g. "CMS122v13" or the measure UUID. */
  eCqmId: string;
  /** Measure UUID (externalDocument/id root). Optional; falls back to eCqmId. */
  measureUuid?: string;
  version?: string;
  initialPopulation: number;
  denominator: number;
  numerator: number;
  denominatorExclusion: number;
}

export interface QrdaCat3Input {
  reportingYear: number;
  measures: MeasurePopulationCounts[];
  /** eCQI QRDA Cat III IG version templateId extension (per reporting year). */
  igVersionExtension?: string;
  organizationName?: string;
}

// QRDA Cat III population type codes (HL7 ActCode / measure population).
const POPULATION = {
  IPOP: 'IPOP', // Initial Population
  DENOM: 'DENOM',
  NUMER: 'NUMER',
  DENEX: 'DENEX', // Denominator Exclusion
} as const;

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Measure Data observation (templateId .3.5) carrying an Aggregate Count (.3.3). */
function measureDataObservation(populationCode: string, count: number): string {
  return `
        <component>
          <observation classCode="OBS" moodCode="EVN">
            <templateId root="2.16.840.1.113883.10.20.27.3.5" extension="2016-09-01"/>
            <code code="ASSERTION" codeSystem="2.16.840.1.113883.5.4"/>
            <value xsi:type="CD" code="${esc(populationCode)}" codeSystem="2.16.840.1.113883.5.4"/>
            <component>
              <observation classCode="OBS" moodCode="EVN">
                <templateId root="2.16.840.1.113883.10.20.27.3.3" extension="2016-09-01"/>
                <code code="MSRAGG" codeSystem="2.16.840.1.113883.5.4" displayName="rate aggregation"/>
                <value xsi:type="INT" value="${count}"/>
                <methodCode code="COUNT" codeSystem="2.16.840.1.113883.5.84"/>
              </observation>
            </component>
          </observation>
        </component>`;
}

function measureOrganizer(m: MeasurePopulationCounts): string {
  const uuid = m.measureUuid ?? m.eCqmId;
  return `
      <entry>
        <organizer classCode="CLUSTER" moodCode="EVN">
          <templateId root="2.16.840.1.113883.10.20.27.3.1" extension="2016-09-01"/>
          <id root="${esc(uuid)}"/>
          <statusCode code="completed"/>
          <reference typeCode="REFR">
            <externalDocument classCode="DOC" moodCode="EVN">
              <id root="${esc(uuid)}"/>
              <code code="57024-2" codeSystem="2.16.840.1.113883.6.1" displayName="Health Quality Measure Document"/>
              <text>${esc(m.eCqmId)}${m.version ? ' v' + esc(m.version) : ''}</text>
            </externalDocument>
          </reference>${measureDataObservation(POPULATION.IPOP, m.initialPopulation)}${measureDataObservation(POPULATION.DENOM, m.denominator)}${measureDataObservation(POPULATION.DENEX, m.denominatorExclusion)}${measureDataObservation(POPULATION.NUMER, m.numerator)}
        </organizer>
      </entry>`;
}

export function buildQrdaCat3(input: QrdaCat3Input): string {
  const ext = input.igVersionExtension ?? `${input.reportingYear}-02-01`;
  const periodStart = `${input.reportingYear}0101`;
  const periodEnd = `${input.reportingYear}1231`;
  const org = esc(input.organizationName ?? 'Medgnosis');
  const organizers = input.measures.map(measureOrganizer).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <realmCode code="US"/>
  <typeId root="2.16.840.1.113883.1.3" extension="POCD_HD000040"/>
  <templateId root="2.16.840.1.113883.10.20.27.1.1" extension="${ext}"/>
  <templateId root="2.16.840.1.113883.10.20.27.1.2" extension="${ext}"/>
  <code code="55184-6" codeSystem="2.16.840.1.113883.6.1" displayName="Quality Measure Report"/>
  <title>QRDA Category III Report — ${org} — CY${input.reportingYear}</title>
  <effectiveTime value="${periodEnd}"/>
  <confidentialityCode code="N" codeSystem="2.16.840.1.113883.5.25"/>
  <languageCode code="en"/>
  <custodian>
    <assignedCustodian>
      <representedCustodianOrganization>
        <id root="2.16.840.1.113883.4.336"/>
        <name>${org}</name>
      </representedCustodianOrganization>
    </assignedCustodian>
  </custodian>
  <component>
    <structuredBody>
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.27.2.1" extension="${ext}"/>
          <templateId root="2.16.840.1.113883.10.20.27.2.3" extension="${ext}"/>
          <code code="55186-1" codeSystem="2.16.840.1.113883.6.1" displayName="Measure Section"/>
          <title>Measure Section</title>
          <text>Aggregate quality results for ${input.measures.length} measure(s), reporting period ${periodStart}–${periodEnd}.</text>${organizers}
        </section>
      </component>
    </structuredBody>
  </component>
</ClinicalDocument>
`;
}
