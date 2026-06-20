import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSql } = vi.hoisted(() => ({
  mockSql: vi.fn(),
}));

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import { writeAuditLog, writeSystemAuditLog } from './auditLog.js';

beforeEach(() => {
  mockSql.mockReset();
  mockSql.mockResolvedValue([]);
});

describe('auditLog service', () => {
  it('writes request-scoped audit rows with serialized details', async () => {
    await writeAuditLog({
      userId: '00000000-0000-4000-8000-000000000001',
      action: 'ehr_tenant_upsert',
      resourceType: 'ehr_tenant',
      resourceId: '42',
      details: { tenantId: 42, clientCount: 1 },
      ipAddress: '127.0.0.1',
      userAgent: 'vitest',
    });

    expect(mockSql).toHaveBeenCalledTimes(1);
    const values = mockSql.mock.calls[0]?.slice(1);
    expect(values).toEqual([
      '00000000-0000-4000-8000-000000000001',
      'ehr_tenant_upsert',
      'ehr_tenant',
      '42',
      JSON.stringify({ tenantId: 42, clientCount: 1 }),
      '127.0.0.1',
      'vitest',
    ]);
  });

  it('writes worker audit rows without a user or request metadata', async () => {
    await writeSystemAuditLog('ehr_bulk_worker_poll', 'ehr_bulk_job', 'bulk-job-id', {
      tenantId: 42,
      status: 'completed',
    });

    expect(mockSql).toHaveBeenCalledTimes(1);
    const values = mockSql.mock.calls[0]?.slice(1);
    expect(values).toEqual([
      null,
      'ehr_bulk_worker_poll',
      'ehr_bulk_job',
      'bulk-job-id',
      JSON.stringify({ tenantId: 42, status: 'completed' }),
      null,
      'medgnosis-worker',
    ]);
  });
});
