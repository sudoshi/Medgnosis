// =============================================================================
// Medgnosis API — Surveillance source abstraction (Phase 6 real-feed adapter)
// A SurveillanceSource turns *whatever the upstream is* — a synthetic walk, an
// HL7 v2 ORU stream, a FHIR Subscription notification — into the SAME normalized
// SurveillanceEvent, which the lane then persists + scores. Keeping ingestion
// behind one interface means scoring/escalation never learns where a vital came
// from, and synthetic demo data can NEVER be silently mistaken for a real feed.
// =============================================================================

/** Source modes, surfaced verbatim to operators. */
export type SurveillanceSourceMode = 'simulated' | 'hl7v2' | 'fhir';

/** Discrete level of consciousness (ACVPU). Matches phm_rt.vital_stream. */
export type Consciousness = 'A' | 'C' | 'V' | 'P' | 'U';

/**
 * A normalized vital-sign observation for ONE admission, decoupled from wire
 * format. Every field except admission identity is optional: a real feed may
 * carry only the parameters that were measured. `null`/`undefined` means
 * "not reported in this event" and is left untouched by scoring.
 */
export interface SurveillanceVitalEvent {
  /** Real-time admission this reading belongs to (phm_rt.admission). */
  admissionId: number;
  /** EDW patient the admission resolves to (phm_rt.admission.patient_id). */
  patientId: number;
  /** When the reading was taken at the source (ISO 8601), if supplied. */
  recordedAt?: string;
  tempC?: number | null;
  heartRate?: number | null;
  systolicBp?: number | null;
  respRate?: number | null;
  spo2?: number | null;
  onOxygen?: boolean | null;
  consciousness?: Consciousness | null;
  gcs?: number | null;
  /** Opaque upstream message/observation id, for audit/dedup. */
  sourceMessageId?: string;
}

/**
 * A discrete point-of-care glucose reading (and, optionally, the insulin given
 * in response). Mirrors phm_rt.glucose_stream / phm_rt.insulin_admin.
 */
export interface SurveillanceGlucoseEvent {
  admissionId: number;
  patientId: number;
  recordedAt?: string;
  glucoseMgdl: number;
  source?: string;
  insulin?: { doseUnits: number; product: string };
}

/** A single decoded surveillance event of a known kind. */
export type SurveillanceEvent =
  | { kind: 'vital'; vital: SurveillanceVitalEvent }
  | { kind: 'glucose'; glucose: SurveillanceGlucoseEvent };

/** Operator-visible health of a source: when did we last successfully ingest. */
export interface SurveillanceSourceStatus {
  /** Current configured source mode. */
  mode: SurveillanceSourceMode;
  /** Whether the mode is the synthetic demo streamer (never real data). */
  synthetic: boolean;
  /** ISO 8601 timestamp of the last ingested event, or null if none yet. */
  lastEventAt: string | null;
  /** Count of events ingested since process start. */
  eventsIngested: number;
  /** healthy = fresh within staleAfterMs; stale = silent past the threshold. */
  health: 'healthy' | 'stale' | 'idle';
  /** Threshold (ms) past which a quiet source is considered stale. */
  staleAfterMs: number;
}

/** Result of running one ingestion cycle. */
export interface SurveillanceIngestResult {
  /** Distinct admissions that received at least one event this cycle. */
  ticked: number;
  /** Escalations (RRT/emergency tier) raised this cycle. */
  alerts: number;
  /** Total events ingested this cycle. */
  events: number;
}

/**
 * A surveillance source. `mode`/`synthetic` describe it; `ingest()` runs one
 * cycle (pull for the simulator, drain-buffer for a push feed) and returns what
 * happened so the worker can log + the status surface can update.
 */
export interface SurveillanceSource {
  readonly mode: SurveillanceSourceMode;
  readonly synthetic: boolean;
  ingest(): Promise<SurveillanceIngestResult>;
}

const DEFAULT_STALE_AFTER_MS = 15 * 60 * 1000; // 3 missed 5-min ticks

/**
 * Tracks last-event time per source mode so an operator can see at a glance
 * whether the feed is live. Pure + in-memory: one tracker per process; no DB,
 * no PHI — only timestamps and counts. Immutable status snapshots are returned.
 */
export class SourceStatusTracker {
  private lastEventAt: Date | null = null;
  private eventsIngested = 0;

  constructor(
    private readonly mode: SurveillanceSourceMode,
    private readonly synthetic: boolean,
    private readonly staleAfterMs: number = DEFAULT_STALE_AFTER_MS,
  ) {}

  /** Record that `count` events were ingested at `at` (default now). */
  record(count: number, at: Date = new Date()): void {
    if (count <= 0) return;
    this.eventsIngested += count;
    if (this.lastEventAt === null || at > this.lastEventAt) {
      this.lastEventAt = at;
    }
  }

  /** Immutable snapshot of current health, evaluated against `now`. */
  snapshot(now: Date = new Date()): SurveillanceSourceStatus {
    let health: SurveillanceSourceStatus['health'];
    if (this.lastEventAt === null) {
      health = 'idle';
    } else if (now.getTime() - this.lastEventAt.getTime() > this.staleAfterMs) {
      health = 'stale';
    } else {
      health = 'healthy';
    }
    return {
      mode: this.mode,
      synthetic: this.synthetic,
      lastEventAt: this.lastEventAt ? this.lastEventAt.toISOString() : null,
      eventsIngested: this.eventsIngested,
      health,
      staleAfterMs: this.staleAfterMs,
    };
  }
}
