// =============================================================================
// reconcilePatient — bridges enterprise identity resolution to the legacy
// phm_edw.patient row. This is the integration point ingestion paths call
// instead of blindly INSERTing a patient.
//
// Behavior:
//   1. resolvePatientIdentity() -> person (creates/attaches as needed)
//   2. if that person already has a linked legacy patient, reuse it (dedup)
//   3. otherwise create the legacy patient row and link it to the person
// =============================================================================

import type { FhirResource } from '../types.js';
import {
  resolvePatientIdentity as resolvePatientIdentityDefault,
  type IdentityRepository,
  type MatchGrade,
  type MpiResolution,
  type ResolvePatientIdentityResult,
} from './resolvePatientIdentity.js';
import {
  findLegacyPatientId as findLegacyPatientIdDefault,
  identityRepository as identityRepositoryDefault,
  linkLegacyPatient as linkLegacyPatientDefault,
} from './identityRepository.js';
import { buildMpiResolution } from './mpiResolution.js';

export interface ReconcilePatientInput {
  patient: FhirResource;
  ehrTenantId: number;
  sourceSystem: string;
  /** Creates the legacy phm_edw.patient row and returns its patient_id. */
  insertLegacyPatient: () => Promise<number>;
}

export interface ReconcilePatientDeps {
  resolveIdentity?: (
    input: { patient: FhirResource; ehrTenantId: number; sourceSystem: string },
    repo: IdentityRepository,
    mpi?: MpiResolution,
  ) => Promise<ResolvePatientIdentityResult>;
  repository?: IdentityRepository;
  findLegacyPatientId?: (personId: number) => Promise<number | null>;
  linkLegacyPatient?: (patientId: number, personId: number, ehrTenantId: number) => Promise<void>;
  /** Probabilistic tier; defaults to the env-configured MPI (undefined when disabled). */
  mpi?: MpiResolution;
}

export interface ReconcilePatientResult {
  localPatientId: number;
  personId: number;
  matchGrade: MatchGrade;
  reusedExisting: boolean;
}

export async function reconcilePatient(
  input: ReconcilePatientInput,
  deps: ReconcilePatientDeps = {},
): Promise<ReconcilePatientResult> {
  const resolveIdentity = deps.resolveIdentity ?? resolvePatientIdentityDefault;
  const repository = deps.repository ?? identityRepositoryDefault;
  const findLegacyPatientId = deps.findLegacyPatientId ?? findLegacyPatientIdDefault;
  const linkLegacyPatient = deps.linkLegacyPatient ?? linkLegacyPatientDefault;
  const mpi = deps.mpi ?? buildMpiResolution();

  const resolveInput = {
    patient: input.patient,
    ehrTenantId: input.ehrTenantId,
    sourceSystem: input.sourceSystem,
  };
  // Pass mpi only when present so deterministic-only callers/tests see a 2-arg call.
  const identity = mpi
    ? await resolveIdentity(resolveInput, repository, mpi)
    : await resolveIdentity(resolveInput, repository);

  const existingLegacyId = await findLegacyPatientId(identity.personId);
  if (existingLegacyId !== null) {
    return {
      localPatientId: existingLegacyId,
      personId: identity.personId,
      matchGrade: identity.matchGrade,
      reusedExisting: true,
    };
  }

  const localPatientId = await input.insertLegacyPatient();
  await linkLegacyPatient(localPatientId, identity.personId, input.ehrTenantId);
  return {
    localPatientId,
    personId: identity.personId,
    matchGrade: identity.matchGrade,
    reusedExisting: false,
  };
}
