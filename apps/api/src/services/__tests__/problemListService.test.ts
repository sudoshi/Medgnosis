// =============================================================================
// Unit tests — Problem List bulk-load utility
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

type SqlRow = Record<string, unknown>;

const { mockSql, mockBegin } = vi.hoisted(() => {
  const fn = vi.fn<(strings: TemplateStringsArray, ...values: unknown[]) => Promise<SqlRow[]>>();
  fn.mockResolvedValue([]);
  // sql.begin(cb) runs the callback with a tx that behaves like sql
  const begin = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(fn));
  return { mockSql: fn, mockBegin: begin };
});

vi.mock('@medgnosis/db', () => ({
  sql: Object.assign(mockSql, {
    unsafe: vi.fn().mockResolvedValue([]),
    begin: mockBegin,
    json: (v: unknown) => v,
  }),
}));

import { applyBulk, type BulkAction } from '../problemListService.js';

// Capture the concatenated SQL text of every call for assertions.
function sqlTexts(): string[] {
  return mockSql.mock.calls.map((c) => (c[0] as TemplateStringsArray).join('|'));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSql.mockResolvedValue([]);
});

describe('applyBulk — dry run', () => {
  it('writes nothing and returns a planned entry per action', async () => {
    // dup-check returns no existing diagnosis → add is planned (not skipped)
    mockSql.mockResolvedValue([]);

    const actions: BulkAction[] = [
      { type: 'add', patient_id: 1, icd10_code: 'N18.4', problem_name: 'CKD stage 4' },
    ];
    const plan = await applyBulk(actions, { dryRun: true, actor: 'tester', source: 'bulk_load' });

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ action: 'add', icd10_code: 'N18.4', status: 'planned' });
    // no INSERT/UPDATE issued in dry-run
    const wrote = sqlTexts().some((t) => /INSERT INTO phm_edw\.problem_list|UPDATE phm_edw\.problem_list/i.test(t));
    expect(wrote).toBe(false);
  });
});

describe('applyBulk — add', () => {
  it('inserts the problem and an audit row when not dry-run', async () => {
    mockSql.mockImplementation(((strings: TemplateStringsArray) => {
      const q = strings.join(' ');
      if (/SELECT.*problem_list.*WHERE/is.test(q)) return Promise.resolve([]); // no existing dup
      if (/INSERT INTO phm_edw\.problem_list\b/is.test(q)) return Promise.resolve([{ problem_id: 99 }]);
      return Promise.resolve([]);
    }) as typeof mockSql);

    const plan = await applyBulk(
      [{ type: 'add', patient_id: 1, icd10_code: 'N18.4', problem_name: 'CKD stage 4' }],
      { dryRun: false, actor: 'tester', source: 'finder_accept' },
    );

    expect(plan[0]).toMatchObject({ action: 'add', status: 'applied', problem_id: 99 });
    const texts = sqlTexts();
    expect(texts.some((t) => /INSERT INTO phm_edw\.problem_list\b/is.test(t))).toBe(true);
    expect(texts.some((t) => /INSERT INTO phm_edw\.problem_list_audit\b/i.test(t))).toBe(true);
  });

  it('skips an add when an active identical icd10 already exists', async () => {
    mockSql.mockImplementation(((strings: TemplateStringsArray) => {
      const q = strings.join(' ');
      if (/SELECT.*problem_list.*WHERE/is.test(q)) return Promise.resolve([{ problem_id: 7 }]); // dup exists
      return Promise.resolve([]);
    }) as typeof mockSql);

    const plan = await applyBulk(
      [{ type: 'add', patient_id: 1, icd10_code: 'N18.4', problem_name: 'CKD stage 4' }],
      { dryRun: false, actor: 'tester', source: 'finder_accept' },
    );

    expect(plan[0].status).toBe('skipped');
    expect(sqlTexts().some((t) => /INSERT INTO phm_edw\.problem_list\b/is.test(t))).toBe(false);
  });
});

describe('applyBulk — resolve', () => {
  it('updates problem_status and resolved_date', async () => {
    mockSql.mockImplementation(((strings: TemplateStringsArray) => {
      const q = strings.join(' ');
      if (/UPDATE phm_edw\.problem_list\b/is.test(q)) return Promise.resolve([{ problem_id: 10 }]);
      return Promise.resolve([{ problem_id: 10, problem_status: 'Active', icd10_code: 'N18.9' }]);
    }) as typeof mockSql);

    const plan = await applyBulk(
      [{ type: 'resolve', patient_id: 1, problem_id: 10 }],
      { dryRun: false, actor: 'tester', source: 'manual' },
    );

    expect(plan[0]).toMatchObject({ action: 'resolve', status: 'applied' });
    const upd = sqlTexts().find((t) => /UPDATE phm_edw\.problem_list\b/is.test(t)) ?? '';
    expect(upd).toMatch(/problem_status/i);
    expect(upd).toMatch(/resolved_date/i);
  });
});

describe('applyBulk — restage', () => {
  it('produces two plan entries (resolve old + add new) in one transaction', async () => {
    mockSql.mockImplementation(((strings: TemplateStringsArray) => {
      const q = strings.join(' ');
      if (/SELECT.*problem_list.*WHERE/is.test(q)) return Promise.resolve([{ problem_id: 10, problem_status: 'Active', icd10_code: 'N18.9' }]);
      if (/INSERT INTO phm_edw\.problem_list\b/is.test(q)) return Promise.resolve([{ problem_id: 100 }]);
      return Promise.resolve([]);
    }) as typeof mockSql);

    const plan = await applyBulk(
      [{ type: 'restage', patient_id: 1, old_problem_id: 10, icd10_code: 'N18.32', problem_name: 'CKD stage 3b' }],
      { dryRun: false, actor: 'tester', source: 'finder_accept' },
    );

    const actions = plan.map((p) => p.action);
    expect(actions).toContain('resolve');
    expect(actions).toContain('add');
    expect(mockBegin).toHaveBeenCalled(); // restage is atomic
  });
});
