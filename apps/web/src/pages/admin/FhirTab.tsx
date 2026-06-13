// =============================================================================
// Admin — FHIR Endpoints Tab
// =============================================================================

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Globe,
  RefreshCw,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  Check,
} from 'lucide-react';
import { useToast } from '../../stores/ui.js';
import { api } from '../../services/api.js';
import { StatusBadge, fmtDateTime } from './helpers.js';
import type { FhirEndpoint } from './types.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ─── Modal: Add / Edit FHIR Endpoint ─────────────────────────────────────────

function FhirEndpointModal({
  endpoint,
  onClose,
  onSuccess,
}: {
  endpoint?: FhirEndpoint;
  onClose(): void;
  onSuccess(): void;
}) {
  const toast = useToast();
  const [name, setName] = useState(endpoint?.name ?? '');
  const [ehrType, setEhrType] = useState(endpoint?.ehr_type ?? 'epic');
  const [baseUrl, setBaseUrl] = useState(endpoint?.base_url ?? '');
  const [authType, setAuthType] = useState(endpoint?.auth_type ?? 'oauth2');
  const [version, setVersion] = useState(endpoint?.version ?? 'R4');
  const [notes, setNotes] = useState(endpoint?.notes ?? '');

  const save = useMutation({
    mutationFn: (body: object) =>
      endpoint
        ? api.patch(`/admin/fhir-endpoints/${endpoint.endpoint_id}`, body)
        : api.post('/admin/fhir-endpoints', body),
    onSuccess: () => {
      toast.success(endpoint ? 'Endpoint updated' : 'Endpoint added');
      onSuccess();
      onClose();
    },
    onError: () => toast.error('Failed to save endpoint'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate({ name, ehr_type: ehrType, base_url: baseUrl, auth_type: authType, version, notes: notes || undefined });
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{endpoint ? 'Edit Endpoint' : 'Add FHIR Endpoint'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-dim mb-1.5">Name *</label>
              <Input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label className="block text-xs text-dim mb-1.5">EHR Type</label>
              <Select value={ehrType} onValueChange={setEhrType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="epic">Epic</SelectItem>
                  <SelectItem value="oracle">Oracle Health</SelectItem>
                  <SelectItem value="cerner">Cerner</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-dim mb-1.5">Base URL *</label>
            <Input type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required placeholder="https://..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-dim mb-1.5">Auth type</label>
              <Select value={authType} onValueChange={setAuthType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="oauth2">OAuth 2.0</SelectItem>
                  <SelectItem value="smart">SMART on FHIR</SelectItem>
                  <SelectItem value="apikey">API Key</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs text-dim mb-1.5">FHIR version</label>
              <Select value={version} onValueChange={setVersion}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="R4">R4</SelectItem>
                  <SelectItem value="R4B">R4B</SelectItem>
                  <SelectItem value="STU3">STU3</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-dim mb-1.5">Notes</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="resize-none" rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={save.isPending}>
              <Check />
              {save.isPending ? 'Saving...' : endpoint ? 'Update' : 'Add endpoint'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── FhirTab ─────────────────────────────────────────────────────────────────

export function FhirTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<FhirEndpoint | undefined>();
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data: epData, isLoading } = useQuery({
    queryKey: ['admin', 'fhir-endpoints'],
    queryFn: () => api.get('/admin/fhir-endpoints'),
    staleTime: 60_000,
  });

  const endpoints = (epData as { data?: { endpoints: FhirEndpoint[] } })?.data?.endpoints ?? [];

  const syncMutation = useMutation({
    mutationFn: (id: number) => api.post(`/admin/fhir-endpoints/${id}/sync`, {}),
    onSuccess: () => {
      toast.success('Sync completed');
      qc.invalidateQueries({ queryKey: ['admin', 'fhir-endpoints'] });
    },
    onError: () => toast.error('Sync failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/fhir-endpoints/${id}`),
    onSuccess: () => {
      toast.success('Endpoint removed');
      qc.invalidateQueries({ queryKey: ['admin', 'fhir-endpoints'] });
    },
    onError: () => toast.error('Failed to remove endpoint'),
  });

  const ehrTypeLabel: Record<string, string> = {
    epic: 'Epic', oracle: 'Oracle Health', cerner: 'Cerner', custom: 'Custom',
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-bright">FHIR Endpoints</h2>
          <p className="text-xs text-ghost mt-0.5">Connected EHR systems via FHIR R4</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus />
          Add endpoint
        </Button>
      </div>

      {isLoading && (
        <div className="surface p-8 text-center">
          <p className="text-sm text-ghost">Loading endpoints...</p>
        </div>
      )}

      {!isLoading && endpoints.length === 0 && (
        <div className="surface p-8 text-center">
          <Globe size={24} className="text-ghost mx-auto mb-3 text-2xl" />
          <p className="text-sm text-bright">No FHIR endpoints configured</p>
          <p className="text-xs text-ghost mt-1">Add an EHR integration to start syncing patient data.</p>
        </div>
      )}

      <div className="space-y-3">
        {endpoints.map((ep) => {
          const isExpanded = expanded === ep.endpoint_id;
          return (
            <div key={ep.endpoint_id} className="surface p-0 overflow-hidden">
              {/* Header row */}
              <div
                className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-s1/50 transition-colors"
                onClick={() => setExpanded(isExpanded ? null : ep.endpoint_id)}
              >
                {/* Status dot */}
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  ep.status === 'connected' ? 'bg-emerald' : ep.status === 'degraded' ? 'bg-amber' : 'bg-ghost'
                }`} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-bright">{ep.name}</p>
                    <span className="text-[10px] bg-s2 text-ghost px-1.5 py-0.5 rounded font-ui border border-edge/30">
                      {ehrTypeLabel[ep.ehr_type] ?? ep.ehr_type}
                    </span>
                    <span className="text-[10px] bg-s2 text-ghost px-1.5 py-0.5 rounded font-data border border-edge/30">
                      FHIR {ep.version}
                    </span>
                  </div>
                  <p className="font-data text-[11px] text-ghost mt-0.5 truncate">{ep.base_url}</p>
                </div>

                <StatusBadge status={ep.status} />

                <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => syncMutation.mutate(ep.endpoint_id)}
                    disabled={syncMutation.isPending}
                    className="p-1.5 text-ghost hover:text-[var(--primary)] transition-colors rounded"
                    title="Sync now"
                  >
                    <RefreshCw size={14} className={syncMutation.isPending ? 'animate-spin' : ''} />
                  </button>
                  <button
                    onClick={() => setEditing(ep)}
                    className="p-1.5 text-ghost hover:text-bright transition-colors rounded"
                    title="Edit"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(ep.endpoint_id)}
                    className="p-1.5 text-ghost hover:text-crimson transition-colors rounded"
                    title="Remove"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {isExpanded ? <ChevronUp size={14} className="text-ghost flex-shrink-0" /> : <ChevronDown size={14} className="text-ghost flex-shrink-0" />}
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="border-t border-edge/20 px-5 py-4 bg-s1/30">
                  <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
                    {[
                      { label: 'Auth type',       value: ep.auth_type },
                      { label: 'Patients linked', value: ep.patients_linked.toLocaleString() },
                      { label: 'Last sync',       value: fmtDateTime(ep.last_sync_at) },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between">
                        <dt className="text-ghost">{label}</dt>
                        <dd className="font-data text-bright">{value}</dd>
                      </div>
                    ))}
                    {ep.notes && (
                      <div className="col-span-2 flex justify-between">
                        <dt className="text-ghost">Notes</dt>
                        <dd className="text-dim ml-4 text-right">{ep.notes}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {(showAdd || editing) && (
        <FhirEndpointModal
          endpoint={editing}
          onClose={() => { setShowAdd(false); setEditing(undefined); }}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['admin', 'fhir-endpoints'] })}
        />
      )}
    </div>
  );
}
