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
