// =============================================================================
// Unit tests - reconcilePatient orchestration.
//
// Bridges enterprise identity resolution to the legacy phm_edw.patient row:
//   - resolve the person
//   - if that person already has a linked legacy patient, REUSE it (dedup)
//   - otherwise create the legacy patient row and link it
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FhirResource } from '../types.js';

// reconcilePatient pulls in the default Postgres repository for its fallback
// deps; all deps are injected in these tests, so a no-op sql mock is enough to
// keep the db client from requiring DATABASE_URL at import time.
vi.mock('@medgnosis/db', () => ({ sql: Object.assign(vi.fn(), { json: (v: unknown) => v }) }));

import { reconcilePatient } from './reconcilePatient.js';
import type { ResolvePatientIdentityResult } from './resolvePatientIdentity.js';

function patient(): FhirResource {
  return {
    resourceType: 'Patient',
    id: 'pat-1',
    name: [{ use: 'official', family: 'Hopper', given: ['Grace'] }],
    birthDate: '1906-12-09',
    gender: 'female',
    identifier: [{ system: 'urn:oid:epic', value: 'E-100' }],
  };
}

function deps(resolved: ResolvePatientIdentityResult, existingLegacyId: number | null) {
  return {
    resolveIdentity: vi.fn().mockResolvedValue(resolved),
    repository: {} as never,
    findLegacyPatientId: vi.fn().mockResolvedValue(existingLegacyId),
    linkLegacyPatient: vi.fn().mockResolvedValue(undefined),
  };
}

let insertLegacyPatient: ReturnType<typeof vi.fn>;
beforeEach(() => {
  insertLegacyPatient = vi.fn().mockResolvedValue(456);
});

describe('reconcilePatient', () => {
  it('creates and links a legacy patient row when the person is new', async () => {
    const d = deps({ personId: 10, matchGrade: 'none', isNew: true, needsReview: false }, null);
    const result = await reconcilePatient(
      { patient: patient(), ehrTenantId: 42, sourceSystem: 'epic', insertLegacyPatient },
      d,
    );
    expect(result).toEqual({ localPatientId: 456, personId: 10, matchGrade: 'none', reusedExisting: false });
    expect(insertLegacyPatient).toHaveBeenCalledTimes(1);
    expect(d.linkLegacyPatient).toHaveBeenCalledWith(456, 10, 42);
  });

  it('reuses the existing legacy patient row when the person already has one (dedup)', async () => {
    const d = deps({ personId: 10, matchGrade: 'certain', isNew: false, needsReview: false }, 123);
    const result = await reconcilePatient(
      { patient: patient(), ehrTenantId: 99, sourceSystem: 'oracle_cerner', insertLegacyPatient },
      d,
    );
    expect(result).toEqual({ localPatientId: 123, personId: 10, matchGrade: 'certain', reusedExisting: true });
    // No new legacy patient row, no re-link.
    expect(insertLegacyPatient).not.toHaveBeenCalled();
    expect(d.linkLegacyPatient).not.toHaveBeenCalled();
  });

  it('passes source context through to identity resolution', async () => {
    const d = deps({ personId: 7, matchGrade: 'none', isNew: true, needsReview: false }, null);
    await reconcilePatient(
      { patient: patient(), ehrTenantId: 42, sourceSystem: 'epic', insertLegacyPatient },
      d,
    );
    expect(d.resolveIdentity).toHaveBeenCalledWith(
      { patient: patient(), ehrTenantId: 42, sourceSystem: 'epic' },
      d.repository,
    );
  });
});
