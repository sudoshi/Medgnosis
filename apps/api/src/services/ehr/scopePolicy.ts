import type { ScopePolicyRequest } from './types.js';

export const DEFAULT_PATIENT_LAUNCH_RESOURCES = [
  'Patient',
  'Encounter',
  'Condition',
  'Observation',
  'MedicationRequest',
  'AllergyIntolerance',
  'Procedure',
  'DiagnosticReport',
  'DocumentReference',
  'ServiceRequest',
  'CarePlan',
  'CareTeam',
  'Goal',
  'Coverage',
] as const;

export const DEFAULT_BACKEND_SERVICE_RESOURCES = [
  'Patient',
  'Encounter',
  'Condition',
  'Observation',
  'MedicationRequest',
  'MedicationDispense',
  'MedicationAdministration',
  'AllergyIntolerance',
  'Procedure',
  'Immunization',
  'DiagnosticReport',
  'DocumentReference',
  'ServiceRequest',
  'CarePlan',
  'CareTeam',
  'Goal',
  'Coverage',
] as const;

export function buildPatientLaunchScopes(options: Omit<ScopePolicyRequest, 'mode'> = {}): string[] {
  const resources = options.resources ?? DEFAULT_PATIENT_LAUNCH_RESOURCES;
  const launchScope = options.launchMode === 'standalone' ? 'launch/patient' : 'launch';
  const scopes = [
    'openid',
    'fhirUser',
    launchScope,
    ...resources.map((resource) => `patient/${resource}.${patientAccessForResource(resource)}`),
    ...(options.includeOnlineAccess ? ['online_access'] : []),
    ...(options.includeOfflineAccess ? ['offline_access'] : []),
    ...(options.additionalScopes ?? []),
  ];

  return assertNoWildcardScopes(normalizeScopes(scopes));
}

export function buildBackendServiceScopes(options: Omit<ScopePolicyRequest, 'mode'> = {}): string[] {
  const resources = options.resources ?? DEFAULT_BACKEND_SERVICE_RESOURCES;
  const scopes = [
    ...resources.map((resource) => `system/${resource}.rs`),
    ...(options.additionalScopes ?? []),
  ];

  return assertNoWildcardScopes(normalizeScopes(scopes));
}

export function defaultScopesForRequest(request: ScopePolicyRequest): string[] {
  return request.mode === 'backend'
    ? buildBackendServiceScopes(request)
    : buildPatientLaunchScopes(request);
}

export function normalizeScopes(scopes: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const scope of scopes) {
    const trimmed = scope.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

export function assertNoWildcardScopes(scopes: readonly string[]): string[] {
  const wildcard = scopes.find((scope) => /(^|\/)\*/.test(scope));
  if (wildcard) {
    throw new Error(`Wildcard SMART scope is not allowed by default: ${wildcard}`);
  }
  return [...scopes];
}

function patientAccessForResource(resource: string): 'r' | 'rs' {
  return resource === 'Patient' ? 'r' : 'rs';
}
