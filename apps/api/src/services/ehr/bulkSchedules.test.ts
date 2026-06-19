import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSql } = vi.hoisted(() => {
  const fn = vi.fn();
  (fn as unknown as { json: (value: unknown) => unknown }).json = (value: unknown) => value;
  (fn as unknown as { unsafe: (value: string) => string }).unsafe = (value: string) => value;
  return { mockSql: fn };
});

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import {
  BulkScheduleOwnershipError,
  listDueBulkSchedules,
  markBulkScheduleFailure,
  markBulkScheduleSuccess,
  MAX_BULK_SCHEDULE_INTERVAL_MINUTES,
  upsertBulkSchedule,
} from './bulkSchedules.js';

const scheduleId = '00000000-0000-4000-8000-000000000091';

const scheduleRow = {
  id: scheduleId,
  org_id: 7,
  ehr_tenant_id: 42,
  enabled: true,
  export_level: 'group',
  group_id: 'group-1',
  patient_id: null,
  resource_types: ['Patient', 'Observation'],
  since_mode: 'last_success',
  since: null,
  type_filters: ['Observation?date=ge2026-01-01'],
  interval_minutes: 1440,
  max_resources_per_file: 500,
  last_enqueued_at: '2026-06-17 12:00:00+00',
  last_queue_job_id: 'ehr-bulk-kickoff:42:abc',
  last_bulk_job_id: '00000000-0000-4000-8000-000000000067',
  last_success_at: '2026-06-17 12:10:00+00',
  last_failure_at: null,
  last_error: null,
  next_run_at: '2026-06-18 12:00:00+00',
  metadata: {},
  created_at: '2026-06-17 11:00:00+00',
  updated_at: '2026-06-17 12:10:00+00',
} as const;

beforeEach(() => {
  mockSql.mockReset();
});

describe('listDueBulkSchedules', () => {
  it('loads due tenant schedules and maps DB rows to API shape', async () => {
    mockSql.mockResolvedValueOnce([scheduleRow]);

    const now = new Date('2026-06-18T12:00:00Z');
    const schedules = await listDueBulkSchedules({ now, limit: 10 });

    expect(schedules).toEqual([
      expect.objectContaining({
        id: scheduleId,
        orgId: 7,
        ehrTenantId: 42,
        enabled: true,
        exportLevel: 'group',
        resourceTypes: ['Patient', 'Observation'],
        sinceMode: 'last_success',
        intervalMinutes: 1440,
        lastSuccessAt: '2026-06-17 12:10:00+00',
        nextRunAt: '2026-06-18 12:00:00+00',
      }),
    ]);
    expect(mockSql.mock.calls[0]!.slice(1)).toEqual(
      expect.arrayContaining(['2026-06-18T12:00:00.000Z', 10]),
    );
  });
});

describe('upsertBulkSchedule', () => {
  it('normalizes resource types, filters, timestamps, and metadata before saving', async () => {
    mockSql.mockResolvedValueOnce([scheduleRow]);

    const schedule = await upsertBulkSchedule({
      orgId: 7,
      ehrTenantId: 42,
      exportLevel: 'group',
      groupId: 'group-1',
      resourceTypes: [' Patient ', 'Observation', 'Patient'],
      sinceMode: 'fixed',
      since: '2026-06-01T00:00:00Z',
      typeFilters: ['Observation?date=ge2026-01-01', 'Observation?date=ge2026-01-01'],
      intervalMinutes: 1440,
      maxResourcesPerFile: 500,
      nextRunAt: '2026-06-18T12:00:00Z',
      metadata: { source: 'unit-test' },
    });

    expect(schedule.id).toBe(scheduleId);
    const values = mockSql.mock.calls[0]!.slice(1);
    expect(values).toEqual(expect.arrayContaining([
      7,
      42,
      true,
      'group',
      'group-1',
      ['Patient', 'Observation'],
      'fixed',
      '2026-06-01T00:00:00.000Z',
      ['Observation?date=ge2026-01-01'],
      1440,
      500,
      '2026-06-18T12:00:00.000Z',
      { source: 'unit-test' },
    ]));
  });

  it('rejects empty resource type sets before writing', async () => {
    await expect(
      upsertBulkSchedule({
        ehrTenantId: 42,
        exportLevel: 'system',
        resourceTypes: ['   '],
        intervalMinutes: 1440,
      }),
    ).rejects.toThrow('Bulk schedule requires at least one resource type');

    expect(mockSql).not.toHaveBeenCalled();
  });

  it('rejects fixed schedules without a since timestamp before writing', async () => {
    await expect(
      upsertBulkSchedule({
        ehrTenantId: 42,
        exportLevel: 'system',
        resourceTypes: ['Patient'],
        sinceMode: 'fixed',
        intervalMinutes: 1440,
      }),
    ).rejects.toThrow('Bulk schedule fixed sinceMode requires since');

    expect(mockSql).not.toHaveBeenCalled();
  });

  it('rejects intervals above the DB constraint before writing', async () => {
    await expect(
      upsertBulkSchedule({
        ehrTenantId: 42,
        exportLevel: 'system',
        resourceTypes: ['Patient'],
        intervalMinutes: MAX_BULK_SCHEDULE_INTERVAL_MINUTES + 1,
      }),
    ).rejects.toThrow('Bulk schedule intervalMinutes must be between');

    expect(mockSql).not.toHaveBeenCalled();
  });

  it('does not reassign an existing schedule id from another tenant', async () => {
    mockSql.mockResolvedValueOnce([]);

    await expect(
      upsertBulkSchedule({
        id: scheduleId,
        ehrTenantId: 42,
        exportLevel: 'system',
        resourceTypes: ['Patient'],
        intervalMinutes: 1440,
      }),
    ).rejects.toBeInstanceOf(BulkScheduleOwnershipError);

    const query = (mockSql.mock.calls[0]?.[0] as TemplateStringsArray).join('');
    expect(query).toContain('WHERE phm_edw.ehr_bulk_schedule.ehr_tenant_id = EXCLUDED.ehr_tenant_id');
    expect(query).not.toContain('ehr_tenant_id = EXCLUDED.ehr_tenant_id,');
  });
});

describe('markBulkScheduleFailure', () => {
  it('persists a structured failure object without raw payload data', async () => {
    mockSql.mockResolvedValueOnce([
      {
        ...scheduleRow,
        last_failure_at: '2026-06-18 12:05:00+00',
        last_error: { message: 'queue_not_enqueued' },
      },
    ]);

    const schedule = await markBulkScheduleFailure(scheduleId, 'queue_not_enqueued');

    expect(schedule?.lastError).toEqual({ message: 'queue_not_enqueued' });
    expect(mockSql.mock.calls[0]!.slice(1)).toEqual(
      expect.arrayContaining([{ message: 'queue_not_enqueued' }, scheduleId]),
    );
  });
});

describe('markBulkScheduleSuccess', () => {
  it('uses the source transaction watermark when provided', async () => {
    mockSql.mockResolvedValueOnce([
      {
        ...scheduleRow,
        last_success_at: '2026-06-17 12:00:00+00',
      },
    ]);

    const schedule = await markBulkScheduleSuccess(
      scheduleId,
      '00000000-0000-4000-8000-000000000067',
      '2026-06-17T12:00:00Z',
    );

    expect(schedule?.lastSuccessAt).toBe('2026-06-17 12:00:00+00');
    expect(mockSql.mock.calls[0]!.slice(1)).toEqual(
      expect.arrayContaining([
        '00000000-0000-4000-8000-000000000067',
        '2026-06-17T12:00:00.000Z',
        scheduleId,
      ]),
    );
  });
});
