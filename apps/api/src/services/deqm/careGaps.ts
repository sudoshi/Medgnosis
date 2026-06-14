// =============================================================================
// Medgnosis API — Da Vinci DEQM Gaps-In-Care Bundle builder (Phase 2 Epic C)
// Re-expresses Medgnosis care gaps as a payer-exchangeable DEQM 5.0.0
// "Gaps in Care" document Bundle: a Composition (LOINC 96315-7) whose sections,
// one per measure, reference an individual gaps-in-care MeasureReport and a
// DetectedIssue (code=care-gap) carrying the gap status (open / closed /
// prospective — "prospective" = an open gap the patient can still close before
// the period ends).
//
// Structurally conformant; full DEQM 5.0.0 conformance is finalized against
// validator_cli.jar in CI (Epic C2/C3), which surfaces any remaining
// profile/extension-url gaps.
// =============================================================================

const DEQM = 'http://hl7.org/fhir/us/davinci-deqm';
const CARE_GAP_CS = `${DEQM}/CodeSystem/care-gap`;
const GAP_STATUS_CS = `${DEQM}/CodeSystem/care-gap-status`;
const GAP_STATUS_EXT = `${DEQM}/StructureDefinition/extension-gapStatus`;
const IMPROVEMENT_NOTATION_CS = 'http://terminology.hl7.org/CodeSystem/measure-improvement-notation';

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
  timestamp: string;
  entry: GapEntry[];
}

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
      fullUrl: `MeasureReport/${mrId}`,
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

    // DetectedIssue describing the gap (code=care-gap, gap status in an extension).
    detectedIssues.push({
      fullUrl: `DetectedIssue/${diId}`,
      resource: {
        resourceType: 'DetectedIssue',
        id: diId,
        status: 'final',
        code: {
          coding: [{ system: CARE_GAP_CS, code: 'care-gap', display: 'Care Gap' }],
        },
        extension: [
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

  const composition: GapEntry = {
    fullUrl: `Composition/gaps-${fhirId(subject.replace('/', '-'))}`,
    resource: {
      resourceType: 'Composition',
      id: `gaps-${fhirId(subject.replace('/', '-'))}`,
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
    timestamp,
    entry: [composition, ...measureReports, ...detectedIssues],
  };
}
