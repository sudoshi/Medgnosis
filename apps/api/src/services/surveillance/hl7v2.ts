// =============================================================================
// Medgnosis API — HL7 v2 ORU/ADT surveillance adapter (real-feed, Phase 6)
// Parses an HL7 v2 ORU^R01 (observation result) message — the canonical wire
// format for streamed inpatient vitals — into a normalized SurveillanceEvent.
// Pure + synchronous: a string in, decoded segments out, NO network. The MLLP
// transport (a listener wrapping this parser) is intentionally NOT opened here;
// production wires a listener that hands each framed message to `parseOru`.
//
// Chosen over a FHIR Subscription adapter because (a) the realtime lane was
// designed for exactly this — phm_rt.039 comments name "a real MLLP/HL7v2
// ORU/ADT source" — and (b) it is fully self-contained: no overlap with the
// protected EHR/FHIR ingestion layer, and unit-testable from a fixture string.
// =============================================================================

import type {
  Consciousness,
  SurveillanceVitalEvent,
} from './source.js';

/** A single OBX observation, decoded but not yet mapped to a vital field. */
export interface Hl7Observation {
  /** OBX-3 identifier code (LOINC or local), e.g. '8867-4'. */
  code: string;
  /** OBX-3 text, e.g. 'Heart rate'. */
  label: string;
  /** OBX-5 raw value (string; numeric coercion happens during mapping). */
  value: string;
  /** OBX-6 units, e.g. 'beats/min'. */
  units: string;
}

/** A decoded ORU message: identity + the observations it carried. */
export interface ParsedOruMessage {
  /** MSH-10 message control id (audit/dedup key). */
  messageControlId: string;
  /** PID-3 patient identifier as sent by the source. */
  externalPatientId: string;
  /** PV1-19 visit/account number, the source's admission handle. */
  externalVisitId: string;
  /** OBR-7 observation datetime (ISO 8601) when parseable. */
  observedAt?: string;
  observations: Hl7Observation[];
}

/** Resolution from source identifiers to internal real-time-lane ids. */
export interface AdmissionResolution {
  admissionId: number;
  patientId: number;
}

const FIELD = '|';
const DEFAULT_COMPONENT = '^';

/** The numeric vital fields an OBX can map to (consciousness/onOxygen handled
 *  separately, since they are not plain numbers). */
type NumericVitalField = 'tempC' | 'heartRate' | 'systolicBp' | 'respRate' | 'spo2' | 'gcs';

// LOINC + common local synonyms → the SurveillanceVitalEvent field they feed.
// Lower-cased label fallbacks let local-coded feeds (no LOINC) still map.
const VITAL_BY_LOINC: Readonly<Record<string, NumericVitalField>> = {
  '8867-4': 'heartRate', // Heart rate
  '8480-6': 'systolicBp', // Systolic blood pressure
  '9279-1': 'respRate', // Respiratory rate
  '2708-6': 'spo2', // Oxygen saturation
  '59408-5': 'spo2', // SpO2 by pulse oximetry
  '8310-5': 'tempC', // Body temperature (assumed Celsius unless °F units)
  '9269-2': 'gcs', // Glasgow coma scale total
  '80288-4': 'gcs', // GCS total (alt)
};

const VITAL_BY_LABEL: ReadonlyArray<readonly [RegExp, NumericVitalField]> = [
  [/heart rate|pulse/i, 'heartRate'],
  [/systolic/i, 'systolicBp'],
  [/respiratory rate|resp rate/i, 'respRate'],
  [/spo2|o2 sat|oxygen sat/i, 'spo2'],
  [/temperature|temp\b/i, 'tempC'],
  [/glasgow|gcs/i, 'gcs'],
];

/** Parse the MSH encoding characters; default to standard `^~\&`. */
function encodingChars(mshLine: string): { component: string } {
  // MSH-1 is the field separator (already known), MSH-2 = encoding chars.
  const enc = mshLine.split(FIELD)[1] ?? '^~\\&';
  return { component: enc[0] ?? DEFAULT_COMPONENT };
}

/** First component of an HL7 field value (split on the component separator). */
function firstComponent(field: string | undefined, component: string): string {
  if (!field) return '';
  return field.split(component)[0]?.trim() ?? '';
}

/**
 * Convert an HL7 TS (YYYYMMDDHHMMSS[.S][+/-ZZZZ]) to ISO 8601, best-effort.
 * Returns undefined when the timestamp is absent or too short to be meaningful.
 */
export function hl7TsToIso(ts: string | undefined): string | undefined {
  if (!ts) return undefined;
  // Strict HL7 TS is contiguous digits; tolerate stray ISO-style separators
  // (T, -, :, space) some interface engines emit before matching.
  const compact = ts.trim().replace(/[T:\-\s]/g, '');
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/.exec(compact);
  if (!m) return undefined;
  const [, y, mo, d, h = '00', mi = '00', s = '00'] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

/**
 * Parse an HL7 v2 ORU^R01 message string into a ParsedOruMessage. Accepts \r,
 * \n, or \r\n segment terminators. Throws a typed error for a non-ORU message;
 * never opens a connection. PHI (names) in PID is deliberately ignored — only
 * identifiers and observations are retained.
 */
export function parseOru(raw: string): ParsedOruMessage {
  const segments = raw
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const msh = segments.find((s) => s.startsWith('MSH'));
  if (!msh) {
    throw new Hl7ParseError('Missing MSH segment');
  }
  const { component } = encodingChars(msh);
  const mshFields = msh.split(FIELD);
  // MSH-9 message type, e.g. 'ORU^R01' — must be an observation result.
  const messageType = firstComponent(mshFields[8], component);
  if (messageType !== 'ORU') {
    throw new Hl7ParseError(`Unsupported message type: ${messageType || '(none)'} (expected ORU)`);
  }
  const messageControlId = (mshFields[9] ?? '').trim();

  const pid = segments.find((s) => s.startsWith('PID'));
  const pv1 = segments.find((s) => s.startsWith('PV1'));
  const obr = segments.find((s) => s.startsWith('OBR'));

  const pidFields = pid ? pid.split(FIELD) : [];
  const pv1Fields = pv1 ? pv1.split(FIELD) : [];
  const obrFields = obr ? obr.split(FIELD) : [];

  // PID-3 carries the patient identifier list; first component is the id value.
  const externalPatientId = firstComponent(pidFields[3], component);
  // PV1-19 is the visit number (the source's admission handle).
  const externalVisitId = firstComponent(pv1Fields[19], component);
  // OBR-7 observation datetime.
  const observedAt = hl7TsToIso(firstComponent(obrFields[7], component));

  const observations: Hl7Observation[] = [];
  for (const seg of segments) {
    if (!seg.startsWith('OBX')) continue;
    const f = seg.split(FIELD);
    // OBX-3 = code^label^system ; OBX-5 = value ; OBX-6 = units
    const id = f[3] ?? '';
    const code = firstComponent(id, component);
    const label = id.split(component)[1]?.trim() ?? '';
    const value = (f[5] ?? '').trim();
    const units = firstComponent(f[6], component);
    if (code === '' && label === '') continue;
    observations.push({ code, label, value, units });
  }

  return { messageControlId, externalPatientId, externalVisitId, observedAt, observations };
}

/** Typed error so callers can distinguish parse failures from infra failures. */
export class Hl7ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Hl7ParseError';
  }
}

function toNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** °F → °C, used when a temperature OBX is reported in Fahrenheit. */
function fahrenheitToCelsius(f: number): number {
  return Math.round((((f - 32) * 5) / 9) * 10) / 10;
}

/** Map an HL7 ACVPU/text consciousness value to the ACVPU enum. */
function toConsciousness(value: string): Consciousness | null {
  const v = value.trim().toUpperCase();
  if (v === 'A' || v === 'C' || v === 'V' || v === 'P' || v === 'U') return v;
  if (/alert/i.test(value)) return 'A';
  if (/confus/i.test(value)) return 'C';
  if (/voice/i.test(value)) return 'V';
  if (/pain/i.test(value)) return 'P';
  if (/unrespons/i.test(value)) return 'U';
  return null;
}

/** Which numeric vital field does an OBX map to? LOINC first, then label. */
function fieldForObservation(obs: Hl7Observation): NumericVitalField | null {
  const byCode = VITAL_BY_LOINC[obs.code];
  if (byCode) return byCode;
  for (const [pattern, field] of VITAL_BY_LABEL) {
    if (pattern.test(obs.label)) return field;
  }
  // Consciousness/diastolic are handled specially in the mapper, not here.
  return null;
}

/**
 * Map a parsed ORU message + its resolved internal ids into a normalized
 * SurveillanceVitalEvent. Pure: no DB, no side effects. Only observations that
 * map to a known vital parameter are applied; unknowns are ignored (forward-
 * compatible). Returns null when the message carried no mappable vitals.
 */
export function mapOruToVitalEvent(
  msg: ParsedOruMessage,
  resolution: AdmissionResolution,
): SurveillanceVitalEvent | null {
  const event: SurveillanceVitalEvent = {
    admissionId: resolution.admissionId,
    patientId: resolution.patientId,
    sourceMessageId: msg.messageControlId || undefined,
  };
  if (msg.observedAt) event.recordedAt = msg.observedAt;

  let mapped = 0;
  for (const obs of msg.observations) {
    // Consciousness (ACVPU) — code 80327-7 (LOINC) or a label match.
    if (obs.code === '80327-7' || /consciousness|acvpu|avpu/i.test(obs.label)) {
      const c = toConsciousness(obs.value);
      if (c) {
        event.consciousness = c;
        mapped += 1;
      }
      continue;
    }
    // Supplemental oxygen flag — code 3150-0 (FiO2) or label 'on oxygen'.
    if (/on oxygen|supplemental o2|oxygen therapy/i.test(obs.label)) {
      event.onOxygen = /^(y|yes|true|1)$/i.test(obs.value.trim());
      mapped += 1;
      continue;
    }

    const field = fieldForObservation(obs);
    if (!field) continue;
    const num = toNumber(obs.value);
    if (num === null) continue;

    const value =
      field === 'tempC' && /f|fahrenheit|°f/i.test(obs.units) ? fahrenheitToCelsius(num) : num;
    event[field] = value;
    mapped += 1;
  }

  return mapped > 0 ? event : null;
}
