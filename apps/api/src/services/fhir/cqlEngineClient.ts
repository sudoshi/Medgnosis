// =============================================================================
// Medgnosis API — clinical-reasoning sidecar client (FHIR $evaluate-measure)
// Typed HTTP client for the HAPI CR sidecar. The $evaluate-measure REST contract
// is standardized (FHIR Clinical Reasoning), independent of how the sidecar is
// fed data. reportType ∈ subject | subject-list | population (NOT 'summary').
// =============================================================================

export interface MeasureReportPopulation {
  code: { coding: Array<{ code: string }> };
  count: number;
}

export interface FhirMeasureReport {
  resourceType: 'MeasureReport';
  status: string;
  measure: string;
  group?: Array<{ population?: MeasureReportPopulation[]; measureScore?: { value?: number } }>;
  [k: string]: unknown;
}

export interface EvaluateMeasureParams {
  periodStart: string;
  periodEnd: string;
  reportType: 'subject' | 'subject-list' | 'population';
  subject?: string;
}

export interface MeasurePopulations {
  initialPopulation: number;
  denominator: number;
  numerator: number;
  denominatorExclusion: number;
}

export async function evaluateMeasure(
  engineBaseUrl: string,
  measureId: string,
  params: EvaluateMeasureParams,
): Promise<FhirMeasureReport> {
  const qs = new URLSearchParams({
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    reportType: params.reportType,
    ...(params.subject ? { subject: params.subject } : {}),
  });
  const url = `${engineBaseUrl}/Measure/${encodeURIComponent(measureId)}/$evaluate-measure?${qs.toString()}`;
  const res = await fetch(url, { headers: { accept: 'application/fhir+json' } });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const issues = (body as { issue?: Array<{ diagnostics?: string }> }).issue ?? [];
    const msg = issues.map((i) => i.diagnostics).filter(Boolean).join('; ') || `HTTP ${res.status}`;
    throw new Error(`$evaluate-measure failed for ${measureId}: ${msg}`);
  }
  return body as unknown as FhirMeasureReport;
}

/**
 * Null-safe capability/version probe for the clinical-reasoning sidecar. The
 * HAPI CR engine answers `GET {base}/metadata` with a FHIR CapabilityStatement
 * carrying `software.{name,version}` and `fhirVersion`. A version is recorded
 * when reachable, and `null` (never a throw) when the engine is down or the
 * response is malformed — callers (measure reports, reconciliation runs,
 * System Health) must continue to function against an unreachable engine.
 */
export interface CqlEngineCapability {
  reachable: boolean;
  /** software.version from the engine CapabilityStatement, null when unknown. */
  version: string | null;
  /** software.name from the engine CapabilityStatement, null when unknown. */
  software: string | null;
  /** Declared FHIR version (e.g. 4.0.1), null when unknown. */
  fhirVersion: string | null;
  /** Diagnostic message when the engine could not be reached/parsed. */
  error?: string;
}

interface CapabilityStatementBody {
  resourceType?: string;
  software?: { name?: unknown; version?: unknown };
  fhirVersion?: unknown;
}

const UNREACHABLE_CAPABILITY: Readonly<Omit<CqlEngineCapability, 'error'>> = Object.freeze({
  reachable: false,
  version: null,
  software: null,
  fhirVersion: null,
});

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Fetch the engine CapabilityStatement and project its version metadata. Never
 * throws: any network/parse failure resolves to an unreachable capability with
 * a diagnostic `error`. `timeoutMs` bounds the probe so a hung engine cannot
 * stall a health check or a measure-evaluation pass.
 */
export async function fetchEngineCapability(
  engineBaseUrl: string,
  opts: { timeoutMs?: number } = {},
): Promise<CqlEngineCapability> {
  const timeoutMs = opts.timeoutMs ?? 5_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${engineBaseUrl}/metadata`, {
      headers: { accept: 'application/fhir+json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ...UNREACHABLE_CAPABILITY, error: `HTTP ${res.status}` };
    }
    const body = (await res.json()) as CapabilityStatementBody;
    return {
      reachable: true,
      version: asNullableString(body.software?.version),
      software: asNullableString(body.software?.name),
      fhirVersion: asNullableString(body.fhirVersion),
    };
  } catch (err) {
    return {
      ...UNREACHABLE_CAPABILITY,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Extract {ip,denom,num,excl} counts from a summary/subject MeasureReport group[0]. */
export function populationsFromReport(report: FhirMeasureReport): MeasurePopulations {
  const pops = report.group?.[0]?.population ?? [];
  const byCode = (code: string): number =>
    pops.find((p) => p.code.coding.some((c) => c.code === code))?.count ?? 0;
  return {
    initialPopulation: byCode('initial-population'),
    denominator: byCode('denominator'),
    numerator: byCode('numerator'),
    denominatorExclusion: byCode('denominator-exclusion'),
  };
}
