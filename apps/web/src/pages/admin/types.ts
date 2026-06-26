// =============================================================================
// Admin — Shared types
// =============================================================================

export interface AdminStats {
  total_providers: number;
  active_patients: number;
  open_care_gaps: number;
  star_bundle_rows: number;
  star_composite_rows: number;
  last_etl_status: string | null;
  last_etl_at: string | null;
}

export interface AdminUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  provider_first_name: string | null;
  provider_last_name: string | null;
  pending_invite: {
    id: string;
    expires_at: string;
    created_at: string;
    status: 'pending' | 'expired';
  } | null;
}

export interface AuthProviderSetting {
  provider_type: string;
  display_name: string;
  enabled: boolean;
  settings: Record<string, unknown>;
  updated_at: string;
}

export interface SystemHealth {
  api: { status: string; node_env: string };
  database: { status: string; error?: string };
  redis: { status: string; error?: string };
  solr: { status: string; enabled: boolean };
  auth: {
    status: string;
    local_enabled: boolean;
    oidc_enabled: boolean;
    providers: AuthProviderHealth[];
    error?: string;
  };
  workers: {
    status: string;
    total_workers: number;
    counts: QueueCounts;
    queues: WorkerQueueStatus[];
  };
  ehr_bulk: {
    status: string;
    queue_enabled: boolean;
    tenants: {
      total: number;
      active: number;
      with_backend_services: number;
      with_capability_snapshots: number;
      ready_for_bulk: number;
    };
    schedules: {
      enabled: number;
      due: number;
      failed_24h: number;
      next_run_at: string | null;
    };
    bulk_jobs: {
      active: number;
      failed_24h: number;
      completed_24h: number;
      latest_completed_at: string | null;
    };
    issues: string[];
    error?: string;
  };
  ehr_sync_alerts: {
    status: string;
    enabled: boolean;
    configured: boolean;
    nightly_enabled: boolean;
    endpoint_host: string | null;
    last_dispatch_at: string | null;
    last_dispatch_status: string | null;
    last_dispatch_reason: string | null;
    last_issue_count: number | null;
    last_critical_issue_count: number | null;
    last_warning_issue_count: number | null;
    error?: string;
  };
  standards: {
    status: string;
    checks: Array<{
      key: 'cql' | 'fhir' | 'deqm';
      label: string;
      status: string;
      runtime_configured: boolean;
      detail: string;
      commands: string[];
      artifacts: {
        present: number;
        total: number;
        missing: string[];
      };
    }>;
    issues: string[];
  };
  duration_ms: number;
}

export interface AuthProviderHealth {
  provider_type: 'local' | 'oidc';
  display_name: string;
  enabled: boolean;
  status: string;
  updated_at: string | null;
  last_test: {
    status: 'ok' | 'error';
    tested_at: string;
    response_ms: number | null;
    issuer: string | null;
    client_configured: boolean | null;
    error_code: string | null;
    error_message: string | null;
  } | null;
  issues: string[];
}

export interface EhrSyncAlertDispatchResult {
  status: string;
  reason: string;
  enabled: boolean;
  configured: boolean;
  endpointHost: string | null;
  generatedAt: string;
  tenantCount: number;
  issueCount: number;
  criticalIssueCount: number;
  warningIssueCount: number;
  statusCode?: number;
  error?: string;
}

export interface QueueCounts {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
}

export interface WorkerQueueStatus {
  name: string;
  label: string;
  role: string;
  status: string;
  workers: number;
  paused: boolean;
  counts: QueueCounts;
  repeatable_jobs?: number;
  error?: string;
}

export interface MeasurePromotionConfig {
  measureCode: string;
  promotionMode: string;
  authoritativeSource: string;
  tolerance: number;
  evaluatorSource: string | null;
  requireReconciliationAgreement: boolean;
  metadata: {
    latestShadowMaterialization?: {
      sqlCounts?: PopulationCounts;
      cqlCounts?: PopulationCounts;
      deltas?: PopulationCounts;
      evaluationScope?: string;
      measureReportId?: number;
      reconciliationRunId?: number;
      reconciliationStatus?: string;
      source?: string;
    };
    [key: string]: unknown;
  };
  latestReconciliationRun?: {
    id: number;
    status: string;
    agree: boolean;
    promotionEligible: boolean;
    evaluationScope: string;
    deltas: PopulationCounts;
    computedAt: string;
  } | null;
}

export interface PopulationCounts {
  denominator: number;
  numerator: number;
  exclusion: number;
}

export interface MeasureTestDeckCoverage {
  status: 'passed';
  testDeck: string;
  artifactYear: number;
  subjectCount: number;
  evidenceSource: string;
  representativeSubject: string;
  representativeExpected: {
    initialPopulation: number;
    denominator: number;
    denominatorExclusion: number;
    numerator: number;
  };
  populationSmoke: {
    initialPopulation: number;
    denominator: number;
    denominatorExclusion: number;
    numerator: number;
    score: number;
  };
  promotionGate: string;
}

export interface MeasureDossier {
  measureCode: string;
  binding: {
    ecqm_id: string | null;
    ecqm_version: string | null;
    fhir_measure_url: string | null;
    fhir_library_url: string | null;
    reporting_period_start: string | null;
    reporting_period_end: string | null;
    status: string;
  } | null;
  components: {
    fhirLibraryUrl: string | null;
    fhirMeasureUrl: string | null;
    elm: string | null;
    testDeckCoverage: MeasureTestDeckCoverage | null;
    measureReport: {
      reportType: string;
      periodStart: string;
      periodEnd: string;
      initialPopulation: number;
      denominator: number;
      numerator: number;
      denominatorExclusion: number;
      measureScore: number | null;
      source: string;
      computedAt: string;
    } | null;
  };
}

export interface DriftFlags {
  denominator: boolean;
  numerator: boolean;
  exclusion: boolean;
}

export interface SemanticDriftWorklistRow {
  dossierPatientId: number;
  patientId: number | null;
  patientRef: string | null;
  patientKey: number | null;
  sql: DriftFlags;
  cql: DriftFlags;
  localGapStatus: string | null;
  denominatorDrift: string;
  numeratorDrift: string;
  exclusionDrift: string;
  classification: Record<string, unknown>;
  evidenceSummary: Record<string, unknown>;
  cqlPopulationCounts: Record<string, number>;
  hasSubjectReport: boolean;
  reviewBuckets: {
    localGap: string;
    hba1c: string;
    qdmEvidenceVolume: string;
    denominatorPrerequisites: string;
    cqlSubjectPopulation: string;
  };
  reviewPriority: number;
  reviewHint: string;
  createdAt: string;
}

export interface SemanticDriftWorklist {
  measureCode: string;
  dossierId: number;
  sourceMeasureCode: string | null;
  reconciliationRunId: number | null;
  measureReportId: number | null;
  period: { start: string; end: string };
  semanticRelationship: string;
  generatedAt: string;
  filters: {
    denominatorDrift: string | null;
    numeratorDrift: string | null;
    exclusionDrift: string | null;
    patientId: number | null;
  };
  pagination: {
    limit: number;
    offset: number;
    total: number;
    returned: number;
    hasMore: boolean;
  };
  classificationCounts: Record<string, unknown>;
  rows: SemanticDriftWorklistRow[];
}

export interface SemanticDriftDetail {
  measureCode: string;
  dossierId: number;
  dossierPatientId: number;
  sourceMeasureCode: string | null;
  reconciliationRunId: number | null;
  measureReportId: number | null;
  period: { start: string; end: string };
  semanticRelationship: string;
  generatedAt: string;
  worklistRow: SemanticDriftWorklistRow;
  measureReportEvidence: {
    id: number;
    measureReportId: number;
    source: string;
    period: { start: string; end: string };
    flags: DriftFlags;
    measureValue: number | null;
    computedAt: string;
    qdmEvidenceCount: number;
    fhirSubjectReportPresent: boolean;
    qdmEvidence: unknown[];
    fhirSubjectReport: Record<string, unknown> | null;
  } | null;
}

export interface QdmBridgeOperationalStatus {
  operation: string;
  measureCode: string | null;
  latestRunId: string;
  latestStatus: string;
  latestStartedAt: string;
  latestCompletedAt: string | null;
  openIssueCount: number;
  openBlockingIssueCount: number;
  latestResult: Record<string, unknown>;
  latestError: Record<string, unknown> | null;
}

export interface QdmBridgeIssue {
  id: string;
  runId: string | null;
  issueType: string;
  severity: string;
  status: string;
  measureCode: string | null;
  patientId: number | null;
  patientRef: string | null;
  qdmEventId: number | null;
  sourceTable: string | null;
  sourceId: number | null;
  message: string;
  details: Record<string, unknown>;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export interface FhirEndpoint {
  endpoint_id: number;
  name: string;
  ehr_type: string;
  base_url: string;
  auth_type: string;
  status: string;
  version: string;
  patients_linked: number;
  last_sync_at: string | null;
  notes: string | null;
}

export type EhrVendor = 'epic' | 'oracle_cerner' | 'smart_generic' | 'hapi' | 'other';
export type EhrEnvironment = 'sandbox' | 'staging' | 'production';
export type EhrClientType = 'smart_launch' | 'backend_services' | 'cds_hooks';
export type EhrIngestRunMode = 'incremental' | 'backfill' | 'bulk' | 'manual';
export type EhrIngestRunStatus = 'running' | 'succeeded' | 'failed' | 'canceled';
export type EhrIngestRunQdmReplayStatus = 'not_ready' | 'ready' | 'replayed' | 'failed';
export type EhrBulkJobStatus = 'accepted' | 'in_progress' | 'completed' | 'failed' | 'canceled';
export type EhrBulkExportLevel = 'system' | 'group' | 'patient';
export type EhrBulkScheduleSinceMode = 'none' | 'fixed' | 'last_success';
export type EhrClientAuthMethod =
  | 'public_pkce'
  | 'client_secret_post'
  | 'client_secret_basic'
  | 'private_key_jwt'
  | 'fhir_authorization_jwt'
  | 'shared_secret';
export type EhrClientApprovalStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'revoked'
  | 'unknown';

export interface EhrTenant {
  id: number;
  orgId: number | null;
  vendor: EhrVendor;
  name: string;
  environment: EhrEnvironment;
  fhirBaseUrl: string;
  smartConfigUrl: string | null;
  issuer: string | null;
  audience: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface EhrClientRegistration {
  id: number;
  ehrTenantId: number;
  clientType: EhrClientType;
  clientSlot: string;
  clientId: string;
  jwksUrl: string | null;
  redirectUris: string[];
  launchUrl: string | null;
  scopesRequested: string;
  scopesGranted: string;
  authMethod: EhrClientAuthMethod;
  profileId: string | null;
  profileVersion: string | null;
  portalAppId: string | null;
  approvalStatus: EhrClientApprovalStatus;
  approvalEvidence: Record<string, unknown>;
  enabled: boolean;
  hasClientSecretRef: boolean;
  hasPrivateKeyRef: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EhrClientReadiness {
  clientSlot: string;
  clientType: EhrClientType;
  clientId: string;
  authMethod: EhrClientAuthMethod;
  status: 'ready' | 'blocked';
  missing: string[];
}

export interface EhrCapabilitySnapshot {
  id: number;
  ehrTenantId: number;
  smartConfiguration: Record<string, unknown> | null;
  capabilityStatement: Record<string, unknown> | null;
  resourceSupport: Record<string, unknown>;
  capturedAt: string;
}

export interface EhrTenantDetail {
  tenant: EhrTenant;
  clientRegistrations: EhrClientRegistration[];
  latestCapabilitySnapshot: EhrCapabilitySnapshot | null;
  readiness: {
    clients: EhrClientReadiness[];
  };
}

export interface EhrIngestRunOperationalSummary {
  source: string;
  recommendedAction: string;
  durationMs: number | null;
  hasErrors: boolean;
  completionRatio: number | null;
  updateRatio: number | null;
  bulkJobId: string | null;
  bulkOutputCount: number | null;
  contextResourceTypesAttempted: string[];
  contextResourceTypesSkipped: number;
  contextResourcesReceived: number | null;
  contextResourcesStaged: number | null;
  contextErrors: number | null;
  continuationPagesRemaining: number | null;
  edwResourcesHydrated: number | null;
  edwResourcesFailed: number | null;
  qdmReplayStatus: EhrIngestRunQdmReplayStatus;
  canReplayQdm: boolean;
  qdmResourcesSeen: number | null;
  qdmResourcesNormalized: number | null;
  qdmResourcesFailed: number | null;
  qdmEventsUpserted: number | null;
  qdmLastReplayedAt: string | null;
}

export interface EhrIngestRun {
  id: string;
  orgId: number | null;
  ehrTenantId: number;
  resourceType: string | null;
  mode: EhrIngestRunMode;
  status: EhrIngestRunStatus;
  requestedSince: string | null;
  startedAt: string;
  finishedAt: string | null;
  resourcesReceived: number;
  resourcesStaged: number;
  resourcesUpdated: number;
  errorCount: number;
  errorMessage: string | null;
  errors: unknown[];
  metadata: Record<string, unknown>;
  operationalSummary: EhrIngestRunOperationalSummary;
  createdAt: string;
  updatedAt: string;
}

export interface EhrBulkImportFile {
  id: string;
  bulkJobId: string;
  orgId: number | null;
  ehrTenantId: number;
  ingestRunId: string | null;
  resourceType: string;
  fileUrlHash: string;
  fileUrlRedacted: string;
  manifestCount: number | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  rowsRead: number;
  resourcesStaged: number;
  errorCount: number;
  error: Record<string, unknown> | null;
  startedAt: string | null;
  completedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type EhrBulkQdmReplayStatus = 'not_ready' | 'ready' | 'replayed' | 'failed';

export interface EhrBulkImportSummary {
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  activeFiles: number;
  skippedFiles: number;
  rowsRead: number;
  manifestRows: number | null;
  resourcesStaged: number;
  errorCount: number;
  canResumeFailedFiles: boolean;
  canReplayQdm: boolean;
  ingestRunId: string | null;
  ingestStatus: string | null;
  ingestFinishedAt: string | null;
  edwResourcesHydrated: number | null;
  edwResourcesFailed: number | null;
  qdmReplayStatus: EhrBulkQdmReplayStatus;
  qdmResourcesNormalized: number | null;
  qdmResourcesFailed: number | null;
  qdmEventsUpserted: number | null;
  qdmLastReplayedAt: string | null;
  recommendedAction: string;
}

export interface EhrBulkJob {
  id: string;
  orgId: number | null;
  ehrTenantId: number;
  ingestRunId: string | null;
  exportLevel: EhrBulkExportLevel;
  groupId: string | null;
  patientId: string | null;
  status: EhrBulkJobStatus;
  resourceTypes: string[];
  since: string | null;
  typeFilters: string[];
  requestUrl: string;
  statusUrl: string;
  manifest: Record<string, unknown> | null;
  outputFiles: Array<{ type: string; url: string; count?: number }>;
  error: Record<string, unknown> | null;
  retryAfterSeconds: number | null;
  pollCount: number;
  requestedAt: string;
  nextPollAt: string | null;
  completedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  importFiles: EhrBulkImportFile[];
  importSummary: EhrBulkImportSummary;
}

export interface EhrBulkSchedule {
  id: string;
  orgId: number | null;
  ehrTenantId: number;
  enabled: boolean;
  exportLevel: EhrBulkExportLevel;
  groupId: string | null;
  patientId: string | null;
  resourceTypes: string[];
  sinceMode: EhrBulkScheduleSinceMode;
  since: string | null;
  typeFilters: string[];
  intervalMinutes: number;
  maxResourcesPerFile: number | null;
  lastEnqueuedAt: string | null;
  lastQueueJobId: string | null;
  lastBulkJobId: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: Record<string, unknown> | null;
  nextRunAt: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type EhrSyncIssueSeverity = 'info' | 'warning' | 'critical';
export type EhrSyncIssueSource = 'crosswalk' | 'ingest' | 'bulk_schedule' | 'bulk_worker' | 'patient_sync' | 'bulk_import';

export interface EhrSyncResourceStatus {
  resourceType: string;
  totalResources: number;
  localTargetResources: number;
  unmappedLocalResources: number;
  patientLinkedResources: number;
  missingPatientResources: number;
  staleResources: number;
  collisionResources: number;
  collisionTargets: number;
  lastSeenAt: string | null;
  lastIngestSucceededAt: string | null;
  lastIngestStartedAt: string | null;
  ingestResourcesReceived: number;
  ingestResourcesStaged: number;
  ingestResourcesUpdated: number;
  lastBulkExportSucceededAt: string | null;
  lastBulkImportSucceededAt: string | null;
  bulkRowsRead: number;
  bulkResourcesStaged: number;
  bulkErrorCount: number;
  bulkFailedFileCount: number;
  bulkActiveFileCount: number;
}

export interface EhrCrosswalkSummary {
  totalResources: number;
  localTargetResources: number;
  unmappedLocalResources: number;
  patientLinkedResources: number;
  missingPatientResources: number;
  staleResources: number;
  collisionResources: number;
  collisionTargets: number;
  patientCrosswalks: number;
  resourceTypes: number;
  lastSeenAt: string | null;
  staleAfterDays: number;
}

export interface EhrBulkScheduleSyncSummary {
  enabledSchedules: number;
  dueSchedules: number;
  nextBulkScheduleAt: string | null;
  lastBulkScheduleSuccessAt: string | null;
  lastBulkScheduleFailureAt: string | null;
}

export interface EhrBulkWorkerSyncSummary {
  lastEventAt: string | null;
  latestAction: string | null;
  lastFailureAt: string | null;
  failures24h: number;
  incompleteImports24h: number;
  activeOverdueJobs: number;
  oldestOverdueJobAt: string | null;
}

export interface EhrPatientResourceStatus {
  localPatientId: number;
  patientResourceId: string | null;
  totalResources: number;
  localTargetResources: number;
  resourceTypes: number;
  staleResources: number;
  lastSeenAt: string | null;
  latestResourceType: string | null;
}

export interface EhrCrosswalkConflictTarget {
  resourceType: string;
  localTable: string;
  localId: number;
  sourceCount: number;
  sourceResourceIds: string[];
  patientCount: number;
  lastSeenAt: string | null;
}

export interface EhrStalePatientResourceStatus {
  localPatientId: number;
  patientResourceId: string | null;
  resourceType: string;
  staleResources: number;
  oldestSeenAt: string | null;
  latestSeenAt: string | null;
}

export interface EhrPatientSyncSummary {
  totalPatients: number;
  displayedPatients: number;
  stalePatients: number;
  lastPatientSeenAt: string | null;
  staleAfterDays: number;
}

export interface EhrSyncIssue {
  severity: EhrSyncIssueSeverity;
  source: EhrSyncIssueSource;
  code: string;
  message: string;
  recommendedAction: string;
  drilldownAvailable: boolean;
  resourceType: string | null;
  count: number | null;
  lastSeenAt: string | null;
}

export interface EhrTenantSyncStatus {
  ehrTenantId: number;
  generatedAt: string;
  crosswalk: EhrCrosswalkSummary;
  resources: EhrSyncResourceStatus[];
  bulkSchedule: EhrBulkScheduleSyncSummary;
  bulkWorker: EhrBulkWorkerSyncSummary;
  patientSync: EhrPatientSyncSummary;
  lastSuccessfulIngestAt: string | null;
  lastSuccessfulBulkExportAt: string | null;
  lastSuccessfulBulkImportAt: string | null;
  lastSeenAt: string | null;
  issues: EhrSyncIssue[];
  patientResources: EhrPatientResourceStatus[];
  conflictTargets: EhrCrosswalkConflictTarget[];
  stalePatientResources: EhrStalePatientResourceStatus[];
}

export type EhrReadinessIssueSeverity = 'info' | 'warning' | 'critical';

export interface EhrDiscoveryDriftIssue {
  code: string;
  severity: EhrReadinessIssueSeverity;
  message: string;
}

export interface EhrDiscoveryEvidence {
  latestSnapshotId: number | null;
  capturedAt: string | null;
  smartConfigurationUrl: string | null;
  capabilityStatementUrl: string | null;
  smartOk: boolean;
  capabilityOk: boolean;
  registeredIssuer: string | null;
  discoveredIssuer: string | null;
  issuerMatches: boolean | null;
  authorizationEndpointPresent: boolean;
  tokenEndpointPresent: boolean;
  fhirVersion: string | null;
  resourceCount: number;
  drift: EhrDiscoveryDriftIssue[];
}

export interface EhrCapabilityReadinessEvidence {
  previousSnapshotId: number | null;
  previousCapturedAt: string | null;
  addedResourceTypes: string[];
  removedResourceTypes: string[];
  changedResourceTypes: string[];
  changedResourceCount: number;
  requiredBulkResourceTypes: string[];
  supportedRequiredBulkResourceTypes: string[];
  missingRequiredBulkResourceTypes: string[];
  bulkResourceCoverageRatio: number | null;
}

export type EhrBackendCredentialStatus = 'not_configured' | 'ready' | 'incomplete';

export interface EhrBackendServicesEvidence {
  enabledClientCount: number;
  authMethods: string[];
  credentialStatus: EhrBackendCredentialStatus;
  hasClientSecretRef: boolean;
  hasPrivateKeyRef: boolean;
  hasJwksUrl: boolean;
  scopesRequestedCount: number;
  scopesGrantedCount: number;
  tokenEndpointPresent: boolean;
  readyForTokenExchange: boolean;
  latestTokenIssuedAt: string | null;
  latestTokenExpiresAt: string | null;
  latestTokenExpired: boolean | null;
  tokenRequests24h: number;
}

export interface EhrLaunchEvidence {
  latestLaunchStartedAt: string | null;
  latestLaunchDeniedAt: string | null;
  latestCallbackSucceededAt: string | null;
  latestCallbackFailedAt: string | null;
  latestHandoffCompletedAt: string | null;
  latestSessionCreatedAt: string | null;
  latestSessionConsumedAt: string | null;
  latestSessionHandoffConsumedAt: string | null;
  activePendingLaunches: number;
  expiredPendingLaunches: number;
  launchesStarted24h: number;
  launchesDenied24h: number;
  callbacksSucceeded24h: number;
  callbacksFailed24h: number;
  handoffsCompleted24h: number;
}

export interface EhrBulkDiagnosticEvidence {
  readyForManualKickoff: boolean;
  activeJobs: number;
  failedJobs24h: number;
  completedJobs24h: number;
  latestJobRequestedAt: string | null;
  latestCompletedAt: string | null;
  enabledScheduleCount: number;
  overdueScheduleCount: number;
  nextScheduledAt: string | null;
}

export interface EhrReadinessIssue {
  severity: EhrReadinessIssueSeverity;
  code: string;
  message: string;
}

export interface EhrTenantReadinessEvidence {
  ehrTenantId: number;
  generatedAt: string;
  discovery: EhrDiscoveryEvidence;
  capability: EhrCapabilityReadinessEvidence;
  backendServices: EhrBackendServicesEvidence;
  launch: EhrLaunchEvidence;
  bulkDiagnostics: EhrBulkDiagnosticEvidence;
  issues: EhrReadinessIssue[];
}

export interface AuditLog {
  audit_id: number;
  event_type: string;
  user_email: string | null;
  user_first_name: string | null;
  user_last_name: string | null;
  target_type: string | null;
  target_id: string | null;
  description: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface EtlLog {
  source_system: string;
  load_status: string;
  rows_inserted: number;
  created_at: string;
}

export interface Migration {
  migration_name: string;
  applied_at: string;
}

export interface StarCounts {
  composite_rows: string;
  bundle_rows: string;
  detail_rows: string;
  dim_patient_rows: string;
  dim_provider_rows: string;
  dim_bundle_rows: string;
}
