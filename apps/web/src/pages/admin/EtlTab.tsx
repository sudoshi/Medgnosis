// =============================================================================
// Admin — ETL & Database Tab
// =============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useToast } from '../../stores/ui.js';
import { api } from '../../services/api.js';
import { fmtDate, fmtDateTime } from './helpers.js';
import type { EtlLog, Migration, StarCounts } from './types.js';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function EtlTab() {
  const toast = useToast();
  const qc = useQueryClient();

  const { data: etlData, isLoading } = useQuery({
    queryKey: ['admin', 'etl-status'],
    queryFn: () => api.get('/admin/etl-status'),
    staleTime: 60_000,
  });

  const payload = (etlData as { data?: { etl_logs: EtlLog[]; migrations: Migration[]; star_counts: StarCounts } })?.data;
  const etlLogs   = payload?.etl_logs   ?? [];
  const migrations = payload?.migrations ?? [];
  const counts    = payload?.star_counts;

  const refreshMut = useMutation({
    mutationFn: () => api.post('/admin/refresh-mat-views', {}),
    onSuccess: () => {
      toast.success('Materialized views refreshed');
      qc.invalidateQueries({ queryKey: ['admin', 'etl-status'] });
    },
    onError: () => toast.error('Refresh failed'),
  });

  const starRows = counts ? [
    { table: 'fact_patient_composite',    rows: counts.composite_rows   },
    { table: 'fact_patient_bundle',       rows: counts.bundle_rows      },
    { table: 'fact_patient_bundle_detail',rows: counts.detail_rows      },
    { table: 'dim_patient',               rows: counts.dim_patient_rows },
    { table: 'dim_provider',              rows: counts.dim_provider_rows},
    { table: 'dim_bundle',                rows: counts.dim_bundle_rows  },
  ] : [];

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Star schema health */}
      <div className="surface p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-semibold text-bright uppercase tracking-wider">Star Schema Health</h3>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => refreshMut.mutate()}
            disabled={refreshMut.isPending}
            className="gap-1.5"
          >
            <RefreshCw className={refreshMut.isPending ? 'animate-spin' : ''} />
            Refresh mat views
          </Button>
        </div>
        {isLoading ? (
          <p className="text-sm text-ghost">Loading...</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Table</TableHead>
                <TableHead className="text-right">Row count</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {starRows.map(({ table, rows }) => (
                <TableRow key={table}>
                  <TableCell><span className="font-data text-xs text-dim">{table}</span></TableCell>
                  <TableCell className="text-right"><span className="font-data text-xs text-bright tabular-nums">{Number(rows).toLocaleString()}</span></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* ETL log */}
      <div className="surface p-5">
        <h3 className="text-xs font-semibold text-bright uppercase tracking-wider mb-4">Recent ETL Runs</h3>
        {etlLogs.length === 0 ? (
          <p className="text-sm text-ghost text-center py-4">No ETL runs recorded</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>System</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Rows inserted</TableHead>
                <TableHead>Timestamp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {etlLogs.map((log, i) => (
                <TableRow key={i}>
                  <TableCell><span className="text-sm text-dim">{log.source_system}</span></TableCell>
                  <TableCell>
                    <span className={`text-xs font-medium ${log.load_status === 'success' ? 'text-emerald' : 'text-amber'}`}>
                      {log.load_status}
                    </span>
                  </TableCell>
                  <TableCell><span className="font-data text-xs text-bright tabular-nums">{Number(log.rows_inserted).toLocaleString()}</span></TableCell>
                  <TableCell><span className="font-data text-xs text-ghost">{fmtDateTime(log.created_at)}</span></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Migration history */}
      <div className="surface p-5">
        <h3 className="text-xs font-semibold text-bright uppercase tracking-wider mb-4">Migration History</h3>
        <div className="divide-y divide-edge/15 max-h-72 overflow-y-auto scrollbar-thin">
          {migrations.map((m) => (
            <div key={m.migration_name} className="flex items-center justify-between py-2.5">
              <span className="font-data text-xs text-dim">{m.migration_name}</span>
              <span className="font-data text-xs text-ghost">{fmtDate(m.applied_at)}</span>
            </div>
          ))}
          {migrations.length === 0 && (
            <p className="text-sm text-ghost text-center py-4">No migrations tracked</p>
          )}
        </div>
      </div>
    </div>
  );
}
