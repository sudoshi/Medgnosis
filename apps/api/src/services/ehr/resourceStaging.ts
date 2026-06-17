// =============================================================================
// Medgnosis API — EHR FHIR resource staging
// =============================================================================

import { createHash } from 'node:crypto';
import { sql } from '@medgnosis/db';
import type { FhirBundle, FhirBundleEntry, FhirResource } from './types.js';

export type FhirStagingStatus = 'staged' | 'normalized' | 'failed' | 'skipped';
export type JsonObject = Record<string, unknown>;

export interface StagedFhirResource {
  id: number;
  orgId: number | null;
  ehrTenantId: number;
  ingestRunId: string;
  resourceType: string;
  resourceId: string;
  patientRef: string | null;
  resource: FhirResource;
  sourceVersionId: string | null;
  sourceLastUpdated: string | null;
  contentHash: string;
  status: FhirStagingStatus;
  errorMessage: string | null;
  errors: unknown[];
  normalized: boolean;
  normalizationError: string | null;
  receivedAt: string;
  updatedAt: string;
}

export interface StageFhirResourceInput {
  orgId: number | null;
  ehrTenantId: number;
  ingestRunId: string;
  resource: FhirResource;
}

export interface StageFhirResourcesInput {
  orgId: number | null;
  ehrTenantId: number;
  ingestRunId: string;
  source: FhirBundle | FhirResource | readonly FhirResource[];
}

export interface StageFhirResourcesResult {
  receivedCount: number;
  staged: StagedFhirResource[];
}

interface StagingCandidate {
  resource: FhirResource;
  fullUrl?: string;
}

interface PreparedStagingResource {
  orgId: number | null;
  ehrTenantId: number;
  ingestRunId: string;
  resourceType: string;
  resourceId: string;
  patientRef: string | null;
  resource: FhirResource;
  sourceVersionId: string | null;
  sourceLastUpdated: string | null;
  contentHash: string;
}

interface StagedFhirResourceRow {
  id: number;
  org_id: number | null;
  ehr_tenant_id: number;
  ingest_run_id: string;
  resource_type: string;
  resource_id: string;
  patient_ref: string | null;
  resource: FhirResource;
  source_version_id: string | null;
  source_last_updated: string | null;
  content_hash: string;
  status: FhirStagingStatus;
  error_message: string | null;
  errors: unknown;
  normalized: boolean;
  normalization_error: string | null;
  received_at: string;
  updated_at: string;
}

function asSqlJson(value: unknown): Parameters<typeof sql.json>[0] {
  return value as Parameters<typeof sql.json>[0];
}

function mapDbNumber(value: number | string): number {
  return Number(value);
}

function mapNullableDbNumber(value: number | string | null): number | null {
  return value == null ? null : mapDbNumber(value);
}

function mapStagedResource(row: StagedFhirResourceRow): StagedFhirResource {
  return {
    id: mapDbNumber(row.id),
    orgId: mapNullableDbNumber(row.org_id),
    ehrTenantId: mapDbNumber(row.ehr_tenant_id),
    ingestRunId: row.ingest_run_id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    patientRef: row.patient_ref,
    resource: row.resource,
    sourceVersionId: row.source_version_id,
    sourceLastUpdated: row.source_last_updated,
    contentHash: row.content_hash,
    status: row.status,
    errorMessage: row.error_message,
    errors: Array.isArray(row.errors) ? row.errors : [],
    normalized: row.normalized,
    normalizationError: row.normalization_error,
    receivedAt: row.received_at,
    updatedAt: row.updated_at,
  };
}

export async function stageFhirResource(input: StageFhirResourceInput): Promise<StagedFhirResource> {
  const staged = await upsertPreparedResource(prepareResource(input, input.resource));
  return staged;
}

export async function stageFhirResources(
  input: StageFhirResourcesInput,
): Promise<StageFhirResourcesResult> {
  const candidates = candidatesFromSource(input.source);
  const staged: StagedFhirResource[] = [];

  for (const candidate of candidates) {
    const prepared = prepareResource(input, candidate.resource, candidate.fullUrl);
    staged.push(await upsertPreparedResource(prepared));
  }

  return {
    receivedCount: candidates.length,
    staged,
  };
}

export function stableFhirResourceHash(resource: FhirResource): string {
  return createHash('sha256').update(stableJson(resource)).digest('hex');
}

function candidatesFromSource(
  source: FhirBundle | FhirResource | readonly FhirResource[],
): StagingCandidate[] {
  if (Array.isArray(source)) {
    return (source as readonly FhirResource[]).map((resource) => ({ resource }));
  }

  const resource = source as FhirResource;
  if (isFhirBundle(resource)) {
    return (resource.entry ?? []).flatMap((entry: FhirBundleEntry) =>
      entry.resource ? [{ resource: entry.resource, fullUrl: entry.fullUrl }] : [],
    );
  }

  return [{ resource }];
}

function prepareResource(
  input: Pick<StageFhirResourceInput, 'orgId' | 'ehrTenantId' | 'ingestRunId'>,
  resource: FhirResource,
  fullUrl?: string,
): PreparedStagingResource {
  const resourceType = nonEmptyString(resource.resourceType, 'FHIR resource is missing resourceType');
  if (resourceType === 'Bundle') {
    throw new Error('FHIR Bundle resources must be staged through their entries');
  }

  const resourceId = resource.id
    ? nonEmptyString(resource.id, `FHIR ${resourceType} resource id cannot be empty`)
    : resourceIdFromFullUrl(resourceType, fullUrl);
  if (!resourceId) {
    throw new Error(`FHIR ${resourceType} resource is missing id and cannot be staged idempotently`);
  }

  return {
    orgId: input.orgId,
    ehrTenantId: input.ehrTenantId,
    ingestRunId: input.ingestRunId,
    resourceType,
    resourceId,
    patientRef: extractPatientRef(resource),
    resource,
    sourceVersionId: cleanString(resource.meta?.versionId),
    sourceLastUpdated: cleanString(resource.meta?.lastUpdated),
    contentHash: stableFhirResourceHash(resource),
  };
}

async function upsertPreparedResource(resource: PreparedStagingResource): Promise<StagedFhirResource> {
  const rows = await sql<StagedFhirResourceRow[]>`
    INSERT INTO phm_edw.fhir_ingest_staging
      (org_id, ehr_tenant_id, ingest_run_id, resource_type, resource_id, patient_ref,
       resource, source_version_id, source_last_updated, content_hash, status,
       error_message, errors, normalized, normalization_error)
    VALUES (
      ${resource.orgId},
      ${resource.ehrTenantId},
      ${resource.ingestRunId}::uuid,
      ${resource.resourceType},
      ${resource.resourceId},
      ${resource.patientRef},
      ${sql.json(asSqlJson(resource.resource))},
      ${resource.sourceVersionId},
      ${resource.sourceLastUpdated}::timestamptz,
      ${resource.contentHash},
      'staged',
      NULL,
      ${sql.json(asSqlJson([]))},
      false,
      NULL
    )
    ON CONFLICT ON CONSTRAINT uq_fhir_ingest_staging_source_identity
    DO UPDATE SET
      ingest_run_id = EXCLUDED.ingest_run_id,
      patient_ref = EXCLUDED.patient_ref,
      resource = EXCLUDED.resource,
      source_last_updated = EXCLUDED.source_last_updated,
      status = 'staged',
      error_message = NULL,
      errors = '[]'::jsonb,
      normalized = false,
      normalization_error = NULL,
      received_at = NOW(),
      updated_at = NOW()
    RETURNING id,
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
              status,
              error_message,
              errors,
              normalized,
              normalization_error,
              received_at::text AS received_at,
              updated_at::text AS updated_at
  `;

  const row = rows[0];
  if (!row) {
    throw new Error('Unable to stage FHIR resource');
  }
  return mapStagedResource(row);
}

function isFhirBundle(resource: FhirResource): resource is FhirBundle {
  return resource.resourceType === 'Bundle';
}

function nonEmptyString(value: string | undefined, message: string): string {
  const cleaned = cleanString(value);
  if (!cleaned) {
    throw new Error(message);
  }
  return cleaned;
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function resourceIdFromFullUrl(resourceType: string, fullUrl: string | undefined): string | null {
  const cleanedFullUrl = cleanString(fullUrl);
  if (!cleanedFullUrl) return null;

  let path = cleanedFullUrl;
  try {
    path = new URL(cleanedFullUrl).pathname;
  } catch {
    // Relative FHIR fullUrl values such as Patient/123 are valid here.
  }

  const pathParts = path.split('/').filter(Boolean);
  const typeIndex = pathParts.lastIndexOf(resourceType);
  const idFromPath = typeIndex >= 0 ? pathParts[typeIndex + 1] : undefined;
  return cleanString(idFromPath);
}

function extractPatientRef(resource: FhirResource): string | null {
  if (resource.resourceType === 'Patient' && resource.id) {
    return `Patient/${resource.id}`;
  }

  return (
    referenceFrom(resource['subject'])
    ?? referenceFrom(resource['patient'])
    ?? referenceFrom(resource['beneficiary'])
  );
}

function referenceFrom(value: unknown): string | null {
  if (!isRecord(value)) return null;
  return cleanString(value['reference']);
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : canonicalize(item)));
  }

  if (isRecord(value)) {
    const normalized: JsonObject = {};
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      if (child !== undefined) {
        normalized[key] = canonicalize(child);
      }
    }
    return normalized;
  }

  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
