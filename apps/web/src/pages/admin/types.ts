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
  id: number;
  email: string;
  first_name: string;
  last_name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  provider_first_name: string | null;
  provider_last_name: string | null;
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
