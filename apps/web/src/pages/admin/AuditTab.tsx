// =============================================================================
// Admin — Audit Log Tab
// =============================================================================

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api.js';
import { fmtDateTime } from './helpers.js';
import type { AuditLog } from './types.js';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const EVENT_TYPES = ['login', 'view', 'create', 'update', 'delete', 'etl_run'];

export function AuditTab() {
  const [eventType, setEventType] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const LIMIT = 25;

  const { data: auditData, isLoading } = useQuery({
    queryKey: ['admin', 'audit-log', eventType, offset],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
      if (eventType) params.set('event_type', eventType);
      return api.get(`/admin/audit-log?${params}`);
    },
    staleTime: 30_000,
  });

  const logs  = (auditData as { data?: { logs: AuditLog[]; total: number } })?.data?.logs ?? [];
  const total = (auditData as { data?: { logs: AuditLog[]; total: number } })?.data?.total ?? 0;

  const handleFilter = (et: string | null) => {
    setEventType(et);
    setOffset(0);
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h2 className="text-base font-semibold text-bright">Audit Log</h2>
        <p className="text-xs text-ghost mt-0.5">{total.toLocaleString()} total events</p>
      </div>

      {/* Event type filter chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => handleFilter(null)}
          className={`px-3 py-1 rounded-pill text-xs font-medium border transition-colors ${
            eventType === null
              ? 'bg-[var(--primary-bg)] text-[var(--primary)] border-[var(--primary-border)]'
              : 'text-ghost border-edge/35 hover:border-edge/60 hover:text-dim'
          }`}
        >
          All
        </button>
        {EVENT_TYPES.map((et) => (
          <button
            key={et}
            onClick={() => handleFilter(et)}
            className={`px-3 py-1 rounded-pill text-xs font-medium border transition-colors ${
              eventType === et
                ? 'bg-[var(--primary-bg)] text-[var(--primary)] border-[var(--primary-border)]'
                : 'text-ghost border-edge/35 hover:border-edge/60 hover:text-dim'
            }`}
          >
            {et.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      <div className="surface p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Timestamp</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-ghost">Loading...</TableCell></TableRow>
            )}
            {!isLoading && logs.length === 0 && (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-ghost">No events found</TableCell></TableRow>
            )}
            {logs.map((log) => {
              const actorName = log.user_first_name
                ? `${log.user_first_name} ${log.user_last_name ?? ''}`.trim()
                : log.user_email ?? 'System';
              return (
                <TableRow key={log.audit_id}>
                  <TableCell>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wide ${
                      log.event_type === 'login'         ? 'bg-[var(--primary-bg)] text-[var(--primary)]'
                      : log.event_type === 'phi_access'   ? 'bg-amber/10 text-amber'
                      : log.event_type === 'etl_run'      ? 'bg-violet/10 text-violet'
                      : log.event_type === 'user_modified'? 'bg-info/10 text-info'
                      : 'bg-s2 text-ghost'
                    }`}>
                      {log.event_type.replace(/_/g, ' ')}
                    </span>
                  </TableCell>
                  <TableCell><span className="text-xs text-dim">{actorName}</span></TableCell>
                  <TableCell><span className="font-data text-xs text-ghost">{log.target_type ?? '\u2014'}</span></TableCell>
                  <TableCell><span className="block max-w-[200px] truncate text-xs text-dim">{log.description ?? '\u2014'}</span></TableCell>
                  <TableCell><span className="font-data text-[11px] text-ghost whitespace-nowrap">{fmtDateTime(log.created_at)}</span></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {total > LIMIT && (
        <div className="flex items-center justify-between text-xs text-ghost">
          <span>{offset + 1}\u2013{Math.min(offset + LIMIT, total)} of {total.toLocaleString()}</span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setOffset(Math.max(0, offset - LIMIT))}
              disabled={offset === 0}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setOffset(offset + LIMIT)}
              disabled={offset + LIMIT >= total}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
