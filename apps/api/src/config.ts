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

export const config = {
  // Server
  port: Number(optional('API_PORT', '3000')),
  host: optional('API_HOST', '0.0.0.0'),
  nodeEnv: optional('NODE_ENV', 'development'),
  corsOrigin: optional('CORS_ORIGIN', 'http://localhost:5173'),

  // Database
  databaseUrl: required('DATABASE_URL'),

  // Auth
  jwtSecret: required('JWT_SECRET'),
  jwtAccessExpiry: optional('JWT_ACCESS_EXPIRY', '15m'),
  jwtRefreshExpiry: optional('JWT_REFRESH_EXPIRY', '7d'),

  // Redis
  redisUrl: optional('REDIS_URL', 'redis://localhost:6379'),

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

  get isDev(): boolean {
    return this.nodeEnv === 'development';
  },
  get isProd(): boolean {
    return this.nodeEnv === 'production';
  },
} as const;
