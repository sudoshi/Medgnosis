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
import type { MpiClient } from './mpiClient.js';
import { decideProbabilisticMatch, type ProbabilisticThresholds } from './probabilisticMatch.js';

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

/**
 * Optional probabilistic (MPI) tier. When supplied, it is consulted only after
 * the deterministic tiers find nothing — never to override a deterministic
 * match. Omit it entirely (the default) for deterministic-only resolution.
 */
export interface MpiResolution extends ProbabilisticThresholds {
  client: MpiClient;
  /** Assigning-authority system used to store the MPI master id on a person. */
  masterIdSystem: string;
}

export async function resolvePatientIdentity(
  input: ResolvePatientIdentityInput,
  repo: IdentityRepository,
  mpi?: MpiResolution,
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

  // Tier 3 — probabilistic (MPI), only when deterministic tiers found nothing.
  if (demographicMatches.length === 0 && mpi) {
    const probabilistic = await resolveProbabilistic(
      { demographics, key, strongIdentifiers, ehrTenantId, sourceSystem },
      repo,
      mpi,
    );
    if (probabilistic) return probabilistic;
  }

  const personId = await repo.createPerson(profileFromDemographics(demographics), sourceSystem, ehrTenantId);
  await repo.attachIdentifiers(personId, strongIdentifiers, sourceSystem, ehrTenantId);
  await repo.upsertDemographicKey(personId, key);

  // Register the new person with the MPI (best-effort) and store the returned
  // master id so a future $match re-resolves to this same person.
  if (mpi) {
    await feedNewPersonToMpi(personId, demographics, sourceSystem, ehrTenantId, mpi, repo);
  }

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

interface ProbabilisticContext {
  demographics: NormalizedDemographics;
  key: string;
  strongIdentifiers: NormalizedIdentifier[];
  ehrTenantId: number;
  sourceSystem: string;
}

function masterAsIdentifier(master: { system: string; value: string }): NormalizedIdentifier {
  return { system: master.system, value: master.value, typeCode: null, strong: true };
}

/**
 * Probabilistic resolution via the MPI. Returns a result when the MPI yields an
 * actionable match, or null to fall through to normal person creation.
 *
 * The MPI master identifier is attached to the resolved person so that a future
 * MPI $match (which re-surfaces the same master) re-resolves to the same local
 * person via the strong-identifier tier. Mid-confidence matches mint a
 * provisional person and enqueue a steward review — never an auto-merge.
 */
async function resolveProbabilistic(
  ctx: ProbabilisticContext,
  repo: IdentityRepository,
  mpi: MpiResolution,
): Promise<ResolvePatientIdentityResult | null> {
  // Best-effort: a failed/unreachable MPI falls back to deterministic creation.
  let candidates;
  try {
    candidates = await mpi.client.match({ ...ctx.demographics, identifiers: ctx.strongIdentifiers });
  } catch {
    return null;
  }
  const decision = decideProbabilisticMatch(candidates, mpi);
  if (decision.action === 'none') return null;

  const master = masterAsIdentifier(decision.candidate.masterIdentifier);

  if (decision.action === 'attach') {
    const matched = distinct(
      (await repo.findPersonIdsByIdentifiers([master])).map((m) => m.personId),
    );
    const personId = matched.length >= 1
      ? Math.min(...matched)
      : await repo.createPerson(profileFromDemographics(ctx.demographics), ctx.sourceSystem, ctx.ehrTenantId);
    await repo.attachIdentifiers(personId, [...ctx.strongIdentifiers, master], ctx.sourceSystem, ctx.ehrTenantId);
    await repo.upsertDemographicKey(personId, ctx.key);
    return { personId, matchGrade: 'certain', isNew: matched.length === 0, needsReview: false };
  }

  // review band: provisional person + steward review against the MPI candidates.
  const personId = await repo.createPerson(
    profileFromDemographics(ctx.demographics),
    ctx.sourceSystem,
    ctx.ehrTenantId,
  );
  await repo.attachIdentifiers(personId, [...ctx.strongIdentifiers, master], ctx.sourceSystem, ctx.ehrTenantId);
  await repo.upsertDemographicKey(personId, ctx.key);
  const candidatePersonIds = distinct(
    (await repo.findPersonIdsByIdentifiers(decision.reviewCandidates.map((c) => masterAsIdentifier(c.masterIdentifier))))
      .map((m) => m.personId),
  ).filter((id) => id !== personId);
  await repo.enqueueReview({
    personId,
    candidatePersonIds,
    // Phase 1 reuses the demographic_only_match bucket for MPI-sourced reviews
    // (no schema change); split out when the steward UI lands.
    reason: 'demographic_only_match',
    ehrTenantId: ctx.ehrTenantId,
    sourceSystem: ctx.sourceSystem,
    demographicKey: ctx.key,
  });
  return { personId, matchGrade: 'possible', isNew: true, needsReview: true };
}

/**
 * Best-effort MPI registration for a newly minted person. Registers the
 * demographics, then self-$matches to learn the MDM MASTER id (the FHIR create
 * returns only the local record id, while $match returns the master), and
 * stores that master id on the person so a future $match re-resolves to it.
 * Any failure (MPI down, feed rejected) is swallowed so ingestion is never
 * blocked.
 */
async function feedNewPersonToMpi(
  personId: number,
  demographics: NormalizedDemographics,
  sourceSystem: string,
  ehrTenantId: number,
  mpi: MpiResolution,
  repo: IdentityRepository,
): Promise<void> {
  try {
    await mpi.client.feed(demographics);
    const selfMatch = await mpi.client.match(demographics);
    const master = selfMatch[0]?.masterIdentifier;
    if (master) {
      await repo.attachIdentifiers(personId, [masterAsIdentifier(master)], sourceSystem, ehrTenantId);
    }
  } catch {
    // Non-blocking: the person exists locally and can be fed/matched later.
  }
}
