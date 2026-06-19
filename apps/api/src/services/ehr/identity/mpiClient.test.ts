// =============================================================================
// Unit tests - FHIR Patient/$match MPI client (SanteMPI probabilistic tier)
// =============================================================================

import { describe, expect, it, vi } from 'vitest';
import { FhirMpiClient } from './mpiClient.js';

const MASTER_SYSTEM = 'urn:oid:2.16.840.1.113883.3.999.mpi';

function matchBundle(): unknown {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    entry: [
      {
        resource: {
          resourceType: 'Patient',
          id: 'mpi-1',
          identifier: [
            { system: 'urn:oid:epic', value: 'E-1' },
            { system: MASTER_SYSTEM, value: 'MASTER-1' },
          ],
        },
        search: {
          score: 0.97,
          extension: [
            { url: 'http://hl7.org/fhir/StructureDefinition/match-grade', valueCode: 'certain' },
          ],
        },
      },
      {
        resource: {
          resourceType: 'Patient',
          id: 'mpi-2',
          identifier: [{ system: MASTER_SYSTEM, value: 'MASTER-2' }],
        },
        search: { score: 0.62 },
      },
    ],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/fhir+json' },
  });
}

const demographics = { firstName: 'Grace', lastName: 'Hopper', dateOfBirth: '1906-12-09', sex: 'female' };

describe('FhirMpiClient.match', () => {
  it('POSTs a Parameters resource with demographics to Patient/$match', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(matchBundle()));
    const client = new FhirMpiClient({
      baseUrl: 'https://mpi.internal/fhir',
      masterIdSystem: MASTER_SYSTEM,
      fetchImpl,
    });

    await client.match(demographics);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://mpi.internal/fhir/Patient/$match');
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/fhir+json');
    const body = JSON.parse(init.body as string);
    expect(body.resourceType).toBe('Parameters');
    const resourceParam = body.parameter.find((p: { name: string }) => p.name === 'resource');
    expect(resourceParam.resource).toMatchObject({
      resourceType: 'Patient',
      birthDate: '1906-12-09',
      gender: 'female',
      name: [{ family: 'Hopper', given: ['Grace'] }],
    });
    // SanteDB's FHIR $match NREs without a count parameter — always send one.
    const countParam = body.parameter.find((p: { name: string }) => p.name === 'count');
    expect(countParam.valueInteger).toBeGreaterThan(0);
  });

  it('parses candidates with master identifier, score, and grade, sorted by score desc', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(matchBundle()));
    const client = new FhirMpiClient({ baseUrl: 'https://mpi.internal/fhir', masterIdSystem: MASTER_SYSTEM, fetchImpl });

    const candidates = await client.match(demographics);

    expect(candidates).toEqual([
      { masterIdentifier: { system: MASTER_SYSTEM, value: 'MASTER-1' }, score: 0.97, grade: 'certain' },
      { masterIdentifier: { system: MASTER_SYSTEM, value: 'MASTER-2' }, score: 0.62, grade: null },
    ]);
  });

  it('sends a bearer token when configured', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ resourceType: 'Bundle', entry: [] }));
    const client = new FhirMpiClient({
      baseUrl: 'https://mpi.internal/fhir',
      masterIdSystem: MASTER_SYSTEM,
      fetchImpl,
      accessToken: 'mpi-token',
    });
    await client.match(demographics);
    expect(fetchImpl.mock.calls[0]![1].headers.authorization).toBe('Bearer mpi-token');
  });

  it('falls back to the candidate resource id (under the master system) when no master identifier is present', async () => {
    // SanteDB returns candidates keyed by their stable resource id, not an
    // identifier in our configured master system.
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        resourceType: 'Bundle',
        entry: [{ resource: { resourceType: 'Patient', id: 'mdm-abc', identifier: [{ system: 'urn:oid:epic', value: 'x' }] }, search: { score: 0.8 } }],
      }),
    );
    const client = new FhirMpiClient({ baseUrl: 'https://mpi.internal/fhir', masterIdSystem: MASTER_SYSTEM, fetchImpl });
    expect(await client.match(demographics)).toEqual([
      { masterIdentifier: { system: MASTER_SYSTEM, value: 'mdm-abc' }, score: 0.8, grade: null },
    ]);
  });

  it('drops candidates with neither a master identifier nor a resource id, and returns [] on empty bundle', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        resourceType: 'Bundle',
        entry: [{ resource: { resourceType: 'Patient' }, search: { score: 0.9 } }],
      }),
    );
    const client = new FhirMpiClient({ baseUrl: 'https://mpi.internal/fhir', masterIdSystem: MASTER_SYSTEM, fetchImpl });
    expect(await client.match(demographics)).toEqual([]);
  });

  it('throws on a non-OK response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ resourceType: 'OperationOutcome' }, 500));
    const client = new FhirMpiClient({ baseUrl: 'https://mpi.internal/fhir', masterIdSystem: MASTER_SYSTEM, fetchImpl });
    await expect(client.match(demographics)).rejects.toThrow(/match/i);
  });
});
