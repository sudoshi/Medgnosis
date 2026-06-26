// =============================================================================
// Unit tests — Hl7v2SurveillanceSource adapter
// Verifies the push adapter: accept() parses+resolves+buffers, ingest() persists
// + scores, unresolvable/unparseable messages are dropped (counted), and the
// non-synthetic flag is set. Persistence + scoring + resolution are injected, so
// NO database or network is touched. @medgnosis/db is mocked to keep the module
// graph (scoreAdmission import) loadable.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSql } = vi.hoisted(() => ({ mockSql: vi.fn() }));
vi.mock('@medgnosis/db', () => ({ sql: Object.assign(mockSql, { json: vi.fn() }) }));
// Stub the facade so the heavy surveillance module graph (rules/ws/config) is
// not loaded; the adapter under test injects its own scorer anyway.
vi.mock('../surveillance.js', () => ({ scoreAdmission: vi.fn().mockResolvedValue(null) }));

import { Hl7v2SurveillanceSource } from './hl7v2Source.js';
import type {
  AdmissionResolver,
  VitalPersister,
  AdmissionScorer,
} from './hl7v2Source.js';
import {
  ORU_VITALS_CRITICAL,
  ORU_VITALS_LOCAL_CODES,
  ADT_ADMIT,
} from './__fixtures__/hl7Messages.js';
import type { SurveillanceVitalEvent } from './source.js';

const resolveAlways: AdmissionResolver = async (visitId) => ({
  admissionId: Number(visitId),
  patientId: 4001,
});

beforeEach(() => {
  mockSql.mockReset();
});

describe('Hl7v2SurveillanceSource', () => {
  it('is a non-synthetic hl7v2 source', () => {
    const src = new Hl7v2SurveillanceSource({ resolve: resolveAlways });
    expect(src.mode).toBe('hl7v2');
    expect(src.synthetic).toBe(false);
  });

  it('accept() parses + resolves + buffers a real ORU into a vital event', async () => {
    const src = new Hl7v2SurveillanceSource({ resolve: resolveAlways, persist: vi.fn(), score: vi.fn() });
    const event = await src.accept(ORU_VITALS_CRITICAL);
    expect(event).toMatchObject({ admissionId: 7, patientId: 4001, heartRate: 128, spo2: 91 });
    expect(src.pending).toBe(1);
    expect(src.rejected).toBe(0);
  });

  it('ingest() persists each buffered event then scores each touched admission', async () => {
    const persisted: SurveillanceVitalEvent[] = [];
    const persist: VitalPersister = async (e) => { persisted.push(e); };
    const scored: number[] = [];
    const score: AdmissionScorer = async (id) => { scored.push(id); return id === 7; };

    const src = new Hl7v2SurveillanceSource({ resolve: resolveAlways, persist, score });
    await src.accept(ORU_VITALS_CRITICAL); // visit 7
    await src.accept(ORU_VITALS_LOCAL_CODES); // visit 11
    expect(src.pending).toBe(2);

    const result = await src.ingest();
    expect(persisted).toHaveLength(2);
    expect(scored.sort((a, b) => a - b)).toEqual([7, 11]);
    expect(result).toEqual({ ticked: 2, alerts: 1, events: 2 });
    expect(src.pending).toBe(0); // buffer drained
  });

  it('drops + counts a non-ORU (ADT) message without throwing', async () => {
    const src = new Hl7v2SurveillanceSource({ resolve: resolveAlways, persist: vi.fn(), score: vi.fn() });
    const event = await src.accept(ADT_ADMIT);
    expect(event).toBeNull();
    expect(src.pending).toBe(0);
    expect(src.rejected).toBe(1);
  });

  it('drops + counts an unresolvable visit (resolver returns null)', async () => {
    const src = new Hl7v2SurveillanceSource({ resolve: async () => null, persist: vi.fn(), score: vi.fn() });
    const event = await src.accept(ORU_VITALS_CRITICAL);
    expect(event).toBeNull();
    expect(src.rejected).toBe(1);
  });

  it('ingest() on an empty buffer is a no-op', async () => {
    const src = new Hl7v2SurveillanceSource({ resolve: resolveAlways, persist: vi.fn(), score: vi.fn() });
    expect(await src.ingest()).toEqual({ ticked: 0, alerts: 0, events: 0 });
  });
});
