// =============================================================================
// Medgnosis API — Da Vinci DEQM Gaps-In-Care Bundle builder (Phase 2 Epic C)
// Re-expresses Medgnosis care gaps as a payer-exchangeable DEQM 5.0.0
// "Gaps in Care" document Bundle: a Composition (LOINC 96315-7) whose sections,
// one per measure, reference an individual gaps-in-care MeasureReport and a
// DetectedIssue (code=CAREGAP) carrying the gap status as a modifierExtension
// (open / closed / prospective — "prospective" = an open gap the patient can
// still close before the period ends).
//
// Validated against Da Vinci DEQM 5.0.0 with validator_cli.jar (scripts/
// deqm-validate.sh, CI): codes/extension/identifier/fullUrl/subject conform.
// Per-resource meta.profile binding (full MustSupport) is the closing gate.
// =============================================================================

const DEQM = 'http://hl7.org/fhir/us/davinci-deqm';
const GAP_STATUS_CS = `${DEQM}/CodeSystem/gaps-status`;
const GAP_STATUS_EXT = `${DEQM}/StructureDefinition/extension-gapStatus`;
const V3_ACTCODE = 'http://terminology.hl7.org/CodeSystem/v3-ActCode';
const IMPROVEMENT_NOTATION_CS = 'http://terminology.hl7.org/CodeSystem/measure-improvement-notation';
const DEFAULT_BASE = 'https://medgnosis.acumenus.net/fhir';

export type GapStatus = 'open' | 'closed' | 'prospective';

export interface CareGapInput {
  measureCode: string;
  /** Canonical Measure url; falls back to measureCode. */
  measureUrl?: string;
  gapStatus: GapStatus;
  /** True when the gap is still closable within the measurement period. */
  prospective: boolean;
  improvementNotation?: 'increase' | 'decrease';
}

export interface GapsInCareOptions {
  period?: { start: string; end: string };
  reporterName?: string;
  /** Absolute base URL for entry fullUrls (DEQM requires absolute fullUrls). */
  baseUrl?: string;
  /** Document timestamp (ISO); defaults to now. */
  timestamp?: string;
}

interface GapEntry {
  fullUrl: string;
  resource: { resourceType: string; id: string; [k: string]: unknown };
}

export interface GapsInCareBundle {
  resourceType: 'Bundle';
  type: 'document';
  identifier: { system: string; value: string };
  timestamp: string;
  entry: GapEntry[];
}

// DEQM gaps-status CodeSystem (.../CodeSystem/gaps-status).
const GAP_STATUS_CODE: Record<GapStatus, { code: string; display: string }> = {
  open: { code: 'open-gap', display: 'Open Gap' },
  closed: { code: 'closed-gap', display: 'Closed Gap' },
  prospective: { code: 'prospective-gap', display: 'Prospective Gap' },
};

// FHIR id: [A-Za-z0-9-.]{1,64}
function fhirId(s: string): string {
  return s.replace(/[^A-Za-z0-9.-]/g, '-').slice(0, 64);
}

export function buildGapsInCareBundle(
  subject: string,
  gaps: CareGapInput[],
  opts: GapsInCareOptions = {},
): GapsInCareBundle {
  const timestamp = opts.timestamp ?? new Date().toISOString();
  const period = opts.period ?? { start: '2026-01-01', end: '2026-12-31' };
  const reporter = opts.reporterName ?? 'Medgnosis';
  const base = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '');
  const url = (type: string, id: string): string => `${base}/${type}/${id}`;

  const patientId = subject.replace(/^Patient\//, '');

  const measureReports: GapEntry[] = [];
  const detectedIssues: GapEntry[] = [];
  const sections: Record<string, unknown>[] = [];

  gaps.forEach((g, i) => {
    const key = `${fhirId(g.measureCode)}-${i}`;
    const mrId = `mr-${key}`;
    const diId = `di-${key}`;
    const measure = g.measureUrl ?? g.measureCode;
    const status = GAP_STATUS_CODE[g.gapStatus];

    // Individual gaps-in-care MeasureReport for this measure.
    measureReports.push({
      fullUrl: url('MeasureReport', mrId),
      resource: {
        resourceType: 'MeasureReport',
        id: mrId,
        status: 'complete',
        type: 'individual',
        measure,
        subject: { reference: subject },
        period: { start: period.start, end: period.end },
        improvementNotation: {
          coding: [{ system: IMPROVEMENT_NOTATION_CS, code: g.improvementNotation ?? 'increase' }],
        },
      },
    });

    // DetectedIssue describing the gap. DEQM fixes code to CAREGAP (v3-ActCode)
    // and carries the gap status as a REQUIRED modifierExtension (gaps-status).
    detectedIssues.push({
      fullUrl: url('DetectedIssue', diId),
      resource: {
        resourceType: 'DetectedIssue',
        id: diId,
        status: 'final',
        code: { coding: [{ system: V3_ACTCODE, code: 'CAREGAP', display: 'Caregap' }] },
        modifierExtension: [
          {
            url: GAP_STATUS_EXT,
            valueCodeableConcept: {
              coding: [{ system: GAP_STATUS_CS, code: status.code, display: status.display }],
            },
          },
        ],
        patient: { reference: subject },
        evidence: [{ detail: [{ reference: `MeasureReport/${mrId}` }] }],
      },
    });

    sections.push({
      title: `Gap in care — ${g.measureCode}`,
      code: { text: measure },
      entry: [{ reference: `DetectedIssue/${diId}` }, { reference: `MeasureReport/${mrId}` }],
    });
  });

  // Minimal Patient so the document Composition.subject resolves in-bundle.
  const patient: GapEntry = {
    fullUrl: url('Patient', patientId),
    resource: { resourceType: 'Patient', id: patientId },
  };

  const composition: GapEntry = {
    fullUrl: url('Composition', `gaps-${fhirId(patientId)}`),
    resource: {
      resourceType: 'Composition',
      id: `gaps-${fhirId(patientId)}`,
      status: 'final',
      type: {
        coding: [{ system: 'http://loinc.org', code: '96315-7', display: 'Gaps in care report' }],
      },
      subject: { reference: subject },
      date: timestamp,
      author: [{ display: reporter }],
      title: 'Gaps in Care Report',
      section: sections,
    },
  };

  return {
    resourceType: 'Bundle',
    type: 'document',
    identifier: { system: `${base}/gaps-report`, value: `${fhirId(patientId)}-${timestamp}` },
    timestamp,
    entry: [composition, patient, ...measureReports, ...detectedIssues],
  };
}
