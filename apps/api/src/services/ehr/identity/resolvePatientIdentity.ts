// =============================================================================
// Deterministic patient identity resolution — the single ingest chokepoint.
//
// Every inbound FHIR Patient (SMART launch, bulk export, aggregator, QHIN)
// passes through resolvePatientIdentity() before it can create or attach to a
// phm_edw.person. This is the deterministic tier of the EMPI: strong identifier
// match, then a demographic floor key per the HL7 Identity Matching IG.
//
// Safety invariant: demographic-only matches NEVER auto-merge. A false merge
// (overlay) attributes one patient's allergies/meds to another and is far more
// dangerous than a false split, so demographic hits mint a provisional person
// and enqueue a steward review instead of merging.
// =============================================================================

import type { FhirResource } from '../types.js';
import {
  demographicMatchKey,
  extractPatientIdentifiers,
  normalizeDemographics,
  type NormalizedDemographics,
  type NormalizedIdentifier,
} from './identityKeys.js';

export type MatchGrade = 'certain' | 'possible' | 'none';

export interface IdentifierMatch {
  personId: number;
  system: string;
  value: string;
}

export interface PersonProfile {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: string | null;
}

export interface ReviewQueueInput {
  /** The person the inbound record resolved to (provisional, or the conflict winner). */
  personId: number;
  /** Existing persons a steward should consider merging with personId. */
  candidatePersonIds: number[];
  reason: 'demographic_only_match' | 'identifier_conflict';
  ehrTenantId: number;
  sourceSystem: string;
  demographicKey: string;
}

export interface IdentityRepository {
  findPersonIdsByIdentifiers(identifiers: NormalizedIdentifier[]): Promise<IdentifierMatch[]>;
  findPersonIdsByDemographicKey(key: string): Promise<number[]>;
  createPerson(profile: PersonProfile, sourceSystem: string, ehrTenantId: number): Promise<number>;
  attachIdentifiers(
    personId: number,
    identifiers: NormalizedIdentifier[],
    sourceSystem: string,
    ehrTenantId: number,
  ): Promise<void>;
  upsertDemographicKey(personId: number, key: string): Promise<void>;
  enqueueReview(input: ReviewQueueInput): Promise<void>;
}

export interface ResolvePatientIdentityInput {
  patient: FhirResource;
  ehrTenantId: number;
  /** Source-system label retained for identifier provenance (e.g. 'epic', 'oracle_cerner', 'aggregator'). */
  sourceSystem: string;
}

export interface ResolvePatientIdentityResult {
  personId: number;
  matchGrade: MatchGrade;
  isNew: boolean;
  needsReview: boolean;
}

function distinct(values: number[]): number[] {
  return Array.from(new Set(values));
}

function profileFromDemographics(demographics: NormalizedDemographics): PersonProfile {
  return {
    firstName: demographics.firstName,
    lastName: demographics.lastName,
    dateOfBirth: demographics.dateOfBirth,
    sex: demographics.sex,
  };
}

export async function resolvePatientIdentity(
  input: ResolvePatientIdentityInput,
  repo: IdentityRepository,
): Promise<ResolvePatientIdentityResult> {
  const { patient, ehrTenantId, sourceSystem } = input;
  const demographics = normalizeDemographics(patient);
  const key = demographicMatchKey(demographics);
  const identifiers = extractPatientIdentifiers(patient);
  const strongIdentifiers = identifiers.filter((identifier) => identifier.strong);

  // Tier 1 — strong identifier match.
  const identifierMatches = strongIdentifiers.length > 0
    ? await repo.findPersonIdsByIdentifiers(strongIdentifiers)
    : [];
  const matchedPersonIds = distinct(identifierMatches.map((match) => match.personId));

  if (matchedPersonIds.length === 1) {
    const personId = matchedPersonIds[0] as number;
    await repo.attachIdentifiers(personId, strongIdentifiers, sourceSystem, ehrTenantId);
    await repo.upsertDemographicKey(personId, key);
    return { personId, matchGrade: 'certain', isNew: false, needsReview: false };
  }

  if (matchedPersonIds.length > 1) {
    // Identifier shared across multiple persons — existing duplicates/overlay.
    // Resolve ingest to the lowest id deterministically; let a steward merge.
    const personId = Math.min(...matchedPersonIds);
    await repo.enqueueReview({
      personId,
      candidatePersonIds: matchedPersonIds,
      reason: 'identifier_conflict',
      ehrTenantId,
      sourceSystem,
      demographicKey: key,
    });
    return { personId, matchGrade: 'possible', isNew: false, needsReview: true };
  }

  // Tier 2 — demographic floor key.
  const demographicMatches = distinct(await repo.findPersonIdsByDemographicKey(key));
  const personId = await repo.createPerson(profileFromDemographics(demographics), sourceSystem, ehrTenantId);
  await repo.attachIdentifiers(personId, strongIdentifiers, sourceSystem, ehrTenantId);
  await repo.upsertDemographicKey(personId, key);

  if (demographicMatches.length > 0) {
    // Provisional person minted; never auto-merge on demographics alone.
    await repo.enqueueReview({
      personId,
      candidatePersonIds: demographicMatches,
      reason: 'demographic_only_match',
      ehrTenantId,
      sourceSystem,
      demographicKey: key,
    });
    return { personId, matchGrade: 'possible', isNew: true, needsReview: true };
  }

  return { personId, matchGrade: 'none', isNew: true, needsReview: false };
}
