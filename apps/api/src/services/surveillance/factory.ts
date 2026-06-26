// =============================================================================
// Medgnosis API — Surveillance source factory + status surface
// Resolves the configured source ONCE per process (so the worker's ingest() and
// the route's source-status / message intake share one instance + one status
// tracker) and exposes an operator-visible status snapshot. The default is
// `simulated`, preserving today's demo behavior; a real feed is opt-in via
// SURVEILLANCE_SOURCE so synthetic data is never silently shipped as real.
// =============================================================================

import {
  SourceStatusTracker,
  type SurveillanceIngestResult,
  type SurveillanceSource,
  type SurveillanceSourceMode,
  type SurveillanceSourceStatus,
} from './source.js';
import { SimulatedSurveillanceSource } from './simulated.js';
import {
  Hl7v2SurveillanceSource,
  resolveAdmissionFromDb,
} from './hl7v2Source.js';

/** Read + validate the configured source mode. Unknown values fall back to
 *  simulated (fail-safe: never surface unscored real expectations by accident). */
export function configuredSourceMode(): SurveillanceSourceMode {
  const raw = (process.env['SURVEILLANCE_SOURCE'] ?? 'simulated').trim().toLowerCase();
  if (raw === 'hl7v2' || raw === 'fhir') return raw;
  return 'simulated';
}

function buildSource(mode: SurveillanceSourceMode): SurveillanceSource {
  switch (mode) {
    case 'hl7v2':
      return new Hl7v2SurveillanceSource({ resolve: resolveAdmissionFromDb });
    case 'fhir':
      // FHIR Subscription intake is not implemented in this workstream; fall back
      // to the simulator rather than silently presenting an empty "real" feed.
      // (Tracked as a follow-up.)
      return new SimulatedSurveillanceSource();
    case 'simulated':
    default:
      return new SimulatedSurveillanceSource();
  }
}

interface SurveillanceRuntime {
  source: SurveillanceSource;
  tracker: SourceStatusTracker;
}

let runtime: SurveillanceRuntime | null = null;

/** Lazily resolve (and memoize) the process-wide surveillance runtime. */
function getRuntime(): SurveillanceRuntime {
  if (runtime) return runtime;
  const mode = configuredSourceMode();
  const source = buildSource(mode);
  const tracker = new SourceStatusTracker(source.mode, source.synthetic);
  runtime = { source, tracker };
  return runtime;
}

/** The process-wide surveillance source (memoized). */
export function getSurveillanceSource(): SurveillanceSource {
  return getRuntime().source;
}

/**
 * Run one ingestion cycle through the configured source and record the result
 * against the shared status tracker. This is what the worker tick calls.
 */
export async function runSurveillanceIngest(): Promise<SurveillanceIngestResult> {
  const { source, tracker } = getRuntime();
  const result = await source.ingest();
  tracker.record(result.events);
  return result;
}

/** Operator-visible snapshot: current mode, synthetic flag, last event, health. */
export function getSurveillanceSourceStatus(now: Date = new Date()): SurveillanceSourceStatus {
  return getRuntime().tracker.snapshot(now);
}

/** Test-only: drop the memoized runtime so a new SURVEILLANCE_SOURCE takes effect. */
export function __resetSurveillanceRuntime(): void {
  runtime = null;
}
