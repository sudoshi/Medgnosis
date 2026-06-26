import { describe, expect, it } from 'vitest';
import pino from 'pino';
import { logRedactionOptions, REDACTION_CENSOR, sanitizeForTelemetry } from './redaction.js';
import { sentryBeforeSend } from './sentry.js';

describe('observability redaction', () => {
  it('redacts PHI and secrets from structured Pino request logs', () => {
    const writes: string[] = [];
    const logger = pino(
      { redact: logRedactionOptions },
      { write: (line: string) => writes.push(line) },
    );

    logger.info(
      {
        patient_id: 'patient-top-level-123',
        search: 'Jane Patient',
        req: {
          headers: {
            authorization: 'Bearer raw-token',
            cookie: 'session=raw-cookie',
          },
          query: {
            patientRef: 'Patient/query-123',
            date_of_birth: '1970-01-01',
            passcode: '123456',
            search: 'John Patient',
          },
          params: {
            patientId: 'patient-param-123',
          },
          body: {
            email: 'patient@example.test',
            password: 'secret-password',
            access_token: 'raw-access-token',
            refresh_token: 'raw-refresh-token',
            ssn: '123-45-6789',
            phone: '555-1212',
            mrn: 'MRN-123',
            patientId: 'patient-123',
            patientResourceId: 'Patient/pat-123',
            settings: {
              clientSecret: 'raw-client-secret',
              private_key: 'raw-private-key',
            },
          },
        },
        err: {
          message: 'failed for Patient/error-123',
          stack: 'Error: failed for patient@example.test',
        },
      },
      'request received',
    );

    const line = writes.join('\n');
    expect(line).toContain(REDACTION_CENSOR);
    expect(line).not.toContain('patient-top-level-123');
    expect(line).not.toContain('Jane Patient');
    expect(line).not.toContain('raw-token');
    expect(line).not.toContain('raw-cookie');
    expect(line).not.toContain('Patient/query-123');
    expect(line).not.toContain('1970-01-01');
    expect(line).not.toContain('123456');
    expect(line).not.toContain('John Patient');
    expect(line).not.toContain('patient-param-123');
    expect(line).not.toContain('patient@example.test');
    expect(line).not.toContain('secret-password');
    expect(line).not.toContain('raw-access-token');
    expect(line).not.toContain('raw-refresh-token');
    expect(line).not.toContain('123-45-6789');
    expect(line).not.toContain('555-1212');
    expect(line).not.toContain('MRN-123');
    expect(line).not.toContain('patient-123');
    expect(line).not.toContain('Patient/pat-123');
    expect(line).not.toContain('raw-client-secret');
    expect(line).not.toContain('raw-private-key');
    expect(line).not.toContain('Patient/error-123');
  });

  it('sanitizes telemetry payloads recursively for Sentry beforeSend', () => {
    const event = sentryBeforeSend({
      message: 'Failed request for patient@example.test with 123-45-6789',
      request: {
        url: 'https://api.example.test/patients/Patient/pat-123',
        headers: {
          authorization: 'Bearer raw-token',
          cookie: 'session=raw-cookie',
        },
        data: {
          patientId: 'patient-123',
          email: 'patient@example.test',
          note: 'non-sensitive aggregate failure',
        },
      },
      extra: {
        nested: {
          refreshToken: 'raw-refresh-token',
          phone: '555-1212',
          counts: { failed: 1 },
        },
      },
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Token Bearer raw-token failed for patient@example.test',
          },
        ],
      },
    });

    const serialized = JSON.stringify(event);
    expect(serialized).toContain('non-sensitive aggregate failure');
    expect(serialized).toContain('"failed":1');
    expect(serialized).toContain(REDACTION_CENSOR);
    expect(serialized).not.toContain('patient@example.test');
    expect(serialized).not.toContain('123-45-6789');
    expect(serialized).not.toContain('raw-token');
    expect(serialized).not.toContain('raw-cookie');
    expect(serialized).not.toContain('patient-123');
    expect(serialized).not.toContain('Patient/pat-123');
    expect(serialized).not.toContain('raw-refresh-token');
    expect(serialized).not.toContain('555-1212');
  });

  it('preserves aggregate telemetry fields while redacting sensitive keys', () => {
    const sanitized = sanitizeForTelemetry({
      tenantId: 42,
      evidenceRowsSeen: 12,
      patientRef: 'Patient/pat-123',
      auth: { clientSecret: 'raw-secret' },
    });

    expect(sanitized).toMatchObject({
      tenantId: 42,
      evidenceRowsSeen: 12,
      patientRef: REDACTION_CENSOR,
      auth: { clientSecret: REDACTION_CENSOR },
    });
  });
});
