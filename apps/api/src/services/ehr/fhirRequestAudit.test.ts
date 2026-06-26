import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSql } = vi.hoisted(() => ({ mockSql: vi.fn() }));

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import {
  summarizeFailureRows,
  writeBackendTokenFailureAudit,
  writeFhirRequestFailureAudit,
  type FailureAuditRow,
} from './fhirRequestAudit.js';

beforeEach(() => {
  mockSql.mockReset();
});

describe('writeFhirRequestFailureAudit', () => {
  it('writes PHI-safe FHIR failure metadata without URLs, tokens, or raw outcome messages', async () => {
    await writeFhirRequestFailureAudit({
      tenant: {
        id: 42,
        orgId: 7,
        vendor: 'epic',
        fhirBaseUrl: 'https://ehr.example.test/fhir/R4',
      },
      audit: {
        method: 'GET',
        interaction: 'read',
        resourceType: 'Patient',
        status: 403,
        attemptCount: 1,
        retryCount: 0,
        durationMs: 20,
        startedAt: '2026-06-25T12:00:00Z',
        completedAt: '2026-06-25T12:00:01Z',
        searchParamKeys: ['patient'],
      },
      outcome: {
        status: 403,
        vendor: 'epic',
        classification: 'access_denied',
        retryable: false,
        message: 'Access denied for Patient/patient-secret',
        issues: [{ severity: 'error', code: 'forbidden', diagnostics: 'patient-secret' }],
      },
    });

    const serialized = JSON.stringify(mockSql.mock.calls);
    const details = String(mockSql.mock.calls[0]?.[5]);
    expect(serialized).toContain('ehr_fhir_request_failed');
    expect(details).toContain('access_denied');
    expect(details).toContain('"resourceType":"Patient"');
    expect(serialized).not.toContain('https://ehr.example.test');
    expect(serialized).not.toContain('raw-token');
    expect(serialized).not.toContain('patient-secret');
    expect(serialized).not.toContain('Access denied for Patient');
  });
});

describe('writeBackendTokenFailureAudit', () => {
  it('summarizes backend token failures without client ids, endpoints, assertions, or descriptions', async () => {
    await writeBackendTokenFailureAudit({
      tenant: {
        id: 42,
        orgId: 7,
        vendor: 'epic',
        fhirBaseUrl: 'https://ehr.example.test/fhir/R4',
      },
      clientRegistrationId: 9,
      authMethod: 'private_key_jwt',
      scope: 'system/Patient.rs system/Observation.rs',
      status: 401,
      code: 'backend_token_request_failed',
      retryable: false,
      oauthErrorCode: 'invalid_client',
    });

    const serialized = JSON.stringify(mockSql.mock.calls);
    const details = String(mockSql.mock.calls[0]?.[5]);
    expect(serialized).toContain('ehr_backend_token_failed');
    expect(details).toContain('invalid_client');
    expect(details).toContain('"scopeResourceTypes":["Observation","Patient"]');
    expect(serialized).not.toContain('backend-client');
    expect(serialized).not.toContain('oauth2/token');
    expect(serialized).not.toContain('client_assertion');
    expect(serialized).not.toContain('bad assertion');
  });
});

describe('summarizeFailureRows', () => {
  it('builds alert issues for FHIR auth failures, rate limits, backend-token failures, and network spikes', () => {
    const rows: FailureAuditRow[] = [
      failureRow('ehr_fhir_request_failed', '2026-06-25T11:55:00Z', {
        status: 429,
        classification: 'rate_limited',
        resourceType: 'Observation',
      }),
      failureRow('ehr_fhir_request_failed', '2026-06-25T11:54:00Z', {
        status: 429,
        classification: 'rate_limited',
        resourceType: 'Condition',
      }),
      failureRow('ehr_fhir_request_failed', '2026-06-25T11:53:00Z', {
        status: 429,
        classification: 'rate_limited',
        resourceType: 'MedicationRequest',
      }),
      failureRow('ehr_fhir_request_failed', '2026-06-25T11:40:00Z', {
        status: 401,
        classification: 'authentication',
        resourceType: 'Patient',
      }),
      failureRow('ehr_fhir_request_failed', '2026-06-25T11:35:00Z', {
        status: 403,
        classification: 'access_denied',
        resourceType: 'Patient',
      }),
      failureRow('ehr_backend_token_failed', '2026-06-25T11:34:00Z', {
        status: 401,
        code: 'backend_token_request_failed',
      }),
      failureRow('ehr_fhir_request_failed', '2026-06-25T11:30:00Z', {
        classification: 'network',
      }),
      failureRow('ehr_fhir_request_failed', '2026-06-25T11:29:00Z', {
        classification: 'network',
      }),
      failureRow('ehr_fhir_request_failed', '2026-06-25T11:28:00Z', {
        classification: 'network',
      }),
      failureRow('ehr_fhir_request_failed', '2026-06-25T11:27:00Z', {
        classification: 'network',
      }),
      failureRow('ehr_fhir_request_failed', '2026-06-25T11:26:00Z', {
        classification: 'network',
      }),
    ];

    const summary = summarizeFailureRows(rows, new Date('2026-06-25T12:00:00Z'));

    expect(summary).toMatchObject({
      failedRequests24h: 10,
      authFailures24h: 2,
      rateLimitFailures24h: 3,
      rateLimitFailures1h: 3,
      networkFailures24h: 5,
      backendTokenFailures24h: 1,
      backendTokenAuthFailures24h: 1,
      statusCounts24h: {
        '401': 1,
        '403': 1,
        '429': 3,
        network: 5,
      },
      backendTokenStatusCounts24h: { '401': 1 },
      affectedResourceTypes: ['Condition', 'MedicationRequest', 'Observation', 'Patient'],
    });
    expect(summary.issues.map((issue) => [issue.code, issue.severity, issue.count])).toEqual([
      ['fhir_auth_failures_24h', 'warning', 2],
      ['fhir_rate_limit_spike_1h', 'critical', 3],
      ['backend_token_auth_failures_24h', 'critical', 1],
      ['fhir_network_failures_24h', 'warning', 5],
    ]);
  });
});

function failureRow(
  action: string,
  createdAt: string,
  details: Record<string, unknown>,
): FailureAuditRow {
  return {
    action,
    created_at: createdAt,
    details,
  };
}
