// =============================================================================
// Route tests — SuperNote (assemble is read-only + provenance-stamped; finalize
// is an explicit clinician action that never auto-signs during assembly)
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyRequest } from 'fastify';

const { mockAuditLog, mockAssemble, mockFinalize } = vi.hoisted(() => ({
  mockAuditLog: vi.fn(),
  mockAssemble: vi.fn(),
  mockFinalize: vi.fn(),
}));

vi.mock('../../services/superNote.js', () => ({
  assembleSuperNote: mockAssemble,
  finalizeSuperNote: mockFinalize,
}));

import superNoteRoutes from './index.js';
import type { JwtPayload } from '../../plugins/auth.js';

const PROVIDER_USER: JwtPayload = {
  sub: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  email: 'provider@example.test',
  role: 'provider',
  org_id: 'org-1',
  provider_id: 7,
};

async function buildApp(user: JwtPayload = PROVIDER_USER) {
  const app = Fastify();
  app.decorate('authenticate', async (request: FastifyRequest) => {
    request.user = user;
  });
  app.decorateRequest('auditLog', mockAuditLog);
  await app.register(superNoteRoutes);
  await app.ready();
  return app;
}

function assembledNoteFixture() {
  return {
    patient: { patient_id: 42, first_name: 'Super', last_name: 'Bean', age: 72, gender: 'male' },
    last_seen: '2025-05-14',
    brief_history: 'Super Bean is a 72 year old male...',
    whats_due: 'Due for: HbA1c.',
    problems_by_system: [],
    interval_events: [],
    care_gaps: [],
    lab_review: [],
    assessment_plan: [],
    provenance: {
      brief_history: { sources: ['demographics', 'problem_list', 'measures', 'encounter'], deterministic: true, ai_generated: false },
      whats_due: { sources: ['measures'], deterministic: true, ai_generated: false },
      problems_by_system: { sources: ['problem_list'], deterministic: true, ai_generated: false },
      interval_events: { sources: ['encounter'], deterministic: true, ai_generated: false },
      care_gaps: { sources: ['measures'], deterministic: true, ai_generated: false },
      lab_review: { sources: ['labs'], deterministic: true, ai_generated: false },
      assessment_plan: { sources: ['problem_list'], deterministic: true, ai_generated: false },
    },
    assembly: { deterministic: true, ai_generated: false, assembled_by: 'supernote' },
    review: { review_status: 'unsigned', signed: false, last_edited_by: null, last_edited_at: null },
  };
}

beforeEach(() => {
  mockAuditLog.mockReset();
  mockAssemble.mockReset();
  mockFinalize.mockReset();
});

describe('GET /supernote/:patientId — deterministic, provenance-stamped, never finalized', () => {
  it('returns per-section provenance and a whole-note deterministic / non-AI flag', async () => {
    mockAssemble.mockResolvedValue(assembledNoteFixture());
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/42' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.assembly).toEqual({ deterministic: true, ai_generated: false, assembled_by: 'supernote' });
    expect(body.data.provenance.brief_history.sources).toContain('problem_list');
    expect(body.data.provenance.lab_review.sources).toContain('labs');
    // Every section affirms deterministic, non-AI assembly.
    for (const section of Object.values(body.data.provenance) as Array<{ deterministic: boolean; ai_generated: boolean }>) {
      expect(section.deterministic).toBe(true);
      expect(section.ai_generated).toBe(false);
    }
    await app.close();
  });

  it('returns an unsigned/draft review state — assembly never auto-signs', async () => {
    mockAssemble.mockResolvedValue(assembledNoteFixture());
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/42' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.review.review_status).toBe('unsigned');
    expect(body.data.review.signed).toBe(false);
    // Assembling a note must NEVER finalize/sign anything.
    expect(mockFinalize).not.toHaveBeenCalled();
    await app.close();
  });

  it('does not leak deferred "AI narrative coming soon" / LLM claims in the response', async () => {
    mockAssemble.mockResolvedValue(assembledNoteFixture());
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/42' });

    expect(res.payload).not.toMatch(/AI narrative coming soon/i);
    expect(res.payload).not.toMatch(/llm[-_ ]generated/i);
    expect(res.payload).not.toMatch(/"ai_generated":true/);
    await app.close();
  });

  it('404s when the patient does not resolve, without finalizing', async () => {
    mockAssemble.mockResolvedValue(null);
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/999999' });

    expect(res.statusCode).toBe(404);
    expect(mockFinalize).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('POST /supernote/:patientId/finalize — explicit clinician action', () => {
  it('finalizes via the explicit route and audits a deterministic, clinician-finalized, non-AI note', async () => {
    mockFinalize.mockResolvedValue({ note_id: '11111111-1111-4111-8111-111111111111', coded: 2 });
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/42/finalize',
      payload: {
        chief_complaint: 'Follow-up',
        ap: [{ icd10_code: 'E11.9', diagnosis_name: 'Type 2 diabetes', plan: 'Continue metformin' }],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(mockFinalize).toHaveBeenCalledTimes(1);
    // Author identity is the JWT sub claim (explicit clinician).
    expect(mockFinalize).toHaveBeenCalledWith(42, PROVIDER_USER.sub, 'Follow-up', expect.any(Array));
    expect(mockAuditLog).toHaveBeenCalledWith(
      'finalize',
      'supernote',
      '11111111-1111-4111-8111-111111111111',
      expect.objectContaining({
        coded: 2,
        deterministic: true,
        ai_generated: false,
        finalized_by: 'clinician',
      }),
    );
    // PHI (the plan text / chief complaint) must not appear in the audit details.
    expect(JSON.stringify(mockAuditLog.mock.calls)).not.toContain('Continue metformin');
    await app.close();
  });

  it('rejects an empty A&P payload (no finalize, no audit)', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/42/finalize',
      payload: { ap: [] },
    });

    expect(res.statusCode).toBe(400);
    expect(mockFinalize).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
    await app.close();
  });
});
