// =============================================================================
// Medgnosis API - staged FHIR to EDW workspace hydration
// Hydrates callback-bounded FHIR resources into the legacy EDW clinical tables
// used by patient detail/workspace routes. QDM linkage remains in
// phm_edw.fhir_qdm_crosswalk; ehr_resource_crosswalk points at the EDW row.
// =============================================================================

import type postgres from 'postgres';
import { sql } from '@medgnosis/db';
import type { FhirResource } from './types.js';
import { extractPatientIdentifiers, normalizeDemographics } from './identity/identityKeys.js';
import { reconcilePatient } from './identity/reconcilePatient.js';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const BULK_IDENTITY_SOURCE_SYSTEM = 'bulk_export';
const SUPPORTED_RESOURCE_TYPES = [
  'Patient',
  'Encounter',
  'Condition',
  'Observation',
  'MedicationRequest',
  'Procedure',
  'AllergyIntolerance',
  'Immunization',
] as const;

type SupportedResourceType = (typeof SUPPORTED_RESOURCE_TYPES)[number];
type Tx = postgres.TransactionSql;
type UnsafeParameter = NonNullable<Parameters<Tx['unsafe']>[1]>[number];

export interface HydrateStagedRunToEdwInput {
  ingestRunId: string;
  ehrTenantId?: number;
  orgId?: number | null;
  limit?: number;
  resourceTypes?: readonly string[];
}

export interface HydrateStagedRunToEdwError {
  stagingId: number;
  resourceType: string;
  resourceId: string;
  message: string;
}

export interface HydrateStagedRunToEdwResult {
  resourcesSeen: number;
  resourcesHydrated: number;
  resourcesSkipped: number;
  resourcesFailed: number;
  rowsInserted: number;
  rowsUpdated: number;
  byResourceType: Record<string, {
    seen: number;
    hydrated: number;
    skipped: number;
    failed: number;
  }>;
  errors: HydrateStagedRunToEdwError[];
}

interface StagedFhirResourceRow {
  id: number | string;
  org_id: number | string | null;
  ehr_tenant_id: number | string;
  ingest_run_id: string;
  resource_type: string;
  resource_id: string;
  patient_ref: string | null;
  resource: FhirResource;
  source_version_id: string | null;
  source_last_updated: string | null;
  content_hash: string | null;
  received_at: string;
}

interface LocalTarget {
  localTable: string | null;
  localId: number | null;
}

interface HydratedResourceTarget {
  localTable: string;
  localId: number;
  operation: 'inserted' | 'updated';
}

interface CodeConcept {
  system: string | null;
  code: string | null;
  display: string | null;
  text: string | null;
}

export async function hydrateStagedRunToEdw(
  input: HydrateStagedRunToEdwInput,
): Promise<HydrateStagedRunToEdwResult> {
  const stagedRows = await findHydratableStagedResources(input);
  const result: HydrateStagedRunToEdwResult = {
    resourcesSeen: stagedRows.length,
    resourcesHydrated: 0,
    resourcesSkipped: 0,
    resourcesFailed: 0,
    rowsInserted: 0,
    rowsUpdated: 0,
    byResourceType: {},
    errors: [],
  };

  for (const row of stagedRows) {
    incrementType(result, row.resource_type, 'seen');
    try {
      const target = await hydrateStagedResource(row);
      if (!target) {
        result.resourcesSkipped += 1;
        incrementType(result, row.resource_type, 'skipped');
        continue;
      }

      result.resourcesHydrated += 1;
      incrementType(result, row.resource_type, 'hydrated');
      if (target.operation === 'inserted') result.rowsInserted += 1;
      if (target.operation === 'updated') result.rowsUpdated += 1;
    } catch (err) {
      result.resourcesFailed += 1;
      incrementType(result, row.resource_type, 'failed');
      result.errors.push({
        stagingId: Number(row.id),
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        message: messageFromError(err, 'EDW hydration failed'),
      });
    }
  }

  return result;
}

async function findHydratableStagedResources(
  input: HydrateStagedRunToEdwInput,
): Promise<StagedFhirResourceRow[]> {
  const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT));
  const tenantFilter = input.ehrTenantId ?? null;
  const orgFilter = input.orgId ?? null;
  const resourceTypes = supportedResourceTypes(input.resourceTypes);

  if (resourceTypes.length === 0) return [];

  return sql<StagedFhirResourceRow[]>`
    SELECT id,
           org_id,
           ehr_tenant_id,
           ingest_run_id::text AS ingest_run_id,
           resource_type,
           resource_id,
           patient_ref,
           resource,
           source_version_id,
           source_last_updated::text AS source_last_updated,
           content_hash,
           received_at::text AS received_at
    FROM phm_edw.fhir_ingest_staging
    WHERE ingest_run_id = ${input.ingestRunId}::uuid
      AND resource_type = ANY(${resourceTypes}::text[])
      AND status IN ('staged', 'normalized')
      AND (${tenantFilter}::bigint IS NULL OR ehr_tenant_id = ${tenantFilter})
      AND (${orgFilter}::int IS NULL OR org_id IS NOT DISTINCT FROM ${orgFilter})
    ORDER BY CASE resource_type
               WHEN 'Patient' THEN 0
               WHEN 'Encounter' THEN 1
               WHEN 'Condition' THEN 2
               WHEN 'Observation' THEN 3
               WHEN 'MedicationRequest' THEN 4
               WHEN 'Procedure' THEN 5
               WHEN 'AllergyIntolerance' THEN 6
               WHEN 'Immunization' THEN 7
               ELSE 9
             END,
             received_at ASC,
             id ASC
    LIMIT ${limit}
  `;
}

function hydrateStagedResource(row: StagedFhirResourceRow): Promise<HydratedResourceTarget | null> {
  return sql.begin(async (tx) => {
    // Patient resources resolve enterprise identity and create/reuse the legacy
    // phm_edw.patient row; the resulting patient_id seeds the crosswalk so child
    // resources in the same (Patient-first ordered) batch can resolve it.
    if (row.resource_type === 'Patient') {
      const existing = await findExistingLocalTarget(tx, row);
      if (existing.localTable === 'phm_edw.patient' && existing.localId !== null) {
        const target: HydratedResourceTarget = {
          localTable: 'phm_edw.patient',
          localId: existing.localId,
          operation: 'updated',
        };
        await upsertResourceCrosswalk(tx, row, target.localId, target);
        return target;
      }

      const target = await hydratePatient(row);
      if (!target) return null;
      await upsertResourceCrosswalk(tx, row, target.localId, target);
      return target;
    }

    const patientId = await resolvePatientId(tx, row);
    if (patientId === null) return null;

    const existing = await findExistingLocalTarget(tx, row);
    const target = await hydrateByResourceType(tx, row, patientId, existing);
    if (!target) return null;

    await upsertResourceCrosswalk(tx, row, patientId, target);
    return target;
  });
}

async function hydratePatient(row: StagedFhirResourceRow): Promise<HydratedResourceTarget | null> {
  const patient = row.resource;
  const ehrTenantId = Number(row.ehr_tenant_id);
  // reconcilePatient uses the default (global-pool) repository rather than the
  // surrounding hydration transaction: postgres's TransactionSql type omits the
  // tagged-template call signature, so the repository cannot run on `tx`. This
  // is safe because reconcile is idempotent — on retry the person is matched by
  // its identifier and the existing legacy patient is reused, so a rolled-back
  // crosswalk step never produces a duplicate patient.
  const result = await reconcilePatient({
    patient,
    ehrTenantId,
    sourceSystem: BULK_IDENTITY_SOURCE_SYSTEM,
    insertLegacyPatient: () => insertStagedPatientRow(patient),
  });
  return {
    localTable: 'phm_edw.patient',
    localId: result.localPatientId,
    operation: result.reusedExisting ? 'updated' : 'inserted',
  };
}

async function insertStagedPatientRow(patient: FhirResource): Promise<number> {
  // Minimal legacy row from the identity minimum data set. Richer demographics
  // (middle name, phone, email) are populated by the SMART launch path; bulk
  // ingestion seeds name/DOB/sex/MRN and is enriched on subsequent encounters.
  const demographics = normalizeDemographics(patient);
  const mrn = extractPatientIdentifiers(patient).find((identifier) => identifier.strong)?.value ?? null;
  const rows = await sql<{ patient_id: number | string }[]>`
    INSERT INTO phm_edw.patient
      (mrn, first_name, last_name, date_of_birth, gender, active_ind, created_date, updated_date)
    VALUES (
      ${mrn === null ? null : truncate(mrn, 50)},
      ${truncate(demographics.firstName, 100)},
      ${truncate(demographics.lastName, 100)},
      ${demographics.dateOfBirth}::date,
      ${truncateNullable(demographics.sex, 50)},
      'Y', NOW(), NOW()
    )
    RETURNING patient_id
  `;
  const patientId = optionalPositiveNumber(rows[0]?.patient_id);
  if (patientId === null) {
    throw new Error('Unable to create local patient during bulk hydration');
  }
  return patientId;
}

async function hydrateByResourceType(
  tx: Tx,
  row: StagedFhirResourceRow,
  patientId: number,
  existing: LocalTarget,
): Promise<HydratedResourceTarget | null> {
  switch (row.resource_type) {
    case 'Encounter':
      return hydrateEncounter(tx, row, patientId, existing);
    case 'Condition':
      return hydrateCondition(tx, row, patientId, existing);
    case 'Observation':
      return hydrateObservation(tx, row, patientId, existing);
    case 'MedicationRequest':
      return hydrateMedicationRequest(tx, row, patientId, existing);
    case 'Procedure':
      return hydrateProcedure(tx, row, patientId, existing);
    case 'AllergyIntolerance':
      return hydrateAllergyIntolerance(tx, row, patientId, existing);
    case 'Immunization':
      return hydrateImmunization(tx, row, patientId, existing);
    default:
      return null;
  }
}

async function hydrateEncounter(
  tx: Tx,
  row: StagedFhirResourceRow,
  patientId: number,
  existing: LocalTarget,
): Promise<HydratedResourceTarget> {
  const resource = row.resource;
  const period = record(resource['period']);
  const start = cleanString(period?.['start']) ?? cleanString(resource['actualPeriod']);
  const end = cleanString(period?.['end']);
  const encounterType = truncate(
    conceptLabel(firstConcept(resource['type']))
      ?? conceptLabel(record(resource['serviceType']))
      ?? codingCode(record(resource['class']))
      ?? resource.resourceType,
    50,
  );
  const reason = truncateNullable(conceptLabel(firstConcept(resource['reasonCode'])), 255);
  const status = truncateNullable(cleanString(resource['status']), 50);
  const orgId = optionalPositiveNumber(row.org_id);

  if (existing.localTable === 'phm_edw.encounter' && existing.localId !== null) {
    const rows = await tx.unsafe<{ encounter_id: number | string }[]>(
      `
      UPDATE phm_edw.encounter
      SET patient_id = $2,
          org_id = $3,
          encounter_number = $4,
          encounter_type = $5,
          encounter_reason = $6,
          admission_datetime = $7::timestamp,
          discharge_datetime = $8::timestamp,
          encounter_datetime = $9::timestamp,
          status = $10,
          updated_date = NOW()
      WHERE encounter_id = $1
      RETURNING encounter_id
      `,
      [
        existing.localId,
        patientId,
        orgId,
        truncate(row.resource_id, 50),
        encounterType,
        reason,
        start,
        end,
        start,
        status,
      ],
    );
    return { localTable: 'phm_edw.encounter', localId: Number(rows[0]?.encounter_id ?? existing.localId), operation: 'updated' };
  }

  const rows = await tx.unsafe<{ encounter_id: number | string }[]>(
    `
    INSERT INTO phm_edw.encounter
      (patient_id, org_id, encounter_number, encounter_type, encounter_reason,
       admission_datetime, discharge_datetime, encounter_datetime, status,
       active_ind, created_date, updated_date)
    VALUES ($1, $2, $3, $4, $5, $6::timestamp, $7::timestamp, $8::timestamp, $9, 'Y', NOW(), NOW())
    RETURNING encounter_id
    `,
    [
      patientId,
      orgId,
      truncate(row.resource_id, 50),
      encounterType,
      reason,
      start,
      end,
      start,
      status,
    ],
  );
  return { localTable: 'phm_edw.encounter', localId: Number(rows[0]!.encounter_id), operation: 'inserted' };
}

async function hydrateCondition(
  tx: Tx,
  row: StagedFhirResourceRow,
  patientId: number,
  existing: LocalTarget,
): Promise<HydratedResourceTarget> {
  const resource = row.resource;
  const code = firstConcept(resource['code']);
  const conditionId = await upsertConditionMaster(tx, row, code);
  const encounterId = await resolveEncounterId(tx, row, referenceId(resource['encounter'], 'Encounter'));
  const onset = datePart(cleanString(resource['onsetDateTime']) ?? periodStart(resource['onsetPeriod']));
  const resolution = datePart(cleanString(resource['abatementDateTime']) ?? periodEnd(resource['abatementPeriod']));
  const diagnosisStatus = conditionStatus(resource);

  if (existing.localTable === 'phm_edw.condition_diagnosis' && existing.localId !== null) {
    const rows = await tx.unsafe<{ condition_diagnosis_id: number | string }[]>(
      `
      UPDATE phm_edw.condition_diagnosis
      SET patient_id = $2,
          encounter_id = $3,
          condition_id = $4,
          diagnosis_status = $5,
          onset_date = $6::date,
          resolution_date = $7::date,
          updated_date = NOW()
      WHERE condition_diagnosis_id = $1
      RETURNING condition_diagnosis_id
      `,
      [existing.localId, patientId, encounterId, conditionId, diagnosisStatus, onset, resolution],
    );
    return {
      localTable: 'phm_edw.condition_diagnosis',
      localId: Number(rows[0]?.condition_diagnosis_id ?? existing.localId),
      operation: 'updated',
    };
  }

  const rows = await tx.unsafe<{ condition_diagnosis_id: number | string }[]>(
    `
    INSERT INTO phm_edw.condition_diagnosis
      (patient_id, encounter_id, condition_id, diagnosis_type, diagnosis_status,
       onset_date, resolution_date, primary_indicator, active_ind, created_date, updated_date)
    VALUES ($1, $2, $3, 'OTHER', $4, $5::date, $6::date, 'N', 'Y', NOW(), NOW())
    RETURNING condition_diagnosis_id
    `,
    [patientId, encounterId, conditionId, diagnosisStatus, onset, resolution],
  );
  return {
    localTable: 'phm_edw.condition_diagnosis',
    localId: Number(rows[0]!.condition_diagnosis_id),
    operation: 'inserted',
  };
}

async function hydrateObservation(
  tx: Tx,
  row: StagedFhirResourceRow,
  patientId: number,
  existing: LocalTarget,
): Promise<HydratedResourceTarget> {
  const resource = row.resource;
  const code = firstConcept(resource['code']);
  const value = observationValue(resource);
  const encounterId = await resolveEncounterId(tx, row, referenceId(resource['encounter'], 'Encounter'));
  const observedAt =
    cleanString(resource['effectiveDateTime'])
    ?? periodStart(resource['effectivePeriod'])
    ?? cleanString(resource['issued'])
    ?? row.source_last_updated
    ?? row.received_at;
  const observationCode = truncate(code.code ?? `FHIR-${row.resource_id}`, 50);
  const observationDesc = truncateNullable(conceptLabel(code) ?? observationCode, 255);
  const status = truncateNullable(cleanString(resource['status']), 50);

  if (existing.localTable === 'phm_edw.observation' && existing.localId !== null) {
    const rows = await tx.unsafe<{ observation_id: number | string }[]>(
      `
      UPDATE phm_edw.observation
      SET patient_id = $2,
          encounter_id = $3,
          observation_datetime = $4::timestamp,
          observation_code = $5,
          observation_desc = $6,
          value_numeric = $7,
          value_text = $8,
          units = $9,
          status = $10,
          updated_date = NOW()
      WHERE observation_id = $1
      RETURNING observation_id
      `,
      [
        existing.localId,
        patientId,
        encounterId,
        observedAt,
        observationCode,
        observationDesc,
        value.numeric,
        value.text,
        value.unit,
        status,
      ],
    );
    return { localTable: 'phm_edw.observation', localId: Number(rows[0]?.observation_id ?? existing.localId), operation: 'updated' };
  }

  const rows = await tx.unsafe<{ observation_id: number | string }[]>(
    `
    INSERT INTO phm_edw.observation
      (patient_id, encounter_id, observation_datetime, observation_code, observation_desc,
       value_numeric, value_text, units, status, active_ind, created_date, updated_date)
    VALUES ($1, $2, $3::timestamp, $4, $5, $6, $7, $8, $9, 'Y', NOW(), NOW())
    RETURNING observation_id
    `,
    [
      patientId,
      encounterId,
      observedAt,
      observationCode,
      observationDesc,
      value.numeric,
      value.text,
      value.unit,
      status,
    ],
  );
  return { localTable: 'phm_edw.observation', localId: Number(rows[0]!.observation_id), operation: 'inserted' };
}

async function hydrateMedicationRequest(
  tx: Tx,
  row: StagedFhirResourceRow,
  patientId: number,
  existing: LocalTarget,
): Promise<HydratedResourceTarget> {
  const resource = row.resource;
  const medication = firstConcept(resource['medicationCodeableConcept']) ?? medicationReferenceConcept(resource);
  const medicationId = await upsertMedicationMaster(tx, row, medication);
  const encounterId = await resolveEncounterId(tx, row, referenceId(resource['encounter'], 'Encounter'));
  const dispense = record(resource['dispenseRequest']);
  const validity = record(dispense?.['validityPeriod']);
  const dosage = firstRecord(resource['dosageInstruction']);
  const start = cleanString(resource['authoredOn']) ?? cleanString(validity?.['start']);
  const end = cleanString(validity?.['end']);
  const status = truncateNullable(cleanString(resource['status']), 50);
  const route = truncateNullable(conceptLabel(record(dosage?.['route'])), 50);
  const frequency = truncateNullable(dosageFrequency(dosage), 50);
  const dosageText = truncateNullable(cleanString(dosage?.['text']), 50);
  const refills = optionalNonNegativeInteger(dispense?.['numberOfRepeatsAllowed']);

  if (existing.localTable === 'phm_edw.medication_order' && existing.localId !== null) {
    const rows = await tx.unsafe<{ medication_order_id: number | string }[]>(
      `
      UPDATE phm_edw.medication_order
      SET patient_id = $2,
          encounter_id = $3,
          medication_id = $4,
          dosage = $5,
          frequency = $6,
          route = $7,
          start_datetime = $8::timestamp,
          end_datetime = $9::timestamp,
          prescription_status = $10,
          refill_count = $11,
          updated_date = NOW()
      WHERE medication_order_id = $1
      RETURNING medication_order_id
      `,
      [existing.localId, patientId, encounterId, medicationId, dosageText, frequency, route, start, end, status, refills],
    );
    return {
      localTable: 'phm_edw.medication_order',
      localId: Number(rows[0]?.medication_order_id ?? existing.localId),
      operation: 'updated',
    };
  }

  const rows = await tx.unsafe<{ medication_order_id: number | string }[]>(
    `
    INSERT INTO phm_edw.medication_order
      (patient_id, encounter_id, medication_id, dosage, frequency, route,
       start_datetime, end_datetime, prescription_status, refill_count,
       active_ind, created_date, updated_date)
    VALUES ($1, $2, $3, $4, $5, $6, $7::timestamp, $8::timestamp, $9, $10, 'Y', NOW(), NOW())
    RETURNING medication_order_id
    `,
    [patientId, encounterId, medicationId, dosageText, frequency, route, start, end, status, refills],
  );
  return {
    localTable: 'phm_edw.medication_order',
    localId: Number(rows[0]!.medication_order_id),
    operation: 'inserted',
  };
}

async function hydrateProcedure(
  tx: Tx,
  row: StagedFhirResourceRow,
  patientId: number,
  existing: LocalTarget,
): Promise<HydratedResourceTarget> {
  const resource = row.resource;
  const procedure = firstConcept(resource['code']);
  const procedureId = await upsertProcedureMaster(tx, row, procedure);
  const encounterId = await resolveEncounterId(tx, row, referenceId(resource['encounter'], 'Encounter'));
  const performedAt =
    cleanString(resource['performedDateTime'])
    ?? periodStart(resource['performedPeriod'])
    ?? cleanString(resource['occurrenceDateTime'])
    ?? periodStart(resource['occurrencePeriod'])
    ?? row.source_last_updated
    ?? row.received_at;
  const status = cleanString(resource['status']);
  const outcome = conceptLabel(firstConcept(resource['outcome']));
  const comments = truncateNullable(outcome ?? status, 500);

  if (existing.localTable === 'phm_edw.procedure_performed' && existing.localId !== null) {
    const rows = await tx.unsafe<{ procedure_performed_id: number | string }[]>(
      `
      UPDATE phm_edw.procedure_performed
      SET patient_id = $2,
          encounter_id = $3,
          procedure_id = $4,
          procedure_datetime = $5::timestamp,
          comments = $6,
          updated_date = NOW()
      WHERE procedure_performed_id = $1
      RETURNING procedure_performed_id
      `,
      [existing.localId, patientId, encounterId, procedureId, performedAt, comments],
    );
    return {
      localTable: 'phm_edw.procedure_performed',
      localId: Number(rows[0]?.procedure_performed_id ?? existing.localId),
      operation: 'updated',
    };
  }

  const rows = await tx.unsafe<{ procedure_performed_id: number | string }[]>(
    `
    INSERT INTO phm_edw.procedure_performed
      (patient_id, encounter_id, procedure_id, procedure_datetime, comments,
       active_ind, created_date, updated_date)
    VALUES ($1, $2, $3, $4::timestamp, $5, 'Y', NOW(), NOW())
    RETURNING procedure_performed_id
    `,
    [patientId, encounterId, procedureId, performedAt, comments],
  );
  return {
    localTable: 'phm_edw.procedure_performed',
    localId: Number(rows[0]!.procedure_performed_id),
    operation: 'inserted',
  };
}

async function hydrateAllergyIntolerance(
  tx: Tx,
  row: StagedFhirResourceRow,
  patientId: number,
  existing: LocalTarget,
): Promise<HydratedResourceTarget> {
  const resource = row.resource;
  const allergy = firstConcept(resource['code']);
  const allergyId = await upsertAllergyMaster(tx, row, allergy);
  const onset = datePart(cleanString(resource['onsetDateTime']) ?? periodStart(resource['onsetPeriod']));
  const reaction = truncateNullable(allergyReaction(resource), 500);
  const severity = truncateNullable(allergySeverity(resource), 50);
  const status = truncateNullable(allergyStatus(resource), 50);
  const endDate = status?.toLowerCase().includes('resolved')
    ? datePart(cleanString(resource['lastOccurrence']) ?? row.source_last_updated ?? row.received_at)
    : null;

  if (existing.localTable === 'phm_edw.patient_allergy' && existing.localId !== null) {
    const rows = await tx.unsafe<{ patient_allergy_id: number | string }[]>(
      `
      UPDATE phm_edw.patient_allergy
      SET patient_id = $2,
          allergy_id = $3,
          reaction = $4,
          severity = $5,
          onset_date = $6::date,
          end_date = $7::date,
          status = $8,
          updated_date = NOW()
      WHERE patient_allergy_id = $1
      RETURNING patient_allergy_id
      `,
      [existing.localId, patientId, allergyId, reaction, severity, onset, endDate, status],
    );
    return {
      localTable: 'phm_edw.patient_allergy',
      localId: Number(rows[0]?.patient_allergy_id ?? existing.localId),
      operation: 'updated',
    };
  }

  const rows = await tx.unsafe<{ patient_allergy_id: number | string }[]>(
    `
    INSERT INTO phm_edw.patient_allergy
      (patient_id, allergy_id, reaction, severity, onset_date, end_date, status,
       active_ind, created_date, updated_date)
    VALUES ($1, $2, $3, $4, $5::date, $6::date, $7, 'Y', NOW(), NOW())
    RETURNING patient_allergy_id
    `,
    [patientId, allergyId, reaction, severity, onset, endDate, status],
  );
  return {
    localTable: 'phm_edw.patient_allergy',
    localId: Number(rows[0]!.patient_allergy_id),
    operation: 'inserted',
  };
}

async function hydrateImmunization(
  tx: Tx,
  row: StagedFhirResourceRow,
  patientId: number,
  existing: LocalTarget,
): Promise<HydratedResourceTarget> {
  const resource = row.resource;
  const vaccine = firstConcept(resource['vaccineCode']);
  const administeredAt =
    cleanString(resource['occurrenceDateTime'])
    ?? cleanString(resource['recorded'])
    ?? row.source_last_updated
    ?? row.received_at;
  const vaccineCode = truncate(vaccine.code ?? `FHIR-${row.resource_id}`, 50);
  const vaccineName = truncate(conceptLabel(vaccine) ?? vaccineCode, 255);
  const lotNumber = truncateNullable(cleanString(resource['lotNumber']), 50);
  const expirationDate = datePart(cleanString(resource['expirationDate']));
  const site = truncateNullable(conceptLabel(firstConcept(resource['site'])), 50);
  const reaction = truncateNullable(immunizationReaction(resource), 500);
  const status = truncateNullable(cleanString(resource['status']), 50);

  if (existing.localTable === 'phm_edw.immunization' && existing.localId !== null) {
    const rows = await tx.unsafe<{ immunization_id: number | string }[]>(
      `
      UPDATE phm_edw.immunization
      SET patient_id = $2,
          vaccine_code = $3,
          vaccine_name = $4,
          administration_datetime = $5::timestamp,
          lot_number = $6,
          expiration_date = $7::date,
          administration_site = $8,
          reaction = $9,
          status = $10,
          updated_date = NOW()
      WHERE immunization_id = $1
      RETURNING immunization_id
      `,
      [
        existing.localId,
        patientId,
        vaccineCode,
        vaccineName,
        administeredAt,
        lotNumber,
        expirationDate,
        site,
        reaction,
        status,
      ],
    );
    return {
      localTable: 'phm_edw.immunization',
      localId: Number(rows[0]?.immunization_id ?? existing.localId),
      operation: 'updated',
    };
  }

  const rows = await tx.unsafe<{ immunization_id: number | string }[]>(
    `
    INSERT INTO phm_edw.immunization
      (patient_id, vaccine_code, vaccine_name, administration_datetime, lot_number,
       expiration_date, administration_site, reaction, status, active_ind, created_date, updated_date)
    VALUES ($1, $2, $3, $4::timestamp, $5, $6::date, $7, $8, $9, 'Y', NOW(), NOW())
    RETURNING immunization_id
    `,
    [
      patientId,
      vaccineCode,
      vaccineName,
      administeredAt,
      lotNumber,
      expirationDate,
      site,
      reaction,
      status,
    ],
  );
  return {
    localTable: 'phm_edw.immunization',
    localId: Number(rows[0]!.immunization_id),
    operation: 'inserted',
  };
}

async function resolvePatientId(tx: Tx, row: StagedFhirResourceRow): Promise<number | null> {
  const patientResourceId = patientResourceIdFromRow(row);
  if (!patientResourceId) return null;

  const rows = await tx.unsafe<{ patient_id: number | string | null }[]>(
    `
    SELECT COALESCE(patient_id, CASE WHEN local_table = 'phm_edw.patient' THEN local_id END) AS patient_id
    FROM phm_edw.ehr_resource_crosswalk
    WHERE ehr_tenant_id = $1
      AND resource_type = 'Patient'
      AND ehr_resource_id = $2
      AND (
        patient_id IS NOT NULL
        OR (local_table = 'phm_edw.patient' AND local_id IS NOT NULL)
      )
    ORDER BY last_seen_at DESC
    LIMIT 1
    `,
    [Number(row.ehr_tenant_id), patientResourceId],
  );

  return optionalPositiveNumber(rows[0]?.patient_id);
}

async function findExistingLocalTarget(tx: Tx, row: StagedFhirResourceRow): Promise<LocalTarget> {
  const rows = await tx.unsafe<Array<{ local_table: string | null; local_id: number | string | null }>>(
    `
    SELECT local_table, local_id
    FROM phm_edw.ehr_resource_crosswalk
    WHERE ehr_tenant_id = $1
      AND resource_type = $2
      AND ehr_resource_id = $3
    LIMIT 1
    `,
    [Number(row.ehr_tenant_id), row.resource_type, row.resource_id],
  );
  const row0 = rows[0];
  return {
    localTable: cleanString(row0?.local_table),
    localId: optionalPositiveNumber(row0?.local_id),
  };
}

async function resolveEncounterId(
  tx: Tx,
  row: StagedFhirResourceRow,
  encounterResourceId: string | null,
): Promise<number | null> {
  if (!encounterResourceId) return null;
  const rows = await tx.unsafe<Array<{ local_id: number | string | null }>>(
    `
    SELECT local_id
    FROM phm_edw.ehr_resource_crosswalk
    WHERE ehr_tenant_id = $1
      AND resource_type = 'Encounter'
      AND ehr_resource_id = $2
      AND local_table = 'phm_edw.encounter'
      AND local_id IS NOT NULL
    ORDER BY last_seen_at DESC
    LIMIT 1
    `,
    [Number(row.ehr_tenant_id), encounterResourceId],
  );
  return optionalPositiveNumber(rows[0]?.local_id);
}

async function upsertConditionMaster(tx: Tx, row: StagedFhirResourceRow, code: CodeConcept): Promise<number> {
  const conditionCode = truncate(code.code ?? `FHIR-${row.resource_id}`, 50);
  const conditionName = truncate(conceptLabel(code) ?? conditionCode, 255);
  const codeSystem = edwConditionCodeSystem(code.system);
  const existing = await tx.unsafe<Array<{ condition_id: number | string }>>(
    `
    SELECT condition_id
    FROM phm_edw.condition
    WHERE condition_code = $1
      AND code_system = $2
    ORDER BY condition_id
    LIMIT 1
    `,
    [conditionCode, codeSystem],
  );
  if (existing[0]) return Number(existing[0].condition_id);

  const inserted = await tx.unsafe<Array<{ condition_id: number | string }>>(
    `
    INSERT INTO phm_edw.condition
      (condition_code, condition_name, code_system, description, active_ind, created_date, updated_date)
    VALUES ($1, $2, $3, $4, 'Y', NOW(), NOW())
    RETURNING condition_id
    `,
    [conditionCode, conditionName, codeSystem, conditionName],
  );
  return Number(inserted[0]!.condition_id);
}

async function upsertMedicationMaster(tx: Tx, row: StagedFhirResourceRow, code: CodeConcept): Promise<number> {
  const medicationCode = truncate(code.code ?? `FHIR-${row.resource_id}`, 50);
  const medicationName = truncate(conceptLabel(code) ?? medicationCode, 255);
  const codeSystem = edwMedicationCodeSystem(code.system);
  const existing = await tx.unsafe<Array<{ medication_id: number | string }>>(
    `
    SELECT medication_id
    FROM phm_edw.medication
    WHERE medication_code = $1
      AND COALESCE(code_system, 'OTHER') = COALESCE($2, 'OTHER')
    ORDER BY medication_id
    LIMIT 1
    `,
    [medicationCode, codeSystem],
  );
  if (existing[0]) return Number(existing[0].medication_id);

  const inserted = await tx.unsafe<Array<{ medication_id: number | string }>>(
    `
    INSERT INTO phm_edw.medication
      (medication_code, medication_name, code_system, active_ind, created_date, updated_date)
    VALUES ($1, $2, $3, 'Y', NOW(), NOW())
    RETURNING medication_id
    `,
    [medicationCode, medicationName, codeSystem],
  );
  return Number(inserted[0]!.medication_id);
}

async function upsertProcedureMaster(tx: Tx, row: StagedFhirResourceRow, code: CodeConcept): Promise<number> {
  const procedureCode = truncate(code.code ?? `FHIR-${row.resource_id}`, 50);
  const procedureDesc = truncate(conceptLabel(code) ?? procedureCode, 255);
  const codeSystem = edwProcedureCodeSystem(code.system);
  const existing = await tx.unsafe<Array<{ procedure_id: number | string }>>(
    `
    SELECT procedure_id
    FROM phm_edw.procedure
    WHERE procedure_code = $1
      AND COALESCE(code_system, 'OTHER') = COALESCE($2, 'OTHER')
    ORDER BY procedure_id
    LIMIT 1
    `,
    [procedureCode, codeSystem],
  );
  if (existing[0]) return Number(existing[0].procedure_id);

  const inserted = await tx.unsafe<Array<{ procedure_id: number | string }>>(
    `
    INSERT INTO phm_edw.procedure
      (procedure_code, procedure_desc, code_system, active_ind, created_date, updated_date)
    VALUES ($1, $2, $3, 'Y', NOW(), NOW())
    RETURNING procedure_id
    `,
    [procedureCode, procedureDesc, codeSystem],
  );
  return Number(inserted[0]!.procedure_id);
}

async function upsertAllergyMaster(tx: Tx, row: StagedFhirResourceRow, code: CodeConcept): Promise<number> {
  const allergyCode = truncate(code.code ?? `FHIR-${row.resource_id}`, 50);
  const allergyName = truncate(conceptLabel(code) ?? allergyCode, 255);
  const codeSystem = edwGeneralCodeSystem(code.system);
  const category = allergyCategory(row.resource);
  const existing = await tx.unsafe<Array<{ allergy_id: number | string }>>(
    `
    SELECT allergy_id
    FROM phm_edw.allergy
    WHERE allergy_code = $1
      AND COALESCE(code_system, 'OTHER') = COALESCE($2, 'OTHER')
    ORDER BY allergy_id
    LIMIT 1
    `,
    [allergyCode, codeSystem],
  );
  if (existing[0]) return Number(existing[0].allergy_id);

  const inserted = await tx.unsafe<Array<{ allergy_id: number | string }>>(
    `
    INSERT INTO phm_edw.allergy
      (allergy_code, allergy_name, code_system, category, active_ind, created_date, updated_date)
    VALUES ($1, $2, $3, $4, 'Y', NOW(), NOW())
    RETURNING allergy_id
    `,
    [allergyCode, allergyName, codeSystem, category],
  );
  return Number(inserted[0]!.allergy_id);
}

async function upsertResourceCrosswalk(
  tx: Tx,
  row: StagedFhirResourceRow,
  patientId: number,
  target: HydratedResourceTarget,
): Promise<void> {
  await tx.unsafe(
    `
    INSERT INTO phm_edw.ehr_resource_crosswalk
      (ehr_tenant_id, resource_type, ehr_resource_id, ehr_identifier,
       local_table, local_id, patient_id, source_version_id,
       source_last_updated, hash, last_seen_at)
    VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9::timestamptz, $10, NOW())
    ON CONFLICT ON CONSTRAINT uq_ehr_resource_crosswalk_source
    DO UPDATE SET
      ehr_identifier = EXCLUDED.ehr_identifier,
      local_table = EXCLUDED.local_table,
      local_id = EXCLUDED.local_id,
      patient_id = COALESCE(EXCLUDED.patient_id, phm_edw.ehr_resource_crosswalk.patient_id),
      source_version_id = EXCLUDED.source_version_id,
      source_last_updated = EXCLUDED.source_last_updated,
      hash = EXCLUDED.hash,
      last_seen_at = NOW()
    `,
    [
      Number(row.ehr_tenant_id),
      row.resource_type,
      row.resource_id,
      asUnsafeJson(identifierArray(row.resource['identifier'])),
      target.localTable,
      target.localId,
      patientId,
      row.source_version_id,
      row.source_last_updated,
      row.content_hash,
    ],
  );
}

function supportedResourceTypes(resourceTypes: readonly string[] | undefined): SupportedResourceType[] {
  const requested = resourceTypes && resourceTypes.length > 0 ? resourceTypes : SUPPORTED_RESOURCE_TYPES;
  return requested.filter((type): type is SupportedResourceType =>
    (SUPPORTED_RESOURCE_TYPES as readonly string[]).includes(type),
  );
}

function incrementType(
  result: HydrateStagedRunToEdwResult,
  resourceType: string,
  field: 'seen' | 'hydrated' | 'skipped' | 'failed',
): void {
  result.byResourceType[resourceType] ??= { seen: 0, hydrated: 0, skipped: 0, failed: 0 };
  result.byResourceType[resourceType][field] += 1;
}

function patientResourceIdFromRow(row: StagedFhirResourceRow): string | null {
  return referenceId(row.patient_ref, 'Patient')
    ?? referenceId(row.resource['subject'], 'Patient')
    ?? referenceId(row.resource['patient'], 'Patient')
    ?? referenceId(row.resource['beneficiary'], 'Patient');
}

function firstConcept(value: unknown): CodeConcept {
  const concept = Array.isArray(value) ? value.find(isRecord) : value;
  if (!isRecord(concept)) return emptyConcept();
  const coding = recordArray(concept['coding']).find((item) =>
    cleanString(item['code']) !== null || cleanString(item['display']) !== null,
  );
  return {
    system: cleanString(coding?.['system']),
    code: cleanString(coding?.['code']),
    display: cleanString(coding?.['display']),
    text: cleanString(concept['text']),
  };
}

function medicationReferenceConcept(resource: FhirResource): CodeConcept {
  const reference = record(resource['medicationReference']);
  const refId = referenceId(reference, 'Medication');
  return {
    system: null,
    code: refId,
    display: cleanString(reference?.['display']),
    text: cleanString(reference?.['display']),
  };
}

function emptyConcept(): CodeConcept {
  return { system: null, code: null, display: null, text: null };
}

function conceptLabel(concept: CodeConcept | Record<string, unknown> | undefined | null): string | null {
  if (!concept) return null;
  if ('display' in concept || 'text' in concept || 'code' in concept) {
    return cleanString((concept as CodeConcept).display)
      ?? cleanString((concept as CodeConcept).text)
      ?? cleanString((concept as CodeConcept).code);
  }
  return null;
}

function codingCode(value: Record<string, unknown> | undefined | null): string | null {
  return cleanString(value?.['code']) ?? cleanString(value?.['display']);
}

function conditionStatus(resource: FhirResource): 'ACTIVE' | 'RESOLVED' | 'INACTIVE' | 'UNKNOWN' {
  const status = firstConcept(resource['clinicalStatus']).code?.toLowerCase()
    ?? cleanString(resource['status'])?.toLowerCase();
  if (status === 'resolved') return 'RESOLVED';
  if (status === 'inactive' || status === 'remission' || status === 'entered-in-error') return 'INACTIVE';
  if (status === 'active' || status === 'recurrence' || status === 'relapse') return 'ACTIVE';
  return 'UNKNOWN';
}

function observationValue(resource: FhirResource): { numeric: number | null; text: string | null; unit: string | null } {
  const quantity = record(resource['valueQuantity']);
  if (quantity) {
    return {
      numeric: optionalNumber(quantity['value']),
      text: null,
      unit: truncateNullable(cleanString(quantity['unit']) ?? cleanString(quantity['code']), 50),
    };
  }
  const concept = firstConcept(resource['valueCodeableConcept']);
  const conceptText = conceptLabel(concept);
  if (conceptText) return { numeric: null, text: truncate(conceptText, 500), unit: null };
  const primitive = cleanString(resource['valueString'])
    ?? cleanString(resource['valueBoolean'])
    ?? cleanString(resource['valueInteger'])
    ?? cleanString(resource['valueDateTime']);
  return { numeric: optionalNumber(resource['valueInteger']), text: truncateNullable(primitive, 500), unit: null };
}

function dosageFrequency(dosage: Record<string, unknown> | undefined | null): string | null {
  const timing = record(dosage?.['timing']);
  const repeat = record(timing?.['repeat']);
  if (!repeat) return cleanString(timing?.['code']);
  const frequency = optionalNonNegativeInteger(repeat['frequency']);
  const period = optionalNumber(repeat['period']);
  const unit = cleanString(repeat['periodUnit']);
  if (frequency !== null && period !== null && unit) return `${frequency} per ${period} ${unit}`;
  if (frequency !== null && unit) return `${frequency} per ${unit}`;
  return cleanString(timing?.['code']);
}

function allergyCategory(resource: FhirResource): string | null {
  const values = Array.isArray(resource['category']) ? resource['category'] : [resource['category']];
  return truncateNullable(values.map(cleanString).find((item): item is string => item !== null) ?? null, 50);
}

function allergyReaction(resource: FhirResource): string | null {
  const reactions = recordArray(resource['reaction']);
  for (const reaction of reactions) {
    const manifestation = firstConcept(reaction['manifestation']);
    const label = conceptLabel(manifestation);
    if (label) return label;
    const description = cleanString(reaction['description']);
    if (description) return description;
  }
  return null;
}

function allergySeverity(resource: FhirResource): string | null {
  return recordArray(resource['reaction'])
    .map((reaction) => cleanString(reaction['severity']))
    .find((severity): severity is string => severity !== null) ?? null;
}

function allergyStatus(resource: FhirResource): string | null {
  return conceptLabel(firstConcept(resource['clinicalStatus']))
    ?? conceptLabel(firstConcept(resource['verificationStatus']))
    ?? cleanString(resource['status']);
}

function immunizationReaction(resource: FhirResource): string | null {
  const reaction = recordArray(resource['reaction']).find((item) => record(item['detail']) || cleanString(item['reported']));
  const detail = record(reaction?.['detail']);
  return cleanString(detail?.['display'])
    ?? referenceId(detail, 'Observation')
    ?? cleanString(reaction?.['reported']);
}

function edwConditionCodeSystem(system: string | null): 'ICD-10' | 'SNOMED' | 'ICD-9' | 'OTHER' {
  const value = (system ?? '').toLowerCase();
  if (value.includes('snomed') || value.includes('sct')) return 'SNOMED';
  if (value.includes('icd-10') || value.includes('icd10')) return 'ICD-10';
  if (value.includes('icd-9') || value.includes('icd9')) return 'ICD-9';
  return 'OTHER';
}

function edwMedicationCodeSystem(system: string | null): string {
  const value = (system ?? '').toLowerCase();
  if (value.includes('rxnorm')) return 'RXNORM';
  if (value.includes('ndc')) return 'NDC';
  return 'OTHER';
}

function edwProcedureCodeSystem(system: string | null): string {
  const value = (system ?? '').toLowerCase();
  if (value.includes('snomed') || value.includes('sct')) return 'SNOMED';
  if (value.includes('cpt')) return 'CPT';
  if (value.includes('hcpcs')) return 'HCPCS';
  if (value.includes('icd-10') || value.includes('icd10')) return 'ICD-10-PCS';
  return 'OTHER';
}

function edwGeneralCodeSystem(system: string | null): string {
  const value = (system ?? '').toLowerCase();
  if (value.includes('snomed') || value.includes('sct')) return 'SNOMED';
  if (value.includes('rxnorm')) return 'RXNORM';
  if (value.includes('ndc')) return 'NDC';
  return 'OTHER';
}

function referenceId(value: unknown, expectedType: string): string | null {
  const reference = typeof value === 'string' ? value : cleanString(record(value)?.['reference']);
  if (!reference) return null;
  const parts = reference.split('/').filter(Boolean);
  const typeIndex = parts.lastIndexOf(expectedType);
  if (typeIndex >= 0) return parts[typeIndex + 1] ?? null;
  return parts.length === 1 ? parts[0] ?? null : null;
}

function periodStart(value: unknown): string | null {
  return cleanString(record(value)?.['start']);
}

function periodEnd(value: unknown): string | null {
  return cleanString(record(value)?.['end']);
}

function firstRecord(value: unknown): Record<string, unknown> | null {
  return Array.isArray(value) ? record(value.find(isRecord)) : record(value);
}

function record(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function identifierArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown): string | null {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function optionalPositiveNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function optionalNonNegativeInteger(value: unknown): number | null {
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function optionalNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function datePart(value: string | null): string | null {
  return value ? value.slice(0, 10) : null;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function truncateNullable(value: string | null, maxLength: number): string | null {
  return value ? truncate(value, maxLength) : null;
}

function asUnsafeJson(value: unknown): UnsafeParameter {
  return value as UnsafeParameter;
}

function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
