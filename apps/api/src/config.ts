// =============================================================================
// Medgnosis API — Environment configuration
// All env vars are validated at startup. Missing required vars cause a crash.
// =============================================================================

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function optionalBool(key: string, fallback: boolean): boolean {
  const val = process.env[key];
  if (val === undefined) return fallback;
  return val === 'true';
}

function optionalList(key: string, fallback: string[]): string[] {
  const val = process.env[key];
  if (!val) return fallback;
  return val
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export const config = {
  // Server
  port: Number(optional('API_PORT', '3000')),
  host: optional('API_HOST', '0.0.0.0'),
  nodeEnv: optional('NODE_ENV', 'development'),
  corsOrigin: optional('CORS_ORIGIN', 'http://localhost:5173'),
  // Canonical base URL for FHIR Bundle fullUrl construction (no trailing slash)
  fhirBaseUrl: optional('FHIR_BASE_URL', 'http://localhost:3000/api/fhir'),
  // CQL clinical-reasoning sidecar (internal Docker network)
  cqlEngineUrl: optional('CQL_ENGINE_URL', 'http://cql-engine:8080/fhir'),
  cqlSampleCohortLimit: Number(optional('CQL_SAMPLE_COHORT_LIMIT', '2000')),

  // Database
  databaseUrl: required('DATABASE_URL'),

  // Auth
  jwtSecret: required('JWT_SECRET'),
  jwtAccessExpiry: optional('JWT_ACCESS_EXPIRY', '15m'),
  jwtRefreshExpiry: optional('JWT_REFRESH_EXPIRY', '7d'),
  publicRegistrationEnabled: optionalBool('PUBLIC_REGISTRATION_ENABLED', false),
  localAuthEnabled: optionalBool('LOCAL_AUTH_ENABLED', true),
  oidcEnabled: optionalBool('OIDC_ENABLED', false),
  oidcLabel: optional('OIDC_LABEL', 'Authentik'),
  oidcDiscoveryUrl: process.env['OIDC_DISCOVERY_URL'] ?? '',
  oidcClientId: process.env['OIDC_CLIENT_ID'] ?? '',
  oidcClientSecret: process.env['OIDC_CLIENT_SECRET'] ?? '',
  oidcClientSecretRef: optional('OIDC_CLIENT_SECRET_REF', 'OIDC_CLIENT_SECRET'),
  oidcRedirectUri: optional(
    'OIDC_REDIRECT_URI',
    'http://localhost:3000/api/v1/auth/oidc/callback',
  ),
  oidcScopes: optionalList('OIDC_SCOPES', ['openid', 'profile', 'email', 'groups']),
  oidcAllowedGroups: optionalList('OIDC_ALLOWED_GROUPS', ['Medgnosis Admins']),
  oidcAdminGroups: optionalList('OIDC_ADMIN_GROUPS', ['Medgnosis Admins']),
  oidcStateTtlSeconds: Number(optional('OIDC_STATE_TTL_SECONDS', '300')),
  oidcExchangeTtlSeconds: Number(optional('OIDC_EXCHANGE_TTL_SECONDS', '60')),

  // EMPI probabilistic matching (SanteMPI). OFF by default — deterministic-only
  // identity resolution until an MPI sidecar is deployed and configured.
  mpiEnabled: optionalBool('MPI_ENABLED', false),
  mpiBaseUrl: optional('MPI_BASE_URL', 'http://santempi:8080/fhir'),
  // Assigning-authority system URI of the MPI master/enterprise identifier.
  mpiMasterIdSystem: optional('MPI_MASTER_ID_SYSTEM', 'urn:oid:2.16.840.1.113883.3.999.mpi'),
  // Static token (overrides client_credentials) — leave blank in production.
  mpiAccessToken: process.env['MPI_ACCESS_TOKEN'] ?? '',
  // OAuth2 client_credentials for the MPI (preferred machine-to-machine auth).
  mpiTokenUrl: process.env['MPI_TOKEN_URL'] ?? '',
  mpiClientId: process.env['MPI_CLIENT_ID'] ?? '',
  mpiClientSecret: process.env['MPI_CLIENT_SECRET'] ?? '',
  mpiScope: optional('MPI_SCOPE', '*'),
  // Auto-accept >= auto; route [review, auto) to the steward queue; ignore < review.
  mpiAutoThreshold: Number(optional('MPI_AUTO_THRESHOLD', '0.9')),
  mpiReviewThreshold: Number(optional('MPI_REVIEW_THRESHOLD', '0.6')),

  // Redis
  redisUrl: optional('REDIS_URL', 'redis://localhost:6379'),

  // Solr (full-text search acceleration)
  solrEnabled: optionalBool('SOLR_ENABLED', false),
  solrUrl: optional('SOLR_URL', 'http://localhost:8984/solr'),
  solrSearchCore: optional('SOLR_SEARCH_CORE', 'search'),
  solrClinicalCore: optional('SOLR_CLINICAL_CORE', 'clinical'),
  solrAuthUser: optional('SOLR_AUTH_USER', 'medgnosis'),
  solrAuthPassword: optional('SOLR_AUTH_PASSWORD', 'devsecret'),

  // Compliance gates — NEVER enable without BAA in place
  aiInsightsEnabled: optionalBool('AI_INSIGHTS_ENABLED', false),
  anthropicBaaSigned: optionalBool('ANTHROPIC_BAA_SIGNED', false),

  // AI provider: 'anthropic' (cloud, requires BAA) or 'ollama' (local, no BAA)
  aiProvider: optional('AI_PROVIDER', 'ollama') as 'anthropic' | 'ollama',

  // Anthropic (gated — only used if both flags above are true)
  anthropicApiKey: process.env['ANTHROPIC_API_KEY'] ?? '',
  anthropicModel: optional('ANTHROPIC_MODEL', 'claude-sonnet-4-5-20250929'),

  // Ollama (local inference — no BAA required, data never leaves the machine)
  ollamaBaseUrl: optional('OLLAMA_BASE_URL', 'http://localhost:11434'),
  ollamaModel: optional('OLLAMA_MODEL', 'gemma:7b'),

  // Notifications — email via Resend
  resendApiKey: process.env['RESEND_API_KEY'] ?? '',
  emailFrom: optional('EMAIL_FROM', 'alerts@medgnosis.app'),
  webAppUrl: optional('WEB_APP_URL', 'http://localhost:5173'),

  // Observability
  sentryDsn: process.env['SENTRY_DSN'] ?? '',
  ehrSyncAlertingEnabled: optionalBool('EHR_SYNC_ALERTING_ENABLED', false),
  ehrSyncAlertWebhookUrl: process.env['EHR_SYNC_ALERT_WEBHOOK_URL'] ?? '',
  ehrSyncAlertWebhookSecret: process.env['EHR_SYNC_ALERT_WEBHOOK_SECRET'] ?? '',
  ehrSyncAlertNightlyEnabled: optionalBool('EHR_SYNC_ALERT_NIGHTLY_ENABLED', false),
  ehrSyncAlertTimeoutMs: Number(optional('EHR_SYNC_ALERT_TIMEOUT_MS', '5000')),

  // External integrations / API documentation
  cdsHooksSecret: process.env['CDS_HOOKS_SECRET'] ?? '',
  cdsFhirAuthRequired: optionalBool('CDS_FHIR_AUTH_REQUIRED', false),
  cdsSharedSecretCompat: optionalBool('CDS_SHARED_SECRET_COMPAT', true),
  cdsJwksCacheTtlSeconds: Number(optional('CDS_JWKS_CACHE_TTL_SECONDS', '300')),
  cdsFhirAuthIssuer: process.env['CDS_FHIR_AUTH_ISSUER'] ?? '',
  cdsFhirAuthAudience: process.env['CDS_FHIR_AUTH_AUDIENCE'] ?? '',
  cdsFhirAuthJwksUrl: process.env['CDS_FHIR_AUTH_JWKS_URL'] ?? '',
  cdsFhirAuthRequiredScopes: process.env['CDS_FHIR_AUTH_REQUIRED_SCOPES'] ?? '',
  swaggerEnabled: optionalBool('SWAGGER_ENABLED', optional('NODE_ENV', 'development') !== 'production'),

  get isDev(): boolean {
    return this.nodeEnv === 'development';
  },
  get isProd(): boolean {
    return this.nodeEnv === 'production';
  },
} as const;
