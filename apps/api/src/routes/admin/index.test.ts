import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import type { JwtPayload } from '../../plugins/auth.js';

const {
  MockMeasurePromotionError,
  mockListConfigs,
  mockUpdateConfig,
  mockPromote,
  mockGenerateSemanticDriftDossier,
  mockGetSemanticDriftDetail,
  mockListSemanticDriftWorklist,
  mockGetQdmBridgeOperationalStatus,
  mockListQdmBridgeRuns,
  mockListQdmBridgeIssues,
  mockAuditLog,
  mockSql,
} = vi.hoisted(() => {
  class MeasurePromotionErrorMock extends Error {
    readonly code: string;
    readonly statusCode: number;
    readonly details?: Record<string, unknown>;

    constructor(code: string, message: string, statusCode = 400, details?: Record<string, unknown>) {
      super(message);
      this.name = 'MeasurePromotionError';
      this.code = code;
      this.statusCode = statusCode;
      this.details = details;
    }
  }

  return {
    MockMeasurePromotionError: MeasurePromotionErrorMock,
    mockListConfigs: vi.fn(),
    mockUpdateConfig: vi.fn(),
    mockPromote: vi.fn(),
    mockGenerateSemanticDriftDossier: vi.fn(),
    mockGetSemanticDriftDetail: vi.fn(),
    mockListSemanticDriftWorklist: vi.fn(),
    mockGetQdmBridgeOperationalStatus: vi.fn(),
    mockListQdmBridgeRuns: vi.fn(),
    mockListQdmBridgeIssues: vi.fn(),
    mockAuditLog: vi.fn(),
    mockSql: vi.fn(),
  };
});

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));
vi.mock('../../services/measureReconciliation.js', () => ({
  listMeasurePromotionConfigs: mockListConfigs,
  updateMeasurePromotionConfig: mockUpdateConfig,
  promoteMeasureToCqlAuthoritative: mockPromote,
  MeasurePromotionError: MockMeasurePromotionError,
}));
vi.mock('../../services/measureSemanticDriftDossier.js', () => ({
  generateMeasureSemanticDriftDossier: mockGenerateSemanticDriftDossier,
  getMeasureSemanticDriftDetail: mockGetSemanticDriftDetail,
  listMeasureSemanticDriftWorklist: mockListSemanticDriftWorklist,
  MeasureSemanticDriftError: MockMeasurePromotionError,
}));
vi.mock('../../services/qdm/bridgeOps.js', () => ({
  getQdmBridgeOperationalStatus: mockGetQdmBridgeOperationalStatus,
  listQdmBridgeRuns: mockListQdmBridgeRuns,
  listQdmBridgeIssues: mockListQdmBridgeIssues,
}));
vi.mock('../../services/omopExport.js', () => ({
  exportPatientsToOmop: vi.fn(),
  exportConditionsToOmop: vi.fn(),
  exportMeasurementsToOmop: vi.fn(),
  generateDeidentifiedCohort: vi.fn(),
}));
vi.mock('../../services/measureEvaluator.js', () => ({
  getMeasureEvaluator: vi.fn(() => ({ refresh: vi.fn() })),
}));
vi.mock('../../plugins/solr.js', () => ({
  getSolrClient: vi.fn(() => null),
  isSolrAvailable: vi.fn(() => false),
}));
vi.mock('../../config.js', () => ({
  config: {
    redisUrl: 'redis://localhost:6379',
    solrEnabled: false,
    nodeEnv: 'test',
    localAuthEnabled: true,
  },
}));
vi.mock('ioredis', () => ({
  Redis: vi.fn(() => ({
    connect: vi.fn(),
    ping: vi.fn(),
    disconnect: vi.fn(),
  })),
}));
vi.mock('../../services/auth/oidc/discovery.js', () => ({ fetchOidcDiscovery: vi.fn() }));
vi.mock('../../services/auth/oidc/providerConfig.js', () => ({
  getOidcProviderConfig: vi.fn(() => ({ enabled: false })),
}));

import adminRoutes from './index.js';

const ADMIN_USER: JwtPayload = {
  sub: '00000000-0000-4000-8000-000000000001',
  email: 'admin@example.test',
  role: 'admin',
  org_id: 'org-1',
};

const PROVIDER_USER: JwtPayload = {
  sub: '00000000-0000-4000-8000-000000000002',
  email: 'provider@example.test',
  role: 'provider',
  org_id: 'org-1',
  provider_id: 7,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSql.mockResolvedValue([]);
});

describe('admin measure promotion governance routes', () => {
  it('lists measure promotion configs', async () => {
    mockListConfigs.mockResolvedValueOnce([
      {
        measureCode: 'CMS122v12',
        promotionMode: 'cql_shadow',
        authoritativeSource: 'sql_bundle',
        latestReconciliationRun: null,
      },
    ]);
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/measure-promotion-configs?measure_code=CMS122v12&limit=10',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: { configs: [{ measureCode: 'CMS122v12', promotionMode: 'cql_shadow' }] },
    });
    expect(mockListConfigs).toHaveBeenCalledWith({ measureCode: 'CMS122v12', limit: 10 });
    await app.close();
  });

  it('updates a config and audits the change', async () => {
    mockUpdateConfig.mockResolvedValueOnce({
      measureCode: 'CMS122v12',
      promotionMode: 'cql_shadow',
      tolerance: 1,
      authoritativeSource: 'sql_bundle',
    });
    const app = await buildApp();

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/measure-promotion-configs/CMS122v12',
      payload: { promotionMode: 'cql_shadow', tolerance: 1 },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: { config: { measureCode: 'CMS122v12', promotionMode: 'cql_shadow' } },
    });
    expect(mockUpdateConfig).toHaveBeenCalledWith({
      measureCode: 'CMS122v12',
      promotionMode: 'cql_shadow',
      tolerance: 1,
      evaluatorSource: undefined,
      requireReconciliationAgreement: undefined,
      metadata: undefined,
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      'measure_promotion_config_update',
      'measure_promotion_config',
      'CMS122v12',
      expect.objectContaining({ promotionMode: 'cql_shadow' }),
    );
    await app.close();
  });

  it('promotes a measure to CQL authoritative and audits non-dry runs', async () => {
    mockPromote.mockResolvedValueOnce({
      measureCode: 'CMS122v12',
      reconciliationRunId: 7001,
      measureReportId: 9001,
      dryRun: false,
      rowsPromoted: 1,
    });
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/measure-promotion-configs/CMS122v12/promote-cql-authoritative',
      payload: {
        reconciliationRunId: 7001,
        measureReportId: 9001,
        requireFullPopulation: true,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: { promotion: { measureCode: 'CMS122v12', rowsPromoted: 1 } },
    });
    expect(mockPromote).toHaveBeenCalledWith({
      measureCode: 'CMS122v12',
      reconciliationRunId: 7001,
      measureReportId: 9001,
      actorId: ADMIN_USER.sub,
      qdmRunId: undefined,
      dryRun: undefined,
      requireFullPopulation: true,
      statementTimeoutMs: undefined,
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      'measure_promotion_cql_authoritative',
      'measure_promotion_config',
      'CMS122v12',
      expect.objectContaining({ reconciliationRunId: 7001, measureReportId: 9001, rowsPromoted: 1 }),
    );
    await app.close();
  });

  it('generates a semantic drift dossier and audits the read model artifact', async () => {
    mockGenerateSemanticDriftDossier.mockResolvedValueOnce({
      dossierId: 42,
      persisted: true,
      measureCode: 'CMS122v12',
      reconciliationRunId: 7003,
      measureReportId: 9001,
      patientsPersisted: 239,
      patientRowsReturned: 10,
    });
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/measure-promotion-configs/CMS122v12/semantic-drift-dossier',
      payload: {
        reconciliationRunId: 7003,
        measureReportId: 9001,
        patientSampleLimit: 10,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: { dossier: { dossierId: 42, measureCode: 'CMS122v12' } },
    });
    expect(mockGenerateSemanticDriftDossier).toHaveBeenCalledWith({
      measureCode: 'CMS122v12',
      reconciliationRunId: 7003,
      measureReportId: 9001,
      patientSampleLimit: 10,
      persist: undefined,
      actorId: ADMIN_USER.sub,
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      'measure_semantic_drift_dossier_generate',
      'measure_semantic_drift_dossier',
      '42',
      expect.objectContaining({
        measureCode: 'CMS122v12',
        reconciliationRunId: 7003,
        measureReportId: 9001,
      }),
    );
    await app.close();
  });

  it('lists a semantic drift worklist and audits the dossier read', async () => {
    mockListSemanticDriftWorklist.mockResolvedValueOnce({
      measureCode: 'CMS122v12',
      dossierId: 42,
      sourceMeasureCode: 'DM-02',
      reconciliationRunId: 7003,
      measureReportId: 9001,
      period: { start: '2024-01-01', end: '2024-12-31' },
      semanticRelationship: 'surrogate_not_equivalent',
      generatedAt: '2026-06-18T13:15:00Z',
      filters: {
        denominatorDrift: 'residual_cql_or_qicore_semantic_gap',
        numeratorDrift: null,
        exclusionDrift: null,
        patientId: 3,
      },
      pagination: { limit: 5, offset: 10, total: 27, returned: 1, hasMore: true },
      classificationCounts: {},
      rows: [
        {
          dossierPatientId: 1001,
          patientId: 3,
          reviewPriority: 100,
          reviewHint: 'Inspect QI-Core projection.',
        },
      ],
    });
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/measure-promotion-configs/CMS122v12/semantic-drift-worklist?dossierId=42&denominatorDrift=residual_cql_or_qicore_semantic_gap&patientId=3&limit=5&offset=10',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        worklist: {
          dossierId: 42,
          rows: [{ dossierPatientId: 1001, reviewPriority: 100 }],
        },
      },
    });
    expect(mockListSemanticDriftWorklist).toHaveBeenCalledWith({
      measureCode: 'CMS122v12',
      dossierId: 42,
      denominatorDrift: 'residual_cql_or_qicore_semantic_gap',
      numeratorDrift: undefined,
      exclusionDrift: undefined,
      patientId: 3,
      limit: 5,
      offset: 10,
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      'measure_semantic_drift_worklist_view',
      'measure_semantic_drift_dossier',
      '42',
      expect.objectContaining({
        measureCode: 'CMS122v12',
        dossierId: 42,
        filters: expect.objectContaining({
          denominatorDrift: 'residual_cql_or_qicore_semantic_gap',
          hasPatientFilter: true,
        }),
      }),
    );
    expect(JSON.stringify(mockAuditLog.mock.calls[0]?.[3])).not.toContain('"patientId":3');
    await app.close();
  });

  it('reads a semantic drift detail row and audits PHI evidence access', async () => {
    mockGetSemanticDriftDetail.mockResolvedValueOnce({
      measureCode: 'CMS122v12',
      dossierId: 42,
      dossierPatientId: 1001,
      sourceMeasureCode: 'DM-02',
      reconciliationRunId: 7003,
      measureReportId: 9001,
      period: { start: '2024-01-01', end: '2024-12-31' },
      semanticRelationship: 'surrogate_not_equivalent',
      generatedAt: '2026-06-18T13:15:00Z',
      worklistRow: {
        dossierPatientId: 1001,
        patientId: 3,
        patientRef: 'Patient/3',
        denominatorDrift: 'residual_cql_or_qicore_semantic_gap',
      },
      measureReportEvidence: {
        id: 90001,
        measureReportId: 9001,
        qdmEvidenceCount: 2,
        fhirSubjectReportPresent: true,
        qdmEvidence: [{ qdmEventId: 1 }],
        fhirSubjectReport: { resourceType: 'MeasureReport' },
      },
    });
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/measure-promotion-configs/CMS122v12/semantic-drift-worklist/1001',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        detail: {
          dossierPatientId: 1001,
          measureReportEvidence: { id: 90001, qdmEvidenceCount: 2 },
        },
      },
    });
    expect(mockGetSemanticDriftDetail).toHaveBeenCalledWith({
      measureCode: 'CMS122v12',
      dossierPatientId: 1001,
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      'measure_semantic_drift_detail_view',
      'measure_semantic_drift_patient',
      '1001',
      expect.objectContaining({
        measureCode: 'CMS122v12',
        dossierId: 42,
        dossierPatientId: 1001,
        patientId: 3,
        patientRef: 'Patient/3',
        measureReportEvidenceId: 90001,
        qdmEvidenceCount: 2,
        fhirSubjectReportPresent: true,
      }),
    );
    const auditMetadata = mockAuditLog.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(auditMetadata).not.toHaveProperty('qdmEvidence');
    expect(auditMetadata).not.toHaveProperty('fhirSubjectReport');
    expect(JSON.stringify(auditMetadata)).not.toContain('qdmEventId');
    expect(JSON.stringify(auditMetadata)).not.toContain('MeasureReport');
    await app.close();
  });

  it('lists QDM bridge operational status and audits aggregate access', async () => {
    mockGetQdmBridgeOperationalStatus.mockResolvedValueOnce([
      {
        operation: 'cql_shadow_refresh',
        measureCode: 'CMS122v12',
        latestRunId: '11111111-1111-4111-8111-111111111111',
        latestStatus: 'completed',
        latestStartedAt: '2026-06-18T14:00:00Z',
        latestCompletedAt: '2026-06-18T14:10:00Z',
        openIssueCount: 1,
        openBlockingIssueCount: 0,
        latestResult: { evidenceRowsPersisted: 256 },
        latestError: null,
      },
    ]);
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/qdm-bridge/status?measureCode=CMS122v12',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: { status: [{ operation: 'cql_shadow_refresh', measureCode: 'CMS122v12' }] },
    });
    expect(mockGetQdmBridgeOperationalStatus).toHaveBeenCalledWith('CMS122v12');
    expect(mockAuditLog).toHaveBeenCalledWith(
      'qdm_bridge_status_view',
      'qdm_bridge_run',
      'CMS122v12',
      expect.objectContaining({ measureCode: 'CMS122v12', returned: 1 }),
    );
    await app.close();
  });

  it('lists QDM bridge runs with bounded filters', async () => {
    mockListQdmBridgeRuns.mockResolvedValueOnce([
      {
        id: '11111111-1111-4111-8111-111111111111',
        operation: 'cql_shadow_refresh',
        measureCode: 'CMS122v12',
        status: 'completed',
      },
    ]);
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/qdm-bridge/runs?measureCode=CMS122v12&operation=cql_shadow_refresh&status=completed&limit=10&offset=0',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: { runs: [{ operation: 'cql_shadow_refresh', status: 'completed' }] },
    });
    expect(mockListQdmBridgeRuns).toHaveBeenCalledWith({
      measureCode: 'CMS122v12',
      operation: 'cql_shadow_refresh',
      status: 'completed',
      limit: 10,
      offset: 0,
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      'qdm_bridge_runs_view',
      'qdm_bridge_run',
      'CMS122v12',
      expect.objectContaining({
        operation: 'cql_shadow_refresh',
        status: 'completed',
        pagination: expect.objectContaining({ returned: 1 }),
      }),
    );
    await app.close();
  });

  it('lists QDM bridge issues without raw evidence payloads in audit metadata', async () => {
    mockListQdmBridgeIssues.mockResolvedValueOnce([
      {
        id: '22222222-2222-4222-8222-222222222222',
        runId: '11111111-1111-4111-8111-111111111111',
        issueType: 'missing_timing',
        severity: 'warning',
        status: 'open',
        measureCode: 'CMS122v12',
        patientId: 3,
        message: 'QDM event has no clinically usable timing',
        details: { qdmDatatype: 'Laboratory Test, Performed' },
      },
    ]);
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/qdm-bridge/issues?measureCode=CMS122v12&severity=warning&status=open&limit=5',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: { issues: [{ issueType: 'missing_timing', patientId: 3 }] },
    });
    expect(mockListQdmBridgeIssues).toHaveBeenCalledWith({
      measureCode: 'CMS122v12',
      runId: undefined,
      severity: 'warning',
      status: 'open',
      limit: 5,
      offset: undefined,
    });
    const auditMetadata = mockAuditLog.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(auditMetadata).toMatchObject({
      measureCode: 'CMS122v12',
      severity: 'warning',
      status: 'open',
      pagination: expect.objectContaining({ returned: 1 }),
    });
    expect(JSON.stringify(auditMetadata)).not.toContain('Laboratory Test');
    await app.close();
  });

  it('rejects invalid QDM bridge run filters before calling services', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/qdm-bridge/runs?operation=promote_anyway',
    });

    expect(res.statusCode).toBe(400);
    expect(mockListQdmBridgeRuns).not.toHaveBeenCalled();
    await app.close();
  });

  it('maps promotion governance errors into API error envelopes', async () => {
    mockPromote.mockRejectedValueOnce(
      new MockMeasurePromotionError(
        'RECONCILIATION_NOT_ACCEPTED',
        'Only accepted reconciliation runs can promote CQL results',
        409,
      ),
    );
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/measure-promotion-configs/CMS122v12/promote-cql-authoritative',
      payload: { reconciliationRunId: 7001, measureReportId: 9001 },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'RECONCILIATION_NOT_ACCEPTED' },
    });
    expect(mockAuditLog).not.toHaveBeenCalled();
    await app.close();
  });

  it('maps semantic drift dossier errors into API error envelopes', async () => {
    mockGenerateSemanticDriftDossier.mockRejectedValueOnce(
      new MockMeasurePromotionError(
        'RECONCILIATION_SCOPE_NOT_FULL_POPULATION',
        'Semantic drift dossiers require full-population runs',
        409,
      ),
    );
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/measure-promotion-configs/CMS122v12/semantic-drift-dossier',
      payload: { reconciliationRunId: 2 },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'RECONCILIATION_SCOPE_NOT_FULL_POPULATION' },
    });
    expect(mockAuditLog).not.toHaveBeenCalled();
    await app.close();
  });

  it('maps semantic drift detail errors into API error envelopes without auditing', async () => {
    mockGetSemanticDriftDetail.mockRejectedValueOnce(
      new MockMeasurePromotionError(
        'SEMANTIC_DRIFT_PATIENT_NOT_FOUND',
        'No semantic drift patient row 999 exists for CMS122v12',
        404,
      ),
    );
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/measure-promotion-configs/CMS122v12/semantic-drift-worklist/999',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'SEMANTIC_DRIFT_PATIENT_NOT_FOUND' },
    });
    expect(mockAuditLog).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects non-admin users before calling governance services', async () => {
    const app = await buildApp(PROVIDER_USER);

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/measure-promotion-configs',
    });

    expect(res.statusCode).toBe(403);
    expect(mockListConfigs).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects invalid promotion payloads before calling the service', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/measure-promotion-configs/CMS122v12/promote-cql-authoritative',
      payload: { reconciliationRunId: 0, measureReportId: 9001 },
    });

    expect(res.statusCode).toBe(400);
    expect(mockPromote).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects invalid semantic drift dossier payloads before calling the service', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/measure-promotion-configs/CMS122v12/semantic-drift-dossier',
      payload: { patientSampleLimit: 0 },
    });

    expect(res.statusCode).toBe(400);
    expect(mockGenerateSemanticDriftDossier).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects invalid semantic drift worklist queries before calling the service', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/measure-promotion-configs/CMS122v12/semantic-drift-worklist?limit=0',
    });

    expect(res.statusCode).toBe(400);
    expect(mockListSemanticDriftWorklist).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects invalid semantic drift detail ids before calling the service', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/measure-promotion-configs/CMS122v12/semantic-drift-worklist/not-an-id',
    });

    expect(res.statusCode).toBe(400);
    expect(mockGetSemanticDriftDetail).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects coercive semantic drift detail ids before calling the service', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/measure-promotion-configs/CMS122v12/semantic-drift-worklist/1e2',
    });

    expect(res.statusCode).toBe(400);
    expect(mockGetSemanticDriftDetail).not.toHaveBeenCalled();
    await app.close();
  });
});

async function buildApp(user: JwtPayload = ADMIN_USER): Promise<FastifyInstance> {
  const app = Fastify();
  app.decorate('authenticate', async (request: FastifyRequest) => {
    request.user = user;
  });
  app.decorate(
    'requireRole',
    (roles: JwtPayload['role'][]) =>
      async (request: FastifyRequest, reply: FastifyReply) => {
        const role = request.user.role;
        if (!(roles.includes(role) || (role === 'super_admin' && roles.includes('admin')))) {
          await reply.status(403).send({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: `Role '${role}' is not permitted to access this resource`,
            },
          });
        }
      },
  );
  app.decorate(
    'requirePermission',
    () => async () => {
      /* no-op permission gate for focused admin route tests */
    },
  );
  app.decorate('requireSuperAdmin', async () => {
    /* no-op super-admin gate for focused admin route tests */
  });
  app.decorateRequest('auditLog', mockAuditLog);
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.ready();
  return app;
}
