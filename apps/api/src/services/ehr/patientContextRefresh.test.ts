import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackendServicesConfig, BackendServiceTokenResult } from './backendServices.js';
import type { EhrIngestRun } from './ingestRuns.js';
import type { FhirResource } from './types.js';

const { mockSql } = vi.hoisted(() => {
  const fn = vi.fn();
  (fn as unknown as { json: (value: unknown) => unknown }).json = (value: unknown) => value;
  return { mockSql: fn };
});

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import { refreshSmartPatientContext } from './patientContextRefresh.js';

const backendConfig: BackendServicesConfig = {
  tenant: {
    id: 42,
    orgId: 7,
    vendor: 'smart_generic',
    fhirBaseUrl: 'https://ehr.example.test/fhir/R4',
  },
  clientRegistrationId: 9,
  clientId: 'backend-client',
  authMethod: 'private_key_jwt',
  clientSecretRef: null,
  jwksUrl: 'https://api.medgnosis.test/.well-known/jwks.json',
  privateKeyRef: 'env:EHR_BACKEND_PRIVATE_KEY_PEM?kid=backend-key-1&alg=RS384',
  scopesRequested: 'system/Encounter.rs system/Observation.rs',
  scopesGranted: 'system/Encounter.rs system/Observation.rs',
  tokenEndpoint: 'https://ehr.example.test/oauth2/token',
};

const tokenResult: BackendServiceTokenResult = {
  accessToken: {
    accessToken: 'raw-backend-token',
    tokenType: 'Bearer',
    scope: 'system/Encounter.rs system/Observation.rs',
  },
  tokenResponse: {
    access_token: 'raw-backend-token',
    token_type: 'Bearer',
    expires_in: 300,
    scope: 'system/Encounter.rs system/Observation.rs',
  },
  tokenMetadata: {
    id: '99999999-9999-4999-8999-999999999999',
    smartLaunchSessionId: null,
    ehrTenantId: 42,
    orgId: 7,
    userId: null,
    tokenType: 'Bearer',
    scope: 'system/Encounter.rs system/Observation.rs',
    accessTokenHash: 'hash',
    refreshTokenHash: null,
    idTokenHash: null,
    patientRef: null,
    encounterRef: null,
    fhirUserRef: null,
    launchContext: {},
    tokenResponseMetadata: {},
    issuedAt: '2026-06-19T12:00:00Z',
    expiresAt: '2026-06-19T12:05:00Z',
    revokedAt: null,
    createdAt: '2026-06-19T12:00:00Z',
    updatedAt: '2026-06-19T12:00:00Z',
  },
};

const ingestRun = {
  id: '00000000-0000-4000-8000-000000000063',
  orgId: 7,
  ehrTenantId: 42,
  resourceType: null,
  mode: 'incremental',
  status: 'running',
  requestedSince: null,
  startedAt: '2026-06-19T12:00:00Z',
  finishedAt: null,
  resourcesReceived: 0,
  resourcesStaged: 0,
  resourcesUpdated: 0,
  errorCount: 0,
  errorMessage: null,
  errors: [],
  metadata: {},
  createdAt: '2026-06-19T12:00:00Z',
  updatedAt: '2026-06-19T12:00:00Z',
} satisfies EhrIngestRun;

const encounterResource = {
  resourceType: 'Encounter',
  id: 'enc-1',
  subject: { reference: 'Patient/pat-1' },
} satisfies FhirResource;

const observationResource = {
  resourceType: 'Observation',
  id: 'obs-1',
  subject: { reference: 'Patient/pat-1' },
  status: 'final',
  code: { text: 'A1c' },
} satisfies FhirResource;

const procedureResource = {
  resourceType: 'Procedure',
  id: 'proc-1',
  subject: { reference: 'Patient/pat-1' },
  status: 'completed',
  code: { text: 'Colonoscopy' },
} satisfies FhirResource;

const allergyResource = {
  resourceType: 'AllergyIntolerance',
  id: 'alg-1',
  patient: { reference: 'Patient/pat-1' },
  code: { text: 'Penicillin allergy' },
} satisfies FhirResource;

const immunizationResource = {
  resourceType: 'Immunization',
  id: 'imm-1',
  patient: { reference: 'Patient/pat-1' },
  status: 'completed',
  vaccineCode: { text: 'Influenza vaccine' },
  occurrenceDateTime: '2025-10-01T12:00:00Z',
} satisfies FhirResource;

const medicationDispenseResource = {
  resourceType: 'MedicationDispense',
  id: 'disp-1',
  subject: { reference: 'Patient/pat-1' },
  medicationCodeableConcept: { text: 'Metformin' },
  status: 'completed',
} satisfies FhirResource;

const medicationAdministrationResource = {
  resourceType: 'MedicationAdministration',
  id: 'admin-1',
  subject: { reference: 'Patient/pat-1' },
  medicationCodeableConcept: { text: 'Metformin' },
  status: 'completed',
} satisfies FhirResource;

const edwHydration = {
  resourcesSeen: 2,
  resourcesHydrated: 2,
  resourcesSkipped: 0,
  resourcesFailed: 0,
  rowsInserted: 2,
  rowsUpdated: 0,
  byResourceType: {
    Encounter: { seen: 1, hydrated: 1, skipped: 0, failed: 0 },
    Observation: { seen: 1, hydrated: 1, skipped: 0, failed: 0 },
  },
  errors: [],
};

const qdmBridge = {
  resourcesSeen: 2,
  resourcesNormalized: 2,
  resourcesSkipped: 0,
  resourcesFailed: 0,
  eventsUpserted: 2,
  errors: [],
};

beforeEach(() => {
  mockSql.mockReset();
});

describe('refreshSmartPatientContext', () => {
  it('skips when the EHR tenant has no enabled backend-services client', async () => {
    const loadBackendServicesConfig = vi.fn().mockResolvedValue(null);
    const startIngestRun = vi.fn();

    const result = await refreshSmartPatientContext(
      {
        ehrTenantId: 42,
        orgId: 7,
        patientResourceId: 'pat-1',
        localPatientId: 123,
      },
      { loadBackendServicesConfig, startIngestRun },
    );

    expect(result).toMatchObject({
      status: 'skipped',
      reason: 'missing_backend_services_config',
    });
    expect(startIngestRun).not.toHaveBeenCalled();
  });

  it('uses a backend-services token to stage, hydrate, and QDM-replay patient context resources', async () => {
    const loadBackendServicesConfig = vi.fn().mockResolvedValue(backendConfig);
    const requestBackendServiceToken = vi.fn().mockResolvedValue(tokenResult);
    const fhirClient = {
      search: vi.fn()
        .mockResolvedValueOnce({
          resources: [encounterResource],
          nextUrl: 'https://ehr.example.test/fhir/R4/Encounter?page=2',
          audit: {},
        })
        .mockResolvedValueOnce({ resources: [observationResource], audit: {} }),
    };
    const startIngestRun = vi.fn().mockResolvedValue(ingestRun);
    const stageFhirResource = vi.fn()
      .mockResolvedValueOnce({ id: 101 })
      .mockResolvedValueOnce({ id: 102 });
    const hydrateStagedRunToEdw = vi.fn().mockResolvedValue(edwHydration);
    const finishIngestRun = vi.fn().mockResolvedValue({
      run: { ...ingestRun, status: 'succeeded' },
      qdmBridge,
    });

    const result = await refreshSmartPatientContext(
      {
        ehrTenantId: 42,
        orgId: 7,
        patientResourceId: 'pat-1',
        localPatientId: 123,
        requestedSince: '2026-06-01T00:00:00Z',
        resourceTypes: ['Encounter', 'Condition', 'Observation'],
        pageSize: 25,
        maxPages: 3,
        smartLaunchSessionId: '11111111-1111-4111-8111-111111111111',
        triggeredBy: 'smart_launch',
      },
      {
        loadBackendServicesConfig,
        requestBackendServiceToken,
        fhirClient,
        startIngestRun,
        stageFhirResource,
        hydrateStagedRunToEdw,
        finishIngestRun,
      },
    );

    expect(result).toMatchObject({
      status: 'succeeded',
      ingestRunId: ingestRun.id,
      tokenMetadataId: tokenResult.tokenMetadata?.id,
      contextResources: {
        attempted: ['Encounter', 'Observation'],
        skipped: [{ resourceType: 'Condition', reason: 'missing_backend_search_scope' }],
        received: 2,
        staged: 2,
        remainingNextUrls: [{ resourceType: 'Encounter', nextUrl: 'https://ehr.example.test/fhir/R4/Encounter?page=2' }],
      },
      edwHydration,
      qdmBridge,
    });
    expect(requestBackendServiceToken).toHaveBeenCalledWith({
      config: backendConfig,
      scope: 'system/Encounter.rs system/Observation.rs',
      fetchImpl: undefined,
    });
    expect(fhirClient.search).toHaveBeenCalledWith(
      backendConfig.tenant,
      tokenResult.accessToken,
      'Encounter',
      { patient: 'pat-1', _lastUpdated: 'ge2026-06-01T00:00:00.000Z' },
      expect.objectContaining({ pageSize: 25, maxPages: 3, timeoutMs: 20_000, retryAttempts: 2 }),
    );
    expect(stageFhirResource).toHaveBeenCalledTimes(2);
    expect(hydrateStagedRunToEdw).toHaveBeenCalledWith({
      orgId: 7,
      ehrTenantId: 42,
      ingestRunId: ingestRun.id,
      resourceTypes: ['Encounter', 'Condition', 'Observation'],
      limit: 250,
    });
    expect(finishIngestRun).toHaveBeenCalledWith(expect.objectContaining({
      id: ingestRun.id,
      resourcesReceived: 2,
      resourcesStaged: 2,
      errorCount: 0,
      qdmBridge: {
        enabled: true,
        limit: 250,
        sourceSystem: 'smart-patient-context-refresh',
        failOnError: false,
      },
    }));
  });

  it('supports EDW-backed Procedure, AllergyIntolerance, and Immunization refreshes', async () => {
    const broadConfig: BackendServicesConfig = {
      ...backendConfig,
      scopesRequested: 'system/Procedure.rs system/AllergyIntolerance.rs system/Immunization.rs',
      scopesGranted: 'system/Procedure.rs system/AllergyIntolerance.rs system/Immunization.rs',
    };
    const broadTokenResult: BackendServiceTokenResult = {
      ...tokenResult,
      accessToken: {
        ...tokenResult.accessToken,
        scope: 'system/Procedure.rs system/AllergyIntolerance.rs system/Immunization.rs',
      },
      tokenResponse: {
        ...tokenResult.tokenResponse,
        scope: 'system/Procedure.rs system/AllergyIntolerance.rs system/Immunization.rs',
      },
    };
    const loadBackendServicesConfig = vi.fn().mockResolvedValue(broadConfig);
    const requestBackendServiceToken = vi.fn().mockResolvedValue(broadTokenResult);
    const fhirClient = {
      search: vi.fn()
        .mockResolvedValueOnce({ resources: [procedureResource], audit: {} })
        .mockResolvedValueOnce({ resources: [allergyResource], audit: {} })
        .mockResolvedValueOnce({ resources: [immunizationResource], audit: {} }),
    };
    const startIngestRun = vi.fn().mockResolvedValue(ingestRun);
    const stageFhirResource = vi.fn().mockResolvedValue({ id: 201 });
    const broadEdwHydration = {
      ...edwHydration,
      resourcesSeen: 3,
      resourcesHydrated: 3,
      rowsInserted: 3,
      byResourceType: {
        Procedure: { seen: 1, hydrated: 1, skipped: 0, failed: 0 },
        AllergyIntolerance: { seen: 1, hydrated: 1, skipped: 0, failed: 0 },
        Immunization: { seen: 1, hydrated: 1, skipped: 0, failed: 0 },
      },
    };
    const hydrateStagedRunToEdw = vi.fn().mockResolvedValue(broadEdwHydration);
    const finishIngestRun = vi.fn().mockResolvedValue({
      run: { ...ingestRun, status: 'succeeded' },
      qdmBridge,
    });

    const result = await refreshSmartPatientContext(
      {
        ehrTenantId: 42,
        orgId: 7,
        patientResourceId: 'pat-1',
        localPatientId: 123,
        resourceTypes: ['Procedure', 'AllergyIntolerance', 'Immunization'],
      },
      {
        loadBackendServicesConfig,
        requestBackendServiceToken,
        fhirClient,
        startIngestRun,
        stageFhirResource,
        hydrateStagedRunToEdw,
        finishIngestRun,
      },
    );

    expect(result).toMatchObject({
      status: 'succeeded',
      contextResources: {
        attempted: ['Procedure', 'AllergyIntolerance', 'Immunization'],
        received: 3,
        staged: 3,
      },
      edwHydration: broadEdwHydration,
    });
    expect(requestBackendServiceToken).toHaveBeenCalledWith({
      config: broadConfig,
      scope: 'system/Procedure.rs system/AllergyIntolerance.rs system/Immunization.rs',
      fetchImpl: undefined,
    });
    expect(fhirClient.search).toHaveBeenCalledTimes(3);
    expect(hydrateStagedRunToEdw).toHaveBeenCalledWith({
      orgId: 7,
      ehrTenantId: 42,
      ingestRunId: ingestRun.id,
      resourceTypes: ['Procedure', 'AllergyIntolerance', 'Immunization'],
      limit: 250,
    });
  });

  it('supports EDW-backed MedicationDispense and MedicationAdministration refreshes', async () => {
    const medicationConfig: BackendServicesConfig = {
      ...backendConfig,
      scopesRequested: 'system/MedicationDispense.rs system/MedicationAdministration.rs',
      scopesGranted: 'system/MedicationDispense.rs system/MedicationAdministration.rs',
    };
    const medicationTokenResult: BackendServiceTokenResult = {
      ...tokenResult,
      accessToken: {
        ...tokenResult.accessToken,
        scope: 'system/MedicationDispense.rs system/MedicationAdministration.rs',
      },
      tokenResponse: {
        ...tokenResult.tokenResponse,
        scope: 'system/MedicationDispense.rs system/MedicationAdministration.rs',
      },
    };
    const loadBackendServicesConfig = vi.fn().mockResolvedValue(medicationConfig);
    const requestBackendServiceToken = vi.fn().mockResolvedValue(medicationTokenResult);
    const fhirClient = {
      search: vi.fn()
        .mockResolvedValueOnce({ resources: [medicationDispenseResource], audit: {} })
        .mockResolvedValueOnce({ resources: [medicationAdministrationResource], audit: {} }),
    };
    const startIngestRun = vi.fn().mockResolvedValue(ingestRun);
    const stageFhirResource = vi.fn().mockResolvedValue({ id: 301 });
    const medicationEdwHydration = {
      ...edwHydration,
      resourcesSeen: 2,
      resourcesHydrated: 2,
      rowsInserted: 2,
      byResourceType: {
        MedicationDispense: { seen: 1, hydrated: 1, skipped: 0, failed: 0 },
        MedicationAdministration: { seen: 1, hydrated: 1, skipped: 0, failed: 0 },
      },
    };
    const hydrateStagedRunToEdw = vi.fn().mockResolvedValue(medicationEdwHydration);
    const finishIngestRun = vi.fn().mockResolvedValue({
      run: { ...ingestRun, status: 'succeeded' },
      qdmBridge,
    });

    const result = await refreshSmartPatientContext(
      {
        ehrTenantId: 42,
        orgId: 7,
        patientResourceId: 'pat-1',
        localPatientId: 123,
        resourceTypes: ['MedicationDispense', 'MedicationAdministration'],
      },
      {
        loadBackendServicesConfig,
        requestBackendServiceToken,
        fhirClient,
        startIngestRun,
        stageFhirResource,
        hydrateStagedRunToEdw,
        finishIngestRun,
      },
    );

    expect(result).toMatchObject({
      status: 'succeeded',
      contextResources: {
        attempted: ['MedicationDispense', 'MedicationAdministration'],
        received: 2,
        staged: 2,
      },
      edwHydration: medicationEdwHydration,
    });
    expect(requestBackendServiceToken).toHaveBeenCalledWith({
      config: medicationConfig,
      scope: 'system/MedicationDispense.rs system/MedicationAdministration.rs',
      fetchImpl: undefined,
    });
    expect(fhirClient.search).toHaveBeenCalledTimes(2);
    expect(hydrateStagedRunToEdw).toHaveBeenCalledWith({
      orgId: 7,
      ehrTenantId: 42,
      ingestRunId: ingestRun.id,
      resourceTypes: ['MedicationDispense', 'MedicationAdministration'],
      limit: 250,
    });
  });

  it('resumes a queued continuation from FHIR next URLs and carries forward remaining links', async () => {
    const loadBackendServicesConfig = vi.fn().mockResolvedValue(backendConfig);
    const requestBackendServiceToken = vi.fn().mockResolvedValue(tokenResult);
    const fhirClient = {
      search: vi.fn(),
      searchFromUrl: vi.fn().mockResolvedValueOnce({
        resources: [encounterResource],
        nextUrl: 'https://ehr.example.test/fhir/R4/Encounter?page=3',
        audit: {},
      }),
    };
    const startIngestRun = vi.fn().mockResolvedValue(ingestRun);
    const stageFhirResource = vi.fn().mockResolvedValue({ id: 101 });
    const hydrateStagedRunToEdw = vi.fn().mockResolvedValue({
      ...edwHydration,
      resourcesSeen: 1,
      resourcesHydrated: 1,
      rowsInserted: 1,
      byResourceType: {
        Encounter: { seen: 1, hydrated: 1, skipped: 0, failed: 0 },
      },
    });
    const finishIngestRun = vi.fn().mockResolvedValue({
      run: { ...ingestRun, status: 'succeeded' },
      qdmBridge,
    });

    const result = await refreshSmartPatientContext(
      {
        ehrTenantId: 42,
        orgId: 7,
        patientResourceId: 'pat-1',
        localPatientId: 123,
        resourceTypes: ['Encounter'],
        continuation: [
          { resourceType: 'Encounter', nextUrl: 'https://ehr.example.test/fhir/R4/Encounter?page=2' },
        ],
        continuationDepth: 1,
        maxPages: 2,
      },
      {
        loadBackendServicesConfig,
        requestBackendServiceToken,
        fhirClient,
        startIngestRun,
        stageFhirResource,
        hydrateStagedRunToEdw,
        finishIngestRun,
      },
    );

    expect(result).toMatchObject({
      status: 'succeeded',
      contextResources: {
        attempted: ['Encounter'],
        received: 1,
        staged: 1,
        remainingNextUrls: [{ resourceType: 'Encounter', nextUrl: 'https://ehr.example.test/fhir/R4/Encounter?page=3' }],
      },
    });
    expect(fhirClient.search).not.toHaveBeenCalled();
    expect(fhirClient.searchFromUrl).toHaveBeenCalledWith(
      backendConfig.tenant,
      tokenResult.accessToken,
      'Encounter',
      'https://ehr.example.test/fhir/R4/Encounter?page=2',
      expect.objectContaining({ maxPages: 2, timeoutMs: 20_000, retryAttempts: 2 }),
    );
    expect(finishIngestRun).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        contextResources: expect.objectContaining({
          remainingNextUrls: [
            { resourceType: 'Encounter', nextUrl: 'https://ehr.example.test/fhir/R4/Encounter?page=3' },
          ],
        }),
      }),
    }));
  });

  it('marks the ingest run failed when backend token acquisition fails after the run starts', async () => {
    const loadBackendServicesConfig = vi.fn().mockResolvedValue(backendConfig);
    const requestBackendServiceToken = vi.fn().mockRejectedValue(new Error('backend token denied'));
    const startIngestRun = vi.fn().mockResolvedValue(ingestRun);
    const failIngestRun = vi.fn().mockResolvedValue({ ...ingestRun, status: 'failed' });

    const result = await refreshSmartPatientContext(
      {
        ehrTenantId: 42,
        orgId: 7,
        patientResourceId: 'pat-1',
        localPatientId: 123,
      },
      {
        loadBackendServicesConfig,
        requestBackendServiceToken,
        startIngestRun,
        failIngestRun,
      },
    );

    expect(result).toMatchObject({
      status: 'failed',
      errorMessage: 'backend token denied',
      ingestRunId: ingestRun.id,
    });
    expect(failIngestRun).toHaveBeenCalledWith(expect.objectContaining({
      id: ingestRun.id,
      resourcesReceived: 0,
      resourcesStaged: 0,
      errorMessage: 'backend token denied',
    }));
  });
});
