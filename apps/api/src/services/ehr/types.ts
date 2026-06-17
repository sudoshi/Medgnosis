export type EhrVendorId = 'smart_generic' | 'epic' | 'oracle_cerner' | 'hapi' | 'other';

export interface EhrTenantRef {
  id?: string | number;
  vendor?: EhrVendorId | string;
  fhirBaseUrl: string;
  smartConfigUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface FhirAccessTokenRef {
  accessToken: string;
  tokenType?: string;
  scope?: string;
  expiresAt?: string | Date;
}

export interface FhirResource {
  resourceType: string;
  id?: string;
  meta?: {
    versionId?: string;
    lastUpdated?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface FhirBundleLink {
  relation: string;
  url: string;
}

export interface FhirBundleEntry<TResource extends FhirResource = FhirResource> {
  fullUrl?: string;
  resource?: TResource;
  search?: Record<string, unknown>;
  response?: Record<string, unknown>;
}

export interface FhirBundle<TResource extends FhirResource = FhirResource> extends FhirResource {
  resourceType: 'Bundle';
  type?: string;
  total?: number;
  link?: FhirBundleLink[];
  entry?: FhirBundleEntry<TResource>[];
}

export interface FhirOperationOutcomeIssue {
  severity?: 'fatal' | 'error' | 'warning' | 'information' | string;
  code?: string;
  details?: {
    text?: string;
    coding?: Array<{
      system?: string;
      code?: string;
      display?: string;
    }>;
  };
  diagnostics?: string;
  location?: string[];
  expression?: string[];
}

export interface FhirOperationOutcome extends FhirResource {
  resourceType: 'OperationOutcome';
  issue?: FhirOperationOutcomeIssue[];
}

export type FhirErrorClassification =
  | 'access_denied'
  | 'authentication'
  | 'authorization'
  | 'conflict'
  | 'invalid_request'
  | 'merged_patient'
  | 'network'
  | 'not_found'
  | 'rate_limited'
  | 'required_parameter_missing'
  | 'restricted_patient'
  | 'service_unavailable'
  | 'timeout'
  | 'too_many_results'
  | 'unknown';

export interface NormalizedOperationOutcomeIssue {
  severity: string;
  code: string;
  diagnostics?: string;
  details?: string;
  expression?: string[];
  location?: string[];
}

export interface NormalizedOperationOutcome {
  status?: number;
  vendor?: EhrVendorId | string;
  classification: FhirErrorClassification;
  retryable: boolean;
  message: string;
  issues: NormalizedOperationOutcomeIssue[];
  raw?: FhirOperationOutcome;
}

export type FhirSearchPrimitive = string | number | boolean | Date;
export type FhirSearchParamValue =
  | FhirSearchPrimitive
  | readonly FhirSearchPrimitive[]
  | null
  | undefined;
export type FhirSearchParams = Record<string, FhirSearchParamValue>;

export interface FhirRequestAudit {
  method: 'GET' | 'POST';
  interaction: 'read' | 'search' | 'metadata' | 'operation';
  resourceType?: string;
  status?: number;
  attemptCount: number;
  retryCount: number;
  durationMs: number;
  startedAt: string;
  completedAt: string;
  searchParamKeys?: string[];
}

export interface FhirReadResult<TResource extends FhirResource = FhirResource> {
  resource: TResource;
  audit: FhirRequestAudit;
}

export interface FhirSearchAudit {
  interaction: 'search';
  resourceType: string;
  pageCount: number;
  requestCount: number;
  requests: FhirRequestAudit[];
  searchParamKeys: string[];
}

export interface FhirSearchResult<TResource extends FhirResource = FhirResource> {
  bundle: FhirBundle<TResource>;
  pages: Array<FhirBundle<TResource>>;
  resources: TResource[];
  nextUrl?: string;
  audit: FhirSearchAudit;
}

export interface ScopePolicyRequest {
  mode: 'patient' | 'backend';
  resources?: readonly string[];
  includeOnlineAccess?: boolean;
  includeOfflineAccess?: boolean;
  launchMode?: 'ehr' | 'standalone';
  additionalScopes?: readonly string[];
}

export type FhirResourceInteraction =
  | 'read'
  | 'search'
  | 'create'
  | 'update'
  | 'delete'
  | 'history'
  | 'operation';

export interface FhirResourceSupport {
  interactions: FhirResourceInteraction[];
  searchParams?: string[];
  notes?: string[];
}

export interface FhirDiscoverResult {
  fhirBaseUrl: string;
  smartConfigurationUrl: string;
  capabilityStatementUrl: string;
}

export interface PaginationPolicy {
  defaultPageSize: number;
  maxPageSize: number;
  maxPages: number;
  nextLinkRelation: 'next';
}

export interface BulkCapabilities {
  supported: boolean;
  exportLevels: Array<'system' | 'group' | 'patient'>;
  requiresTenantApproval: boolean;
  pollingMinSeconds: number;
  pollingMaxSeconds: number;
  notes?: string[];
}

export interface CdsCapabilities {
  cdsHooksVersion: string;
  supportedHooks: string[];
  feedbackSupported: boolean;
  fhirAuthorizationRequired: boolean;
}

export interface SmartTokenResponseShape {
  patient?: unknown;
  encounter?: unknown;
  fhirUser?: unknown;
  scope?: unknown;
  [key: string]: unknown;
}

export interface EhrLaunchContext {
  patient?: string;
  encounter?: string;
  fhirUser?: string;
  scopes: string[];
}

export interface OperationOutcomeContext {
  status?: number;
  vendor?: EhrVendorId | string;
  fallbackMessage?: string;
  classification?: FhirErrorClassification;
}

export interface EhrVendorAdapter {
  vendor: EhrVendorId;
  displayName: string;
  discover: (tenant: EhrTenantRef) => FhirDiscoverResult;
  defaultScopes: (request: ScopePolicyRequest) => string[];
  resourceSupport: Record<string, FhirResourceSupport>;
  normalizeSearchParams: (resourceType: string, params: FhirSearchParams) => FhirSearchParams;
  handleOperationOutcome: (
    outcome: unknown,
    context?: OperationOutcomeContext,
  ) => NormalizedOperationOutcome;
  paginationPolicy: PaginationPolicy;
  bulkCapabilities: BulkCapabilities;
  cdsCapabilities: CdsCapabilities;
  launchContextMapper: (tokenResponse: SmartTokenResponseShape) => EhrLaunchContext;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
