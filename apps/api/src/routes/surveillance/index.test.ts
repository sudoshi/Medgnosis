import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyRequest } from 'fastify';
import type { JwtPayload } from '../../plugins/auth.js';

const { mockAuditLog, mockSql, mockStreamTick, mockGetSource, mockGetStatus } = vi.hoisted(() => ({
  mockAuditLog: vi.fn(),
  mockSql: vi.fn(),
  mockStreamTick: vi.fn(),
  mockGetSource: vi.fn(),
  mockGetStatus: vi.fn(),
}));

vi.mock('@medgnosis/db', () => ({ sql: Object.assign(mockSql, { json: vi.fn() }) }));
vi.mock('../../services/surveillance.js', () => ({
  streamTick: mockStreamTick,
  scoreAdmission: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../services/surveillance/factory.js', () => ({
  getSurveillanceSource: mockGetSource,
  getSurveillanceSourceStatus: mockGetStatus,
}));

import surveillanceRoutes from './index.js';
import { Hl7v2SurveillanceSource } from '../../services/surveillance/hl7v2Source.js';
import { SimulatedSurveillanceSource } from '../../services/surveillance/simulated.js';

const ADMIN_USER: JwtPayload = {
  sub: '00000000-0000-4000-8000-000000000001',
  email: 'admin@example.test',
  role: 'admin',
  org_id: '7',
};

const PROVIDER_USER: JwtPayload = {
  sub: '00000000-0000-4000-8000-000000000002',
  email: 'provider@example.test',
  role: 'provider',
  org_id: '7',
  provider_id: 7,
};

async function buildApp(user: JwtPayload = ADMIN_USER) {
  const app = Fastify();
  app.decorate('authenticate', async (request: FastifyRequest) => {
    request.user = user;
  });
  app.decorateRequest('auditLog', mockAuditLog);
  await app.register(surveillanceRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  mockAuditLog.mockReset();
  mockSql.mockReset();
  mockStreamTick.mockReset();
  mockStreamTick.mockResolvedValue({ ticked: 4, alerts: 2 });
  mockGetSource.mockReset();
  mockGetStatus.mockReset();
});

describe('surveillance manual tick audit', () => {
  it('audits admin-triggered surveillance ticks as aggregate metadata', async () => {
    const app = await buildApp(ADMIN_USER);

    const res = await app.inject({
      method: 'POST',
      url: '/tick',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: { ticked: 4, alerts: 2 },
    });
    expect(mockStreamTick).toHaveBeenCalledTimes(1);
    expect(mockAuditLog).toHaveBeenCalledWith(
      'surveillance_tick_run',
      'surveillance_tick',
      undefined,
      {
        ticked: 4,
        alerts: 2,
        initiated_by: 'manual',
      },
    );
    await app.close();
  });

  it('does not tick or audit for non-admin callers', async () => {
    const app = await buildApp(PROVIDER_USER);

    const res = await app.inject({
      method: 'POST',
      url: '/tick',
    });

    expect(res.statusCode).toBe(403);
    expect(mockStreamTick).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('surveillance source-status surface', () => {
  it('returns the operator status snapshot for any authenticated caller', async () => {
    mockGetStatus.mockReturnValue({
      mode: 'hl7v2',
      synthetic: false,
      lastEventAt: '2026-06-26T10:00:00.000Z',
      eventsIngested: 3,
      health: 'healthy',
      staleAfterMs: 900000,
    });
    const app = await buildApp(PROVIDER_USER);

    const res = await app.inject({ method: 'GET', url: '/source-status' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: { mode: 'hl7v2', synthetic: false, health: 'healthy' },
    });
    await app.close();
  });
});

describe('surveillance HL7 v2 intake', () => {
  const ORU = [
    'MSH|^~\\&|MONITOR|ICU|MEDGNOSIS|HOSP|20260626T101500||ORU^R01|MSG1|P|2.5.1',
    'PID|1||4001^^^HOSP^MR||DOE^JANE||19550214|F',
    'PV1|1|I|ICU^04^A||||||||||||||||7',
    'OBR|1||OBS1|VITALS^Vital signs^L|||20260626T101500',
    'OBX|1|NM|8867-4^Heart rate^LN||128|beats/min|||||F',
  ].join('\r');

  it('accepts a posted ORU message when the active source is hl7v2 (admin)', async () => {
    const source = new Hl7v2SurveillanceSource({
      resolve: async (visitId) => ({ admissionId: Number(visitId), patientId: 4001 }),
      persist: vi.fn(),
      score: vi.fn(),
    });
    mockGetSource.mockReturnValue(source);
    const app = await buildApp(ADMIN_USER);

    const res = await app.inject({ method: 'POST', url: '/hl7v2/ingest', payload: { message: ORU } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true, data: { accepted: true, admission_id: 7 } });
    expect(source.pending).toBe(1);
    expect(mockAuditLog).toHaveBeenCalledWith(
      'surveillance_hl7v2_ingest',
      'surveillance_source',
      undefined,
      expect.objectContaining({ accepted: true, admission_id: 7 }),
    );
    await app.close();
  });

  it('rejects intake for non-admin callers', async () => {
    mockGetSource.mockReturnValue(new Hl7v2SurveillanceSource({ resolve: async () => null }));
    const app = await buildApp(PROVIDER_USER);

    const res = await app.inject({ method: 'POST', url: '/hl7v2/ingest', payload: { message: ORU } });

    expect(res.statusCode).toBe(403);
    expect(mockAuditLog).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 409 when the active source is not hl7v2', async () => {
    mockGetSource.mockReturnValue(new SimulatedSurveillanceSource());
    const app = await buildApp(ADMIN_USER);

    const res = await app.inject({ method: 'POST', url: '/hl7v2/ingest', payload: { message: ORU } });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'SOURCE_MISMATCH' } });
    await app.close();
  });

  it('returns 400 for an empty message body', async () => {
    mockGetSource.mockReturnValue(new Hl7v2SurveillanceSource({ resolve: async () => null }));
    const app = await buildApp(ADMIN_USER);

    const res = await app.inject({ method: 'POST', url: '/hl7v2/ingest', payload: { message: '' } });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'EMPTY_MESSAGE' } });
    await app.close();
  });

  it('returns 422 when a message cannot be mapped to an admission', async () => {
    mockGetSource.mockReturnValue(
      new Hl7v2SurveillanceSource({ resolve: async () => null, persist: vi.fn(), score: vi.fn() }),
    );
    const app = await buildApp(ADMIN_USER);

    const res = await app.inject({ method: 'POST', url: '/hl7v2/ingest', payload: { message: ORU } });

    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNMAPPED_MESSAGE' } });
    await app.close();
  });
});
