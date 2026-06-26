// =============================================================================
// Unit tests — Rules Engine Worker (Phase 6 expanded rule families)
//
// Each new family is verified for the three required behaviors:
//   1. triggers (creates + broadcasts an alert) when a threshold is breached
//   2. suppresses duplicates (no second alert while one is open)
//   3. auto-resolves the open alert when the triggering condition clears
//
// The @medgnosis/db `sql` tag is mocked with a query-routing dispatcher: it
// inspects the SQL text of each tagged-template call and returns the configured
// rows, so a test only declares the data each rule sees — not a brittle ordered
// sequence of every internal query.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

type SqlRow = Record<string, unknown>;
type SqlHandler = (text: string, params: unknown[]) => SqlRow[];

// Indirection so the hoisted `sql` mock always reads the route the current test
// installed via `use()`. Reassigning `routeRef.current` swaps query behavior.
const routeRef = { current: (() => []) as SqlHandler };

const { mockSql, mockPublishAlert } = vi.hoisted(() => {
  const fn = vi.fn(
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<SqlRow[]> => {
      const text = strings.join(' ');
      return Promise.resolve(routeRef.current(text, values));
    },
  );
  const publish = vi.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
  return { mockSql: fn, mockPublishAlert: publish };
});

// BullMQ constructs a Queue at module load — stub it so no Redis is touched.
vi.mock('bullmq', () => ({
  Queue: class {
    add = vi.fn();
    addBulk = vi.fn();
  },
  Worker: class {
    on = vi.fn();
  },
}));

// config is read at module load for the redis connection URL.
vi.mock('../config.js', () => ({
  config: { redisUrl: 'redis://localhost:6379' },
}));

vi.mock('@medgnosis/db', () => ({
  sql: Object.assign(mockSql, { unsafe: vi.fn().mockResolvedValue([]) }),
}));

vi.mock('../plugins/websocket.js', () => ({
  publishAlert: mockPublishAlert,
}));

// Import AFTER mocking
import { __testables } from './rules-engine.js';

const {
  evaluateAbnormalVitals,
  evaluateLabCriticalValue,
  evaluateMedicationDuplicateTherapy,
} = __testables;

// ---------------------------------------------------------------------------
// Routing helpers — classify a query by a stable substring of its SQL text.
// ---------------------------------------------------------------------------

const NO_OPEN_ALERT: SqlRow[] = [];
const HAS_OPEN_ALERT: SqlRow[] = [{ id: 'alert-existing' }];
const INSERTED: SqlRow[] = [{ id: 'alert-new' }];

interface RouteConfig {
  vitals?: SqlRow[];
  labs?: SqlRow[];
  meds?: SqlRow[];
  openAlert?: SqlRow[]; // result of the hasOpenAlert SELECT
}

/** Build a router. `clinical_rule` SELECTs always return [] so thresholds use
 *  the shared-constant fallback; INSERT returns a new id; UPDATE (resolve)
 *  returns []. */
function makeRoute(cfg: RouteConfig): SqlHandler {
  const insertCalls: number[] = [];
  const updateCalls: number[] = [];
  let i = 0;
  const handler: SqlHandler = (text) => {
    i += 1;
    if (text.includes('phm_edw.clinical_rule')) return []; // → fallback threshold
    if (text.includes('FROM phm_edw.vital_sign')) return cfg.vitals ?? [];
    if (text.includes('FROM phm_edw.observation')) return cfg.labs ?? [];
    if (text.includes('FROM phm_edw.medication_order')) return cfg.meds ?? [];
    if (text.includes('SELECT id FROM clinical_alerts')) return cfg.openAlert ?? NO_OPEN_ALERT;
    if (text.includes('INSERT INTO clinical_alerts')) { insertCalls.push(i); return INSERTED; }
    if (text.includes('UPDATE clinical_alerts')) { updateCalls.push(i); return []; }
    return [];
  };
  (handler as SqlHandler & { insertCalls: number[]; updateCalls: number[] }).insertCalls = insertCalls;
  (handler as SqlHandler & { insertCalls: number[]; updateCalls: number[] }).updateCalls = updateCalls;
  return handler;
}

function use(cfg: RouteConfig): SqlHandler & { insertCalls: number[]; updateCalls: number[] } {
  const handler = makeRoute(cfg) as SqlHandler & { insertCalls: number[]; updateCalls: number[] };
  routeRef.current = handler;
  return handler;
}

beforeEach(() => {
  vi.clearAllMocks();
  routeRef.current = () => [];
});

// ---------------------------------------------------------------------------
// RULE-009 — Abnormal vitals
// ---------------------------------------------------------------------------

describe('RULE-009 evaluateAbnormalVitals', () => {
  const criticalVitals = {
    vital_id: 1,
    recorded_datetime: '2026-06-25T10:00:00Z',
    bp_systolic: 195, // ≥ 180 critical-high
    bp_diastolic: 85,
    heart_rate: 80,
    spo2_percent: '97',
    respiratory_rate: 16,
    temperature_f: '98.6',
  };
  const normalVitals = {
    vital_id: 2,
    recorded_datetime: '2026-06-26T10:00:00Z',
    bp_systolic: 122,
    bp_diastolic: 78,
    heart_rate: 72,
    spo2_percent: '98',
    respiratory_rate: 14,
    temperature_f: '98.4',
  };

  it('triggers a critical alert when a vital breaches its threshold', async () => {
    const r = use({ vitals: [criticalVitals], openAlert: NO_OPEN_ALERT });
    await evaluateAbnormalVitals('100', '1');

    expect(r.insertCalls.length).toBe(1);
    expect(mockPublishAlert).toHaveBeenCalledTimes(1);
    const [, , event] = mockPublishAlert.mock.calls[0] as [string, string, { ruleKey: string; severity: string }];
    expect(event.ruleKey).toBe('RULE-009');
    expect(event.severity).toBe('critical');
  });

  it('suppresses the duplicate when an open alert already exists', async () => {
    const r = use({ vitals: [criticalVitals], openAlert: HAS_OPEN_ALERT });
    await evaluateAbnormalVitals('100', '1');

    expect(r.insertCalls.length).toBe(0);
    expect(mockPublishAlert).not.toHaveBeenCalled();
  });

  it('auto-resolves the open alert when the latest reading is back in range', async () => {
    const r = use({ vitals: [normalVitals] });
    await evaluateAbnormalVitals('100', '1');

    expect(r.insertCalls.length).toBe(0);
    expect(r.updateCalls.length).toBe(1); // UPDATE clinical_alerts ... auto_resolved
    expect(mockPublishAlert).not.toHaveBeenCalled();
  });

  it('auto-resolves when there is no recent reading at all', async () => {
    const r = use({ vitals: [] });
    await evaluateAbnormalVitals('100', '1');
    expect(r.updateCalls.length).toBe(1);
    expect(r.insertCalls.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// RULE-010 — High-risk lab result
// ---------------------------------------------------------------------------

describe('RULE-010 evaluateLabCriticalValue', () => {
  const criticalPotassium = {
    observation_id: 50,
    observation_code: '2823-3', // Potassium
    observation_datetime: '2026-06-20T08:00:00Z',
    value_numeric: '6.4', // ≥ 6.0 critical-high
    units: 'mmol/L',
  };
  const normalPotassium = {
    observation_id: 51,
    observation_code: '2823-3',
    observation_datetime: '2026-06-25T08:00:00Z',
    value_numeric: '4.1',
    units: 'mmol/L',
  };

  it('triggers a critical lab alert when a value breaches the threshold', async () => {
    const r = use({ labs: [criticalPotassium], openAlert: NO_OPEN_ALERT });
    await evaluateLabCriticalValue('200', '1');

    expect(r.insertCalls.length).toBe(1);
    expect(mockPublishAlert).toHaveBeenCalledTimes(1);
    const [, , event] = mockPublishAlert.mock.calls[0] as [string, string, { ruleKey: string }];
    expect(event.ruleKey).toBe('RULE-010');
  });

  it('suppresses the duplicate when an open alert already exists', async () => {
    const r = use({ labs: [criticalPotassium], openAlert: HAS_OPEN_ALERT });
    await evaluateLabCriticalValue('200', '1');

    expect(r.insertCalls.length).toBe(0);
    expect(mockPublishAlert).not.toHaveBeenCalled();
  });

  it('auto-resolves when the latest value is back in range', async () => {
    const r = use({ labs: [normalPotassium] });
    await evaluateLabCriticalValue('200', '1');

    expect(r.insertCalls.length).toBe(0);
    expect(r.updateCalls.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// RULE-011 — Medication safety: duplicate active therapy
// ---------------------------------------------------------------------------

describe('RULE-011 evaluateMedicationDuplicateTherapy', () => {
  const duplicate = { medication_id: 9, medication_name: 'Warfarin 5mg tablet', order_count: 2 };

  it('triggers an alert when duplicate active therapy is detected', async () => {
    const r = use({ meds: [duplicate], openAlert: NO_OPEN_ALERT });
    await evaluateMedicationDuplicateTherapy('300', '1');

    expect(r.insertCalls.length).toBe(1);
    expect(mockPublishAlert).toHaveBeenCalledTimes(1);
    const [, , event] = mockPublishAlert.mock.calls[0] as [string, string, { ruleKey: string; severity: string }];
    expect(event.ruleKey).toBe('RULE-011');
    expect(event.severity).toBe('warning');
  });

  it('suppresses the duplicate when an open alert already exists', async () => {
    const r = use({ meds: [duplicate], openAlert: HAS_OPEN_ALERT });
    await evaluateMedicationDuplicateTherapy('300', '1');

    expect(r.insertCalls.length).toBe(0);
    expect(mockPublishAlert).not.toHaveBeenCalled();
  });

  it('auto-resolves when no duplicate active therapy remains', async () => {
    const r = use({ meds: [] });
    await evaluateMedicationDuplicateTherapy('300', '1');

    expect(r.insertCalls.length).toBe(0);
    expect(r.updateCalls.length).toBe(1);
  });
});
