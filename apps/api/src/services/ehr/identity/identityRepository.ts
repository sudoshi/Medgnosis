// =============================================================================
// Postgres-backed IdentityRepository for resolvePatientIdentity().
//
// Persistence adapter only — all matching policy lives in resolvePatientIdentity.
// SSN-type identifier values are hashed before storage (HIPAA minimization);
// the same hash is applied on lookup so equality matching still works.
// =============================================================================

import { createHash } from 'node:crypto';
import { sql } from '@medgnosis/db';
import type { NormalizedIdentifier } from './identityKeys.js';
import type {
  IdentifierMatch,
  IdentityRepository,
  PersonProfile,
  ReviewQueueInput,
} from './resolvePatientIdentity.js';

// Any tagged-template SQL client: the global pool OR a transaction handle.
// Passing a transaction runs the whole reconcile atomically inside an existing
// edwHydration sql.begin() block.
type SqlExecutor = typeof sql;

const IDENTIFIER_COMPOSITE_SEPARATOR = '';
const SENSITIVE_TYPE_CODES = new Set(['SS', 'SB']); // SSN, social beneficiary

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

interface StorableIdentifier {
  system: string;
  value: string;
  valueHash: string | null;
  typeCode: string | null;
}

/** Hash sensitive identifier values so SSNs never land in cleartext. */
function toStorable(identifier: NormalizedIdentifier): StorableIdentifier {
  const sensitive = identifier.typeCode !== null && SENSITIVE_TYPE_CODES.has(identifier.typeCode);
  if (sensitive) {
    const hashed = sha256(`${identifier.system}|${identifier.value}`);
    return { system: identifier.system, value: hashed, valueHash: hashed, typeCode: identifier.typeCode };
  }
  return { system: identifier.system, value: identifier.value, valueHash: null, typeCode: identifier.typeCode };
}

function compositeKey(system: string, value: string): string {
  return `${system}${IDENTIFIER_COMPOSITE_SEPARATOR}${value}`;
}

interface PersonIdRow { person_id: string | number }
interface IdentifierMatchRow { person_id: string | number; system: string; value: string }
interface PatientLinkRow { patient_id: string | number }

function toNumber(value: string | number | null | undefined): number {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : value;
  if (parsed === null || parsed === undefined || Number.isNaN(parsed)) {
    throw new Error('Expected a numeric id from the identity store');
  }
  return parsed;
}

export class PostgresIdentityRepository implements IdentityRepository {
  // db defaults to the global pool; pass a transaction handle to run the whole
  // reconcile atomically inside an existing sql.begin() block (bulk hydration).
  constructor(private readonly db: SqlExecutor = sql) {}

  async findPersonIdsByIdentifiers(identifiers: NormalizedIdentifier[]): Promise<IdentifierMatch[]> {
    const storable = identifiers.filter((identifier) => identifier.strong).map(toStorable);
    if (storable.length === 0) return [];
    const composites = storable.map((identifier) => compositeKey(identifier.system, identifier.value));
    const rows = await this.db<IdentifierMatchRow[]>`
      SELECT person_id, system, value
      FROM phm_edw.patient_identifier
      WHERE active = true
        AND (system || ${IDENTIFIER_COMPOSITE_SEPARATOR} || value) = ANY(${composites})
    `;
    return rows.map((row) => ({ personId: toNumber(row.person_id), system: row.system, value: row.value }));
  }

  async findPersonIdsByDemographicKey(key: string): Promise<number[]> {
    const rows = await this.db<PersonIdRow[]>`
      SELECT person_id
      FROM phm_edw.person
      WHERE demographic_match_key = ${key}
        AND status <> 'merged'
    `;
    return rows.map((row) => toNumber(row.person_id));
  }

  async createPerson(profile: PersonProfile, sourceSystem: string, ehrTenantId: number): Promise<number> {
    const rows = await this.db<PersonIdRow[]>`
      INSERT INTO phm_edw.person
        (first_name, last_name, date_of_birth, sex, source_system, origin_ehr_tenant_id, status)
      VALUES (
        ${profile.firstName}, ${profile.lastName}, ${profile.dateOfBirth}::date, ${profile.sex},
        ${sourceSystem}, ${ehrTenantId}, 'active'
      )
      RETURNING person_id
    `;
    const personId = toNumber(rows[0]?.person_id);
    await this.db`
      INSERT INTO phm_edw.patient_merge_log (action, target_person_id, performed_by, details)
      VALUES ('provisional_created', ${personId}, 'system', ${this.db.json({ sourceSystem, ehrTenantId })})
    `;
    return personId;
  }

  async attachIdentifiers(
    personId: number,
    identifiers: NormalizedIdentifier[],
    sourceSystem: string,
    ehrTenantId: number,
  ): Promise<void> {
    const storable = identifiers.filter((identifier) => identifier.strong).map(toStorable);
    for (const identifier of storable) {
      await this.db`
        INSERT INTO phm_edw.patient_identifier
          (person_id, system, value, value_hash, type_code, source_system, ehr_tenant_id)
        VALUES (
          ${personId}, ${identifier.system}, ${identifier.value}, ${identifier.valueHash},
          ${identifier.typeCode}, ${sourceSystem}, ${ehrTenantId}
        )
        ON CONFLICT ON CONSTRAINT uq_patient_identifier_system_value
        DO UPDATE SET last_seen_at = NOW(), active = true
      `;
    }
  }

  async upsertDemographicKey(personId: number, key: string): Promise<void> {
    await this.db`
      UPDATE phm_edw.person
      SET demographic_match_key = ${key}, updated_at = NOW()
      WHERE person_id = ${personId}
    `;
  }

  async enqueueReview(input: ReviewQueueInput): Promise<void> {
    await this.db`
      INSERT INTO phm_edw.identity_review_queue
        (person_id, candidate_person_ids, reason, ehr_tenant_id, source_system, demographic_key)
      VALUES (
        ${input.personId}, ${input.candidatePersonIds}, ${input.reason},
        ${input.ehrTenantId}, ${input.sourceSystem}, ${input.demographicKey}
      )
    `;
    // Demographic-only and probabilistic matches both mint a provisional person
    // pending steward confirmation; an identifier conflict resolves to an
    // existing person, so it is not marked provisional.
    if (input.reason === 'demographic_only_match' || input.reason === 'probabilistic_match') {
      await this.db`
        UPDATE phm_edw.person SET status = 'provisional', updated_at = NOW()
        WHERE person_id = ${input.personId} AND status = 'active'
      `;
    }
    await this.db`
      INSERT INTO phm_edw.patient_merge_log (action, target_person_id, reason, performed_by, details)
      VALUES ('review_enqueued', ${input.personId}, ${input.reason}, 'system',
              ${this.db.json({ candidatePersonIds: input.candidatePersonIds })})
    `;
  }

  /** Find the legacy phm_edw.patient row already linked to a person, if any. */
  async findLegacyPatientId(personId: number): Promise<number | null> {
    const rows = await this.db<PatientLinkRow[]>`
      SELECT patient_id FROM phm_edw.patient_link WHERE person_id = ${personId} ORDER BY patient_id LIMIT 1
    `;
    const value = rows[0]?.patient_id;
    return value === undefined ? null : toNumber(value);
  }

  /** Link a legacy phm_edw.patient row to its resolved enterprise person. */
  async linkLegacyPatient(patientId: number, personId: number, ehrTenantId: number): Promise<void> {
    await this.db`
      INSERT INTO phm_edw.patient_link (patient_id, person_id, ehr_tenant_id)
      VALUES (${patientId}, ${personId}, ${ehrTenantId})
      ON CONFLICT (patient_id) DO UPDATE SET person_id = EXCLUDED.person_id
    `;
  }
}

export const identityRepository = new PostgresIdentityRepository();

// Standalone wrappers over the default (global-pool) instance, used by the
// reconcilePatient defaults and the SMART launch path.
export function findLegacyPatientId(personId: number): Promise<number | null> {
  return identityRepository.findLegacyPatientId(personId);
}

export function linkLegacyPatient(patientId: number, personId: number, ehrTenantId: number): Promise<void> {
  return identityRepository.linkLegacyPatient(patientId, personId, ehrTenantId);
}
