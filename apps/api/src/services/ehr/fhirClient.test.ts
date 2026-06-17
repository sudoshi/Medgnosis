import { afterEach, describe, expect, it, vi } from 'vitest';
import { FhirClient, FhirClientError, parseRetryAfter } from './fhirClient.js';
import type { FetchLike } from './types.js';

const tenant = {
  vendor: 'smart_generic',
  fhirBaseUrl: 'https://ehr.example/fhir',
};

const token = {
  accessToken: 'ehr-token',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FhirClient.readResource', () => {
  it('reads a FHIR resource with bearer authorization and FHIR accept headers', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
      fhirResponse({ resourceType: 'Patient', id: 'pat-1' }),
    );
    const client = new FhirClient({ fetchImpl: fetchMock });

    const result = await client.readResource(tenant, token, 'Patient', 'pat-1');

    expect(result.resource).toMatchObject({ resourceType: 'Patient', id: 'pat-1' });
    expect(result.audit).toMatchObject({
      interaction: 'read',
      resourceType: 'Patient',
      status: 200,
      attemptCount: 1,
      retryCount: 0,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ehr.example/fhir/Patient/pat-1',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          accept: 'application/fhir+json, application/json',
          authorization: 'Bearer ehr-token',
        }),
      }),
    );
  });

  it('retries 503 responses and respects Retry-After', async () => {
    const sleep = vi.fn(async (_ms: number) => undefined);
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(
        fhirResponse(
          {
            resourceType: 'OperationOutcome',
            issue: [{ severity: 'error', code: 'transient', diagnostics: 'maintenance' }],
          },
          503,
          { 'retry-after': '2' },
        ),
      )
      .mockResolvedValueOnce(fhirResponse({ resourceType: 'Patient', id: 'pat-1' }));
    const client = new FhirClient({ fetchImpl: fetchMock, sleep });

    const result = await client.readResource(tenant, token, 'Patient', 'pat-1');

    expect(result.resource.id).toBe('pat-1');
    expect(result.audit.attemptCount).toBe(2);
    expect(result.audit.retryCount).toBe(1);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it('retries transient fetch errors with exponential backoff', async () => {
    const sleep = vi.fn(async (_ms: number) => undefined);
    const fetchMock = vi
      .fn<FetchLike>()
      .mockRejectedValueOnce(new TypeError('socket closed'))
      .mockResolvedValueOnce(fhirResponse({ resourceType: 'Patient', id: 'pat-2' }));
    const client = new FhirClient({
      fetchImpl: fetchMock,
      sleep,
      retryBaseDelayMs: 25,
      retryMaxDelayMs: 500,
    });

    const result = await client.readResource(tenant, token, 'Patient', 'pat-2');

    expect(result.resource.id).toBe('pat-2');
    expect(result.audit.retryCount).toBe(1);
    expect(sleep).toHaveBeenCalledWith(25);
  });

  it('throws a typed FhirClientError for OperationOutcome failures', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
      fhirResponse(
        {
          resourceType: 'OperationOutcome',
          issue: [{ severity: 'error', code: 'forbidden', diagnostics: 'Access denied' }],
        },
        403,
      ),
    );
    const client = new FhirClient({ fetchImpl: fetchMock, retryAttempts: 0 });

    const promise = client.readResource(tenant, token, 'Patient', 'pat-1');

    await expect(promise).rejects.toBeInstanceOf(FhirClientError);
    await expect(promise).rejects.toMatchObject({
      status: 403,
      outcome: {
        classification: 'access_denied',
        retryable: false,
        message: 'Access denied',
      },
    });
  });
});

describe('FhirClient.search', () => {
  it('adds vendor _count defaults and follows Bundle next links', async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(
        fhirResponse({
          resourceType: 'Bundle',
          type: 'searchset',
          total: 2,
          link: [{ relation: 'next', url: 'https://ehr.example/fhir/Observation?page=2' }],
          entry: [{ resource: { resourceType: 'Observation', id: 'obs-1' } }],
        }),
      )
      .mockResolvedValueOnce(
        fhirResponse({
          resourceType: 'Bundle',
          type: 'searchset',
          entry: [{ resource: { resourceType: 'Observation', id: 'obs-2' } }],
        }),
      );
    const client = new FhirClient({ fetchImpl: fetchMock });

    const result = await client.search(tenant, token, 'Observation', { patient: 'pat-1' });

    expect(result.resources.map((resource) => resource.id)).toEqual(['obs-1', 'obs-2']);
    expect(result.audit).toMatchObject({
      interaction: 'search',
      resourceType: 'Observation',
      pageCount: 2,
      requestCount: 2,
      searchParamKeys: ['_count', 'patient'],
    });
    expect(result.nextUrl).toBeUndefined();

    const firstUrl = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(firstUrl.searchParams.get('patient')).toBe('pat-1');
    expect(firstUrl.searchParams.get('_count')).toBe('100');
    expect(fetchMock.mock.calls[1]![0]).toBe('https://ehr.example/fhir/Observation?page=2');
  });

  it('returns a remaining nextUrl when maxPages is reached', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
      fhirResponse({
        resourceType: 'Bundle',
        type: 'searchset',
        link: [{ relation: 'next', url: 'Observation?page=2' }],
        entry: [{ resource: { resourceType: 'Observation', id: 'obs-1' } }],
      }),
    );
    const client = new FhirClient({ fetchImpl: fetchMock });

    const result = await client.search(
      tenant,
      token,
      'Observation',
      { patient: 'pat-1' },
      { maxPages: 1 },
    );

    expect(result.resources).toHaveLength(1);
    expect(result.nextUrl).toBe('https://ehr.example/fhir/Observation?page=2');
    expect(result.bundle.link?.[0]?.url).toBe('https://ehr.example/fhir/Observation?page=2');
  });

  it('rejects next links outside the tenant FHIR base URL before sending bearer tokens', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValueOnce(
      fhirResponse({
        resourceType: 'Bundle',
        type: 'searchset',
        link: [{ relation: 'next', url: 'https://attacker.example/fhir/Observation?page=2' }],
        entry: [{ resource: { resourceType: 'Observation', id: 'obs-1' } }],
      }),
    );
    const client = new FhirClient({ fetchImpl: fetchMock });

    await expect(client.search(tenant, token, 'Observation', { patient: 'pat-1' })).rejects.toMatchObject({
      outcome: {
        classification: 'invalid_request',
        message: 'FHIR search Bundle next link points outside the tenant FHIR base URL',
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('parseRetryAfter', () => {
  it('parses seconds and HTTP-date values', () => {
    expect(parseRetryAfter('3')).toBe(3000);
    expect(parseRetryAfter('Tue, 16 Jun 2026 10:00:03 GMT', Date.parse('2026-06-16T10:00:00Z'))).toBe(
      3000,
    );
  });
});

function fhirResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/fhir+json',
      ...headers,
    },
  });
}
