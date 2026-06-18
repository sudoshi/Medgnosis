// =============================================================================
// Medgnosis — Auth & Identity Types
// =============================================================================

export type UserRole = 'provider' | 'analyst' | 'admin' | 'super_admin' | 'care_coordinator';

export type AuthPermission =
  | 'admin:access'
  | 'admin:users'
  | 'admin:roles'
  | 'admin:auth-providers'
  | 'admin:ai-providers'
  | 'admin:audit'
  | 'admin:system-health'
  | 'admin:etl'
  | 'admin:ehr'
  | 'patients:read'
  | 'patients:write';

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  roles?: UserRole[];
  permissions?: AuthPermission[];
  org_id: string;
  provider_id?: number | null;
  mfa_enabled: boolean;
  must_change_password?: boolean;
  created_at: string;
  updated_at: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  roles?: UserRole[];
  permissions?: AuthPermission[];
  org_id: string;
  provider_id?: number;
  mfa_pending?: boolean;
  must_change_password?: boolean;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  data: {
    user: User;
    tokens: AuthTokens;
    mfa_required?: boolean;
  };
}

export interface AuthProviderDiscovery {
  local_enabled: boolean;
  oidc_enabled: boolean;
  oidc_label: string | null;
  oidc_redirect_path: string | null;
}

export interface OidcExchangeResponse {
  user: User;
  tokens: AuthTokens;
  mfa_required?: boolean;
}

export interface MfaVerifyRequest {
  code: string;
  factor_id: string;
}
