import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSql } = vi.hoisted(() => {
  const fn = vi.fn();
  return { mockSql: fn };
});

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import { getTenantSyncStatus } from './syncStatus.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-19T12:00:00Z'));
  mockSql.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getTenantSyncStatus', () => {
  it('rolls up resource freshness, crosswalk gaps, Bulk Data imports, and issues', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join('');
      expect(values).toContain(42);
      if (text.includes('crosswalk_by_resource')) {
        return Promise.resolve([
          {
            resource_type: 'Patient',
            total_resources: '3',
            local_target_resources: '3',
            unmapped_local_resources: '0',
            patient_linked_resources: '3',
            missing_patient_resources: '0',
            stale_resources: '0',
            last_seen_at: '2026-06-19 10:00:00+00',
            collision_resources: '0',
            collision_targets: '0',
          },
          {
            resource_type: 'Observation',
            total_resources: '8',
            local_target_resources: '6',
            unmapped_local_resources: '2',
            patient_linked_resources: '7',
            missing_patient_resources: '1',
            stale_resources: '1',
            last_seen_at: '2026-06-18 09:00:00+00',
            collision_resources: '2',
            collision_targets: '1',
          },
        ]);
      }
      if (text.includes('latest_ingest_by_resource')) {
        return Promise.resolve([
          {
            resource_type: 'Observation',
            last_ingest_succeeded_at: '2026-06-18 09:30:00+00',
            last_ingest_started_at: '2026-06-18 09:00:00+00',
            ingest_resources_received: 8,
            ingest_resources_staged: 8,
            ingest_resources_updated: 6,
          },
        ]);
      }
      if (text.includes('bulk_by_resource')) {
        return Promise.resolve([
          {
            resource_type: 'Observation',
            last_bulk_export_succeeded_at: '2026-06-17 12:00:00+00',
            last_bulk_import_succeeded_at: '2026-06-17 12:10:00+00',
            bulk_rows_read: '8',
            bulk_resources_staged: '8',
            bulk_error_count: '2',
            bulk_failed_file_count: '1',
            bulk_active_file_count: '0',
          },
        ]);
      }
      if (text.includes('FROM phm_edw.ehr_bulk_schedule')) {
        return Promise.resolve([
          {
            enabled_schedules: '1',
            due_schedules: '0',
            next_bulk_schedule_at: '2026-06-20 12:00:00+00',
            last_bulk_schedule_success_at: '2026-06-17 12:10:00+00',
            last_bulk_schedule_failure_at: null,
          },
        ]);
      }
      if (text.includes('worker_audit')) {
        return Promise.resolve([
          {
            last_event_at: '2026-06-19 11:45:00+00',
            latest_action: 'ehr_bulk_worker_import_incomplete',
            last_failure_at: '2026-06-19 11:45:00+00',
            failures_24h: '2',
            incomplete_imports_24h: '1',
            active_overdue_jobs: '1',
            oldest_overdue_job_at: '2026-06-19 11:30:00+00',
          },
        ]);
      }
      if (text.includes('crosswalk_conflict_drilldown')) {
        return Promise.resolve([
          {
            resource_type: 'Observation',
            local_table: 'phm_edw.observation',
            local_id: '456',
            source_count: '2',
            source_resource_ids: ['obs-1', 'obs-2'],
            patient_count: '1',
            last_seen_at: '2026-06-18 09:00:00+00',
          },
        ]);
      }
      if (text.includes('patient_resource_rollup')) {
        return Promise.resolve([
          {
            local_patient_id: '123',
            patient_resource_id: 'pat-1',
            total_resources: '9',
            local_target_resources: '8',
            resource_types: '3',
            stale_resources: '2',
            last_seen_at: '2026-05-01 08:00:00+00',
            latest_resource_type: 'Observation',
            total_patients: '2',
            stale_patients: '1',
            last_patient_seen_at: '2026-06-19 10:00:00+00',
          },
          {
            local_patient_id: '124',
            patient_resource_id: 'pat-2',
            total_resources: '2',
            local_target_resources: '2',
            resource_types: '1',
            stale_resources: '0',
            last_seen_at: '2026-06-19 10:00:00+00',
            latest_resource_type: 'Patient',
            total_patients: '2',
            stale_patients: '1',
            last_patient_seen_at: '2026-06-19 10:00:00+00',
          },
        ]);
      }
      if (text.includes('stale_patient_resource_drilldown')) {
        return Promise.resolve([
          {
            local_patient_id: '123',
            patient_resource_id: 'pat-1',
            resource_type: 'Observation',
            stale_resources: '2',
            oldest_seen_at: '2026-05-01 08:00:00+00',
            latest_seen_at: '2026-05-02 08:00:00+00',
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const status = await getTenantSyncStatus(42);

    expect(status).toMatchObject({
      ehrTenantId: 42,
      generatedAt: '2026-06-19T12:00:00.000Z',
      crosswalk: {
        totalResources: 11,
        localTargetResources: 9,
        unmappedLocalResources: 2,
        patientCrosswalks: 3,
        missingPatientResources: 1,
        staleResources: 1,
        collisionTargets: 1,
        resourceTypes: 2,
        staleAfterDays: 30,
      },
      bulkSchedule: {
        enabledSchedules: 1,
        dueSchedules: 0,
        nextBulkScheduleAt: '2026-06-20 12:00:00+00',
      },
      bulkWorker: {
        lastEventAt: '2026-06-19 11:45:00+00',
        latestAction: 'ehr_bulk_worker_import_incomplete',
        lastFailureAt: '2026-06-19 11:45:00+00',
        failures24h: 2,
        incompleteImports24h: 1,
        activeOverdueJobs: 1,
        oldestOverdueJobAt: '2026-06-19 11:30:00+00',
      },
      patientSync: {
        totalPatients: 2,
        displayedPatients: 2,
        stalePatients: 1,
        lastPatientSeenAt: '2026-06-19 10:00:00+00',
        staleAfterDays: 30,
      },
      lastSuccessfulIngestAt: '2026-06-18 09:30:00+00',
      lastSuccessfulBulkImportAt: '2026-06-17 12:10:00+00',
    });
    expect(status.patientResources).toEqual([
      {
        localPatientId: 123,
        patientResourceId: 'pat-1',
        totalResources: 9,
        localTargetResources: 8,
        resourceTypes: 3,
        staleResources: 2,
        lastSeenAt: '2026-05-01 08:00:00+00',
        latestResourceType: 'Observation',
      },
      {
        localPatientId: 124,
        patientResourceId: 'pat-2',
        totalResources: 2,
        localTargetResources: 2,
        resourceTypes: 1,
        staleResources: 0,
        lastSeenAt: '2026-06-19 10:00:00+00',
        latestResourceType: 'Patient',
      },
    ]);
    expect(status.conflictTargets).toEqual([
      {
        resourceType: 'Observation',
        localTable: 'phm_edw.observation',
        localId: 456,
        sourceCount: 2,
        sourceResourceIds: ['obs-1', 'obs-2'],
        patientCount: 1,
        lastSeenAt: '2026-06-18 09:00:00+00',
      },
    ]);
    expect(status.stalePatientResources).toEqual([
      {
        localPatientId: 123,
        patientResourceId: 'pat-1',
        resourceType: 'Observation',
        staleResources: 2,
        oldestSeenAt: '2026-05-01 08:00:00+00',
        latestSeenAt: '2026-05-02 08:00:00+00',
      },
    ]);
    expect(status.resources).toEqual([
      expect.objectContaining({
        resourceType: 'Patient',
        totalResources: 3,
        localTargetResources: 3,
      }),
      expect.objectContaining({
        resourceType: 'Observation',
        totalResources: 8,
        unmappedLocalResources: 2,
        missingPatientResources: 1,
        collisionTargets: 1,
        bulkErrorCount: 2,
        bulkFailedFileCount: 1,
      }),
    ]);
    expect(status.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'crosswalk_local_target_collision',
        'crosswalk_unmapped_local_target',
        'crosswalk_missing_patient',
        'crosswalk_stale_resource',
        'bulk_import_file_errors',
        'bulk_worker_failures_24h',
        'bulk_worker_poll_overdue',
        'patient_resource_stale',
      ]),
    );
    expect(status.issues[0]).toMatchObject({
      severity: 'critical',
      source: 'crosswalk',
      code: 'crosswalk_local_target_collision',
      drilldownAvailable: true,
      recommendedAction: expect.stringContaining('Review conflict drilldowns'),
      resourceType: 'Observation',
    });
    expect(status.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'patient_sync',
          code: 'patient_resource_stale',
          drilldownAvailable: true,
          recommendedAction: expect.stringContaining('Review stale resource drilldowns'),
        }),
      ]),
    );
  });
});
