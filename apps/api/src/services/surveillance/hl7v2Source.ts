// =============================================================================
// Medgnosis API — HL7 v2 ORU surveillance source (real-feed adapter)
// Push model: an MLLP listener (NOT opened by default) hands each framed message
// to `accept()`, which parses + resolves + buffers a normalized event. `ingest()`
// drains the buffer, persists vitals to the hot partition, and scores via the
// existing scoreAdmission(). Persistence + identity resolution are injected so
// the adapter is fully unit-testable without a live connection or database.
// =============================================================================

import { sql } from '@medgnosis/db';
import { scoreAdmission } from '../surveillance.js';
import {
  parseOru,
  mapOruToVitalEvent,
  Hl7ParseError,
  type AdmissionResolution,
} from './hl7v2.js';
import type {
  SurveillanceIngestResult,
  SurveillanceSource,
  SurveillanceVitalEvent,
} from './source.js';

/** Resolves a source visit/patient identifier to internal real-time-lane ids. */
export type AdmissionResolver = (
  externalVisitId: string,
  externalPatientId: string,
) => Promise<AdmissionResolution | null>;

/** Persists one normalized vital event to phm_rt.vital_stream. */
export type VitalPersister = (event: SurveillanceVitalEvent) => Promise<void>;

/** Re-scores an admission and reports whether it escalated. */
export type AdmissionScorer = (admissionId: number) => Promise<boolean>;

export interface Hl7v2SourceDeps {
  resolve: AdmissionResolver;
  persist?: VitalPersister;
  score?: AdmissionScorer;
}

/** Default resolver: look up the most recent admitted stay for a visit id.
 *  Falls back to matching the external visit id against admission_id directly
 *  (demo census uses synthetic visit numbers == admission_id). */
export async function resolveAdmissionFromDb(
  externalVisitId: string,
  externalPatientId: string,
): Promise<AdmissionResolution | null> {
  const visitNum = Number(externalVisitId);
  if (Number.isInteger(visitNum) && visitNum > 0) {
    const [row] = await sql<{ admission_id: number; patient_id: number }[]>`
      SELECT admission_id, patient_id FROM phm_rt.admission
      WHERE admission_id = ${visitNum} AND status = 'admitted' LIMIT 1
    `;
    if (row) return { admissionId: row.admission_id, patientId: row.patient_id };
  }
  const patientNum = Number(externalPatientId);
  if (Number.isInteger(patientNum) && patientNum > 0) {
    const [row] = await sql<{ admission_id: number; patient_id: number }[]>`
      SELECT admission_id, patient_id FROM phm_rt.admission
      WHERE patient_id = ${patientNum} AND status = 'admitted'
      ORDER BY admit_datetime DESC LIMIT 1
    `;
    if (row) return { admissionId: row.admission_id, patientId: row.patient_id };
  }
  return null;
}

/** Default persister: append the event's reported parameters to vital_stream. */
export async function persistVitalToDb(event: SurveillanceVitalEvent): Promise<void> {
  await sql`
    INSERT INTO phm_rt.vital_stream
      (admission_id, patient_id, recorded_datetime, temp_c, heart_rate, systolic_bp,
       resp_rate, spo2, on_oxygen, consciousness, gcs)
    VALUES (
      ${event.admissionId}, ${event.patientId},
      COALESCE(${event.recordedAt ?? null}::timestamp, NOW()),
      ${event.tempC ?? null}, ${event.heartRate ?? null}, ${event.systolicBp ?? null},
      ${event.respRate ?? null}, ${event.spo2 ?? null}, ${event.onOxygen ?? false},
      ${event.consciousness ?? 'A'}, ${event.gcs ?? 15}
    )
  `;
}

/** Default scorer: delegate to the shared scoreAdmission() and report escalation. */
export async function scoreAdmissionEscalation(admissionId: number): Promise<boolean> {
  const score = await scoreAdmission(admissionId);
  return !!score && (score.mews >= 5 || score.news2 >= 7);
}

/**
 * HL7 v2 ORU source. Stateless w.r.t. transport: messages arrive via `accept()`
 * (sync parse → buffer), and `ingest()` (called by the worker tick) drains the
 * buffer into the hot partition + scoring. Unresolvable/unparseable messages are
 * counted and dropped, never thrown to the caller.
 */
export class Hl7v2SurveillanceSource implements SurveillanceSource {
  readonly mode = 'hl7v2' as const;
  readonly synthetic = false;

  private readonly buffer: SurveillanceVitalEvent[] = [];
  private readonly resolve: AdmissionResolver;
  private readonly persist: VitalPersister;
  private readonly score: AdmissionScorer;

  /** Messages that failed to parse/resolve since process start (operator signal). */
  rejected = 0;

  constructor(deps: Hl7v2SourceDeps) {
    this.resolve = deps.resolve;
    this.persist = deps.persist ?? persistVitalToDb;
    this.score = deps.score ?? scoreAdmissionEscalation;
  }

  /**
   * Accept one raw HL7 message (already MLLP-deframed). Parses, resolves the
   * visit to an internal admission, maps to a normalized event, and buffers it.
   * Returns the buffered event, or null when it could not be mapped/resolved.
   */
  async accept(raw: string): Promise<SurveillanceVitalEvent | null> {
    let event: SurveillanceVitalEvent | null;
    try {
      const parsed = parseOru(raw);
      const resolution = await this.resolve(parsed.externalVisitId, parsed.externalPatientId);
      if (!resolution) {
        this.rejected += 1;
        return null;
      }
      event = mapOruToVitalEvent(parsed, resolution);
    } catch (err) {
      if (err instanceof Hl7ParseError) {
        this.rejected += 1;
        return null;
      }
      throw err;
    }
    if (!event) {
      this.rejected += 1;
      return null;
    }
    this.buffer.push(event);
    return event;
  }

  /** Number of events currently buffered awaiting the next ingest cycle. */
  get pending(): number {
    return this.buffer.length;
  }

  async ingest(): Promise<SurveillanceIngestResult> {
    if (this.buffer.length === 0) return { ticked: 0, alerts: 0, events: 0 };
    const drained = this.buffer.splice(0, this.buffer.length);
    const touched = new Set<number>();
    for (const event of drained) {
      await this.persist(event);
      touched.add(event.admissionId);
    }
    let alerts = 0;
    for (const admissionId of touched) {
      if (await this.score(admissionId)) alerts += 1;
    }
    return { ticked: touched.size, alerts, events: drained.length };
  }
}
