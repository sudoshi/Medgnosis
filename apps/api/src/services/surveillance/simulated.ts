// =============================================================================
// Medgnosis API — Simulated surveillance source (DEMO ONLY)
// The original random-walk streamer, now behind the SurveillanceSource interface
// and explicitly flagged `synthetic: true` so demo data can never be mistaken
// for a real feed. Behavior is UNCHANGED from streamTick(); this only adapts it.
// =============================================================================

import { streamTick } from '../surveillance.js';
import type {
  SurveillanceIngestResult,
  SurveillanceSource,
} from './source.js';

/** Wraps the legacy random-walk streamer as a SurveillanceSource. */
export class SimulatedSurveillanceSource implements SurveillanceSource {
  readonly mode = 'simulated' as const;
  readonly synthetic = true;

  async ingest(): Promise<SurveillanceIngestResult> {
    const r = await streamTick();
    // Each ticked admission produced one vital reading; treat as event count.
    return { ticked: r.ticked, alerts: r.alerts, events: r.ticked };
  }
}
