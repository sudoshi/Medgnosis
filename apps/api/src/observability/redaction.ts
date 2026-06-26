export const REDACTION_CENSOR = '[Redacted]';

const LOG_REDACTION_FIELDS = [
  'authorization',
  'cookie',
  'password',
  'passcode',
  'access_token',
  'refresh_token',
  'id_token',
  'token',
  'client_secret',
  'clientSecret',
  'private_key',
  'privateKey',
  'email',
  'ssn',
  'phone',
  'mrn',
  'patientId',
  'patient_id',
  'patientRef',
  'patient_ref',
  'patientResourceId',
  'patient_resource_id',
  'dob',
  'dateOfBirth',
  'date_of_birth',
  'search',
] as const;

const NESTED_SECRET_FIELDS = [
  'client_secret',
  'clientSecret',
  'private_key',
  'privateKey',
] as const;

export const LOG_REDACTION_PATHS = [
  ...LOG_REDACTION_FIELDS,
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  ...LOG_REDACTION_FIELDS.map((field) => `req.query.${field}`),
  ...LOG_REDACTION_FIELDS.map((field) => `req.params.${field}`),
  ...LOG_REDACTION_FIELDS.map((field) => `req.body.${field}`),
  ...NESTED_SECRET_FIELDS.map((field) => `req.body.settings.${field}`),
  'err.message',
  'err.stack',
  'error.message',
  'error.stack',
  ...LOG_REDACTION_FIELDS.map((field) => `*.${field}`),
];

export const logRedactionOptions = {
  paths: [...LOG_REDACTION_PATHS],
  censor: REDACTION_CENSOR,
};

const SENSITIVE_KEY_PATTERN =
  /authorization|cookie|password|passcode|token|secret|private[_-]?key|email|ssn|phone|mrn|search|patient[_-]?(id|ref|resource|name)?|dob|date[_-]?of[_-]?birth/i;

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const FHIR_PATIENT_REF_PATTERN = /\bPatient\/[A-Za-z0-9._~|:-]+\b/g;
const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;

export function sanitizeForTelemetry<T>(value: T): T {
  return sanitizeValue(value) as T;
}

function sanitizeValue(value: unknown, key = '', depth = 0): unknown {
  if (isSensitiveKey(key)) return REDACTION_CENSOR;
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactSensitiveString(value);
  if (typeof value !== 'object') return value;
  if (depth > 12) return '[Truncated]';
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, key, depth + 1));
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSensitiveString(value.message),
    };
  }

  const sanitized: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
    sanitized[entryKey] = sanitizeValue(entryValue, entryKey, depth + 1);
  }
  return sanitized;
}

function isSensitiveKey(key: string): boolean {
  return key.length > 0 && SENSITIVE_KEY_PATTERN.test(key);
}

function redactSensitiveString(value: string): string {
  return value
    .replace(BEARER_PATTERN, `Bearer ${REDACTION_CENSOR}`)
    .replace(FHIR_PATIENT_REF_PATTERN, REDACTION_CENSOR)
    .replace(EMAIL_PATTERN, REDACTION_CENSOR)
    .replace(SSN_PATTERN, REDACTION_CENSOR);
}
