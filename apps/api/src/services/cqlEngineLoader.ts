// =============================================================================
// Medgnosis API — clinical-reasoning engine bundle loader
// POSTs a FHIR transaction Bundle (a measure bundle or an exported cohort, see
// qicoreExport.ts) to the HAPI CR sidecar's base endpoint. The sidecar applies
// the transaction against its JPA store ("Mode B"); we parse the
// transaction-response to report per-entry status counts and fail loudly when
// the transaction as a whole is rejected (OperationOutcome / non-2xx).
// =============================================================================

import { sql } from '@medgnosis/db';
import type { TransactionBundle } from './fhir/qicoreExport.js';
import { fetchEngineCapability, type CqlEngineCapability } from './fhir/cqlEngineClient.js';
import { writeSystemAuditLog } from './auditLog.js';
import {
  loadQdmEventsToCqlEngine,
  type LoadQdmEventsToCqlEngineInput,
  type LoadQdmEventsToCqlEngineResult,
} from './qdm/qdmCqlLoader.js';

export interface LoadResult {
  total: number;
  created: number; // 201
  ok: number; // 2xx (incl. 200/201)
  failed: number; // non-2xx per-entry responses
}

// -----------------------------------------------------------------------------
// Bounded export limits.
//
// QI-Core/QDM loading projects EDW rows into a FHIR transaction Bundle and POSTs
// it to the sidecar's JPA store. The source observation table is ~1B rows, so a
// load must NEVER stream an unbounded population: every loading entrypoint clamps
// to a hard ceiling. The default is generous enough for a representative cohort
// while keeping a single transaction bundle bounded; an operator may raise it via
// CQL_COHORT_EXPORT_LIMIT but never above CQL_COHORT_EXPORT_HARD_MAX.
// -----------------------------------------------------------------------------

/** Hard upper bound on resources/rows a single CQL load may export. Not overridable. */
export const CQL_COHORT_EXPORT_HARD_MAX = 50_000;

/** Default export ceiling when CQL_COHORT_EXPORT_LIMIT is unset. */
export const CQL_COHORT_EXPORT_DEFAULT_LIMIT = 2_000;

export class CqlExportLimitError extends Error {
  readonly code = 'CQL_EXPORT_LIMIT_EXCEEDED';
  readonly requested: number;
  readonly limit: number;

  constructor(requested: number, limit: number) {
    super(
      `CQL cohort export of ${requested} exceeds the bounded limit of ${limit}; ` +
        'raise CQL_COHORT_EXPORT_LIMIT (capped at ' +
        `${CQL_COHORT_EXPORT_HARD_MAX}) or scope the load by patient/tenant.`,
    );
    this.name = 'CqlExportLimitError';
    this.requested = requested;
    this.limit = limit;
  }
}

/**
 * Resolve the effective per-load export ceiling. Reads CQL_COHORT_EXPORT_LIMIT,
 * falls back to the default, and clamps to [1, CQL_COHORT_EXPORT_HARD_MAX] so a
 * misconfigured env can never authorize an unbounded streaming export.
 */
export function cqlCohortExportLimit(): number {
  const raw = process.env['CQL_COHORT_EXPORT_LIMIT'];
  const parsed = raw === undefined ? CQL_COHORT_EXPORT_DEFAULT_LIMIT : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return CQL_COHORT_EXPORT_DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), CQL_COHORT_EXPORT_HARD_MAX);
}

/**
 * Enforce the bounded export ceiling. Throws {@link CqlExportLimitError} when the
 * requested row count would exceed the effective limit. Returns the clamped
 * limit so callers can pass it down to the bundle selector.
 */
export function assertWithinExportLimit(requested: number, limit = cqlCohortExportLimit()): number {
  if (requested > limit) {
    throw new CqlExportLimitError(requested, limit);
  }
  return limit;
}

interface TransactionResponse {
  entry?: Array<{ response?: { status?: string } }>;
  issue?: Array<{ diagnostics?: string }>;
}

export async function loadBundle(
  engineBaseUrl: string,
  bundle: TransactionBundle,
): Promise<LoadResult> {
  const res = await fetch(engineBaseUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/fhir+json',
      accept: 'application/fhir+json',
    },
    body: JSON.stringify(bundle),
  });

  const body = (await res.json()) as TransactionResponse;

  if (!res.ok) {
    const msg =
      (body.issue ?? []).map((i) => i.diagnostics).filter(Boolean).join('; ') ||
      `HTTP ${res.status}`;
    throw new Error(`engine bundle load failed: ${msg}`);
  }

  const entries = body.entry ?? [];
  let created = 0;
  let ok = 0;
  let failed = 0;
  for (const e of entries) {
    const code = parseInt((e.response?.status ?? '').slice(0, 3), 10);
    if (code >= 200 && code < 300) {
      ok += 1;
      if (code === 201) created += 1;
    } else {
      failed += 1;
    }
  }

  return { total: entries.length, created, ok, failed };
}

// -----------------------------------------------------------------------------
// Operator-triggerable QI-Core/QDM load.
//
// runCqlArtifactLoad() projects a BOUNDED slice of persisted QDM events into a
// QI-Core transaction Bundle and feeds it to the sidecar ("Mode B"), then records
// last-run / last-success evidence + counts in the audit_log (mirroring the
// systemAlerts / ehrSyncAlerts nightly loaders). The result is also consumable by
// the nightly scheduler — the orchestrator wires the step; this module owns the work.
// -----------------------------------------------------------------------------

export const CQL_LOAD_AUDIT_ACTION = 'cql_artifact_load';
export const CQL_LOAD_AUDIT_RESOURCE = 'cql_artifact_load';

export type CqlArtifactLoadStatus = 'loaded' | 'empty' | 'failed';

export interface RunCqlArtifactLoadInput {
  /** Scope/period passthrough to the QDM selector (already internally bounded). */
  selector?: Omit<LoadQdmEventsToCqlEngineInput, 'limit'>;
  /** Per-run export ceiling; clamped to [1, CQL_COHORT_EXPORT_HARD_MAX]. */
  limit?: number;
  /** Operator who triggered the run (audit attribution); null for scheduler. */
  triggeredBy?: string | null;
  /** Engine capability probe timeout; null-safe version capture. */
  capabilityTimeoutMs?: number;
}

export interface CqlArtifactLoadResult {
  status: CqlArtifactLoadStatus;
  /** Effective bounded export ceiling applied to this run. */
  exportLimit: number;
  /** Engine software version at load time (null when unreachable). */
  engineVersion: string | null;
  engineReachable: boolean;
  counts: {
    qdmEventsSelected: number;
    qdmEventsIncluded: number;
    qdmEventsProjected: number;
    bundleEntries: number;
    /** Resources the engine acknowledged with a 2xx response. */
    loadedResources: number;
    /** Resources the engine rejected per-entry. */
    failedResources: number;
  };
  startedAt: string;
  /** ISO timestamp of the most recent successful load (this run, when loaded). */
  lastSuccessAt: string | null;
  durationMs: number;
  error?: string;
}

interface CqlLoadAuditRow {
  details: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Run a bounded QI-Core/QDM load into the clinical-reasoning sidecar and persist
 * last-run/last-success evidence to the audit_log. Never streams an unbounded
 * population: the export ceiling is enforced by {@link cqlCohortExportLimit} and
 * passed to the QDM selector. The engine version is captured null-safely.
 */
export async function runCqlArtifactLoad(
  input: RunCqlArtifactLoadInput = {},
): Promise<CqlArtifactLoadResult> {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const exportLimit = input.limit === undefined
    ? cqlCohortExportLimit()
    : assertWithinExportLimit(input.limit, cqlCohortExportLimit());
  const engineBaseUrl = input.selector?.engineBaseUrl ?? engineUrl();

  // Version probe is best-effort: an unreachable engine records null, not a throw.
  const capability = await fetchEngineCapability(engineBaseUrl, {
    ...(input.capabilityTimeoutMs === undefined ? {} : { timeoutMs: input.capabilityTimeoutMs }),
  });

  try {
    const load: LoadQdmEventsToCqlEngineResult = await loadQdmEventsToCqlEngine({
      ...input.selector,
      engineBaseUrl,
      limit: exportLimit,
    });

    const bundleEntries = load.bundleEntries;
    const loadedResources = load.load?.ok ?? 0;
    const failedResources = load.load?.failed ?? 0;
    const status: CqlArtifactLoadStatus = bundleEntries === 0 ? 'empty' : 'loaded';
    const durationMs = Date.now() - startedAtMs;
    const lastSuccessAt = status === 'loaded' ? new Date().toISOString() : null;

    const result: CqlArtifactLoadResult = {
      status,
      exportLimit,
      engineVersion: capability.version,
      engineReachable: capability.reachable,
      counts: {
        qdmEventsSelected: load.qdmEventsSelected,
        qdmEventsIncluded: load.qdmEventsIncluded,
        qdmEventsProjected: load.qdmEventsProjected,
        bundleEntries,
        loadedResources,
        failedResources,
      },
      startedAt,
      lastSuccessAt,
      durationMs,
    };

    await recordCqlLoadAudit(result, input.triggeredBy ?? null);
    return result;
  } catch (err) {
    const result: CqlArtifactLoadResult = {
      status: 'failed',
      exportLimit,
      engineVersion: capability.version,
      engineReachable: capability.reachable,
      counts: {
        qdmEventsSelected: 0,
        qdmEventsIncluded: 0,
        qdmEventsProjected: 0,
        bundleEntries: 0,
        loadedResources: 0,
        failedResources: 0,
      },
      startedAt,
      lastSuccessAt: null,
      durationMs: Date.now() - startedAtMs,
      error: err instanceof Error ? err.message : String(err),
    };
    await recordCqlLoadAudit(result, input.triggeredBy ?? null).catch(() => undefined);
    throw err;
  }
}

/** PHI-safe last-run/last-success audit details for a load run (counts + timings only). */
export function cqlLoadAuditDetails(
  result: CqlArtifactLoadResult,
  triggeredBy: string | null,
): Record<string, unknown> {
  return {
    status: result.status,
    triggeredBy,
    exportLimit: result.exportLimit,
    engineVersion: result.engineVersion,
    engineReachable: result.engineReachable,
    counts: result.counts,
    startedAt: result.startedAt,
    lastSuccessAt: result.lastSuccessAt,
    durationMs: result.durationMs,
    ...(result.error ? { error: result.error } : {}),
  };
}

async function recordCqlLoadAudit(
  result: CqlArtifactLoadResult,
  triggeredBy: string | null,
): Promise<void> {
  await writeSystemAuditLog(
    CQL_LOAD_AUDIT_ACTION,
    CQL_LOAD_AUDIT_RESOURCE,
    triggeredBy ?? 'operator',
    cqlLoadAuditDetails(result, triggeredBy),
  );
}

export interface CqlLoadRunState {
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastStatus: CqlArtifactLoadStatus | null;
  lastEngineVersion: string | null;
  lastBundleEntries: number | null;
  lastLoadedResources: number | null;
}

/**
 * Read the most recent CQL load run + most recent SUCCESSFUL load from the
 * audit_log. Read-only; used by System Health to surface last-run evidence.
 */
export async function getCqlLoadRunState(): Promise<CqlLoadRunState> {
  const [latest] = await sql<CqlLoadAuditRow[]>`
    SELECT details, created_at::text AS created_at
    FROM audit_log
    WHERE action = ${CQL_LOAD_AUDIT_ACTION}
      AND resource_type = ${CQL_LOAD_AUDIT_RESOURCE}
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `;
  const [lastSuccess] = await sql<CqlLoadAuditRow[]>`
    SELECT details, created_at::text AS created_at
    FROM audit_log
    WHERE action = ${CQL_LOAD_AUDIT_ACTION}
      AND resource_type = ${CQL_LOAD_AUDIT_RESOURCE}
      AND details ->> 'status' = 'loaded'
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `;

  const details = latest?.details ?? null;
  return {
    lastRunAt: latest?.created_at ?? null,
    lastSuccessAt: lastSuccess?.created_at ?? null,
    lastStatus: cqlStatusFromDetails(details),
    lastEngineVersion: stringOrNull(details?.['engineVersion']),
    lastBundleEntries: countFromDetails(details, 'bundleEntries'),
    lastLoadedResources: countFromDetails(details, 'loadedResources'),
  };
}

function engineUrl(): string {
  return process.env['CQL_ENGINE_URL'] ?? 'http://cql-engine:8080/fhir';
}

function cqlStatusFromDetails(
  details: Record<string, unknown> | null,
): CqlArtifactLoadStatus | null {
  const status = details?.['status'];
  return status === 'loaded' || status === 'empty' || status === 'failed' ? status : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function countFromDetails(details: Record<string, unknown> | null, key: string): number | null {
  const counts = details?.['counts'];
  if (counts && typeof counts === 'object' && !Array.isArray(counts)) {
    const value = (counts as Record<string, unknown>)[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

export type { CqlEngineCapability };
