import type {
  EhrVendorId,
  FhirErrorClassification,
  FhirOperationOutcome,
  FhirOperationOutcomeIssue,
  NormalizedOperationOutcome,
  NormalizedOperationOutcomeIssue,
  OperationOutcomeContext,
} from './types.js';

const RETRYABLE_CLASSIFICATIONS = new Set<FhirErrorClassification>([
  'network',
  'rate_limited',
  'service_unavailable',
  'timeout',
]);

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export function isOperationOutcome(value: unknown): value is FhirOperationOutcome {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { resourceType?: unknown }).resourceType === 'OperationOutcome'
  );
}

export function normalizeOperationOutcome(
  value: unknown,
  context: OperationOutcomeContext = {},
): NormalizedOperationOutcome {
  const raw = isOperationOutcome(value) ? value : undefined;
  const issues = normalizeIssues(raw?.issue);
  const classification =
    context.classification ?? classifyOperationOutcome(issues, context.status, context.vendor);
  const message = buildMessage(issues, context.fallbackMessage, context.status);

  return {
    status: context.status,
    vendor: context.vendor,
    classification,
    retryable:
      RETRYABLE_CLASSIFICATIONS.has(classification) ||
      (context.status !== undefined && RETRYABLE_STATUSES.has(context.status)),
    message,
    issues,
    raw,
  };
}

export function classifyOperationOutcome(
  issues: readonly NormalizedOperationOutcomeIssue[],
  status?: number,
  vendor?: EhrVendorId | string,
): FhirErrorClassification {
  const text = issues
    .flatMap((issue) => [issue.code, issue.diagnostics, issue.details, ...(issue.expression ?? [])])
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ')
    .toLowerCase();

  if (/\bbreak[- ]?the[- ]?glass\b|restricted patient|confidential patient/.test(text)) {
    return 'restricted_patient';
  }
  if (/\bmerged patient\b|patient.*merged|merge redirect/.test(text)) {
    return 'merged_patient';
  }
  if (/required search parameter|required parameter|missing required/.test(text)) {
    return 'required_parameter_missing';
  }
  if (/too many results|result limit|too-costly|query too broad/.test(text)) {
    return 'too_many_results';
  }
  if (/rate limit|too many requests|throttle|throttled/.test(text)) {
    return 'rate_limited';
  }
  if (/access denied|not authorized|unauthori[sz]ed|forbidden|insufficient scope/.test(text)) {
    return vendor === 'oracle_cerner' ? 'authorization' : 'access_denied';
  }
  if (/timed? out|timeout/.test(text)) {
    return 'timeout';
  }

  const issueCodes = new Set(issues.map((issue) => issue.code));
  if (issueCodes.has('login')) return 'authentication';
  if (issueCodes.has('forbidden')) return vendor === 'oracle_cerner' ? 'authorization' : 'access_denied';
  if (issueCodes.has('security')) return 'authorization';
  if (issueCodes.has('not-found')) return 'not_found';
  if (issueCodes.has('conflict') || issueCodes.has('duplicate')) return 'conflict';
  if (issueCodes.has('too-costly')) return 'too_many_results';
  if (issueCodes.has('required')) return 'required_parameter_missing';
  if (issueCodes.has('invalid') || issueCodes.has('structure')) return 'invalid_request';

  if (status === 401) return 'authentication';
  if (status === 403) return vendor === 'oracle_cerner' ? 'authorization' : 'access_denied';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limited';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 502 || status === 503) return 'service_unavailable';
  if (status !== undefined && status >= 400 && status < 500) return 'invalid_request';
  if (status !== undefined && status >= 500) return 'service_unavailable';

  return 'unknown';
}

function normalizeIssues(
  issues: FhirOperationOutcomeIssue[] | undefined,
): NormalizedOperationOutcomeIssue[] {
  if (!Array.isArray(issues) || issues.length === 0) {
    return [];
  }

  return issues.map((issue) => ({
    severity: issue.severity ?? 'error',
    code: issue.code ?? 'unknown',
    diagnostics: issue.diagnostics,
    details: issue.details?.text ?? issue.details?.coding?.map((coding) => coding.display).filter(Boolean).join('; '),
    expression: issue.expression,
    location: issue.location,
  }));
}

function buildMessage(
  issues: readonly NormalizedOperationOutcomeIssue[],
  fallbackMessage: string | undefined,
  status: number | undefined,
): string {
  const issueMessages = issues
    .flatMap((issue) => [issue.diagnostics, issue.details])
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0);

  if (issueMessages.length > 0) {
    return issueMessages.join('; ');
  }

  if (fallbackMessage) {
    return fallbackMessage;
  }

  return status === undefined ? 'FHIR request failed' : `FHIR request failed with HTTP ${status}`;
}

