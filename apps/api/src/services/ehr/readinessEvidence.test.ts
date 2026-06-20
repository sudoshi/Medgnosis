import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EhrTenant } from './tenantRegistry.js';

const { mockSql } = vi.hoisted(() => ({ mockSql: vi.fn() }));

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import { getTenantReadinessEvidence } from './readinessEvidence.js';

const tenant: EhrTenant = {
  id: 42,
  orgId: 7,
  vendor: 'epic',
  name: 'Acme Epic Sandbox',
  environment: 'sandbox',
  fhirBaseUrl: 'https://ehr.example.test/fhir/R4',
  smartConfigUrl: 'https://issuer.example.test/.well-known/smart-configuration',
  issuer: 'https://issuer.example.test',
  audience: 'https://ehr.example.test/fhir/R4',
  status: 'testing',
  createdAt: '2026-06-16T12:00:00Z',
  updatedAt: '2026-06-16T12:00:00Z',
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-19T12:00:00Z'));
  mockSql.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getTenantReadinessEvidence', () => {
  it('reports discovery drift, launch timestamps, and operational issues', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.ehr_capability_snapshot')) {
        expect(values).toContain(42);
        return Promise.resolve([
          {
            id: 12,
            ehr_tenant_id: 42,
            smart_configuration: {
              url: 'https://issuer.example.test/.well-known/smart-configuration',
              ok: true,
              status: 200,
              summary: {
                issuer: 'https://wrong-issuer.example.test',
                authorizationEndpoint: 'https://issuer.example.test/oauth2/authorize',
                tokenEndpoint: 'https://issuer.example.test/oauth2/token',
              },
            },
            capability_statement: {
              url: 'https://ehr.example.test/fhir/R4/metadata',
              ok: true,
              status: 200,
              summary: { fhirVersion: '4.0.1' },
            },
            resource_support: {
              Patient: { interactions: ['read'], searchParams: ['_id'] },
              Observation: { interactions: ['search-type'], searchParams: ['patient'] },
            },
            captured_at: '2026-06-18 12:00:00+00',
          },
        ]);
      }
      if (text.includes('FROM phm_edw.smart_launch_session')) {
        expect(values).toContain(42);
        return Promise.resolve([
          {
            latest_session_created_at: '2026-06-19 10:00:00+00',
            latest_session_consumed_at: '2026-06-19 10:02:00+00',
            latest_session_handoff_consumed_at: '2026-06-19 10:03:00+00',
            active_pending_launches: '1',
            expired_pending_launches: '2',
          },
        ]);
      }
      if (text.includes('FROM audit_log')) {
        expect(values).toContain('42');
        return Promise.resolve([
          {
            latest_launch_started_at: '2026-06-19 10:00:00+00',
            latest_launch_denied_at: '2026-06-19 11:00:00+00',
            latest_callback_succeeded_at: '2026-06-19 10:02:00+00',
            latest_callback_failed_at: '2026-06-19 11:05:00+00',
            latest_handoff_completed_at: '2026-06-19 10:03:00+00',
            launches_started_24h: '3',
            launches_denied_24h: '1',
            callbacks_succeeded_24h: '2',
            callbacks_failed_24h: '1',
            handoffs_completed_24h: '2',
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const evidence = await getTenantReadinessEvidence(tenant);

    expect(evidence).toMatchObject({
      ehrTenantId: 42,
      generatedAt: '2026-06-19T12:00:00.000Z',
      discovery: {
        latestSnapshotId: 12,
        capturedAt: '2026-06-18 12:00:00+00',
        smartOk: true,
        capabilityOk: true,
        registeredIssuer: 'https://issuer.example.test',
        discoveredIssuer: 'https://wrong-issuer.example.test',
        issuerMatches: false,
        authorizationEndpointPresent: true,
        tokenEndpointPresent: true,
        fhirVersion: '4.0.1',
        resourceCount: 2,
      },
      launch: {
        latestLaunchStartedAt: '2026-06-19 10:00:00+00',
        latestCallbackSucceededAt: '2026-06-19 10:02:00+00',
        latestHandoffCompletedAt: '2026-06-19 10:03:00+00',
        activePendingLaunches: 1,
        expiredPendingLaunches: 2,
        launchesDenied24h: 1,
        callbacksFailed24h: 1,
      },
    });
    expect(evidence.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'issuer_mismatch',
        'launch_denials_24h',
        'callback_failures_24h',
        'expired_pending_launches',
      ]),
    );
  });
});
