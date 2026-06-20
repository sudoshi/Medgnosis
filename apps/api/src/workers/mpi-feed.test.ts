// =============================================================================
// Unit tests - MPI feed worker processor
// =============================================================================

import { describe, expect, it, vi } from 'vitest';

// identityRepository (the processor's default) imports @medgnosis/db.
vi.mock('@medgnosis/db', () => ({ sql: Object.assign(vi.fn(), { json: (v: unknown) => v }) }));

import { processMpiFeed } from './mpi-feed.js';
import type { MpiClientConfig } from '../services/ehr/identity/mpiConfig.js';

const demographics = { firstName: 'Grace', lastName: 'Hopper', dateOfBirth: '1906-12-09', sex: 'female' };
const jobData = { personId: 42, demographics, ehrTenantId: 7 };

function fakeConfig(candidates: Array<{ masterIdentifier: { system: string; value: string }; score: number; grade: null }>) {
  return {
    masterIdSystem: 'urn:mpi',
    autoThreshold: 0.9,
    reviewThreshold: 0.6,
    client: {
      feed: vi.fn().mockResolvedValue('local-id'),
      match: vi.fn().mockResolvedValue(candidates),
    },
  } as unknown as MpiClientConfig;
}

describe('processMpiFeed', () => {
  it('no-ops when the MPI is disabled (no config)', async () => {
    const repository = { attachIdentifiers: vi.fn() };
    const result = await processMpiFeed(jobData, { config: undefined, repository });
    expect(result).toEqual({ fed: false, masterStored: false });
    expect(repository.attachIdentifiers).not.toHaveBeenCalled();
  });

  it('feeds, learns the master id from the self-match, and stores it on the person', async () => {
    const repository = { attachIdentifiers: vi.fn().mockResolvedValue(undefined) };
    const config = fakeConfig([{ masterIdentifier: { system: 'urn:mpi', value: 'MASTER-9' }, score: 0.7, grade: null }]);
    const result = await processMpiFeed(jobData, { config, repository });

    expect(result).toEqual({ fed: true, masterStored: true });
    expect(config.client.feed).toHaveBeenCalledWith(demographics);
    expect(repository.attachIdentifiers).toHaveBeenCalledWith(
      42,
      [{ system: 'urn:mpi', value: 'MASTER-9', typeCode: null, strong: true }],
      'mpi-feed',
      7,
    );
  });

  it('feeds but stores nothing when the self-match returns no candidate', async () => {
    const repository = { attachIdentifiers: vi.fn() };
    const config = fakeConfig([]);
    const result = await processMpiFeed(jobData, { config, repository });
    expect(result).toEqual({ fed: true, masterStored: false });
    expect(repository.attachIdentifiers).not.toHaveBeenCalled();
  });
});
