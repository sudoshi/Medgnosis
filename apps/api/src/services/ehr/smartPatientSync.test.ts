// =============================================================================
// Unit tests - SMART launch patient-context sync
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EhrIngestRun } from './ingestRuns.js';
import type { FhirResource } from './types.js';

const { mockSql } = vi.hoisted(() => {
  const fn = vi.fn();
  (fn as unknown as { json: (value: unknown) => unknown }).json = (value: unknown) => value;
  return { mockSql: fn };
});

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import {
  enrichLaunchContextWithPatientSync,
  localPatientIdFromLaunchContext,
  patientResourceIdFromLaunchContext,
  patientSyncFromLaunchContext,
  syncSmartLaunchPatientContext,
} from './smartPatientSync.js';
import type { SmartLaunchSession, SmartTokenResponse } from './smartLaunch.js';

const session = {
  id: '11111111-1111-4111-8111-111111111111',
  ehrTenantId: 42,
  orgId: 7,
  userId: null,
  appSessionId: null,
  clientRegistrationId: 5,
  stateHash: 'state-hash',
  nonceHash: 'nonce-hash',
  codeVerifier: 'verifier',
  redirectUri: 'https://api.medgnosis.test/api/v1/ehr/launch/callback',
  appRedirectUrl: '/ehr/complete',
  issuer: 'https://ehr.example.test',
  launch: 'launch-opaque',
  requestedScope: 'openid fhirUser launch patient/Patient.r',
  launchContext: {},
  status: 'consumed',
  expiresAt: '2026-06-19T12:10:00Z',
  consumedAt: '2026-06-19T12:01:00Z',
  handoffCodeHash: null,
  handoffExpiresAt: null,
  handoffConsumedAt: null,
  createdAt: '2026-06-19T12:00:00Z',
  updatedAt: '2026-06-19T12:01:00Z',
} satisfies SmartLaunchSession;

const tenant = {
  id: 42,
  orgId: 7,
  vendor: 'smart_generic',
  fhirBaseUrl: 'https://ehr.example.test/fhir/R4',
};

const tokenResponse = {
  access_token: 'raw-access-token',
  token_type: 'Bearer',
  expires_in: 300,
  scope: 'openid fhirUser launch patient/Patient.r',
  patient: 'Patient/pat-1',
} satisfies SmartTokenResponse;

const ingestRun = {
  id: '00000000-0000-4000-8000-000000000063',
  orgId: 7,
  ehrTenantId: 42,
  resourceType: 'Patient',
  mode: 'manual',
  status: 'running',
  requestedSince: null,
  startedAt: '2026-06-19T12:01:00Z',
  finishedAt: null,
  resourcesReceived: 0,
  resourcesStaged: 0,
  resourcesUpdated: 0,
  errorCount: 0,
  errorMessage: null,
  errors: [],
  metadata: {},
  createdAt: '2026-06-19T12:01:00Z',
  updatedAt: '2026-06-19T12:01:00Z',
} satisfies EhrIngestRun;

const qdmBridgeResult = {
  resourcesSeen: 1,
  resourcesNormalized: 1,
  resourcesSkipped: 0,
  resourcesFailed: 0,
  eventsUpserted: 1,
  errors: [],
};

const edwHydrationResult = {
  resourcesSeen: 1,
  resourcesHydrated: 1,
  resourcesSkipped: 0,
  resourcesFailed: 0,
  rowsInserted: 1,
  rowsUpdated: 0,
  byResourceType: {
    Observation: { seen: 1, hydrated: 1, skipped: 0, failed: 0 },
  },
  errors: [],
};

const patientResource = {
  resourceType: 'Patient',
  id: 'pat-1',
  meta: { versionId: '7', lastUpdated: '2026-06-19T12:00:00Z' },
  identifier: [
    {
      system: 'urn:mrn',
      value: 'MRN-1',
      type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MR' }] },
    },
  ],
  name: [{ use: 'official', family: 'Launch', given: ['Ehr'] }],
  birthDate: '1975-04-02',
  gender: 'female',
  telecom: [
    { system: 'phone', use: 'mobile', value: '555-0100' },
    { system: 'email', value: 'ehr.launch@example.test' },
  ],
} satisfies FhirResource;

beforeEach(() => {
  mockSql.mockReset();
});

describe('syncSmartLaunchPatientContext', () => {
  it('skips when the SMART launch context has no patient', async () => {
    const result = await syncSmartLaunchPatientContext({
      session,
      tenant,
      tokenResponse,
      launchContext: { scopes: ['openid'] },
    });

    expect(result).toMatchObject({
      status: 'skipped',
      patientResourceId: null,
      localPatientId: null,
      reason: 'missing_patient_context',
    });
    expect(mockSql).not.toHaveBeenCalled();
  });

  it('resolves an existing crosswalk without reading FHIR', async () => {
    const fhirClient = { readResource: vi.fn(), search: vi.fn() };
    const startIngestRun = vi.fn();
    mockSql.mockResolvedValueOnce([{ patient_id: 123 }]);

    const result = await syncSmartLaunchPatientContext(
      {
        session,
        tenant,
        tokenResponse,
        launchContext: { patient: 'Patient/pat-1', scopes: ['patient/Patient.r'] },
      },
      { fhirClient, startIngestRun },
    );

    expect(result).toMatchObject({
      status: 'resolved',
      patientRef: 'Patient/pat-1',
      patientResourceId: 'pat-1',
      localPatientId: 123,
    });
    expect(fhirClient.readResource).not.toHaveBeenCalled();
    expect(fhirClient.search).not.toHaveBeenCalled();
    expect(startIngestRun).not.toHaveBeenCalled();
  });

  it('normalizes bounded context resources for an existing Patient crosswalk', async () => {
    const observation: FhirResource = {
      resourceType: 'Observation',
      id: 'obs-existing-1',
      subject: { reference: 'Patient/pat-1' },
      status: 'final',
      code: { text: 'Blood pressure' },
    };
    const existingQdmBridgeResult = {
      ...qdmBridgeResult,
      resourcesSeen: 1,
      resourcesNormalized: 1,
      eventsUpserted: 1,
    };
    const fhirClient = {
      readResource: vi.fn(),
      search: vi.fn().mockResolvedValue({ resources: [observation], audit: {} }),
    };
    const startIngestRun = vi.fn().mockResolvedValue(ingestRun);
    const finishIngestRun = vi.fn().mockResolvedValue({
      run: { ...ingestRun, status: 'succeeded' },
      qdmBridge: existingQdmBridgeResult,
    });
    const stageFhirResource = vi.fn().mockResolvedValue({ id: 101 });
    const hydrateStagedRunToEdw = vi.fn().mockResolvedValue(edwHydrationResult);
    mockSql.mockResolvedValueOnce([{ patient_id: 123 }]);

    const result = await syncSmartLaunchPatientContext(
      {
        session,
        tenant,
        tokenResponse,
        launchContext: { patient: 'Patient/pat-1', scopes: ['patient/Patient.r', 'patient/Observation.rs'] },
      },
      { fhirClient, startIngestRun, finishIngestRun, stageFhirResource, hydrateStagedRunToEdw },
    );

    expect(result).toMatchObject({
      status: 'resolved',
      localPatientId: 123,
      contextResources: {
        attempted: ['Observation'],
        received: 1,
        staged: 1,
        errors: [],
      },
      edwHydration: edwHydrationResult,
      qdmBridge: existingQdmBridgeResult,
      ingestRunId: ingestRun.id,
    });
    expect(fhirClient.readResource).not.toHaveBeenCalled();
    expect(fhirClient.search).toHaveBeenCalledWith(
      tenant,
      { accessToken: 'raw-access-token', tokenType: 'Bearer', scope: tokenResponse.scope },
      'Observation',
      { patient: 'pat-1' },
      expect.objectContaining({ pageSize: 10, maxPages: 1, timeoutMs: 10_000, retryAttempts: 1 }),
    );
    expect(stageFhirResource).toHaveBeenCalledWith({
      orgId: 7,
      ehrTenantId: 42,
      ingestRunId: ingestRun.id,
      resource: observation,
    });
    expect(hydrateStagedRunToEdw).toHaveBeenCalledWith({
      orgId: 7,
      ehrTenantId: 42,
      ingestRunId: ingestRun.id,
      limit: 50,
      resourceTypes: ['Encounter', 'Condition', 'Observation', 'MedicationRequest', 'Procedure', 'AllergyIntolerance'],
    });
    expect(finishIngestRun).toHaveBeenCalledWith(expect.objectContaining({
      id: ingestRun.id,
      resourcesReceived: 1,
      resourcesStaged: 1,
      resourcesUpdated: 0,
      errorCount: 0,
      qdmBridge: {
        enabled: true,
        limit: 50,
        sourceSystem: 'smart-launch-patient-context',
        failOnError: false,
      },
      metadata: expect.objectContaining({
        edwHydration: edwHydrationResult,
        contextResources: expect.objectContaining({ received: 1, staged: 1 }),
      }),
    }));
  });

  it('reads, stages, creates, and crosswalks the launched Patient when no mapping exists', async () => {
    const fhirClient = {
      readResource: vi.fn().mockResolvedValue({ resource: patientResource, audit: {} }),
      search: vi.fn(),
    };
    const startIngestRun = vi.fn().mockResolvedValue(ingestRun);
    const finishIngestRun = vi.fn().mockResolvedValue({
      run: { ...ingestRun, status: 'succeeded' },
      qdmBridge: qdmBridgeResult,
    });
    const failIngestRun = vi.fn();
    const stageFhirResource = vi.fn().mockResolvedValue({ id: 99 });
    // Legacy patient reconciliation is delegated to the identity resolver
    // (unit-tested in identity/*). Here we fake it so the sql sequence only
    // covers the crosswalk lookup and upsert.
    const reconcileLocalPatient = vi.fn().mockResolvedValue(456);
    mockSql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ patient_id: 456, local_id: 456 }]);

    const result = await syncSmartLaunchPatientContext(
      {
        session,
        tenant,
        tokenResponse,
        launchContext: { patient: 'Patient/pat-1', scopes: ['patient/Patient.r'] },
      },
      { fhirClient, startIngestRun, finishIngestRun, failIngestRun, stageFhirResource, reconcileLocalPatient },
    );

    expect(reconcileLocalPatient).toHaveBeenCalledWith(patientResource, 42, 'pat-1', 'smart_generic');

    expect(result).toMatchObject({
      status: 'imported',
      patientResourceId: 'pat-1',
      localPatientId: 456,
      ingestRunId: ingestRun.id,
      stagedResourceId: 99,
      qdmBridge: qdmBridgeResult,
    });
    expect(fhirClient.readResource).toHaveBeenCalledWith(
      tenant,
      { accessToken: 'raw-access-token', tokenType: 'Bearer', scope: tokenResponse.scope },
      'Patient',
      'pat-1',
    );
    expect(startIngestRun).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 7,
      ehrTenantId: 42,
      resourceType: 'Patient',
      mode: 'manual',
    }));
    expect(stageFhirResource).toHaveBeenCalledWith({
      orgId: 7,
      ehrTenantId: 42,
      ingestRunId: ingestRun.id,
      resource: patientResource,
    });
    expect(finishIngestRun).toHaveBeenCalledWith(expect.objectContaining({
      id: ingestRun.id,
      resourcesReceived: 1,
      resourcesStaged: 1,
      resourcesUpdated: 1,
      errorCount: 0,
      qdmBridge: {
        enabled: true,
        limit: 50,
        sourceSystem: 'smart-launch-patient-context',
        failOnError: false,
      },
    }));
    expect(failIngestRun).not.toHaveBeenCalled();
    expect(fhirClient.search).not.toHaveBeenCalled();
    expect(result.contextResources).toMatchObject({
      attempted: [],
      received: 0,
      staged: 0,
      errors: [],
    });

    const queries = mockSql.mock.calls.map((call) => (call[0] as TemplateStringsArray).join(''));
    // The legacy patient INSERT is now delegated to the (faked) identity
    // reconciler, so it no longer appears in this path's direct sql calls.
    expect(queries.some((query) => query.includes('INSERT INTO phm_edw.patient'))).toBe(false);
    expect(queries.some((query) => query.includes('INSERT INTO phm_edw.ehr_resource_crosswalk'))).toBe(true);
    expect(queries.some((query) => query.includes('WHERE mrn'))).toBe(false);
  });

  it('stages but fails softly when the Patient is missing required local demographics', async () => {
    const fhirClient = {
      readResource: vi.fn().mockResolvedValue({
        resource: {
          ...patientResource,
          birthDate: undefined,
        },
        audit: {},
      }),
      search: vi.fn(),
    };
    const startIngestRun = vi.fn().mockResolvedValue(ingestRun);
    const finishIngestRun = vi.fn();
    const failIngestRun = vi.fn().mockResolvedValue({ ...ingestRun, status: 'failed' });
    const stageFhirResource = vi.fn().mockResolvedValue({ id: 99 });
    mockSql.mockResolvedValueOnce([]);

    const result = await syncSmartLaunchPatientContext(
      {
        session,
        tenant,
        tokenResponse,
        launchContext: { patient: 'pat-1', scopes: ['patient/Patient.r'] },
      },
      { fhirClient, startIngestRun, finishIngestRun, failIngestRun, stageFhirResource },
    );

    expect(result).toMatchObject({
      status: 'failed',
      patientResourceId: 'pat-1',
      localPatientId: null,
      ingestRunId: ingestRun.id,
    });
    expect(result.errorMessage).toContain('birthDate');
    expect(stageFhirResource).toHaveBeenCalled();
    expect(finishIngestRun).not.toHaveBeenCalled();
    expect(failIngestRun).toHaveBeenCalledWith(expect.objectContaining({
      id: ingestRun.id,
      resourcesReceived: 1,
      resourcesStaged: 1,
      errorMessage: expect.stringContaining('birthDate'),
    }));
  });

  it('stages bounded launch-context resources and records per-resource search errors', async () => {
    const observation: FhirResource = {
      resourceType: 'Observation',
      id: 'obs-1',
      subject: { reference: 'Patient/pat-1' },
      status: 'final',
      code: { text: 'A1c' },
    };
    const medicationRequest: FhirResource = {
      resourceType: 'MedicationRequest',
      id: 'med-1',
      subject: { reference: 'Patient/pat-1' },
      status: 'active',
      intent: 'order',
    };
    const fhirClient = {
      readResource: vi.fn().mockResolvedValue({ resource: patientResource, audit: {} }),
      search: vi.fn()
        .mockResolvedValueOnce({ resources: [], audit: {} })
        .mockRejectedValueOnce(new Error('Condition search denied'))
        .mockResolvedValueOnce({ resources: [observation], audit: {} })
        .mockResolvedValueOnce({ resources: [medicationRequest], audit: {} }),
    };
    const startIngestRun = vi.fn().mockResolvedValue(ingestRun);
    const contextQdmBridgeResult = {
      ...qdmBridgeResult,
      resourcesSeen: 3,
      resourcesNormalized: 3,
      eventsUpserted: 3,
    };
    const finishIngestRun = vi.fn().mockResolvedValue({
      run: { ...ingestRun, status: 'succeeded' },
      qdmBridge: contextQdmBridgeResult,
    });
    const failIngestRun = vi.fn();
    const stageFhirResource = vi.fn().mockResolvedValue({ id: 99 });
    const contextEdwHydrationResult = {
      ...edwHydrationResult,
      resourcesSeen: 2,
      resourcesHydrated: 2,
      rowsInserted: 2,
      byResourceType: {
        Observation: { seen: 1, hydrated: 1, skipped: 0, failed: 0 },
        MedicationRequest: { seen: 1, hydrated: 1, skipped: 0, failed: 0 },
      },
    };
    const hydrateStagedRunToEdw = vi.fn().mockResolvedValue(contextEdwHydrationResult);
    const reconcileLocalPatient = vi.fn().mockResolvedValue(456);
    mockSql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ patient_id: 456, local_id: 456 }]);

    const result = await syncSmartLaunchPatientContext(
      {
        session,
        tenant,
        tokenResponse,
        launchContext: {
          patient: 'Patient/pat-1',
          scopes: [
            'patient/Patient.r',
            'patient/Encounter.rs',
            'patient/Condition.rs',
            'patient/Observation.rs',
            'patient/MedicationRequest.rs',
          ],
        },
      },
      {
        fhirClient, startIngestRun, finishIngestRun, failIngestRun, stageFhirResource,
        hydrateStagedRunToEdw, reconcileLocalPatient,
      },
    );

    expect(result).toMatchObject({
      status: 'imported',
      localPatientId: 456,
      contextResources: {
        attempted: ['Encounter', 'Condition', 'Observation', 'MedicationRequest'],
        received: 2,
        staged: 2,
        errors: [{ resourceType: 'Condition', message: 'Condition search denied' }],
      },
      edwHydration: contextEdwHydrationResult,
      qdmBridge: contextQdmBridgeResult,
    });
    expect(fhirClient.search).toHaveBeenCalledTimes(4);
    expect(fhirClient.search).toHaveBeenCalledWith(
      tenant,
      { accessToken: 'raw-access-token', tokenType: 'Bearer', scope: tokenResponse.scope },
      'Observation',
      { patient: 'pat-1' },
      expect.objectContaining({ pageSize: 10, maxPages: 1, timeoutMs: 10_000, retryAttempts: 1 }),
    );
    expect(stageFhirResource).toHaveBeenCalledTimes(3);
    expect(stageFhirResource).toHaveBeenNthCalledWith(2, {
      orgId: 7,
      ehrTenantId: 42,
      ingestRunId: ingestRun.id,
      resource: observation,
    });
    expect(stageFhirResource).toHaveBeenNthCalledWith(3, {
      orgId: 7,
      ehrTenantId: 42,
      ingestRunId: ingestRun.id,
      resource: medicationRequest,
    });
    expect(hydrateStagedRunToEdw).toHaveBeenCalledWith({
      orgId: 7,
      ehrTenantId: 42,
      ingestRunId: ingestRun.id,
      limit: 50,
      resourceTypes: ['Encounter', 'Condition', 'Observation', 'MedicationRequest', 'Procedure', 'AllergyIntolerance'],
    });
    expect(finishIngestRun).toHaveBeenCalledWith(expect.objectContaining({
      resourcesReceived: 3,
      resourcesStaged: 3,
      errorCount: 1,
      qdmBridge: {
        enabled: true,
        limit: 50,
        sourceSystem: 'smart-launch-patient-context',
        failOnError: false,
      },
      metadata: expect.objectContaining({
        edwHydration: contextEdwHydrationResult,
        contextResources: expect.objectContaining({
          received: 2,
          staged: 2,
          errors: [{ resourceType: 'Condition', message: 'Condition search denied' }],
        }),
      }),
    }));
    expect(failIngestRun).not.toHaveBeenCalled();
  });
});

describe('SMART patient sync launch context helpers', () => {
  it('parses patient references and exposes local patient ids from enriched context', () => {
    expect(patientResourceIdFromLaunchContext({ patient: 'Patient/pat-1' })).toBe('pat-1');
    expect(patientResourceIdFromLaunchContext({
      patient: 'https://ehr.example.test/fhir/R4/Patient/pat%202',
    })).toBe('pat 2');

    const context = enrichLaunchContextWithPatientSync(
      { patient: 'Patient/pat-1', scopes: ['patient/Patient.r'] },
      {
        status: 'imported',
        patientRef: 'Patient/pat-1',
        patientResourceId: 'pat-1',
        localPatientId: 456,
        edwHydration: {
          ...edwHydrationResult,
          errors: [{ stagingId: 100, resourceType: 'Observation', resourceId: 'obs-2', message: 'missing patient' }],
        },
        qdmBridge: {
          ...qdmBridgeResult,
          errors: [{ stagingId: 99, resourceType: 'Observation', resourceId: 'obs-1', message: 'bad code' }],
        },
      },
    );

    expect(localPatientIdFromLaunchContext(context)).toBe(456);
    expect(patientSyncFromLaunchContext(context)).toMatchObject({
      status: 'imported',
      edwHydration: {
        resourcesSeen: 1,
        resourcesHydrated: 1,
        resourcesFailed: 0,
        rowsInserted: 1,
        byResourceType: {
          Observation: { seen: 1, hydrated: 1, skipped: 0, failed: 0 },
        },
        errors: [{ stagingId: 100, resourceType: 'Observation', resourceId: 'obs-2', message: 'missing patient' }],
      },
      qdmBridge: {
        resourcesSeen: 1,
        resourcesNormalized: 1,
        resourcesFailed: 0,
        eventsUpserted: 1,
        errors: [{ stagingId: 99, resourceType: 'Observation', resourceId: 'obs-1', message: 'bad code' }],
      },
    });
    expect(context).toMatchObject({
      localPatientId: 456,
      patientSync: {
        status: 'imported',
        patientResourceId: 'pat-1',
        localPatientId: 456,
        qdmBridge: expect.objectContaining({
          resourcesSeen: 1,
          eventsUpserted: 1,
        }),
        edwHydration: expect.objectContaining({
          resourcesSeen: 1,
          rowsInserted: 1,
        }),
      },
    });
  });
});
