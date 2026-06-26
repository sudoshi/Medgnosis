// =============================================================================
// Unit tests — Surveillance source factory
// Source DEFAULTS to simulated (preserving demo behavior); SURVEILLANCE_SOURCE
// selects hl7v2; unknown values fall back to simulated; runSurveillanceIngest()
// delegates to the active source and updates the shared status tracker.
// The legacy facade (streamTick) and @medgnosis/db are mocked so no Redis/DB is
// touched and the simulated path is observable.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockStreamTick, mockSql } = vi.hoisted(() => ({
  mockStreamTick: vi.fn(),
  mockSql: vi.fn(),
}));

vi.mock('../surveillance.js', () => ({
  streamTick: mockStreamTick,
  // scoreAdmission is imported by hl7v2Source default deps; stub it.
  scoreAdmission: vi.fn().mockResolvedValue(null),
}));
vi.mock('@medgnosis/db', () => ({ sql: Object.assign(mockSql, { json: vi.fn() }) }));

import {
  configuredSourceMode,
  getSurveillanceSource,
  getSurveillanceSourceStatus,
  runSurveillanceIngest,
  __resetSurveillanceRuntime,
} from './factory.js';
import { SimulatedSurveillanceSource } from './simulated.js';
import { Hl7v2SurveillanceSource } from './hl7v2Source.js';

const ORIGINAL = process.env['SURVEILLANCE_SOURCE'];

beforeEach(() => {
  mockStreamTick.mockReset().mockResolvedValue({ ticked: 4, alerts: 1 });
  mockSql.mockReset();
  __resetSurveillanceRuntime();
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env['SURVEILLANCE_SOURCE'];
  else process.env['SURVEILLANCE_SOURCE'] = ORIGINAL;
  __resetSurveillanceRuntime();
});

describe('configuredSourceMode', () => {
  it('defaults to simulated when unset', () => {
    delete process.env['SURVEILLANCE_SOURCE'];
    expect(configuredSourceMode()).toBe('simulated');
  });

  it('honors hl7v2 and fhir, case-insensitively', () => {
    process.env['SURVEILLANCE_SOURCE'] = 'HL7V2';
    expect(configuredSourceMode()).toBe('hl7v2');
    process.env['SURVEILLANCE_SOURCE'] = 'fhir';
    expect(configuredSourceMode()).toBe('fhir');
  });

  it('falls back to simulated for an unknown value', () => {
    process.env['SURVEILLANCE_SOURCE'] = 'garbage';
    expect(configuredSourceMode()).toBe('simulated');
  });
});

describe('getSurveillanceSource', () => {
  it('builds the simulated source by default', () => {
    delete process.env['SURVEILLANCE_SOURCE'];
    __resetSurveillanceRuntime();
    const src = getSurveillanceSource();
    expect(src).toBeInstanceOf(SimulatedSurveillanceSource);
    expect(src.synthetic).toBe(true);
  });

  it('builds the hl7v2 source when configured', () => {
    process.env['SURVEILLANCE_SOURCE'] = 'hl7v2';
    __resetSurveillanceRuntime();
    const src = getSurveillanceSource();
    expect(src).toBeInstanceOf(Hl7v2SurveillanceSource);
    expect(src.synthetic).toBe(false);
  });

  it('memoizes the same instance across calls', () => {
    delete process.env['SURVEILLANCE_SOURCE'];
    __resetSurveillanceRuntime();
    expect(getSurveillanceSource()).toBe(getSurveillanceSource());
  });
});

describe('runSurveillanceIngest + status', () => {
  it('starts idle, then reports the simulated mode after an ingest', async () => {
    delete process.env['SURVEILLANCE_SOURCE'];
    __resetSurveillanceRuntime();

    const before = getSurveillanceSourceStatus();
    expect(before).toMatchObject({ mode: 'simulated', synthetic: true, health: 'idle', lastEventAt: null });

    const result = await runSurveillanceIngest();
    expect(mockStreamTick).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ticked: 4, alerts: 1, events: 4 });

    const after = getSurveillanceSourceStatus();
    expect(after.mode).toBe('simulated');
    expect(after.synthetic).toBe(true);
    expect(after.eventsIngested).toBe(4);
    expect(after.health).toBe('healthy');
    expect(after.lastEventAt).not.toBeNull();
  });

  it('hl7v2 ingest with an empty buffer leaves status idle', async () => {
    process.env['SURVEILLANCE_SOURCE'] = 'hl7v2';
    __resetSurveillanceRuntime();

    const result = await runSurveillanceIngest();
    expect(mockStreamTick).not.toHaveBeenCalled();
    expect(result).toEqual({ ticked: 0, alerts: 0, events: 0 });
    expect(getSurveillanceSourceStatus().health).toBe('idle');
  });
});
