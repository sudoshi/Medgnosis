// =============================================================================
// Unit tests — SourceStatusTracker (operator-visible freshness)
// idle before any event, healthy when fresh, stale past the threshold; snapshots
// are immutable and report mode + synthetic + last-event time.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { SourceStatusTracker } from './source.js';

describe('SourceStatusTracker', () => {
  it('reports idle before any event is recorded', () => {
    const t = new SourceStatusTracker('hl7v2', false, 1000);
    const s = t.snapshot();
    expect(s).toMatchObject({
      mode: 'hl7v2',
      synthetic: false,
      lastEventAt: null,
      eventsIngested: 0,
      health: 'idle',
      staleAfterMs: 1000,
    });
  });

  it('reports healthy immediately after recording an event', () => {
    const t = new SourceStatusTracker('simulated', true, 60_000);
    const at = new Date('2026-06-26T10:00:00Z');
    t.record(4, at);
    const s = t.snapshot(new Date('2026-06-26T10:00:30Z'));
    expect(s.health).toBe('healthy');
    expect(s.eventsIngested).toBe(4);
    expect(s.lastEventAt).toBe('2026-06-26T10:00:00.000Z');
    expect(s.synthetic).toBe(true);
  });

  it('reports stale once the last event is older than the threshold', () => {
    const t = new SourceStatusTracker('hl7v2', false, 60_000);
    t.record(1, new Date('2026-06-26T10:00:00Z'));
    const s = t.snapshot(new Date('2026-06-26T10:02:00Z')); // +120s > 60s
    expect(s.health).toBe('stale');
  });

  it('accumulates counts and keeps the latest timestamp', () => {
    const t = new SourceStatusTracker('hl7v2', false, 60_000);
    t.record(2, new Date('2026-06-26T10:00:00Z'));
    t.record(3, new Date('2026-06-26T10:01:00Z'));
    t.record(1, new Date('2026-06-26T09:59:00Z')); // out-of-order, older
    const s = t.snapshot(new Date('2026-06-26T10:01:10Z'));
    expect(s.eventsIngested).toBe(6);
    expect(s.lastEventAt).toBe('2026-06-26T10:01:00.000Z');
  });

  it('ignores non-positive event counts', () => {
    const t = new SourceStatusTracker('hl7v2', false, 60_000);
    t.record(0);
    t.record(-5);
    expect(t.snapshot().health).toBe('idle');
    expect(t.snapshot().eventsIngested).toBe(0);
  });
});
