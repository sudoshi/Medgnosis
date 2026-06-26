// =============================================================================
// Unit tests — HL7 v2 ORU parser + SurveillanceVitalEvent mapper
// Verifies a real ORU fixture maps into the correct surveillance event shape,
// Fahrenheit→Celsius conversion, local-code (label) fallback, and rejection of
// a non-ORU (ADT) message. Pure: no DB, no network.
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  parseOru,
  mapOruToVitalEvent,
  hl7TsToIso,
  Hl7ParseError,
  type AdmissionResolution,
} from './hl7v2.js';
import {
  ORU_VITALS_CRITICAL,
  ORU_VITALS_FAHRENHEIT,
  ORU_VITALS_LOCAL_CODES,
  ADT_ADMIT,
} from './__fixtures__/hl7Messages.js';

const RESOLUTION: AdmissionResolution = { admissionId: 42, patientId: 4001 };

describe('parseOru', () => {
  it('extracts identity + observations from an ORU^R01 message', () => {
    const msg = parseOru(ORU_VITALS_CRITICAL);
    expect(msg.messageControlId).toBe('MSG000123');
    expect(msg.externalPatientId).toBe('4001');
    expect(msg.externalVisitId).toBe('7');
    expect(msg.observedAt).toBe('2026-06-26T10:15:00.000Z');
    expect(msg.observations).toHaveLength(7);
    const hr = msg.observations.find((o) => o.code === '8867-4');
    expect(hr).toMatchObject({ value: '128', units: 'beats/min', label: 'Heart rate' });
  });

  it('accepts \\n and \\r\\n segment terminators', () => {
    const lf = ORU_VITALS_CRITICAL.replace(/\r/g, '\n');
    const crlf = ORU_VITALS_CRITICAL.replace(/\r/g, '\r\n');
    expect(parseOru(lf).externalVisitId).toBe('7');
    expect(parseOru(crlf).externalVisitId).toBe('7');
  });

  it('throws Hl7ParseError for a non-ORU message (ADT)', () => {
    expect(() => parseOru(ADT_ADMIT)).toThrow(Hl7ParseError);
    expect(() => parseOru(ADT_ADMIT)).toThrow(/expected ORU/i);
  });

  it('throws Hl7ParseError when MSH is missing', () => {
    expect(() => parseOru('PID|1||4001')).toThrow(Hl7ParseError);
  });
});

describe('hl7TsToIso', () => {
  it('parses a full HL7 timestamp to ISO 8601', () => {
    expect(hl7TsToIso('20260626T101500')).toBe('2026-06-26T10:15:00.000Z');
  });
  it('parses a date-only timestamp', () => {
    expect(hl7TsToIso('20260626')).toBe('2026-06-26T00:00:00.000Z');
  });
  it('returns undefined for empty/garbage', () => {
    expect(hl7TsToIso('')).toBeUndefined();
    expect(hl7TsToIso(undefined)).toBeUndefined();
    expect(hl7TsToIso('nope')).toBeUndefined();
  });
});

describe('mapOruToVitalEvent', () => {
  it('maps a critical ORU into the correct SurveillanceVitalEvent shape', () => {
    const event = mapOruToVitalEvent(parseOru(ORU_VITALS_CRITICAL), RESOLUTION);
    expect(event).not.toBeNull();
    expect(event).toMatchObject({
      admissionId: 42,
      patientId: 4001,
      sourceMessageId: 'MSG000123',
      recordedAt: '2026-06-26T10:15:00.000Z',
      heartRate: 128,
      systolicBp: 88,
      respRate: 26,
      spo2: 91,
      tempC: 38.7,
      consciousness: 'A',
      gcs: 15,
    });
  });

  it('converts a Fahrenheit temperature to Celsius', () => {
    const event = mapOruToVitalEvent(parseOru(ORU_VITALS_FAHRENHEIT), {
      admissionId: 9,
      patientId: 4002,
    });
    expect(event?.tempC).toBe(38.5); // 101.3°F → 38.5°C
  });

  it('falls back to label matching for local-coded observations', () => {
    const event = mapOruToVitalEvent(parseOru(ORU_VITALS_LOCAL_CODES), {
      admissionId: 11,
      patientId: 4003,
    });
    expect(event?.heartRate).toBe(72);
  });

  it('returns null when no observation maps to a known vital', () => {
    const msg = parseOru(
      ['MSH|^~\\&|M|I|D|H|20260626||ORU^R01|X1|P|2.5.1', 'OBX|1|NM|99999-9^Unknown^L||5|x'].join('\r'),
    );
    expect(mapOruToVitalEvent(msg, RESOLUTION)).toBeNull();
  });
});
