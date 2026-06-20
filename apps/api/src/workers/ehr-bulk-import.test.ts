import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  queueAdds,
  mockKickoffBulkExportWithBackendServices,
  mockPollBulkExportJobWithBackendServices,
  mockImportCompletedBulkExportJob,
  mockListDueBulkSchedules,
  mockMarkBulkScheduleEnqueued,
  mockMarkBulkScheduleBulkJob,
  mockMarkBulkScheduleFailure,
  mockMarkBulkScheduleSuccess,
  mockWriteSystemAuditLog,
  MockQueue,
  MockWorker,
  getProcessor,
} = vi.hoisted(() => {
  const queueAdds: Array<{ name: string; data: unknown; options: unknown }> = [];
  let processor: ((job: { data: unknown }) => Promise<unknown>) | null = null;
  const mockKickoffBulkExportWithBackendServices = vi.fn();
  const mockPollBulkExportJobWithBackendServices = vi.fn();
  const mockImportCompletedBulkExportJob = vi.fn();
  const mockListDueBulkSchedules = vi.fn();
  const mockMarkBulkScheduleEnqueued = vi.fn();
  const mockMarkBulkScheduleBulkJob = vi.fn();
  const mockMarkBulkScheduleFailure = vi.fn();
  const mockMarkBulkScheduleSuccess = vi.fn();
  const mockWriteSystemAuditLog = vi.fn();

  class MockQueue {
    add(name: string, data: unknown, options: unknown) {
      queueAdds.push({ name, data, options });
      const id = typeof options === 'object' && options && 'jobId' in options
        ? String((options as { jobId?: unknown }).jobId)
        : `${name}:1`;
      return Promise.resolve({ id });
    }
  }

  class MockWorker {
    constructor(_name: string, nextProcessor: (job: { data: unknown }) => Promise<unknown>) {
      processor = nextProcessor;
    }

    on() {
      return this;
    }

    close() {
      return Promise.resolve();
    }
  }

  return {
    queueAdds,
    mockKickoffBulkExportWithBackendServices,
    mockPollBulkExportJobWithBackendServices,
    mockImportCompletedBulkExportJob,
    mockListDueBulkSchedules,
    mockMarkBulkScheduleEnqueued,
    mockMarkBulkScheduleBulkJob,
    mockMarkBulkScheduleFailure,
    mockMarkBulkScheduleSuccess,
    mockWriteSystemAuditLog,
    MockQueue,
    MockWorker,
    getProcessor: () => processor,
  };
});

vi.mock('bullmq', () => ({
  Queue: MockQueue,
  Worker: MockWorker,
}));

vi.mock('../services/ehr/bulkData.js', () => ({
  kickoffBulkExportWithBackendServices: mockKickoffBulkExportWithBackendServices,
  pollBulkExportJobWithBackendServices: mockPollBulkExportJobWithBackendServices,
  importCompletedBulkExportJob: mockImportCompletedBulkExportJob,
}));

vi.mock('../services/ehr/bulkSchedules.js', () => ({
  listDueBulkSchedules: mockListDueBulkSchedules,
  markBulkScheduleEnqueued: mockMarkBulkScheduleEnqueued,
  markBulkScheduleBulkJob: mockMarkBulkScheduleBulkJob,
  markBulkScheduleFailure: mockMarkBulkScheduleFailure,
  markBulkScheduleSuccess: mockMarkBulkScheduleSuccess,
}));

vi.mock('../services/ehr/vendorAdapters/index.js', () => ({
  getVendorAdapter: () => ({
    bulkCapabilities: {
      pollingMinSeconds: 1,
      pollingMaxSeconds: 5,
    },
  }),
}));

vi.mock('../services/auditLog.js', () => ({
  writeSystemAuditLog: mockWriteSystemAuditLog,
}));

import {
  enqueueDueEhrBulkExports,
  enqueueEhrBulkImport,
  enqueueEhrBulkExport,
  startEhrBulkImportWorker,
} from './ehr-bulk-import.js';

const bulkSchedule = {
  id: '00000000-0000-4000-8000-000000000091',
  orgId: 7,
  ehrTenantId: 42,
  enabled: true,
  exportLevel: 'group',
  groupId: 'group-1',
  patientId: null,
  resourceTypes: ['Patient', 'Observation'],
  sinceMode: 'last_success',
  since: '2026-06-01T00:00:00.000Z',
  typeFilters: ['Observation?date=ge2026-01-01'],
  intervalMinutes: 1440,
  maxResourcesPerFile: 500,
  lastEnqueuedAt: null,
  lastQueueJobId: null,
  lastBulkJobId: null,
  lastSuccessAt: '2026-06-17T12:10:00.000Z',
  lastFailureAt: null,
  lastError: null,
  nextRunAt: '2026-06-18T12:00:00.000Z',
  metadata: {},
  createdAt: '2026-06-17T11:00:00.000Z',
  updatedAt: '2026-06-17T12:10:00.000Z',
} as const;

const completedBulkJob = {
  id: '00000000-0000-4000-8000-000000000067',
  status: 'completed',
  manifest: {
    transactionTime: '2026-06-17T12:00:00Z',
    request: 'https://ehr.example.test/__bulk_output__/request',
    requiresAccessToken: true,
    output: [{ type: 'Patient', url: 'https://ehr.example.test/__bulk_output__/file', count: 1 }],
  },
} as const;

beforeEach(() => {
  queueAdds.length = 0;
  mockKickoffBulkExportWithBackendServices.mockReset();
  mockPollBulkExportJobWithBackendServices.mockReset();
  mockImportCompletedBulkExportJob.mockReset();
  mockListDueBulkSchedules.mockReset();
  mockMarkBulkScheduleEnqueued.mockReset();
  mockMarkBulkScheduleBulkJob.mockReset();
  mockMarkBulkScheduleFailure.mockReset();
  mockMarkBulkScheduleSuccess.mockReset();
  mockWriteSystemAuditLog.mockReset();
  process.env['EHR_BULK_IMPORT_QUEUE_ENABLED'] = 'true';
});

afterEach(() => {
  delete process.env['EHR_BULK_IMPORT_QUEUE_ENABLED'];
});

describe('EHR Bulk import worker orchestration', () => {
  it('enqueues due tenant Bulk Data schedules with last-success _since', async () => {
    mockListDueBulkSchedules.mockResolvedValueOnce([bulkSchedule]);

    const now = new Date('2026-06-18T12:00:00Z');
    const result = await enqueueDueEhrBulkExports(now);

    expect(result).toEqual({
      examined: 1,
      enqueued: 1,
      skipped: 0,
      failed: 0,
      queueName: 'medgnosis-ehr-bulk-import',
    });
    expect(mockListDueBulkSchedules).toHaveBeenCalledWith({ now });
    expect(queueAdds[0]).toMatchObject({
      name: 'ehr-bulk-kickoff',
      data: {
        action: 'kickoff',
        scheduleId: '00000000-0000-4000-8000-000000000091',
        ehrTenantId: 42,
        orgId: 7,
        exportLevel: 'group',
        groupId: 'group-1',
        resourceTypes: ['Patient', 'Observation'],
        since: '2026-06-17T12:10:00.000Z',
        typeFilters: ['Observation?date=ge2026-01-01'],
        triggeredBy: 'scheduled',
        maxResourcesPerFile: 500,
      },
    });
    expect(mockMarkBulkScheduleEnqueued).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000091',
      expect.stringMatching(/^ehr-bulk-kickoff:42:/),
    );
  });

  it('gives equivalent schedules distinct kickoff job ids', async () => {
    mockListDueBulkSchedules.mockResolvedValueOnce([
      bulkSchedule,
      { ...bulkSchedule, id: '00000000-0000-4000-8000-000000000092' },
    ]);

    const result = await enqueueDueEhrBulkExports(new Date('2026-06-18T12:00:00Z'));

    expect(result.enqueued).toBe(2);
    const jobIds = queueAdds.map((add) => (add.options as { jobId?: string }).jobId);
    expect(jobIds).toHaveLength(2);
    expect(new Set(jobIds).size).toBe(2);
  });

  it('enqueues kickoff jobs without token payloads', async () => {
    const result = await enqueueEhrBulkExport({
      ehrTenantId: 42,
      orgId: 7,
      vendor: 'epic',
      exportLevel: 'group',
      groupId: 'group-1',
      resourceTypes: ['Patient', 'Observation'],
      triggeredBy: 'manual',
    });

    expect(result.enqueued).toBe(true);
    expect(queueAdds[0]).toMatchObject({
      name: 'ehr-bulk-kickoff',
      data: {
        action: 'kickoff',
        ehrTenantId: 42,
        resourceTypes: ['Patient', 'Observation'],
      },
    });
    expect(JSON.stringify(queueAdds[0])).not.toContain('accessToken');
  });

  it('enqueues manual import replays without a stable job id', async () => {
    const result = await enqueueEhrBulkImport({
      ehrTenantId: 42,
      orgId: 7,
      vendor: 'epic',
      bulkJobId: '00000000-0000-4000-8000-000000000067',
      triggeredBy: 'manual',
      resumeFailedOnly: true,
    });

    expect(result.enqueued).toBe(true);
    expect(queueAdds[0]).toMatchObject({
      name: 'ehr-bulk-import',
      data: {
        action: 'import',
        bulkJobId: '00000000-0000-4000-8000-000000000067',
        resumeFailedOnly: true,
      },
    });
    expect(queueAdds[0]?.options).not.toHaveProperty('jobId');
    expect(JSON.stringify(queueAdds[0])).not.toContain('accessToken');
  });

  it('chains kickoff completion into a delayed poll job', async () => {
    startEhrBulkImportWorker();
    mockKickoffBulkExportWithBackendServices.mockResolvedValueOnce({
      tenant: { id: 42, orgId: 7, vendor: 'epic', fhirBaseUrl: 'https://ehr.example.test/fhir' },
      job: {
        id: '00000000-0000-4000-8000-000000000067',
        status: 'accepted',
        retryAfterSeconds: 2,
      },
      tokenMetadataId: null,
    });

    await getProcessor()?.({
      data: {
        action: 'kickoff',
        scheduleId: '00000000-0000-4000-8000-000000000091',
        ehrTenantId: 42,
        orgId: 7,
        vendor: 'epic',
        exportLevel: 'group',
        groupId: 'group-1',
        resourceTypes: ['Patient'],
        triggeredBy: 'manual',
      },
    });

    expect(mockKickoffBulkExportWithBackendServices).toHaveBeenCalledWith(expect.objectContaining({
      ehrTenantId: 42,
      exportLevel: 'group',
      groupId: 'group-1',
      resourceTypes: ['Patient'],
      metadata: expect.objectContaining({
        triggeredBy: 'manual',
        queueName: 'medgnosis-ehr-bulk-import',
        scheduleId: '00000000-0000-4000-8000-000000000091',
      }),
    }));
    expect(mockMarkBulkScheduleBulkJob).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000091',
      '00000000-0000-4000-8000-000000000067',
    );
    expect(queueAdds).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'ehr-bulk-poll',
        data: expect.objectContaining({
          action: 'poll',
          scheduleId: '00000000-0000-4000-8000-000000000091',
          bulkJobId: '00000000-0000-4000-8000-000000000067',
        }),
        options: expect.objectContaining({ delay: 2000 }),
      }),
    ]));
    expect(mockWriteSystemAuditLog).toHaveBeenCalledWith(
      'ehr_bulk_worker_kickoff',
      'ehr_bulk_job',
      '00000000-0000-4000-8000-000000000067',
      expect.objectContaining({
        tenantId: 42,
        orgId: 7,
        vendor: 'epic',
        scheduleId: '00000000-0000-4000-8000-000000000091',
        queueName: 'medgnosis-ehr-bulk-import',
        jobAction: 'kickoff',
        status: 'accepted',
        resourceTypeCount: 1,
        exportLevel: 'group',
        triggeredBy: 'manual',
        nextAction: 'poll_enqueued',
        nextPollDelayMs: 2000,
      }),
    );
    const auditDetails = JSON.stringify(mockWriteSystemAuditLog.mock.calls[0]?.[3]);
    expect(auditDetails).not.toContain('group-1');
    expect(auditDetails).not.toContain('Observation?date=ge2026-01-01');
    expect(auditDetails).not.toContain('accessToken');
  });

  it('chains completed polling into an import job', async () => {
    startEhrBulkImportWorker();
    mockPollBulkExportJobWithBackendServices.mockResolvedValueOnce({
      tenant: { id: 42, orgId: 7, vendor: 'epic', fhirBaseUrl: 'https://ehr.example.test/fhir' },
      job: {
        id: '00000000-0000-4000-8000-000000000067',
        status: 'completed',
        retryAfterSeconds: null,
      },
      tokenMetadataId: null,
    });

    await getProcessor()?.({
      data: {
        action: 'poll',
        scheduleId: '00000000-0000-4000-8000-000000000091',
        ehrTenantId: 42,
        orgId: 7,
        vendor: 'epic',
        bulkJobId: '00000000-0000-4000-8000-000000000067',
        maxResourcesPerFile: 500,
      },
    });

    expect(queueAdds).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'ehr-bulk-import',
        data: expect.objectContaining({
          action: 'import',
          scheduleId: '00000000-0000-4000-8000-000000000091',
          triggeredBy: 'poll_completion',
          bulkJobId: '00000000-0000-4000-8000-000000000067',
          maxResourcesPerFile: 500,
          resumeFailedOnly: true,
        }),
      }),
    ]));
    expect(mockWriteSystemAuditLog).toHaveBeenCalledWith(
      'ehr_bulk_worker_poll',
      'ehr_bulk_job',
      '00000000-0000-4000-8000-000000000067',
      expect.objectContaining({
        tenantId: 42,
        orgId: 7,
        vendor: 'epic',
        scheduleId: '00000000-0000-4000-8000-000000000091',
        jobAction: 'poll',
        status: 'completed',
        nextAction: 'import_enqueued',
      }),
    );
  });

  it('marks scheduled poll terminal failures on the schedule', async () => {
    startEhrBulkImportWorker();
    mockPollBulkExportJobWithBackendServices.mockResolvedValueOnce({
      tenant: { id: 42, orgId: 7, vendor: 'epic', fhirBaseUrl: 'https://ehr.example.test/fhir' },
      job: {
        id: '00000000-0000-4000-8000-000000000067',
        status: 'failed',
        retryAfterSeconds: null,
      },
      tokenMetadataId: null,
    });

    await getProcessor()?.({
      data: {
        action: 'poll',
        scheduleId: '00000000-0000-4000-8000-000000000091',
        ehrTenantId: 42,
        orgId: 7,
        vendor: 'epic',
        bulkJobId: '00000000-0000-4000-8000-000000000067',
      },
    });

    expect(mockMarkBulkScheduleFailure).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000091',
      'Bulk export ended with status=failed',
    );
    expect(mockWriteSystemAuditLog).toHaveBeenCalledWith(
      'ehr_bulk_worker_poll',
      'ehr_bulk_job',
      '00000000-0000-4000-8000-000000000067',
      expect.objectContaining({
        tenantId: 42,
        scheduleId: '00000000-0000-4000-8000-000000000091',
        jobAction: 'poll',
        status: 'failed',
        nextAction: 'terminal_failure',
      }),
    );
  });

  it('marks scheduled imports successful after all files import cleanly', async () => {
    startEhrBulkImportWorker();
    mockImportCompletedBulkExportJob.mockResolvedValueOnce({
      job: completedBulkJob,
      ingestRun: {
        id: '00000000-0000-4000-8000-000000000085',
        status: 'succeeded',
      },
      resourcesStaged: 3,
      resourcesFailed: 0,
    });

    await getProcessor()?.({
      data: {
        action: 'import',
        scheduleId: '00000000-0000-4000-8000-000000000091',
        ehrTenantId: 42,
        orgId: 7,
        vendor: 'epic',
        bulkJobId: '00000000-0000-4000-8000-000000000067',
        triggeredBy: 'poll_completion',
      },
    });

    expect(mockImportCompletedBulkExportJob).toHaveBeenCalledWith({
      ehrTenantId: 42,
      bulkJobId: '00000000-0000-4000-8000-000000000067',
      maxResourcesPerFile: undefined,
      resumeFailedOnly: true,
    });
    expect(mockMarkBulkScheduleSuccess).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000091',
      '00000000-0000-4000-8000-000000000067',
      '2026-06-17T12:00:00.000Z',
    );
    expect(mockWriteSystemAuditLog).toHaveBeenCalledWith(
      'ehr_bulk_worker_import',
      'ehr_bulk_job',
      '00000000-0000-4000-8000-000000000067',
      expect.objectContaining({
        tenantId: 42,
        orgId: 7,
        vendor: 'epic',
        scheduleId: '00000000-0000-4000-8000-000000000091',
        jobAction: 'import',
        ingestRunId: '00000000-0000-4000-8000-000000000085',
        ingestStatus: 'succeeded',
        resourcesStaged: 3,
        resourcesFailed: 0,
        triggeredBy: 'poll_completion',
        resumeFailedOnly: true,
        scheduleMarkedSuccess: true,
      }),
    );
    expect(JSON.stringify(mockWriteSystemAuditLog.mock.calls[0]?.[3])).not.toContain('__bulk_output__');
  });

  it('treats incomplete imports as failed queue jobs so BullMQ retries and retains them', async () => {
    startEhrBulkImportWorker();
    mockImportCompletedBulkExportJob.mockResolvedValueOnce({
      ingestRun: {
        id: '00000000-0000-4000-8000-000000000085',
        status: 'failed',
      },
      resourcesStaged: 0,
      resourcesFailed: 1,
    });

    await expect(getProcessor()?.({
      data: {
        action: 'import',
        scheduleId: '00000000-0000-4000-8000-000000000091',
        ehrTenantId: 42,
        orgId: 7,
        vendor: 'epic',
        bulkJobId: '00000000-0000-4000-8000-000000000067',
        triggeredBy: 'poll_completion',
      },
    })).rejects.toThrow('Bulk Data import incomplete');

    expect(mockImportCompletedBulkExportJob).toHaveBeenCalledWith({
      ehrTenantId: 42,
      bulkJobId: '00000000-0000-4000-8000-000000000067',
      maxResourcesPerFile: undefined,
      resumeFailedOnly: true,
    });
    expect(mockMarkBulkScheduleFailure).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000091',
      'Bulk import incomplete: status=failed resourcesFailed=1',
    );
    expect(mockWriteSystemAuditLog).toHaveBeenCalledWith(
      'ehr_bulk_worker_import_incomplete',
      'ehr_bulk_job',
      '00000000-0000-4000-8000-000000000067',
      expect.objectContaining({
        tenantId: 42,
        scheduleId: '00000000-0000-4000-8000-000000000091',
        jobAction: 'import',
        ingestRunId: '00000000-0000-4000-8000-000000000085',
        ingestStatus: 'failed',
        resourcesStaged: 0,
        resourcesFailed: 1,
        triggeredBy: 'poll_completion',
        resumeFailedOnly: true,
      }),
    );
    expect(mockMarkBulkScheduleSuccess).not.toHaveBeenCalled();
  });
});
