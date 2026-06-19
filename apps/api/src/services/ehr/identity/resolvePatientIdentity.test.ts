// =============================================================================
// Unit tests - deterministic patient identity resolution (DI repository)
//
// The resolver is the single chokepoint every inbound FHIR Patient passes
// through before it can create or attach to a person. Matching tiers:
//   1. strong identifier (system + value) -> exactly one person  => certain
//   2. strong identifier -> multiple persons                     => possible (conflict/overlay)
//   3. no identifier match, demographic floor key hit            => possible (provisional + review)
//   4. nothing matches                                           => none (new person)
// Demographic-only matches NEVER auto-merge (overlay safety): they mint a new
// provisional person and enqueue a steward review.
// =============================================================================

import { beforeEach, describe, expect, it } from 'vitest';
import type { FhirResource } from '../types.js';
import { resolvePatientIdentity } from './resolvePatientIdentity.js';
import type {
  IdentifierMatch,
  IdentityRepository,
  PersonProfile,
  ReviewQueueInput,
} from './resolvePatientIdentity.js';
import type { NormalizedIdentifier } from './identityKeys.js';

interface PersonRow {
  personId: number;
  identifiers: NormalizedIdentifier[];
  demographicKey: string | null;
  profile: PersonProfile;
}

class FakeIdentityRepository implements IdentityRepository {
  persons: PersonRow[] = [];
  reviews: ReviewQueueInput[] = [];
  private nextId = 1;

  seed(person: Omit<PersonRow, 'personId'>): number {
    const personId = this.nextId++;
    this.persons.push({ personId, ...person });
    return personId;
  }

  async findPersonIdsByIdentifiers(identifiers: NormalizedIdentifier[]): Promise<IdentifierMatch[]> {
    const matches: IdentifierMatch[] = [];
    for (const person of this.persons) {
      for (const seeded of person.identifiers) {
        const hit = identifiers.find((i) => i.strong && i.system === seeded.system && i.value === seeded.value);
        if (hit) matches.push({ personId: person.personId, system: hit.system, value: hit.value });
      }
    }
    return matches;
  }

  async findPersonIdsByDemographicKey(key: string): Promise<number[]> {
    return this.persons.filter((p) => p.demographicKey === key).map((p) => p.personId);
  }

  async createPerson(profile: PersonProfile): Promise<number> {
    const personId = this.nextId++;
    this.persons.push({ personId, identifiers: [], demographicKey: null, profile });
    return personId;
  }

  async attachIdentifiers(personId: number, identifiers: NormalizedIdentifier[]): Promise<void> {
    const person = this.persons.find((p) => p.personId === personId);
    if (!person) throw new Error(`unknown person ${personId}`);
    for (const identifier of identifiers) {
      if (!person.identifiers.some((i) => i.system === identifier.system && i.value === identifier.value)) {
        person.identifiers.push(identifier);
      }
    }
  }

  async upsertDemographicKey(personId: number, key: string): Promise<void> {
    const person = this.persons.find((p) => p.personId === personId);
    if (person) person.demographicKey = key;
  }

  async enqueueReview(input: ReviewQueueInput): Promise<void> {
    this.reviews.push(input);
  }
}

function patient(overrides: Record<string, unknown> = {}): FhirResource {
  return {
    resourceType: 'Patient',
    id: 'pat-1',
    name: [{ use: 'official', family: 'Hopper', given: ['Grace'] }],
    birthDate: '1906-12-09',
    gender: 'female',
    identifier: [{ system: 'urn:oid:epic', value: 'E-100' }],
    ...overrides,
  };
}

let repo: FakeIdentityRepository;
beforeEach(() => {
  repo = new FakeIdentityRepository();
});

describe('resolvePatientIdentity', () => {
  it('mints a new person when nothing matches (grade none)', async () => {
    const result = await resolvePatientIdentity({ patient: patient(), ehrTenantId: 1, sourceSystem: 'epic' }, repo);
    expect(result.matchGrade).toBe('none');
    expect(result.isNew).toBe(true);
    expect(result.needsReview).toBe(false);
    expect(repo.persons).toHaveLength(1);
    expect(repo.persons[0]?.identifiers[0]?.value).toBe('E-100');
    expect(repo.reviews).toHaveLength(0);
  });

  it('attaches to the existing person on a strong identifier match (grade certain)', async () => {
    const existing = repo.seed({
      identifiers: [{ system: 'urn:oid:epic', value: 'E-100', typeCode: 'MR', strong: true }],
      demographicKey: null,
      profile: { firstName: 'Grace', lastName: 'Hopper', dateOfBirth: '1906-12-09', sex: 'female' },
    });
    const result = await resolvePatientIdentity({ patient: patient(), ehrTenantId: 1, sourceSystem: 'epic' }, repo);
    expect(result.matchGrade).toBe('certain');
    expect(result.isNew).toBe(false);
    expect(result.personId).toBe(existing);
    expect(repo.persons).toHaveLength(1);
    expect(repo.reviews).toHaveLength(0);
  });

  it('does not create a duplicate when the same EHR patient is ingested twice', async () => {
    const input = { patient: patient(), ehrTenantId: 1, sourceSystem: 'epic' };
    const first = await resolvePatientIdentity(input, repo);
    const second = await resolvePatientIdentity(input, repo);
    expect(second.personId).toBe(first.personId);
    expect(repo.persons).toHaveLength(1);
  });

  it('unifies the same person arriving from two different tenants via a shared strong identifier', async () => {
    const epic = await resolvePatientIdentity({ patient: patient(), ehrTenantId: 1, sourceSystem: 'epic' }, repo);
    // Cerner feed carries the same national identifier plus its own MRN.
    const cerner = await resolvePatientIdentity(
      {
        patient: patient({
          identifier: [
            { system: 'urn:oid:epic', value: 'E-100' },
            { system: 'urn:oid:cerner', value: 'C-200' },
          ],
        }),
        ehrTenantId: 2,
        sourceSystem: 'oracle_cerner',
      },
      repo,
    );
    expect(cerner.personId).toBe(epic.personId);
    expect(cerner.matchGrade).toBe('certain');
    expect(repo.persons).toHaveLength(1);
    // The Cerner-local identifier is now attached to the unified person.
    expect(repo.persons[0]?.identifiers.map((i) => i.value).sort()).toEqual(['C-200', 'E-100']);
  });

  it('routes a demographic-only match to review and mints a provisional person (no silent overlay)', async () => {
    repo.seed({
      identifiers: [{ system: 'urn:oid:other', value: 'OTHER-1', typeCode: 'MR', strong: true }],
      demographicKey: 'hoppergrace1906-12-09female',
      profile: { firstName: 'Grace', lastName: 'Hopper', dateOfBirth: '1906-12-09', sex: 'female' },
    });
    const result = await resolvePatientIdentity(
      { patient: patient({ identifier: [{ system: 'urn:oid:epic', value: 'E-100' }] }), ehrTenantId: 1, sourceSystem: 'epic' },
      repo,
    );
    expect(result.matchGrade).toBe('possible');
    expect(result.isNew).toBe(true);
    expect(result.needsReview).toBe(true);
    expect(repo.persons).toHaveLength(2); // provisional, not merged
    expect(repo.reviews).toHaveLength(1);
    expect(repo.reviews[0]?.candidatePersonIds).toEqual([1]);
  });

  it('flags an identifier shared across multiple persons as a conflict for steward review', async () => {
    const a = repo.seed({
      identifiers: [{ system: 'urn:oid:epic', value: 'E-100', typeCode: 'MR', strong: true }],
      demographicKey: null,
      profile: { firstName: 'Grace', lastName: 'Hopper', dateOfBirth: '1906-12-09', sex: 'female' },
    });
    const b = repo.seed({
      identifiers: [{ system: 'urn:oid:epic', value: 'E-100', typeCode: 'MR', strong: true }],
      demographicKey: null,
      profile: { firstName: 'Grace', lastName: 'Hopper', dateOfBirth: '1906-12-09', sex: 'female' },
    });
    const result = await resolvePatientIdentity({ patient: patient(), ehrTenantId: 1, sourceSystem: 'epic' }, repo);
    expect(result.matchGrade).toBe('possible');
    expect(result.needsReview).toBe(true);
    expect(result.isNew).toBe(false);
    expect(result.personId).toBe(Math.min(a, b)); // resolve to the lowest existing id, do not split further
    expect(repo.reviews[0]?.candidatePersonIds.sort()).toEqual([a, b].sort());
    expect(repo.persons).toHaveLength(2); // no new person created
  });

  it('ignores weak (system-less) identifiers for cross-source matching', async () => {
    repo.seed({
      identifiers: [{ system: '', value: 'E-100', typeCode: null, strong: false }],
      demographicKey: null,
      profile: { firstName: 'Grace', lastName: 'Hopper', dateOfBirth: '1906-12-09', sex: 'female' },
    });
    const result = await resolvePatientIdentity(
      { patient: patient({ identifier: [{ value: 'E-100' }] }), ehrTenantId: 1, sourceSystem: 'epic' },
      repo,
    );
    // No strong identifier and no demographic-key seed -> brand new person.
    expect(result.matchGrade).toBe('none');
    expect(result.isNew).toBe(true);
    expect(repo.persons).toHaveLength(2);
  });
});
