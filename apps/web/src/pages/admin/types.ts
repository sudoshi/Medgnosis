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
