// =============================================================================
// Medgnosis API — Reporting artifact export service (Phase 5)
// Admin-gated assembly of the reporting artifacts for a measure + period:
//   - QRDA Category I   (patient-level CDA, BOUNDED sample)
//   - QRDA Category III (aggregate CDA)
//   - QPP / MIPS JSON   (CMS QPP Submissions performance-data shape)
//   - DEQM Gaps-in-Care Bundle (Da Vinci DEQM, BOUNDED sample collection)
//   - FHIR MeasureReport (latest persisted aggregate report)
//
// This module ONLY orchestrates the existing artifact generators (qrdaCat1,
// qrdaCat3, qppJson, deqm/careGaps, measureReportStore) over data already in
// the star/EDW schemas. It does NOT reimplement serialization.
//
// SUBMISSION READINESS: every artifact is returned with an explicit
// submissionReadiness of { validated: false, ... }. The artifacts are
// well-formed but are NOT submission-ready until they pass external validation
// (Cypress / CVU+ for QRDA; the CMS QPP sandbox/API for QPP). Nothing here
// asserts conformance.
//
// PHI / BOUNDING: QRDA Cat I is inherently patient-level. We never stream an
// unbounded population: the patient sample is hard-capped (CAT1_SAMPLE_CAP) and
// the applied bound is returned in the artifact meta. The route layer keeps the
// AUDIT row PHI-safe (measure code + artifact type + period + COUNTS only).
// =============================================================================

import { sql } from '@medgnosis/db';
import { buildQrdaCat1, type QrdaCat1MeasureResult, type QrdaCat1Patient } from './qrda/qrdaCat1.js';
import { buildQrdaCat3, type MeasurePopulationCounts } from './qrda/qrdaCat3.js';
import { buildQppSubmission } from './qrda/qppJson.js';
import { buildGapsInCareBundle, type CareGapInput, type GapStatus } from './deqm/careGaps.js';
import { latestMeasureReport } from './measureReportStore.js';

/** Artifact kinds exposed by the export endpoints. */
export const EXPORT_ARTIFACTS = ['qrda-cat1', 'qrda-cat3', 'qpp', 'deqm', 'measure-report'] as const;
export type ExportArtifact = (typeof EXPORT_ARTIFACTS)[number];

export function isExportArtifact(value: string): value is ExportArtifact {
  return (EXPORT_ARTIFACTS as readonly string[]).includes(value);
}

/**
 * Hard cap on the patient-level QRDA Cat I sample. Cat I is patient-level by
 * definition; this prevents an unbounded population document from being
 * streamed. The applied bound is reported back in the artifact meta.
 */
export const CAT1_SAMPLE_CAP = 25;

/** Default DEQM gaps-in-care subject sample cap (also patient-level). */
export const DEQM_SAMPLE_CAP = 25;

export interface ExportPeriod {
  start: string;
  end: string;
}

export interface ExportRequest {
  measureCode: string;
  period?: Partial<ExportPeriod>;
  /** Requested Cat I / DEQM sample size; clamped to the cap. */
  sampleLimit?: number;
}

export interface SubmissionReadiness {
  /** Always false here — external validation has not been run. */
  validated: false;
  /** External validator that gates submission readiness for this artifact. */
  validator: string;
  /** Human-readable reason the artifact is not yet submission-ready. */
  reason: string;
}

export interface ExportBound {
  /** Whether the artifact content was limited to a bounded sample. */
  bounded: boolean;
  /** Applied cap when bounded (rows requested are clamped to this). */
  sampleCap?: number;
  /** Patients actually included in the bounded artifact. */
  patientCount?: number;
}

export interface ArtifactExport {
  artifact: ExportArtifact;
  filename: string;
  contentType: string;
  content: string;
  submissionReadiness: SubmissionReadiness;
  /** PHI-safe descriptive meta (counts only — never patient identifiers). */
  meta: {
    measureCode: string;
    period: ExportPeriod;
    bound: ExportBound;
    /** Aggregate population counts behind the artifact (IP/D/N/DENEX). */
    populations: PopulationCounts;
  };
}

export interface PopulationCounts {
  initialPopulation: number;
  denominator: number;
  numerator: number;
  denominatorExclusion: number;
}

export class MeasureExportError extends Error {
  readonly code: string;
  readonly statusCode: number;
  constructor(code: string, message: string, statusCode = 404) {
    super(message);
    this.name = 'MeasureExportError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const ZERO_COUNTS: PopulationCounts = {
  initialPopulation: 0,
  denominator: 0,
  numerator: 0,
  denominatorExclusion: 0,
};

interface MeasureRow {
  measure_id: number;
  measure_key: number;
  measure_code: string;
  measure_name: string;
  ecqm_id: string | null;
  ecqm_version: string | null;
  fhir_measure_url: string | null;
  binding_period_start: string | null;
  binding_period_end: string | null;
}

/**
 * Resolve a measure_code to its star key + EDW/artifact binding. The artifact
 * binding (when present) supplies the canonical eCQM id/version/url and the
 * default reporting period.
 */
async function resolveMeasure(measureCode: string): Promise<MeasureRow> {
  const rows = await sql<MeasureRow[]>`
    SELECT dm.measure_id,
           dm.measure_key,
           dm.measure_code,
           dm.measure_name,
           ma.ecqm_id,
           ma.ecqm_version,
           ma.fhir_measure_url,
           ma.reporting_period_start::text AS binding_period_start,
           ma.reporting_period_end::text   AS binding_period_end
    FROM phm_star.dim_measure dm
    LEFT JOIN LATERAL (
      SELECT ecqm_id, ecqm_version, fhir_measure_url,
             reporting_period_start, reporting_period_end
      FROM phm_edw.measure_artifact a
      WHERE a.measure_code = dm.measure_code
      ORDER BY a.reporting_period_start DESC NULLS LAST
      LIMIT 1
    ) ma ON TRUE
    WHERE dm.measure_code = ${measureCode}
    ORDER BY dm.measure_key DESC
    LIMIT 1
  `;
  const measure = rows[0];
  if (!measure) {
    throw new MeasureExportError('MEASURE_NOT_FOUND', `No measure found for code ${measureCode}`);
  }
  return measure;
}

/**
 * Resolve the reporting period: explicit request > artifact binding > the
 * calendar year inferred from any latest persisted MeasureReport > current year.
 */
function resolvePeriod(
  measure: MeasureRow,
  requested: Partial<ExportPeriod> | undefined,
  reportPeriod: ExportPeriod | null,
): ExportPeriod {
  const start =
    requested?.start ??
    measure.binding_period_start ??
    reportPeriod?.start ??
    `${new Date().getUTCFullYear()}-01-01`;
  const end =
    requested?.end ??
    measure.binding_period_end ??
    reportPeriod?.end ??
    `${new Date().getUTCFullYear()}-12-31`;
  return { start, end };
}

function reportingYear(period: ExportPeriod): number {
  const year = Number(period.start.slice(0, 4));
  return Number.isInteger(year) && year > 1900 ? year : new Date().getUTCFullYear();
}

/**
 * Aggregate population counts for a measure from the authoritative measure-result
 * rows (mirrors GET /measures/:id population analysis: the authoritative source
 * is governed per measure via measure_promotion_config). Falls back to the
 * latest persisted MeasureReport populations when no star rows exist.
 */
async function populationCounts(
  measure: MeasureRow,
  reportPopulations: PopulationCounts | null,
): Promise<PopulationCounts> {
  const rows = await sql<
    { initial_population: number; denominator: number; numerator: number; denominator_exclusion: number }[]
  >`
    SELECT
      COUNT(*)::int AS initial_population,
      COUNT(*) FILTER (WHERE fmr.denominator_flag = TRUE)::int AS denominator,
      COUNT(*) FILTER (WHERE fmr.numerator_flag = TRUE)::int AS numerator,
      COUNT(*) FILTER (WHERE fmr.exclusion_flag = TRUE)::int AS denominator_exclusion
    FROM phm_star.fact_measure_result fmr
    JOIN phm_star.dim_measure dm ON dm.measure_key = fmr.measure_key
    LEFT JOIN phm_edw.measure_promotion_config mpc ON mpc.measure_code = dm.measure_code
    WHERE dm.measure_key = ${measure.measure_key}
      AND fmr.source = COALESCE(NULLIF(mpc.authoritative_source, ''), 'sql_bundle')
      AND fmr.evaluation_scope = 'full_population'
      AND fmr.reconciliation_status = 'authoritative'
  `;
  const row = rows[0];
  if (row && row.initial_population > 0) {
    return {
      initialPopulation: row.initial_population,
      denominator: row.denominator,
      numerator: row.numerator,
      denominatorExclusion: row.denominator_exclusion,
    };
  }
  return reportPopulations ?? ZERO_COUNTS;
}

interface Cat1PatientRow {
  patient_id: number;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  gender: string | null;
  denominator_flag: boolean;
  numerator_flag: boolean;
  exclusion_flag: boolean;
}

/**
 * Bounded patient-level sample for QRDA Cat I / DEQM. Hard-capped at `cap`.
 * Returns one row per patient in the authoritative measure-result set, with the
 * patient's population membership flags.
 */
async function patientSample(measure: MeasureRow, cap: number): Promise<Cat1PatientRow[]> {
  return sql<Cat1PatientRow[]>`
    SELECT dp.patient_id,
           dp.first_name,
           dp.last_name,
           dp.date_of_birth::text AS date_of_birth,
           dp.gender,
           fmr.denominator_flag,
           fmr.numerator_flag,
           fmr.exclusion_flag
    FROM phm_star.fact_measure_result fmr
    JOIN phm_star.dim_measure dm ON dm.measure_key = fmr.measure_key
    JOIN phm_star.dim_patient dp ON dp.patient_key = fmr.patient_key
    LEFT JOIN phm_edw.measure_promotion_config mpc ON mpc.measure_code = dm.measure_code
    WHERE dm.measure_key = ${measure.measure_key}
      AND fmr.source = COALESCE(NULLIF(mpc.authoritative_source, ''), 'sql_bundle')
      AND fmr.evaluation_scope = 'full_population'
      AND fmr.reconciliation_status = 'authoritative'
    ORDER BY dp.patient_id ASC
    LIMIT ${cap}
  `;
}

function slug(measureCode: string): string {
  return measureCode.replace(/[^A-Za-z0-9.-]/g, '-');
}

function measureUuid(measure: MeasureRow): string {
  return measure.ecqm_id ?? measure.fhir_measure_url ?? measure.measure_code;
}

function clampSample(requested: number | undefined, cap: number): number {
  if (requested === undefined || !Number.isFinite(requested) || requested <= 0) return cap;
  return Math.min(Math.trunc(requested), cap);
}

// ---- Per-artifact builders ----

async function exportQrdaCat1(req: ExportRequest): Promise<ArtifactExport> {
  const measure = await resolveMeasure(req.measureCode);
  const report = await latestMeasureReport(measure.measure_code);
  const reportPeriod = report ? { start: report.period_start, end: report.period_end } : null;
  const period = resolvePeriod(measure, req.period, reportPeriod);
  const populations = await populationCounts(
    measure,
    report
      ? {
          initialPopulation: report.initial_population,
          denominator: report.denominator,
          numerator: report.numerator,
          denominatorExclusion: report.denominator_exclusion,
        }
      : null,
  );

  const cap = clampSample(req.sampleLimit, CAT1_SAMPLE_CAP);
  const sample = await patientSample(measure, cap);

  // One QRDA Cat I ClinicalDocument per sampled patient (Cat I is one-doc-per-
  // patient). They are concatenated into a single downloadable file with a
  // boundary header that documents the BOUND; each <ClinicalDocument> remains an
  // independent, well-formed QRDA Cat I document.
  const uuid = measureUuid(measure);
  const documents = sample.map((row) => {
    const patient: QrdaCat1Patient = {
      id: String(row.patient_id),
      given: row.first_name ?? undefined,
      family: row.last_name ?? undefined,
      gender: row.gender ?? undefined,
      birthDate: row.date_of_birth ?? undefined,
    };
    const measureResult: QrdaCat1MeasureResult = {
      measureId: measure.measure_code,
      measureUuid: uuid,
      version: measure.ecqm_version ?? undefined,
      populations: {
        // Per-patient population membership (0/1) from the flags.
        initialPopulation: 1,
        denominator: row.denominator_flag ? 1 : 0,
        numerator: row.numerator_flag ? 1 : 0,
        denominatorExclusion: row.exclusion_flag ? 1 : 0,
      },
    };
    return buildQrdaCat1(patient, [measureResult], { period });
  });

  const header =
    `<!-- Medgnosis QRDA Category I export — measure ${measure.measure_code}, ` +
    `period ${period.start}/${period.end}. BOUNDED SAMPLE: ${sample.length} of ` +
    `at most ${cap} patient document(s). Each clinical document below is an ` +
    `independent QRDA Cat I file. NOT submission-ready until Cypress/CVU+ validation. -->\n`;
  const content = header + documents.join('\n');

  return {
    artifact: 'qrda-cat1',
    filename: `qrda-cat1-${slug(measure.measure_code)}-${period.start}-${period.end}.xml`,
    contentType: 'application/xml',
    content,
    submissionReadiness: {
      validated: false,
      validator: 'Cypress / CVU+ (ONC official QRDA validator)',
      reason:
        'Well-formed QRDA Category I; bounded sample only and not validated against ' +
        'Cypress/CVU+. Not submission-ready until external validation passes.',
    },
    meta: {
      measureCode: measure.measure_code,
      period,
      bound: { bounded: true, sampleCap: cap, patientCount: sample.length },
      populations,
    },
  };
}

async function exportQrdaCat3(req: ExportRequest): Promise<ArtifactExport> {
  const measure = await resolveMeasure(req.measureCode);
  const report = await latestMeasureReport(measure.measure_code);
  const reportPeriod = report ? { start: report.period_start, end: report.period_end } : null;
  const period = resolvePeriod(measure, req.period, reportPeriod);
  const populations = await populationCounts(
    measure,
    report
      ? {
          initialPopulation: report.initial_population,
          denominator: report.denominator,
          numerator: report.numerator,
          denominatorExclusion: report.denominator_exclusion,
        }
      : null,
  );

  const counts: MeasurePopulationCounts = {
    eCqmId: measure.ecqm_version ?? measure.measure_code,
    measureUuid: measureUuid(measure),
    version: measure.ecqm_version ?? undefined,
    initialPopulation: populations.initialPopulation,
    denominator: populations.denominator,
    numerator: populations.numerator,
    denominatorExclusion: populations.denominatorExclusion,
  };
  const content = buildQrdaCat3({ reportingYear: reportingYear(period), measures: [counts] });

  return {
    artifact: 'qrda-cat3',
    filename: `qrda-cat3-${slug(measure.measure_code)}-${reportingYear(period)}.xml`,
    contentType: 'application/xml',
    content,
    submissionReadiness: {
      validated: false,
      validator: 'Cypress / CVU+ (ONC official QRDA validator)',
      reason:
        'Well-formed aggregate QRDA Category III but not validated against ' +
        'Cypress/CVU+. Not submission-ready until external validation passes.',
    },
    meta: {
      measureCode: measure.measure_code,
      period,
      bound: { bounded: false },
      populations,
    },
  };
}

async function exportQpp(req: ExportRequest): Promise<ArtifactExport> {
  const measure = await resolveMeasure(req.measureCode);
  const report = await latestMeasureReport(measure.measure_code);
  const reportPeriod = report ? { start: report.period_start, end: report.period_end } : null;
  const period = resolvePeriod(measure, req.period, reportPeriod);
  const populations = await populationCounts(
    measure,
    report
      ? {
          initialPopulation: report.initial_population,
          denominator: report.denominator,
          numerator: report.numerator,
          denominatorExclusion: report.denominator_exclusion,
        }
      : null,
  );

  const counts: MeasurePopulationCounts = {
    eCqmId: measure.ecqm_version ?? measure.measure_code,
    measureUuid: measureUuid(measure),
    version: measure.ecqm_version ?? undefined,
    initialPopulation: populations.initialPopulation,
    denominator: populations.denominator,
    numerator: populations.numerator,
    denominatorExclusion: populations.denominatorExclusion,
  };
  const submission = buildQppSubmission(reportingYear(period), [counts]);
  const content = `${JSON.stringify(submission, null, 2)}\n`;

  return {
    artifact: 'qpp',
    filename: `qpp-submission-${slug(measure.measure_code)}-${reportingYear(period)}.json`,
    contentType: 'application/json',
    content,
    submissionReadiness: {
      validated: false,
      validator: 'CMS QPP Submissions sandbox / API',
      reason:
        'QPP performance-data JSON in the expected shape but not validated against ' +
        'the CMS QPP sandbox/API. Not submission-ready until external validation passes.',
    },
    meta: {
      measureCode: measure.measure_code,
      period,
      bound: { bounded: false },
      populations,
    },
  };
}

interface DeqmGapRow {
  patient_id: number;
  gap_status: string;
  due_date: string | null;
  measure_code: string;
  fhir_measure_url: string | null;
}

async function exportDeqm(req: ExportRequest): Promise<ArtifactExport> {
  const measure = await resolveMeasure(req.measureCode);
  const report = await latestMeasureReport(measure.measure_code);
  const reportPeriod = report ? { start: report.period_start, end: report.period_end } : null;
  const period = resolvePeriod(measure, req.period, reportPeriod);
  const populations = await populationCounts(
    measure,
    report
      ? {
          initialPopulation: report.initial_population,
          denominator: report.denominator,
          numerator: report.numerator,
          denominatorExclusion: report.denominator_exclusion,
        }
      : null,
  );

  const cap = clampSample(req.sampleLimit, DEQM_SAMPLE_CAP);
  // Bounded set of patients with a care gap for this measure (gaps-in-care is
  // per-subject; we emit one DEQM document Bundle per sampled subject inside a
  // FHIR collection Bundle).
  const rows = await sql<DeqmGapRow[]>`
    SELECT cg.patient_id,
           cg.gap_status,
           cg.due_date::text AS due_date,
           md.measure_code,
           ma.fhir_measure_url
    FROM phm_edw.care_gap cg
    JOIN phm_edw.patient p ON p.patient_id = cg.patient_id
    JOIN phm_edw.measure_definition md ON md.measure_id = cg.measure_id
    LEFT JOIN phm_edw.measure_artifact ma ON ma.measure_code = md.measure_code
    WHERE md.measure_code = ${measure.measure_code}
      AND cg.active_ind = 'Y'
      AND p.active_ind = 'Y'
    ORDER BY cg.patient_id ASC
    LIMIT ${cap}
  `;

  const today = new Date().toISOString().slice(0, 10);
  const subjectBundles = rows.map((row) => {
    const closed = row.gap_status === 'closed' || row.gap_status === 'resolved';
    const prospective = !closed && row.due_date != null && row.due_date > today;
    const gapStatus: GapStatus = closed ? 'closed' : prospective ? 'prospective' : 'open';
    const gap: CareGapInput = {
      measureCode: row.measure_code,
      measureUrl: row.fhir_measure_url ?? undefined,
      gapStatus,
      prospective,
    };
    return buildGapsInCareBundle(`Patient/${row.patient_id}`, [gap], { period });
  });

  // A FHIR collection Bundle wrapping the per-subject gaps-in-care document
  // Bundles keeps the export a single downloadable, valid FHIR resource.
  const collection = {
    resourceType: 'Bundle' as const,
    type: 'collection' as const,
    timestamp: new Date().toISOString(),
    entry: subjectBundles.map((bundle) => ({ resource: bundle })),
  };
  const content = `${JSON.stringify(collection, null, 2)}\n`;

  return {
    artifact: 'deqm',
    filename: `deqm-gaps-in-care-${slug(measure.measure_code)}-${period.start}-${period.end}.json`,
    contentType: 'application/fhir+json',
    content,
    submissionReadiness: {
      validated: false,
      validator: 'HL7 FHIR validator (Da Vinci DEQM 5.0.0 profiles)',
      reason:
        'Da Vinci DEQM Gaps-in-Care Bundle (bounded subject sample) not validated ' +
        'against the DEQM 5.0.0 profiles. Not submission-ready until external validation passes.',
    },
    meta: {
      measureCode: measure.measure_code,
      period,
      bound: { bounded: true, sampleCap: cap, patientCount: rows.length },
      populations,
    },
  };
}

async function exportMeasureReport(req: ExportRequest): Promise<ArtifactExport> {
  const measure = await resolveMeasure(req.measureCode);
  const report = await latestMeasureReport(measure.measure_code);
  if (!report) {
    throw new MeasureExportError(
      'NO_MEASURE_REPORT',
      `No persisted MeasureReport for measure ${measure.measure_code}`,
    );
  }
  const period: ExportPeriod = { start: report.period_start, end: report.period_end };
  const populations: PopulationCounts = {
    initialPopulation: report.initial_population,
    denominator: report.denominator,
    numerator: report.numerator,
    denominatorExclusion: report.denominator_exclusion,
  };
  const content = `${JSON.stringify(report.report, null, 2)}\n`;

  return {
    artifact: 'measure-report',
    filename: `measure-report-${slug(measure.measure_code)}-${period.start}-${period.end}.json`,
    contentType: 'application/fhir+json',
    content,
    submissionReadiness: {
      validated: false,
      validator: 'HL7 FHIR validator (FHIR Quality Measure / MeasureReport profiles)',
      reason:
        'Latest persisted FHIR MeasureReport, not validated against the MeasureReport ' +
        'profiles. Not submission-ready until external validation passes.',
    },
    meta: {
      measureCode: measure.measure_code,
      period,
      bound: { bounded: false },
      populations,
    },
  };
}

/** Build a reporting artifact export for a measure + period. */
export async function buildMeasureExport(
  artifact: ExportArtifact,
  req: ExportRequest,
): Promise<ArtifactExport> {
  switch (artifact) {
    case 'qrda-cat1':
      return exportQrdaCat1(req);
    case 'qrda-cat3':
      return exportQrdaCat3(req);
    case 'qpp':
      return exportQpp(req);
    case 'deqm':
      return exportDeqm(req);
    case 'measure-report':
      return exportMeasureReport(req);
    default: {
      const exhaustive: never = artifact;
      throw new MeasureExportError('UNKNOWN_ARTIFACT', `Unknown artifact ${String(exhaustive)}`, 400);
    }
  }
}

/**
 * PHI-safe audit details for an export. Counts + period + artifact type ONLY —
 * never patient identifiers and never the artifact content.
 */
export function exportAuditDetails(result: ArtifactExport): Record<string, unknown> {
  return {
    artifact: result.artifact,
    measureCode: result.meta.measureCode,
    periodStart: result.meta.period.start,
    periodEnd: result.meta.period.end,
    bounded: result.meta.bound.bounded,
    sampleCap: result.meta.bound.sampleCap ?? null,
    patientCount: result.meta.bound.patientCount ?? null,
    initialPopulation: result.meta.populations.initialPopulation,
    denominator: result.meta.populations.denominator,
    numerator: result.meta.populations.numerator,
    denominatorExclusion: result.meta.populations.denominatorExclusion,
    contentBytes: Buffer.byteLength(result.content, 'utf8'),
    submissionValidated: result.submissionReadiness.validated,
  };
}
