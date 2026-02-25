// =============================================================================
// Medgnosis — Auth & Identity Types
// =============================================================================

export type UserRole = 'provider' | 'analyst' | 'admin' | 'care_coordinator';

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  org_id: string;
  mfa_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  org_id: string;
  mfa_pending?: boolean;
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
  user: User;
  tokens: AuthTokens;
  mfa_required?: boolean;
}

export interface MfaVerifyRequest {
  code: string;
  factor_id: string;
}
