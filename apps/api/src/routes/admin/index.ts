// =============================================================================
// Medgnosis API — Admin routes
// All routes require authenticated admin role.
// Actual table schemas:
//   app_users: id (uuid), first_name, last_name, email, role, is_active, last_login_at
//   audit_log: id (uuid), user_id (uuid→app_users.id), action, resource_type, resource_id, details (jsonb), ip_address, user_agent, created_at
//   etl_log:   etl_log_id, source_system, load_status, rows_inserted, created_date
//   _migrations: id, name, applied_at
// =============================================================================

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import identityReviewRoutes from './identityReview.js';
import {
  exportPatientsToOmop,
  exportConditionsToOmop,
  exportMeasurementsToOmop,
  generateDeidentifiedCohort,
} from '../../services/omopExport.js';
import { sql } from '@medgnosis/db';
import { getMeasureEvaluator } from '../../services/measureEvaluator.js';
import { getSolrClient, isSolrAvailable } from '../../plugins/solr.js';
import { config } from '../../config.js';
import { fetchOidcDiscovery } from '../../services/auth/oidc/discovery.js';
import { getOidcProviderConfig } from '../../services/auth/oidc/providerConfig.js';
import {
  recordAuthProviderTestEvent,
  type AuthProviderTestEventInput,
} from '../../services/auth/providerHealth.js';
import { getSystemHealth } from '../../services/systemHealth.js';
import {
  dispatchEhrSyncAlertSnapshot,
  ehrSyncAlertAuditDetails,
} from '../../services/ehr/syncAlerts.js';
import {
  listMeasurePromotionConfigs,
  updateMeasurePromotionConfig,
  promoteMeasureToCqlAuthoritative,
  MeasurePromotionError,
  type MeasurePromotionMode,
  type PromoteMeasureToCqlAuthoritativeResult,
} from '../../services/measureReconciliation.js';
import {
  generateMeasureSemanticDriftDossier,
  getMeasureSemanticDriftDetail,
  listMeasureSemanticDriftWorklist,
  MeasureSemanticDriftError,
} from '../../services/measureSemanticDriftDossier.js';
import {
  getQdmBridgeOperationalStatus,
  listQdmBridgeIssues,
  listQdmBridgeRuns,
  type QdmBridgeIssueSeverity,
  type QdmBridgeIssueStatus,
  type QdmBridgeOperation,
  type QdmBridgeRunStatus,
} from '../../services/qdm/bridgeOps.js';
import {
  createPendingPasswordHash,
  createUserInvite,
  sendInviteEmail,
  type CreatedInvite,
} from '../../services/auth/invites.js';

interface AuthProviderRow {
  provider_type: string;
  display_name: string;
  enabled: boolean;
  settings: Record<string, unknown>;
  updated_at: string;
}

interface AdminUserScopeRow {
  id: string;
  role: string;
  is_active: boolean;
  org_id: number | null;
}

const PROMOTION_MODES: MeasurePromotionMode[] = [
  'sql_only',
  'cql_shadow',
  'cql_authoritative',
  'manual_hold',
];
const QDM_BRIDGE_OPERATIONS: QdmBridgeOperation[] = [
  'normalization',
  'cql_shadow_refresh',
  'star_refresh',
  'reconciliation',
  'semantic_drift_dossier',
  'promotion_validation',
  'manual_review',
];
const QDM_BRIDGE_RUN_STATUSES: QdmBridgeRunStatus[] = ['running', 'completed', 'failed', 'canceled'];
const QDM_BRIDGE_ISSUE_SEVERITIES: QdmBridgeIssueSeverity[] = ['info', 'warning', 'error', 'critical'];
const QDM_BRIDGE_ISSUE_STATUSES: QdmBridgeIssueStatus[] = [
  'open',
  'acknowledged',
  'resolved',
  'suppressed',
];
const VISIBLE_AUTH_PROVIDER_TYPES = ['local', 'oidc'] as const;
const MANAGED_AUTH_PROVIDER_TYPES = ['oidc'] as const;

type VisibleAuthProviderType = (typeof VISIBLE_AUTH_PROVIDER_TYPES)[number];
type ManagedAuthProviderType = (typeof MANAGED_AUTH_PROVIDER_TYPES)[number];

function isVisibleAuthProviderType(value: string): value is VisibleAuthProviderType {
  return (VISIBLE_AUTH_PROVIDER_TYPES as readonly string[]).includes(value);
}

function isManagedAuthProviderType(value: string): value is ManagedAuthProviderType {
  return (MANAGED_AUTH_PROVIDER_TYPES as readonly string[]).includes(value);
}

function requestAdminOrgId(request: FastifyRequest): number | null {
  return positiveIntFromUnknown(request.user.org_id);
}

function positiveIntFromUnknown(value: unknown): number | null {
  if (Array.isArray(value)) return null;
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim().length > 0
      ? Number(value)
      : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function isGlobalAdminRequest(request: FastifyRequest): boolean {
  return request.user.role === 'super_admin';
}

function adminScopeError(reply: FastifyReply) {
  return reply.status(403).send({
    success: false,
    error: {
      code: 'ADMIN_ORG_SCOPE_REQUIRED',
      message: 'Admin organization scope is required for this operation',
    },
  });
}

async function requireAdminUserInScope(
  request: FastifyRequest,
  reply: FastifyReply,
  userId: string,
): Promise<AdminUserScopeRow | undefined> {
  const orgId = requestAdminOrgId(request);
  if (!isGlobalAdminRequest(request) && orgId === null) {
    await adminScopeError(reply);
    return undefined;
  }

  const [target] = isGlobalAdminRequest(request)
    ? await sql<AdminUserScopeRow[]>`
        SELECT id, role, is_active, org_id
        FROM public.app_users
        WHERE id = ${userId}::uuid
      `
    : await sql<AdminUserScopeRow[]>`
        SELECT id, role, is_active, org_id
        FROM public.app_users
        WHERE id = ${userId}::uuid
          AND org_id = ${orgId}
      `;

  if (!target) {
    await reply.status(404).send({ success: false, error: { message: 'User not found' } });
    return undefined;
  }

  if (target.role === 'super_admin' && !isGlobalAdminRequest(request)) {
    await reply.status(403).send({
      success: false,
      error: { message: 'Only a super-admin can modify a super-admin account' },
    });
    return undefined;
  }

  return target;
}

function listFromUnknown(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return undefined;
}

function normalizeProviderSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  const stringKeys = [
    'label',
    'discovery_url',
    'client_id',
    'client_secret_ref',
    'redirect_uri',
  ];

  for (const key of stringKeys) {
    const value = settings[key];
    if (typeof value === 'string') normalized[key] = value.trim();
  }

  for (const key of ['scopes', 'allowed_groups', 'admin_groups']) {
    const list = listFromUnknown(settings[key]);
    if (list) normalized[key] = list;
  }

  return normalized;
}

function maskProvider(row: AuthProviderRow) {
  return {
    ...row,
    settings: Object.fromEntries(
      Object.entries(row.settings ?? {}).map(([key, value]) => [
        key,
        /secret|password|private_key/i.test(key) &&
        !/_ref$/i.test(key) &&
        typeof value === 'string' &&
        value.length > 0
          ? '__stored__'
          : value,
      ]),
    ),
  };
}

async function recordProviderTestEvidence(
  app: FastifyInstance,
  input: AuthProviderTestEventInput,
): Promise<void> {
  try {
    await recordAuthProviderTestEvent(input);
  } catch (err) {
    app.log.error(
      { err, provider_type: input.providerType, status: input.status },
      'Failed to record auth provider test evidence',
    );
  }
}

function positiveInt(value: unknown): number | null {
  if (typeof value === 'string' && !/^[1-9]\d*$/.test(value)) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function nonnegativeInt(value: unknown): number | null {
  if (typeof value === 'string' && !/^(0|[1-9]\d*)$/.test(value)) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function optionalEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !allowed.includes(value as T)) return null;
  return value as T;
}

function mapMeasurePromotionError(err: unknown, reply: FastifyReply) {
  if (err instanceof MeasurePromotionError) {
    const details = safePromotionErrorDetails(err.details);
    return reply.status(err.statusCode).send({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(Object.keys(details).length > 0 ? { details } : {}),
      },
    });
  }
  if (err instanceof MeasureSemanticDriftError) {
    return reply.status(err.statusCode).send({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }
  const message = err instanceof Error ? err.message : String(err);
  return reply.status(500).send({
    success: false,
    error: { code: 'PROMOTION_GOVERNANCE_FAILED', message },
  });
}

interface PromotionAttemptAuditInput {
  measureCode: string;
  reconciliationRunId: number;
  measureReportId: number;
  qdmRunId?: string | null;
  dryRunRequested?: boolean;
  requireFullPopulation?: boolean;
  statementTimeoutMs?: number;
}

function promotionAttemptBaseAuditDetails(input: PromotionAttemptAuditInput): Record<string, unknown> {
  const details: Record<string, unknown> = {
    measureCode: input.measureCode,
    reconciliationRunId: input.reconciliationRunId,
    measureReportId: input.measureReportId,
    qdmRunIdPresent: typeof input.qdmRunId === 'string' && input.qdmRunId.trim().length > 0,
    dryRunRequested: input.dryRunRequested === true,
    requireFullPopulation: input.requireFullPopulation !== false,
  };
  if (input.statementTimeoutMs !== undefined) details.statementTimeoutMs = input.statementTimeoutMs;
  return details;
}

function promotionCoverageAuditDetails(
  coverage: PromoteMeasureToCqlAuthoritativeResult['coverage'] | null | undefined,
): Record<string, unknown> | undefined {
  if (!coverage) return undefined;
  return {
    evidenceRowsSeen: Number(coverage.evidenceRowsSeen ?? 0),
    evidenceRowsPromotable: Number(coverage.evidenceRowsPromotable ?? 0),
    distinctPatientKeys: Number(coverage.distinctPatientKeys ?? 0),
    distinctMeasureKeys: Number(coverage.distinctMeasureKeys ?? 0),
    expectedInitialPopulation: coverage.expectedInitialPopulation ?? null,
  };
}

function promotionMaterializationAuditDetails(
  materialization: PromoteMeasureToCqlAuthoritativeResult['materialization'] | null | undefined,
): Record<string, unknown> | undefined {
  if (!materialization) return undefined;
  return {
    measureReportId: Number(materialization.measureReportId),
    source: materialization.source,
    evaluationScope: materialization.evaluationScope,
    evidenceRowsSeen: Number(materialization.evidenceRowsSeen),
    evidenceRowsPromoted: Number(materialization.evidenceRowsPromoted),
    evidenceRowsSkipped: Number(materialization.evidenceRowsSkipped),
    resultRowsUpserted: Number(materialization.resultRowsUpserted),
    selectedEvidenceRows: Number(materialization.qdmEvidenceSelected),
    bridgeRowsUpserted: Number(materialization.bridgeRowsUpserted),
    factEvidenceRowsUpserted: Number(materialization.factEvidenceRowsUpserted),
  };
}

function promotionSuccessAuditDetails(input: PromotionAttemptAuditInput & {
  promotion: PromoteMeasureToCqlAuthoritativeResult;
}): Record<string, unknown> {
  const details: Record<string, unknown> = {
    ...promotionAttemptBaseAuditDetails(input),
    status: input.promotion.dryRun ? 'dry_run' : 'promoted',
    rowsPromoted: input.promotion.rowsPromoted,
    promotionMode: input.promotion.config?.promotionMode,
    authoritativeSource: input.promotion.config?.authoritativeSource,
    evaluatorSource: input.promotion.config?.evaluatorSource,
  };
  const coverage = promotionCoverageAuditDetails(input.promotion.coverage);
  const materialization = promotionMaterializationAuditDetails(input.promotion.materialization);
  if (coverage) details.coverage = coverage;
  if (materialization) details.materialization = materialization;
  return details;
}

function promotionFailureAuditDetails(input: PromotionAttemptAuditInput & {
  err: unknown;
}): Record<string, unknown> {
  const details: Record<string, unknown> = {
    ...promotionAttemptBaseAuditDetails(input),
    status: 'failed',
  };
  if (input.err instanceof MeasurePromotionError || input.err instanceof MeasureSemanticDriftError) {
    details.errorCode = input.err.code;
    details.httpStatus = input.err.statusCode;
    const errorDetails = safePromotionErrorDetails(input.err.details);
    if (Object.keys(errorDetails).length > 0) details.errorDetails = errorDetails;
  } else {
    details.errorCode = 'PROMOTION_GOVERNANCE_FAILED';
    details.httpStatus = 500;
  }
  return details;
}

function safePromotionErrorDetails(details?: Record<string, unknown>): Record<string, unknown> {
  if (!details) return {};
  const sanitized: Record<string, unknown> = {};
  copyStringDetail(sanitized, details, 'evaluationScope');
  copyStringDetail(sanitized, details, 'status');
  copyStringDetail(sanitized, details, 'reportMeasureCode');
  copyStringDetail(sanitized, details, 'measureCode');
  copyStringDetail(sanitized, details, 'reportType');
  copyBooleanDetail(sanitized, details, 'promotionEligible');
  copyBooleanDetail(sanitized, details, 'agree');
  copyNumberDetail(sanitized, details, 'configuredArtifactId');
  copyNumberDetail(sanitized, details, 'latestArtifactId');
  copyNumberDetail(sanitized, details, 'runArtifactId');
  copyNumberDetail(sanitized, details, 'reconciliationMeasureReportId');
  copyNumberDetail(sanitized, details, 'measureReportId');
  copyNumberDetail(sanitized, details, 'tolerance');
  copyNumberDetail(sanitized, details, 'evidenceRowsSeen');
  copyNumberDetail(sanitized, details, 'evidenceRowsPromotable');
  copyNumberDetail(sanitized, details, 'distinctPatientKeys');
  copyNumberDetail(sanitized, details, 'distinctMeasureKeys');
  copyNullableNumberDetail(sanitized, details, 'expectedInitialPopulation');
  copyPopulationCountsDetail(sanitized, details, 'deltas');
  copyPopulationCountsDetail(sanitized, details, 'reportCounts');
  copyPopulationCountsDetail(sanitized, details, 'runCqlCounts');
  copyPeriodDetail(sanitized, details, 'reportPeriod');
  copyPeriodDetail(sanitized, details, 'reconciliationPeriod');
  return sanitized;
}

function copyStringDetail(target: Record<string, unknown>, source: Record<string, unknown>, key: string) {
  const value = source[key];
  if (typeof value === 'string') target[key] = value;
}

function copyBooleanDetail(target: Record<string, unknown>, source: Record<string, unknown>, key: string) {
  const value = source[key];
  if (typeof value === 'boolean') target[key] = value;
}

function copyNumberDetail(target: Record<string, unknown>, source: Record<string, unknown>, key: string) {
  const value = source[key];
  if (typeof value === 'number' && Number.isFinite(value)) target[key] = value;
}

function copyNullableNumberDetail(target: Record<string, unknown>, source: Record<string, unknown>, key: string) {
  const value = source[key];
  if (value === null) {
    target[key] = null;
    return;
  }
  copyNumberDetail(target, source, key);
}

function copyPopulationCountsDetail(target: Record<string, unknown>, source: Record<string, unknown>, key: string) {
  const value = source[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const record = value as Record<string, unknown>;
  const counts: Record<string, number> = {};
  for (const countKey of ['denominator', 'numerator', 'exclusion'] as const) {
    if (typeof record[countKey] === 'number' && Number.isFinite(record[countKey])) {
      counts[countKey] = record[countKey];
    }
  }
  if (Object.keys(counts).length > 0) target[key] = counts;
}

function copyPeriodDetail(target: Record<string, unknown>, source: Record<string, unknown>, key: string) {
  const value = source[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const record = value as Record<string, unknown>;
  const period: Record<string, string> = {};
  if (typeof record.start === 'string') period.start = record.start;
  if (typeof record.end === 'string') period.end = record.end;
  if (Object.keys(period).length > 0) target[key] = period;
}

async function isLastActiveSuperAdmin(userId: string): Promise<boolean> {
  const [target] = await sql<{ role: string; is_active: boolean }[]>`
    SELECT role, is_active
    FROM public.app_users
    WHERE id = ${userId}::uuid
  `;

  if (target?.role !== 'super_admin' || !target.is_active) {
    return false;
  }

  const [remaining] = await sql<{ count: string }[]>`
    SELECT COUNT(*) AS count
    FROM public.app_users
    WHERE role = 'super_admin'
      AND is_active = TRUE
      AND id <> ${userId}::uuid
  `;

  return Number(remaining?.count ?? 0) === 0;
}

interface InviteRecipient {
  email: string;
  first_name: string;
}

interface RevokedInviteRow {
  id: string;
  user_id: string;
  expires_at: string;
  revoked_at: string;
}

async function sendInviteIfConfigured(
  app: FastifyInstance,
  recipient: InviteRecipient,
  invite: CreatedInvite,
): Promise<boolean> {
  try {
    return await sendInviteEmail({
      toEmail: recipient.email,
      firstName: recipient.first_name,
      activationUrl: invite.activationUrl,
      expiresAt: invite.invite.expires_at,
    });
  } catch (err) {
    app.log.error({ err, invite_id: invite.invite.id }, 'Failed to send invite email');
    return false;
  }
}

function invitePayload(invite: CreatedInvite, emailSent: boolean) {
  return {
    id: invite.invite.id,
    expires_at: invite.invite.expires_at,
    activation_url: invite.activationUrl,
    email_sent: emailSent,
  };
}

export default async function adminRoutes(app: FastifyInstance) {
  // Require admin role for all admin routes
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireRole(['admin']));

  // Identity steward review (EMPI) — inherits the admin hooks above.
  await app.register(identityReviewRoutes, { prefix: '/identity' });

  // ---- Authentication Providers ----

  app.get('/auth-providers', { preHandler: app.requireSuperAdmin }, async () => {
    const providers = await sql<AuthProviderRow[]>`
      SELECT provider_type, display_name, enabled, settings, updated_at
      FROM public.auth_provider_settings
      ORDER BY provider_type
    `;

    return {
      success: true,
      data: { providers: providers.filter((provider) => isVisibleAuthProviderType(provider.provider_type)).map(maskProvider) },
    };
  });

  app.patch('/auth-providers/:type', { preHandler: app.requireSuperAdmin }, async (req, reply) => {
    const { type } = req.params as { type: string };
    const body = req.body as {
      display_name?: string;
      enabled?: boolean;
      settings?: Record<string, unknown>;
    };

    if (!isManagedAuthProviderType(type)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'UNSUPPORTED_PROVIDER',
          message: 'Only OIDC provider settings are managed here; local auth is environment-controlled',
        },
      });
    }

    const [existing] = await sql<AuthProviderRow[]>`
      SELECT provider_type, display_name, enabled, settings, updated_at
      FROM public.auth_provider_settings
      WHERE provider_type = ${type}
    `;
    const nextSettings = {
      ...(existing?.settings ?? {}),
      ...normalizeProviderSettings(body.settings ?? {}),
    };

    const [provider] = await sql<AuthProviderRow[]>`
      INSERT INTO public.auth_provider_settings (
        provider_type, display_name, enabled, settings, updated_by, updated_at
      )
      VALUES (
        ${type},
        ${body.display_name?.trim() || existing?.display_name || type.toUpperCase()},
        ${body.enabled ?? existing?.enabled ?? false},
        ${JSON.stringify(nextSettings)}::jsonb,
        ${req.user.sub}::uuid,
        NOW()
      )
      ON CONFLICT (provider_type)
      DO UPDATE SET
        display_name = EXCLUDED.display_name,
        enabled = EXCLUDED.enabled,
        settings = EXCLUDED.settings,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING provider_type, display_name, enabled, settings, updated_at
    `;

    await req.auditLog('auth_provider_update', 'auth_provider', type, {
      provider_type: type,
      enabled: provider?.enabled ?? false,
    });

    return { success: true, data: { provider: provider ? maskProvider(provider) : null } };
  });

  app.post('/auth-providers/:type/test', { preHandler: app.requireSuperAdmin }, async (req, reply) => {
    const { type } = req.params as { type: string };
    if (type !== 'oidc') {
      return reply.status(400).send({
        success: false,
        error: { code: 'UNSUPPORTED_TEST', message: 'Only OIDC provider tests are currently supported' },
      });
    }

    const startedAt = Date.now();
    let clientConfigured: boolean | null = null;
    let redirectUri: string | null = null;

    try {
      const provider = await getOidcProviderConfig();
      clientConfigured = Boolean(provider.clientId);
      redirectUri = provider.redirectUri;
      const discovery = await fetchOidcDiscovery(provider.discoveryUrl);
      await recordProviderTestEvidence(app, {
        providerType: 'oidc',
        status: 'ok',
        testedBy: req.user.sub,
        responseMs: Date.now() - startedAt,
        issuer: discovery.issuer,
        authorizationEndpoint: discovery.authorization_endpoint,
        tokenEndpoint: discovery.token_endpoint,
        jwksUri: discovery.jwks_uri,
        clientConfigured,
        redirectUri,
      });
      return {
        success: true,
        data: {
          issuer: discovery.issuer,
          authorization_endpoint: discovery.authorization_endpoint,
          token_endpoint: discovery.token_endpoint,
          jwks_uri: discovery.jwks_uri,
          client_configured: Boolean(provider.clientId),
          redirect_uri: provider.redirectUri,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await recordProviderTestEvidence(app, {
        providerType: 'oidc',
        status: 'error',
        testedBy: req.user.sub,
        responseMs: Date.now() - startedAt,
        clientConfigured,
        redirectUri,
        errorCode: 'PROVIDER_TEST_FAILED',
        errorMessage: message,
      });
      return reply.status(502).send({
        success: false,
        error: { code: 'PROVIDER_TEST_FAILED', message },
      });
    }
  });

  // ---- System Health ----

  app.get('/system-health', { preHandler: app.requirePermission('admin:system-health') }, async () => {
    return {
      success: true,
      data: await getSystemHealth(),
    };
  });

  app.post('/system-health/ehr-sync-alerts/dispatch', { preHandler: app.requirePermission('admin:system-health') }, async (req) => {
    const result = await dispatchEhrSyncAlertSnapshot();
    await req.auditLog(
      'ehr_sync_alert_dispatch',
      'ehr_sync_alert',
      'manual',
      ehrSyncAlertAuditDetails(result, 'manual'),
    );
    return {
      success: true,
      data: { ehrSyncAlertDispatch: result },
    };
  });

  // ---- OMOP CDM Export ----

  app.get('/omop/persons', async () => {
    const data = await exportPatientsToOmop();
    return { success: true, data: { persons: data, count: data.length } };
  });

  app.get('/omop/conditions', async (req) => {
    const { patient_id } = req.query as { patient_id?: string };
    const data = await exportConditionsToOmop(
      patient_id ? Number(patient_id) : undefined,
    );
    return { success: true, data: { conditions: data, count: data.length } };
  });

  app.get('/omop/measurements', async (req) => {
    const { patient_id } = req.query as { patient_id?: string };
    const data = await exportMeasurementsToOmop(
      patient_id ? Number(patient_id) : undefined,
    );
    return { success: true, data: { measurements: data, count: data.length } };
  });

  app.post('/omop/cohort', async (req) => {
    const criteria = req.body as {
      min_age?: number;
      max_age?: number;
      conditions?: string[];
    };
    const data = await generateDeidentifiedCohort(criteria);
    return { success: true, data: { cohort: data, count: data.length } };
  });

  // ---- System Stats ----

  app.get('/stats', async () => {
    const [patients, providers, openGaps, starBundle, starComposite, etlLog] = await Promise.all([
      sql`SELECT COUNT(*) AS count FROM phm_edw.patient`,
      sql`SELECT COUNT(*) AS count FROM phm_edw.provider`,
      sql`SELECT COUNT(*) AS count FROM phm_edw.care_gap WHERE resolved_date IS NULL`,
      sql`SELECT COUNT(*) AS count FROM phm_star.fact_patient_bundle`,
      sql`SELECT COUNT(*) AS count FROM phm_star.fact_patient_composite`,
      sql`SELECT load_status, source_system, rows_inserted, created_date
          FROM phm_edw.etl_log ORDER BY created_date DESC LIMIT 1`,
    ]);

    const lastEtl = etlLog[0] ?? null;

    return {
      success: true,
      data: {
        total_providers:        Number(providers[0].count),
        active_patients:        Number(patients[0].count),
        open_care_gaps:         Number(openGaps[0].count),
        star_bundle_rows:       Number(starBundle[0].count),
        star_composite_rows:    Number(starComposite[0].count),
        last_etl_status:        lastEtl?.load_status ?? null,
        last_etl_system:        lastEtl?.source_system ?? null,
        last_etl_rows_inserted: lastEtl ? Number(lastEtl.rows_inserted) : null,
        last_etl_at:            lastEtl?.created_date ?? null,
      },
    };
  });

  // ---- User Management ----

  app.get('/users', async (req, reply) => {
    const orgId = requestAdminOrgId(req);
    if (!isGlobalAdminRequest(req) && orgId === null) return adminScopeError(reply);

    const users = isGlobalAdminRequest(req)
      ? await sql`
          SELECT
            u.id, u.email, u.first_name, u.last_name, u.role, u.is_active,
            u.created_at, u.last_login_at,
            p.first_name AS provider_first_name,
            p.last_name  AS provider_last_name,
            CASE
              WHEN pending_invite.id IS NULL THEN NULL
              ELSE jsonb_build_object(
                'id', pending_invite.id,
                'expires_at', pending_invite.expires_at::text,
                'created_at', pending_invite.created_at::text,
                'status',
                  CASE
                    WHEN pending_invite.expires_at <= NOW() THEN 'expired'
                    ELSE 'pending'
                  END
              )
            END AS pending_invite
          FROM public.app_users u
          LEFT JOIN phm_edw.provider p ON p.email = u.email
          LEFT JOIN LATERAL (
            SELECT i.id, i.expires_at, i.created_at
            FROM public.app_user_invites i
            WHERE i.user_id = u.id
              AND i.accepted_at IS NULL
              AND i.revoked_at IS NULL
            ORDER BY i.created_at DESC
            LIMIT 1
          ) pending_invite ON TRUE
          ORDER BY u.created_at DESC
        `
      : await sql`
          SELECT
            u.id, u.email, u.first_name, u.last_name, u.role, u.is_active,
            u.created_at, u.last_login_at,
            p.first_name AS provider_first_name,
            p.last_name  AS provider_last_name,
            CASE
              WHEN pending_invite.id IS NULL THEN NULL
              ELSE jsonb_build_object(
                'id', pending_invite.id,
                'expires_at', pending_invite.expires_at::text,
                'created_at', pending_invite.created_at::text,
                'status',
                  CASE
                    WHEN pending_invite.expires_at <= NOW() THEN 'expired'
                    ELSE 'pending'
                  END
              )
            END AS pending_invite
          FROM public.app_users u
          LEFT JOIN phm_edw.provider p ON p.email = u.email
          LEFT JOIN LATERAL (
            SELECT i.id, i.expires_at, i.created_at
            FROM public.app_user_invites i
            WHERE i.user_id = u.id
              AND i.accepted_at IS NULL
              AND i.revoked_at IS NULL
            ORDER BY i.created_at DESC
            LIMIT 1
          ) pending_invite ON TRUE
          WHERE u.org_id = ${orgId}
            AND u.role <> 'super_admin'
          ORDER BY u.created_at DESC
        `;
    return { success: true, data: { users } };
  });

  app.post('/users', async (req, reply) => {
    const { email, first_name, last_name, role, org_id, orgId } = req.body as {
      email: string;
      first_name: string;
      last_name?: string;
      role?: string;
      org_id?: string | number;
      orgId?: string | number;
    };
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const trimmedFirstName = typeof first_name === 'string' ? first_name.trim() : '';
    const trimmedLastName = typeof last_name === 'string' ? last_name.trim() : '';

    if (!normalizedEmail || !trimmedFirstName) {
      return reply.status(400).send({ success: false, error: { message: 'email and first_name are required' } });
    }

    const validRoles = ['provider', 'analyst', 'admin', 'super_admin', 'care_coordinator'];
    const resolvedRole = validRoles.includes(role ?? '') ? role! : 'provider';

    if (resolvedRole === 'super_admin' && req.user.role !== 'super_admin') {
      return reply.status(403).send({
        success: false,
        error: { message: 'Only a super-admin can create another super-admin' },
      });
    }
    const adminOrgId = requestAdminOrgId(req);
    if (!isGlobalAdminRequest(req) && adminOrgId === null) return adminScopeError(reply);
    const requestedOrgValue = org_id ?? orgId;
    const requestedOrgId = requestedOrgValue === undefined ? null : positiveIntFromUnknown(requestedOrgValue);
    if (requestedOrgValue !== undefined && requestedOrgId === null) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_ORG_ID',
          message: 'org_id must be a positive integer',
        },
      });
    }

    let targetOrgId: number | null;
    if (isGlobalAdminRequest(req)) {
      targetOrgId = resolvedRole === 'super_admin' ? null : (requestedOrgId ?? adminOrgId);
      if (targetOrgId === null) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'TARGET_ORG_REQUIRED',
            message: 'org_id is required when creating non-super-admin users',
          },
        });
      }
    } else {
      targetOrgId = adminOrgId;
    }

    const [existing] = await sql`SELECT id FROM public.app_users WHERE lower(email) = ${normalizedEmail}`;
    if (existing) {
      return reply.status(409).send({ success: false, error: { message: 'A user with this email already exists' } });
    }

    const pendingPasswordHash = await createPendingPasswordHash();
    const [user] = await sql`
      INSERT INTO public.app_users (email, first_name, last_name, role, org_id, password_hash, must_change_password, is_active)
      VALUES (
        ${normalizedEmail},
        ${trimmedFirstName},
        ${trimmedLastName},
        ${resolvedRole},
        ${targetOrgId},
        ${pendingPasswordHash},
        FALSE,
        FALSE
      )
      RETURNING id, email, first_name, last_name, role, is_active, created_at
    `;

    const invite = await createUserInvite({
      userId: String(user.id),
      createdBy: req.user.sub,
    });
    const emailSent = await sendInviteIfConfigured(app, {
      email: String(user.email),
      first_name: String(user.first_name),
    }, invite);
    await req.auditLog('user_invite_create', 'app_user', String(user.id), {
      invite_id: invite.invite.id,
      role: user.role,
      email_sent: emailSent,
      expires_at: invite.invite.expires_at,
    });

    return { success: true, data: { user, invite: invitePayload(invite, emailSent) } };
  });

  app.post('/users/:id/resend-invite', async (req, reply) => {
    const { id } = req.params as { id: string };
    const orgId = requestAdminOrgId(req);
    if (!isGlobalAdminRequest(req) && orgId === null) return adminScopeError(reply);
    const [user] = isGlobalAdminRequest(req) ? await sql<{
      id: string;
      email: string;
      first_name: string;
      last_name: string;
      role: string;
      is_active: boolean;
    }[]>`
      SELECT id, email, first_name, last_name, role, is_active
      FROM public.app_users
      WHERE id = ${id}::uuid
    ` : await sql<{
      id: string;
      email: string;
      first_name: string;
      last_name: string;
      role: string;
      is_active: boolean;
    }[]>`
      SELECT id, email, first_name, last_name, role, is_active
      FROM public.app_users
      WHERE id = ${id}::uuid
        AND org_id = ${orgId}
    `;

    if (!user) {
      return reply.status(404).send({ success: false, error: { message: 'User not found' } });
    }

    if (user.role === 'super_admin' && req.user.role !== 'super_admin') {
      return reply.status(403).send({
        success: false,
        error: { message: 'Only a super-admin can resend a super-admin invite' },
      });
    }

    if (user.is_active) {
      return reply.status(409).send({
        success: false,
        error: { message: 'User is already active' },
      });
    }

    const invite = await createUserInvite({
      userId: user.id,
      createdBy: req.user.sub,
    });
    const emailSent = await sendInviteIfConfigured(app, user, invite);
    await req.auditLog('user_invite_resend', 'app_user', user.id, {
      invite_id: invite.invite.id,
      role: user.role,
      email_sent: emailSent,
      expires_at: invite.invite.expires_at,
    });

    return { success: true, data: { user, invite: invitePayload(invite, emailSent) } };
  });

  app.post('/users/:id/revoke-invite', async (req, reply) => {
    const { id } = req.params as { id: string };
    const orgId = requestAdminOrgId(req);
    if (!isGlobalAdminRequest(req) && orgId === null) return adminScopeError(reply);
    const [user] = isGlobalAdminRequest(req) ? await sql<{
      id: string;
      email: string;
      first_name: string;
      last_name: string;
      role: string;
      is_active: boolean;
    }[]>`
      SELECT id, email, first_name, last_name, role, is_active
      FROM public.app_users
      WHERE id = ${id}::uuid
    ` : await sql<{
      id: string;
      email: string;
      first_name: string;
      last_name: string;
      role: string;
      is_active: boolean;
    }[]>`
      SELECT id, email, first_name, last_name, role, is_active
      FROM public.app_users
      WHERE id = ${id}::uuid
        AND org_id = ${orgId}
    `;

    if (!user) {
      return reply.status(404).send({ success: false, error: { message: 'User not found' } });
    }

    if (user.role === 'super_admin' && req.user.role !== 'super_admin') {
      return reply.status(403).send({
        success: false,
        error: { message: 'Only a super-admin can revoke a super-admin invite' },
      });
    }

    if (user.is_active) {
      return reply.status(409).send({
        success: false,
        error: { message: 'User is already active' },
      });
    }

    const [invite] = await sql<RevokedInviteRow[]>`
      UPDATE public.app_user_invites
      SET revoked_at = NOW(),
          updated_at = NOW()
      WHERE id = (
        SELECT i.id
        FROM public.app_user_invites i
        WHERE i.user_id = ${id}::uuid
          AND i.accepted_at IS NULL
          AND i.revoked_at IS NULL
        ORDER BY i.created_at DESC
        LIMIT 1
      )
      RETURNING id, user_id, expires_at::text AS expires_at, revoked_at::text AS revoked_at
    `;

    if (!invite) {
      return reply.status(409).send({
        success: false,
        error: { message: 'No active invite exists for this user' },
      });
    }

    await req.auditLog('user_invite_revoke', 'app_user', user.id, {
      invite_id: invite.id,
      role: user.role,
      expires_at: invite.expires_at,
      revoked_at: invite.revoked_at,
    });

    return { success: true, data: { user, invite } };
  });

  app.patch('/users/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { role, is_active, first_name, last_name } = req.body as {
      role?: string;
      is_active?: boolean;
      first_name?: string;
      last_name?: string;
    };

    if (role === undefined && is_active === undefined && !first_name && !last_name) {
      return reply.status(400).send({ success: false, error: { message: 'No updates provided' } });
    }

    if (role === 'super_admin' && req.user.role !== 'super_admin') {
      return reply.status(403).send({
        success: false,
        error: { message: 'Only a super-admin can grant super-admin access' },
      });
    }

    const target = await requireAdminUserInScope(req, reply, id);
    if (target === undefined) return reply;

    if ((role && role !== 'super_admin') || is_active === false) {
      const wouldRemoveLastSuperAdmin = await isLastActiveSuperAdmin(id);
      if (wouldRemoveLastSuperAdmin) {
        return reply.status(400).send({
          success: false,
          error: { message: 'At least one active super-admin must remain' },
        });
      }
    }

    const orgId = requestAdminOrgId(req);
    const [updated] = isGlobalAdminRequest(req)
      ? await sql`
          UPDATE public.app_users
          SET
            role       = COALESCE(${role ?? null}, role),
            is_active  = COALESCE(${is_active ?? null}, is_active),
            first_name = COALESCE(${first_name ?? null}, first_name),
            last_name  = COALESCE(${last_name ?? null}, last_name),
            updated_at = NOW()
          WHERE id = ${id}::uuid
          RETURNING id, email, first_name, last_name, role, is_active
        `
      : await sql`
          UPDATE public.app_users
          SET
            role       = COALESCE(${role ?? null}, role),
            is_active  = COALESCE(${is_active ?? null}, is_active),
            first_name = COALESCE(${first_name ?? null}, first_name),
            last_name  = COALESCE(${last_name ?? null}, last_name),
            updated_at = NOW()
          WHERE id = ${id}::uuid
            AND org_id = ${orgId}
          RETURNING id, email, first_name, last_name, role, is_active
        `;

    if (!updated) return reply.status(404).send({ success: false, error: { message: 'User not found' } });
    await req.auditLog('user_update', 'app_user', String(updated.id ?? id), {
      role_changed: role !== undefined,
      is_active_changed: is_active !== undefined,
      profile_changed: first_name !== undefined || last_name !== undefined,
      role: updated.role,
      is_active: updated.is_active,
    });
    return { success: true, data: { user: updated } };
  });

  app.delete('/users/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    const target = await requireAdminUserInScope(req, reply, id);
    if (target === undefined) return reply;

    const wouldRemoveLastSuperAdmin = await isLastActiveSuperAdmin(id);
    if (wouldRemoveLastSuperAdmin) {
      return reply.status(400).send({
        success: false,
        error: { message: 'At least one active super-admin must remain' },
      });
    }

    const orgId = requestAdminOrgId(req);
    const [updated] = isGlobalAdminRequest(req)
      ? await sql`
          UPDATE public.app_users
          SET is_active = FALSE, updated_at = NOW()
          WHERE id = ${id}::uuid
          RETURNING id, email, is_active
        `
      : await sql`
          UPDATE public.app_users
          SET is_active = FALSE, updated_at = NOW()
          WHERE id = ${id}::uuid
            AND org_id = ${orgId}
          RETURNING id, email, is_active
        `;

    if (!updated) return reply.status(404).send({ success: false, error: { message: 'User not found' } });
    await req.auditLog('user_deactivate', 'app_user', String(updated.id ?? id), {
      is_active: updated.is_active,
    });
    return { success: true, data: { user: updated } };
  });

  // ---- FHIR Endpoints ----

  app.get('/fhir-endpoints', async () => {
    const endpoints = await sql`
      SELECT * FROM phm_edw.fhir_endpoint
      WHERE is_active = TRUE
      ORDER BY created_at DESC
    `;
    return { success: true, data: { endpoints } };
  });

  app.post('/fhir-endpoints', async (req) => {
    const { name, ehr_type, base_url, auth_type, version, notes } = req.body as {
      name: string;
      ehr_type: string;
      base_url: string;
      auth_type?: string;
      version?: string;
      notes?: string;
    };

    const [endpoint] = await sql`
      INSERT INTO phm_edw.fhir_endpoint (name, ehr_type, base_url, auth_type, version, notes)
      VALUES (
        ${name}, ${ehr_type}, ${base_url},
        ${auth_type ?? 'oauth2'}, ${version ?? 'R4'}, ${notes ?? null}
      )
      RETURNING *
    `;
    return { success: true, data: { endpoint } };
  });

  app.patch('/fhir-endpoints/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { name, base_url, auth_type, status, version, notes } = req.body as {
      name?: string;
      base_url?: string;
      auth_type?: string;
      status?: string;
      version?: string;
      notes?: string;
    };

    const [endpoint] = await sql`
      UPDATE phm_edw.fhir_endpoint
      SET
        name       = COALESCE(${name ?? null}, name),
        base_url   = COALESCE(${base_url ?? null}, base_url),
        auth_type  = COALESCE(${auth_type ?? null}, auth_type),
        status     = COALESCE(${status ?? null}, status),
        version    = COALESCE(${version ?? null}, version),
        notes      = COALESCE(${notes ?? null}, notes),
        updated_at = NOW()
      WHERE endpoint_id = ${id}
      RETURNING *
    `;

    if (!endpoint) return reply.status(404).send({ success: false, error: { message: 'Endpoint not found' } });
    return { success: true, data: { endpoint } };
  });

  app.delete('/fhir-endpoints/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    const [endpoint] = await sql`
      UPDATE phm_edw.fhir_endpoint
      SET is_active = FALSE, updated_at = NOW()
      WHERE endpoint_id = ${id}
      RETURNING endpoint_id
    `;

    if (!endpoint) return reply.status(404).send({ success: false, error: { message: 'Endpoint not found' } });
    return { success: true };
  });

  app.post('/fhir-endpoints/:id/sync', async (req, reply) => {
    const { id } = req.params as { id: string };

    const [endpoint] = await sql`
      UPDATE phm_edw.fhir_endpoint
      SET
        last_sync_at = NOW(),
        status       = 'connected',
        updated_at   = NOW()
      WHERE endpoint_id = ${id}
      RETURNING *
    `;

    if (!endpoint) return reply.status(404).send({ success: false, error: { message: 'Endpoint not found' } });
    return { success: true, data: { endpoint } };
  });

  // ---- Audit Log ----
  // Schema: id (uuid), user_id (uuid), action, resource_type, resource_id, details (jsonb), ip_address, user_agent, created_at

  app.get('/audit-log', async (req, reply) => {
    const { limit = '50', offset = '0', event_type } = req.query as {
      limit?: string;
      offset?: string;
      event_type?: string;  // maps to audit_log.action
    };
    const orgId = requestAdminOrgId(req);
    if (!isGlobalAdminRequest(req) && orgId === null) return adminScopeError(reply);

    let logs: readonly unknown[];
    let countRows: readonly { count: number | string }[];

    if (isGlobalAdminRequest(req)) {
      logs = event_type
        ? await sql`
          SELECT
            al.id AS audit_id, al.action AS event_type, al.resource_type AS target_type,
            al.resource_id AS target_id, al.details::text AS description,
            al.ip_address, al.created_at,
            au.email AS user_email, au.first_name AS user_first_name, au.last_name AS user_last_name
          FROM public.audit_log al
          LEFT JOIN public.app_users au ON al.user_id = au.id
          WHERE al.action = ${event_type}
          ORDER BY al.created_at DESC
          LIMIT ${Number(limit)} OFFSET ${Number(offset)}
        `
        : await sql`
          SELECT
            al.id AS audit_id, al.action AS event_type, al.resource_type AS target_type,
            al.resource_id AS target_id, al.details::text AS description,
            al.ip_address, al.created_at,
            au.email AS user_email, au.first_name AS user_first_name, au.last_name AS user_last_name
          FROM public.audit_log al
          LEFT JOIN public.app_users au ON al.user_id = au.id
          ORDER BY al.created_at DESC
          LIMIT ${Number(limit)} OFFSET ${Number(offset)}
        `;

      countRows = event_type
        ? await sql`SELECT COUNT(*) AS count FROM public.audit_log WHERE action = ${event_type}`
        : await sql`SELECT COUNT(*) AS count FROM public.audit_log`;
    } else {
      logs = event_type
        ? await sql`
          SELECT
            al.id AS audit_id, al.action AS event_type, al.resource_type AS target_type,
            al.resource_id AS target_id, al.details::text AS description,
            al.ip_address, al.created_at,
            au.email AS user_email, au.first_name AS user_first_name, au.last_name AS user_last_name
          FROM public.audit_log al
          JOIN public.app_users au ON al.user_id = au.id
          WHERE al.action = ${event_type}
            AND au.org_id = ${orgId}
          ORDER BY al.created_at DESC
          LIMIT ${Number(limit)} OFFSET ${Number(offset)}
        `
        : await sql`
          SELECT
            al.id AS audit_id, al.action AS event_type, al.resource_type AS target_type,
            al.resource_id AS target_id, al.details::text AS description,
            al.ip_address, al.created_at,
            au.email AS user_email, au.first_name AS user_first_name, au.last_name AS user_last_name
          FROM public.audit_log al
          JOIN public.app_users au ON al.user_id = au.id
          WHERE au.org_id = ${orgId}
          ORDER BY al.created_at DESC
          LIMIT ${Number(limit)} OFFSET ${Number(offset)}
        `;

      countRows = event_type
        ? await sql`
          SELECT COUNT(*) AS count
          FROM public.audit_log al
          JOIN public.app_users au ON al.user_id = au.id
          WHERE al.action = ${event_type}
            AND au.org_id = ${orgId}
        `
        : await sql`
          SELECT COUNT(*) AS count
          FROM public.audit_log al
          JOIN public.app_users au ON al.user_id = au.id
          WHERE au.org_id = ${orgId}
        `;
    }

    const [{ count = 0 } = { count: 0 }] = countRows;
    return { success: true, data: { logs, total: Number(count) } };
  });

  // ---- ETL Status ----

  app.get('/etl-status', async () => {
    const [etlLogs, migrations, starCounts] = await Promise.all([
      sql`
        SELECT source_system, load_status, rows_inserted, created_date AS created_at
        FROM phm_edw.etl_log
        ORDER BY created_date DESC
        LIMIT 10
      `,
      sql`
        SELECT name AS migration_name, applied_at
        FROM public._migrations
        ORDER BY applied_at DESC
      `,
      sql`
        SELECT
          (SELECT COUNT(*) FROM phm_star.fact_patient_composite)    AS composite_rows,
          (SELECT COUNT(*) FROM phm_star.fact_patient_bundle)        AS bundle_rows,
          (SELECT COUNT(*) FROM phm_star.fact_patient_bundle_detail) AS detail_rows,
          (SELECT COUNT(*) FROM phm_star.dim_patient)                AS dim_patient_rows,
          (SELECT COUNT(*) FROM phm_star.dim_provider)               AS dim_provider_rows,
          (SELECT COUNT(*) FROM phm_star.dim_bundle)                 AS dim_bundle_rows
      `,
    ]);

    return {
      success: true,
      data: {
        etl_logs:    etlLogs,
        migrations,
        star_counts: starCounts[0] ?? {},
      },
    };
  });

  // ---- Refresh Materialized Views ----

  app.post('/refresh-mat-views', async (_, reply) => {
    // REFRESH CONCURRENTLY cannot run inside a transaction — iterate sequentially
    const views = [
      'phm_star.mv_patient_dashboard',
      'phm_star.mv_bundle_compliance_by_provider',
      'phm_star.mv_population_overview',
      'phm_star.mv_care_gap_worklist',
      'phm_star.mv_population_by_condition',
      'phm_star.mv_provider_scorecard',
      'phm_star.mv_patient_risk_tier',
    ];

    const results: Array<{ view: string; status: string; error?: string }> = [];
    for (const view of views) {
      try {
        await sql.unsafe(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${view}`);
        results.push({ view, status: 'ok' });
      } catch (err) {
        results.push({ view, status: 'error', error: String(err) });
      }
    }

    // Also refresh measure results after mat views
    try {
      await getMeasureEvaluator().refresh();
      results.push({ view: 'fact_measure_result', status: 'ok' });
    } catch (err) {
      results.push({ view: 'fact_measure_result', status: 'error', error: String(err) });
    }

    const allOk = results.every((r) => r.status === 'ok');
    return reply
      .status(allOk ? 200 : 207)
      .send({ success: allOk, data: { results } });
  });

  // ---- Measure Promotion Governance ----

  app.get('/measure-promotion-configs', async (req, reply) => {
    const { measure_code, limit } = req.query as { measure_code?: string; limit?: string };
    const parsedLimit = limit === undefined ? undefined : positiveInt(limit);
    if (limit !== undefined && parsedLimit === null) {
      return reply.status(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'limit must be a positive integer' },
      });
    }

    const configs = await listMeasurePromotionConfigs({
      measureCode: measure_code,
      limit: parsedLimit ?? undefined,
    });
    return reply.send({ success: true, data: { configs } });
  });

  app.patch('/measure-promotion-configs/:measureCode', async (req, reply) => {
    const { measureCode } = req.params as { measureCode: string };
    const body = req.body as {
      promotionMode?: string;
      tolerance?: number;
      evaluatorSource?: string;
      requireReconciliationAgreement?: boolean;
      metadata?: Record<string, unknown>;
    };

    if (body.promotionMode !== undefined && !PROMOTION_MODES.includes(body.promotionMode as MeasurePromotionMode)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Unsupported promotionMode' },
      });
    }
    const parsedTolerance = body.tolerance === undefined ? undefined : nonnegativeInt(body.tolerance);
    if (body.tolerance !== undefined && parsedTolerance === null) {
      return reply.status(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'tolerance must be a non-negative integer' },
      });
    }

    try {
      const config = await updateMeasurePromotionConfig({
        measureCode,
        promotionMode: body.promotionMode as MeasurePromotionMode | undefined,
        tolerance: parsedTolerance ?? undefined,
        evaluatorSource: body.evaluatorSource,
        requireReconciliationAgreement: body.requireReconciliationAgreement,
        metadata: body.metadata,
      });
      await req.auditLog('measure_promotion_config_update', 'measure_promotion_config', measureCode, {
        promotionMode: config.promotionMode,
        tolerance: config.tolerance,
        authoritativeSource: config.authoritativeSource,
      });
      return reply.send({ success: true, data: { config } });
    } catch (err) {
      return mapMeasurePromotionError(err, reply);
    }
  });

  app.post('/measure-promotion-configs/:measureCode/promote-cql-authoritative', async (req, reply) => {
    const { measureCode } = req.params as { measureCode: string };
    const body = req.body as {
      reconciliationRunId?: number;
      measureReportId?: number;
      qdmRunId?: string | null;
      dryRun?: boolean;
      requireFullPopulation?: boolean;
      statementTimeoutMs?: number;
    };
    const reconciliationRunId = positiveInt(body.reconciliationRunId);
    const measureReportId = positiveInt(body.measureReportId);
    if (reconciliationRunId === null || measureReportId === null) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'reconciliationRunId and measureReportId must be positive integers',
        },
      });
    }
    const parsedStatementTimeoutMs = body.statementTimeoutMs === undefined
      ? undefined
      : positiveInt(body.statementTimeoutMs);
    if (body.statementTimeoutMs !== undefined && parsedStatementTimeoutMs === null) {
      return reply.status(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'statementTimeoutMs must be a positive integer' },
      });
    }
    const attemptAuditInput: PromotionAttemptAuditInput = {
      measureCode,
      reconciliationRunId,
      measureReportId,
      qdmRunId: body.qdmRunId,
      dryRunRequested: body.dryRun,
      requireFullPopulation: body.requireFullPopulation,
      statementTimeoutMs: parsedStatementTimeoutMs ?? undefined,
    };

    try {
      const promotion = await promoteMeasureToCqlAuthoritative({
        measureCode,
        reconciliationRunId,
        measureReportId,
        actorId: req.user.sub,
        qdmRunId: body.qdmRunId,
        dryRun: body.dryRun,
        requireFullPopulation: body.requireFullPopulation,
        statementTimeoutMs: parsedStatementTimeoutMs ?? undefined,
      });
      await req.auditLog(
        'measure_promotion_cql_authoritative_attempt',
        'measure_promotion_config',
        measureCode,
        promotionSuccessAuditDetails({ ...attemptAuditInput, promotion }),
      );
      if (!promotion.dryRun) {
        await req.auditLog('measure_promotion_cql_authoritative', 'measure_promotion_config', measureCode, {
          reconciliationRunId,
          measureReportId,
          rowsPromoted: promotion.rowsPromoted,
        });
      }
      return reply.send({ success: true, data: { promotion } });
    } catch (err) {
      try {
        await req.auditLog(
          'measure_promotion_cql_authoritative_attempt',
          'measure_promotion_config',
          measureCode,
          promotionFailureAuditDetails({ ...attemptAuditInput, err }),
        );
      } catch (auditErr) {
        req.log.error(
          { err: auditErr, measureCode, reconciliationRunId, measureReportId },
          'Failed to write measure promotion failure audit',
        );
      }
      return mapMeasurePromotionError(err, reply);
    }
  });

  app.post('/measure-promotion-configs/:measureCode/semantic-drift-dossier', async (req, reply) => {
    const { measureCode } = req.params as { measureCode: string };
    const body = (req.body ?? {}) as {
      reconciliationRunId?: number;
      measureReportId?: number;
      patientSampleLimit?: number;
      persist?: boolean;
    };
    const reconciliationRunId =
      body.reconciliationRunId === undefined ? undefined : positiveInt(body.reconciliationRunId);
    const measureReportId =
      body.measureReportId === undefined ? undefined : positiveInt(body.measureReportId);
    const patientSampleLimit =
      body.patientSampleLimit === undefined ? undefined : positiveInt(body.patientSampleLimit);
    if (
      (body.reconciliationRunId !== undefined && reconciliationRunId === null) ||
      (body.measureReportId !== undefined && measureReportId === null) ||
      (body.patientSampleLimit !== undefined && patientSampleLimit === null)
    ) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'reconciliationRunId, measureReportId, and patientSampleLimit must be positive integers when provided',
        },
      });
    }
    if (body.persist !== undefined && typeof body.persist !== 'boolean') {
      return reply.status(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'persist must be a boolean when provided' },
      });
    }

    try {
      const dossier = await generateMeasureSemanticDriftDossier({
        measureCode,
        reconciliationRunId: reconciliationRunId ?? undefined,
        measureReportId: measureReportId ?? undefined,
        patientSampleLimit: patientSampleLimit ?? undefined,
        persist: body.persist,
        actorId: req.user.sub,
      });
      await req.auditLog(
        'measure_semantic_drift_dossier_generate',
        'measure_semantic_drift_dossier',
        dossier.dossierId == null ? measureCode : String(dossier.dossierId),
        {
          measureCode,
          reconciliationRunId: dossier.reconciliationRunId,
          measureReportId: dossier.measureReportId,
          persisted: dossier.persisted,
          patientRowsPersisted: dossier.patientsPersisted,
          patientRowsReturned: dossier.patientRowsReturned,
        },
      );
      return reply.send({ success: true, data: { dossier } });
    } catch (err) {
      return mapMeasurePromotionError(err, reply);
    }
  });

  // ---- Refresh Measure Results ----

  app.post('/refresh-measures', async (req, reply) => {
    try {
      const result = await getMeasureEvaluator().refresh();

      await sql`
        INSERT INTO public.audit_log (user_id, action, resource_type, details)
        VALUES (
          ${req.user.sub}::UUID,
          'measure_refresh',
          'measure_result',
          ${JSON.stringify({ rowCount: result.rowCount, durationMs: result.durationMs })}::jsonb
        )
      `;

      return reply.send({
        success: true,
        data: {
          rows_refreshed: result.rowCount,
          duration_ms: result.durationMs,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({
        success: false,
        error: { message: `Measure refresh failed: ${msg}` },
      });
    }
  });

  app.get('/measure-promotion-configs/:measureCode/semantic-drift-worklist', async (req, reply) => {
    const { measureCode } = req.params as { measureCode: string };
    const query = req.query as {
      dossierId?: string;
      denominatorDrift?: string;
      numeratorDrift?: string;
      exclusionDrift?: string;
      patientId?: string;
      limit?: string;
      offset?: string;
    };
    const dossierId = query.dossierId === undefined ? undefined : positiveInt(query.dossierId);
    const patientId = query.patientId === undefined ? undefined : positiveInt(query.patientId);
    const limit = query.limit === undefined ? undefined : positiveInt(query.limit);
    const offset = query.offset === undefined ? undefined : nonnegativeInt(query.offset);
    if (
      (query.dossierId !== undefined && dossierId === null) ||
      (query.patientId !== undefined && patientId === null) ||
      (query.limit !== undefined && limit === null) ||
      (query.offset !== undefined && offset === null)
    ) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'dossierId, patientId, and limit must be positive integers; offset must be non-negative',
        },
      });
    }

    try {
      const worklist = await listMeasureSemanticDriftWorklist({
        measureCode,
        dossierId: dossierId ?? undefined,
        denominatorDrift: query.denominatorDrift,
        numeratorDrift: query.numeratorDrift,
        exclusionDrift: query.exclusionDrift,
        patientId: patientId ?? undefined,
        limit: limit ?? undefined,
        offset: offset ?? undefined,
      });
      await req.auditLog(
        'measure_semantic_drift_worklist_view',
        'measure_semantic_drift_dossier',
        String(worklist.dossierId),
        {
          measureCode,
          dossierId: worklist.dossierId,
          filters: {
            denominatorDrift: worklist.filters.denominatorDrift,
            numeratorDrift: worklist.filters.numeratorDrift,
            exclusionDrift: worklist.filters.exclusionDrift,
            hasPatientFilter: worklist.filters.patientId !== null,
          },
          pagination: {
            limit: worklist.pagination.limit,
            offset: worklist.pagination.offset,
            returned: worklist.pagination.returned,
            total: worklist.pagination.total,
          },
        },
      );
      return reply.send({ success: true, data: { worklist } });
    } catch (err) {
      return mapMeasurePromotionError(err, reply);
    }
  });

  app.get('/measure-promotion-configs/:measureCode/semantic-drift-worklist/:dossierPatientId', async (req, reply) => {
    const { measureCode, dossierPatientId: rawDossierPatientId } = req.params as {
      measureCode: string;
      dossierPatientId: string;
    };
    const dossierPatientId = positiveInt(rawDossierPatientId);
    if (dossierPatientId === null) {
      return reply.status(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'dossierPatientId must be a positive integer' },
      });
    }

    try {
      const detail = await getMeasureSemanticDriftDetail({ measureCode, dossierPatientId });
      await req.auditLog(
        'measure_semantic_drift_detail_view',
        'measure_semantic_drift_patient',
        String(detail.dossierPatientId),
        {
          measureCode,
          dossierId: detail.dossierId,
          dossierPatientId: detail.dossierPatientId,
          patientId: detail.worklistRow.patientId,
          patientRef: detail.worklistRow.patientRef,
          measureReportEvidenceId: detail.measureReportEvidence?.id ?? null,
          qdmEvidenceCount: detail.measureReportEvidence?.qdmEvidenceCount ?? 0,
          fhirSubjectReportPresent:
            detail.measureReportEvidence?.fhirSubjectReportPresent ?? false,
        },
      );
      return reply.send({ success: true, data: { detail } });
    } catch (err) {
      return mapMeasurePromotionError(err, reply);
    }
  });

  // ---- QDM Bridge Operations ----

  app.get('/qdm-bridge/status', async (req, reply) => {
    const query = req.query as { measureCode?: string };
    try {
      const status = await getQdmBridgeOperationalStatus(query.measureCode);
      await req.auditLog(
        'qdm_bridge_status_view',
        'qdm_bridge_run',
        query.measureCode ?? 'all',
        {
          measureCode: query.measureCode ?? null,
          returned: status.length,
        },
      );
      return reply.send({ success: true, data: { status } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message },
      });
    }
  });

  app.get('/qdm-bridge/runs', async (req, reply) => {
    const query = req.query as {
      measureCode?: string;
      operation?: string;
      status?: string;
      limit?: string;
      offset?: string;
    };
    const operation = optionalEnum(query.operation, QDM_BRIDGE_OPERATIONS);
    const status = optionalEnum(query.status, QDM_BRIDGE_RUN_STATUSES);
    const limit = query.limit === undefined ? undefined : positiveInt(query.limit);
    const offset = query.offset === undefined ? undefined : nonnegativeInt(query.offset);
    if (operation === null || status === null || limit === null || offset === null) {
      return reply.status(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Invalid QDM bridge run filters' },
      });
    }

    try {
      const runs = await listQdmBridgeRuns({
        measureCode: query.measureCode,
        operation,
        status,
        limit,
        offset,
      });
      await req.auditLog(
        'qdm_bridge_runs_view',
        'qdm_bridge_run',
        query.measureCode ?? 'all',
        {
          measureCode: query.measureCode ?? null,
          operation: operation ?? null,
          status: status ?? null,
          pagination: {
            limit: limit ?? null,
            offset: offset ?? null,
            returned: runs.length,
          },
        },
      );
      return reply.send({ success: true, data: { runs } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message },
      });
    }
  });

  app.get('/qdm-bridge/issues', async (req, reply) => {
    const query = req.query as {
      measureCode?: string;
      runId?: string;
      severity?: string;
      status?: string;
      limit?: string;
      offset?: string;
    };
    const severity = optionalEnum(query.severity, QDM_BRIDGE_ISSUE_SEVERITIES);
    const status = optionalEnum(query.status, QDM_BRIDGE_ISSUE_STATUSES);
    const limit = query.limit === undefined ? undefined : positiveInt(query.limit);
    const offset = query.offset === undefined ? undefined : nonnegativeInt(query.offset);
    if (severity === null || status === null || limit === null || offset === null) {
      return reply.status(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Invalid QDM bridge issue filters' },
      });
    }

    try {
      const issues = await listQdmBridgeIssues({
        measureCode: query.measureCode,
        runId: query.runId,
        severity,
        status,
        limit,
        offset,
      });
      await req.auditLog(
        'qdm_bridge_issues_view',
        'qdm_bridge_issue',
        query.measureCode ?? query.runId ?? 'all',
        {
          measureCode: query.measureCode ?? null,
          hasRunFilter: Boolean(query.runId),
          severity: severity ?? null,
          status: status ?? null,
          pagination: {
            limit: limit ?? null,
            offset: offset ?? null,
            returned: issues.length,
          },
        },
      );
      return reply.send({ success: true, data: { issues } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message },
      });
    }
  });

  // ---- Analytics Overview (legacy endpoint — kept for backwards compatibility) ----

  app.get('/analytics/overview', async () => {
    const [patients, conditions, encounters, measures] = await Promise.all([
      sql`SELECT COUNT(*) AS count FROM phm_edw.patient`,
      sql`SELECT COUNT(*) AS count FROM phm_edw.condition_diagnosis`,
      sql`
        SELECT COUNT(*) AS count FROM phm_edw.encounter
        WHERE encounter_datetime >= NOW() - INTERVAL '30 days'
      `,
      sql`
        SELECT COUNT(DISTINCT fmr.measure_key) AS count
        FROM phm_star.fact_measure_result fmr
        JOIN phm_star.dim_measure dm
          ON dm.measure_key = fmr.measure_key
        LEFT JOIN phm_edw.measure_promotion_config mpc
          ON mpc.measure_code = dm.measure_code
        WHERE fmr.source = COALESCE(NULLIF(mpc.authoritative_source, ''), 'sql_bundle')
          AND fmr.evaluation_scope = 'full_population'
          AND fmr.reconciliation_status = 'authoritative'
      `,
    ]);

    return {
      success: true,
      data: {
        total_patients:    Number(patients[0].count),
        active_conditions: Number(conditions[0].count),
        recent_encounters: Number(encounters[0].count),
        active_measures:   Number(measures[0].count),
      },
    };
  });

  // ---- Solr Status ----

  app.get('/solr-status', async (_request, reply) => {
    const solr = getSolrClient();
    if (!solr) {
      return reply.send({
        success: true,
        data: {
          available: false,
          enabled: config.solrEnabled,
          message: 'Solr is not available',
        },
      });
    }

    const [searchStatus, clinicalStatus, searchPing, clinicalPing] =
      await Promise.all([
        solr.coreStatus('search').catch(() => null),
        solr.coreStatus('clinical').catch(() => null),
        solr.ping('search'),
        solr.ping('clinical'),
      ]);

    return reply.send({
      success: true,
      data: {
        available: isSolrAvailable(),
        searchCore: { healthy: searchPing, status: searchStatus },
        clinicalCore: { healthy: clinicalPing, status: clinicalStatus },
      },
    });
  });
}
