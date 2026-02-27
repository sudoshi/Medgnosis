// =============================================================================
// Medgnosis Web — Admin Panel  (Clinical Obsidian v2)
// 5-tab admin interface: Dashboard | Users | FHIR | ETL & DB | Audit Log
// Access requires role === 'admin' — enforced at render time.
// =============================================================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Users,
  Globe,
  Database,
  ScrollText,
  RefreshCw,
  Plus,
  Pencil,
  Trash2,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
  X,
  Check,
  UserPlus,
} from 'lucide-react';
import { useAuthStore } from '../stores/auth.js';
import { useToast } from '../stores/ui.js';
import { api } from '../services/api.js';

// ─── Tab config ───────────────────────────────────────────────────────────────

const ADMIN_TABS = [
  { id: 'dashboard',  label: 'Dashboard',     icon: LayoutDashboard },
  { id: 'users',      label: 'Users',         icon: Users           },
  { id: 'fhir',       label: 'FHIR Endpoints',icon: Globe           },
  { id: 'etl',        label: 'ETL & Database',icon: Database        },
  { id: 'audit',      label: 'Audit Log',     icon: ScrollText      },
] as const;

type AdminTab = (typeof ADMIN_TABS)[number]['id'];

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminStats {
  total_providers: number;
  active_patients: number;
  open_care_gaps: number;
  star_bundle_rows: number;
  star_composite_rows: number;
  last_etl_status: string | null;
  last_etl_at: string | null;
}

interface AdminUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  provider_first_name: string | null;
  provider_last_name: string | null;
}

interface FhirEndpoint {
  endpoint_id: number;
  name: string;
  ehr_type: string;
  base_url: string;
  auth_type: string;
  status: string;
  version: string;
  patients_linked: number;
  last_sync_at: string | null;
  notes: string | null;
}

interface AuditLog {
  audit_id: number;
  event_type: string;
  user_email: string | null;
  user_first_name: string | null;
  user_last_name: string | null;
  target_type: string | null;
  target_id: string | null;
  description: string | null;
  ip_address: string | null;
  created_at: string;
}

interface EtlLog {
  source_system: string;
  load_status: string;
  rows_inserted: number;
  created_at: string;
}

interface Migration {
  migration_name: string;
  applied_at: string;
}

interface StarCounts {
  composite_rows: string;
  bundle_rows: string;
  detail_rows: string;
  dim_patient_rows: string;
  dim_provider_rows: string;
  dim_bundle_rows: string;
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function MetricCard({ label, value, sub, color = 'teal' }: {
  label: string;
  value: string | number | null;
  sub?: string;
  color?: 'teal' | 'amber' | 'crimson' | 'emerald';
}) {
  const colorMap: Record<string, string> = {
    teal:    'text-[var(--primary)]',
    amber:   'text-amber',
    crimson: 'text-crimson',
    emerald: 'text-emerald',
  };
  return (
    <div className="surface p-5">
      <p className="text-xs text-ghost uppercase tracking-wider mb-2">{label}</p>
      <p className={`font-data text-data-2xl tabular-nums ${colorMap[color]}`}>
        {value === null ? '...' : typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {sub && <p className="text-xs text-ghost mt-1">{sub}</p>}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    admin:             'bg-[var(--primary-bg)] text-[var(--primary)] border border-[var(--primary-border)]',
    provider:          'bg-emerald/10 text-emerald border border-emerald/25',
    analyst:           'bg-violet/10 text-violet border border-violet/25',
    care_coordinator:  'bg-info/10 text-info border border-info/25',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${styles[role] ?? 'bg-s2 text-ghost border border-edge/35'}`}>
      {role.replace(/_/g, ' ')}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: React.ElementType; cls: string }> = {
    connected:    { icon: CheckCircle2,  cls: 'text-emerald' },
    degraded:     { icon: AlertTriangle, cls: 'text-amber'   },
    disconnected: { icon: XCircle,       cls: 'text-ghost'   },
  };
  const entry = map[status] ?? map.disconnected;
  const Icon = entry.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${entry.cls}`}>
      <Icon size={12} strokeWidth={2} />
      <span className="capitalize">{status}</span>
    </span>
  );
}

// ─── Modal: Invite User ───────────────────────────────────────────────────────

function InviteUserModal({ onClose, onSuccess }: { onClose(): void; onSuccess(): void }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState('provider');

  const create = useMutation({
    mutationFn: (body: object) => api.post('/admin/users', body),
    onSuccess: () => {
      toast.success('User invited successfully');
      onSuccess();
      onClose();
    },
    onError: () => toast.error('Failed to create user'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !firstName.trim()) return;
    create.mutate({ email: email.trim(), first_name: firstName.trim(), last_name: lastName.trim() || undefined, role });
  };

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center">
      <div className="fixed inset-0 bg-void/85 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-s0 border border-[var(--border-default)] rounded-panel p-6 w-full max-w-md shadow-2xl animate-fade-up">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-bright">Invite User</h3>
          <button onClick={onClose} className="text-ghost hover:text-bright transition-colors">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-dim mb-1.5">First name *</label>
              <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="input-field" required />
            </div>
            <div>
              <label className="block text-xs text-dim mb-1.5">Last name</label>
              <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className="input-field" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-dim mb-1.5">Email address *</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-field" required />
          </div>
          <div>
            <label className="block text-xs text-dim mb-1.5">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="select-field">
              <option value="provider">Provider</option>
              <option value="analyst">Analyst</option>
              <option value="care_coordinator">Care Coordinator</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
            <button type="submit" className="btn-primary btn-sm" disabled={create.isPending}>
              <UserPlus size={13} />
              {create.isPending ? 'Inviting...' : 'Invite user'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

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
    <div className="fixed inset-0 z-[210] flex items-center justify-center">
      <div className="fixed inset-0 bg-void/85 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-s0 border border-[var(--border-default)] rounded-panel p-6 w-full max-w-lg shadow-2xl animate-fade-up">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-bright">{endpoint ? 'Edit Endpoint' : 'Add FHIR Endpoint'}</h3>
          <button onClick={onClose} className="text-ghost hover:text-bright transition-colors">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-dim mb-1.5">Name *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-field" required />
            </div>
            <div>
              <label className="block text-xs text-dim mb-1.5">EHR Type</label>
              <select value={ehrType} onChange={(e) => setEhrType(e.target.value)} className="select-field">
                <option value="epic">Epic</option>
                <option value="oracle">Oracle Health</option>
                <option value="cerner">Cerner</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-dim mb-1.5">Base URL *</label>
            <input type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="input-field" required placeholder="https://..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-dim mb-1.5">Auth type</label>
              <select value={authType} onChange={(e) => setAuthType(e.target.value)} className="select-field">
                <option value="oauth2">OAuth 2.0</option>
                <option value="smart">SMART on FHIR</option>
                <option value="apikey">API Key</option>
                <option value="none">None</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-dim mb-1.5">FHIR version</label>
              <select value={version} onChange={(e) => setVersion(e.target.value)} className="select-field">
                <option value="R4">R4</option>
                <option value="R4B">R4B</option>
                <option value="STU3">STU3</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-dim mb-1.5">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input-field resize-none" rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
            <button type="submit" className="btn-primary btn-sm" disabled={save.isPending}>
              <Check size={13} />
              {save.isPending ? 'Saving...' : (endpoint ? 'Update' : 'Add endpoint')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Tab: Dashboard ───────────────────────────────────────────────────────────

function DashboardTab() {
  const { data: statsData } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => api.get('/admin/stats'),
    staleTime: 60_000,
  });
  const { data: auditData } = useQuery({
    queryKey: ['admin', 'audit-log', 'recent'],
    queryFn: () => api.get('/admin/audit-log?limit=5'),
    staleTime: 60_000,
  });

  const stats = (statsData as { data?: AdminStats })?.data;
  const recentAudit = (auditData as { data?: { logs: AuditLog[] } })?.data?.logs ?? [];

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Total Providers"  value={stats?.total_providers   ?? null} color="teal"    />
        <MetricCard label="Active Patients"  value={stats?.active_patients   ?? null} color="emerald" />
        <MetricCard label="Open Care Gaps"   value={stats?.open_care_gaps    ?? null} color="amber"   />
        <MetricCard
          label="ETL Status"
          value={stats?.last_etl_status ? stats.last_etl_status.toUpperCase() : null}
          sub={stats?.last_etl_at ? `Last run ${fmtDateTime(stats.last_etl_at)}` : undefined}
          color={stats?.last_etl_status === 'success' ? 'emerald' : 'amber'}
        />
      </div>

      {/* Star schema health */}
      <div className="surface p-5">
        <h3 className="text-xs font-semibold text-bright uppercase tracking-wider mb-4">Star Schema Health</h3>
        <div className="grid grid-cols-2 gap-x-8 gap-y-0">
          {[
            { label: 'fact_patient_composite',    value: stats?.star_composite_rows },
            { label: 'fact_patient_bundle',       value: stats?.star_bundle_rows    },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-2.5 border-b border-edge/15 last:border-0">
              <span className="font-data text-xs text-dim">{label}</span>
              <span className="font-data text-xs text-bright tabular-nums">
                {value !== undefined ? Number(value).toLocaleString() : '...'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent audit events */}
      <div className="surface p-5">
        <h3 className="text-xs font-semibold text-bright uppercase tracking-wider mb-4">Recent Activity</h3>
        {recentAudit.length === 0 ? (
          <p className="text-sm text-ghost py-4 text-center">No recent events</p>
        ) : (
          <div className="divide-y divide-edge/15">
            {recentAudit.map((log) => (
              <div key={log.audit_id} className="py-2.5 flex items-start gap-3">
                <span className={`mt-0.5 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wide flex-shrink-0 ${
                  log.event_type === 'login' ? 'bg-[var(--primary-bg)] text-[var(--primary)]'
                  : log.event_type === 'phi_access' ? 'bg-amber/10 text-amber'
                  : log.event_type === 'etl_run' ? 'bg-violet/10 text-violet'
                  : 'bg-s2 text-ghost'
                }`}>
                  {log.event_type.replace(/_/g, ' ')}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-bright truncate">{log.description ?? '—'}</p>
                  <p className="text-[10px] text-ghost mt-0.5">
                    {log.user_first_name ? `${log.user_first_name} ${log.user_last_name ?? ''}`.trim() : log.user_email ?? 'System'}
                    {' · '}
                    {fmtDateTime(log.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Users ───────────────────────────────────────────────────────────────

function UsersTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get('/admin/users'),
    staleTime: 30_000,
  });

  const users = (usersData as { data?: { users: AdminUser[] } })?.data?.users ?? [];

  const deactivate = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/users/${id}`),
    onSuccess: () => {
      toast.success('User deactivated');
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: () => toast.error('Failed to deactivate user'),
  });

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-bright">Users</h2>
          <p className="text-xs text-ghost mt-0.5">{users.length} registered accounts</p>
        </div>
        <button onClick={() => setShowInvite(true)} className="btn-primary btn-sm">
          <UserPlus size={13} />
          Invite user
        </button>
      </div>

      <div className="surface p-0 overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Last login</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-ghost">Loading users...</td>
              </tr>
            )}
            {!isLoading && users.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-ghost">No users found</td>
              </tr>
            )}
            {users.map((u) => {
              const initials = `${u.first_name[0] ?? ''}${u.last_name?.[0] ?? ''}`.toUpperCase();
              const fullName = `${u.first_name} ${u.last_name ?? ''}`.trim();
              return (
                <tr key={u.id} className={!u.is_active ? 'opacity-45' : ''}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-[var(--primary-bg)] text-[var(--primary)] text-xs font-semibold flex items-center justify-center flex-shrink-0">
                        {initials}
                      </div>
                      <span className="text-sm text-bright">{fullName}</span>
                    </div>
                  </td>
                  <td><span className="font-data text-xs text-dim">{u.email}</span></td>
                  <td><RoleBadge role={u.role} /></td>
                  <td><span className="font-data text-xs text-ghost">{fmtDate(u.last_login_at)}</span></td>
                  <td>
                    <span className={`inline-flex items-center gap-1 text-xs ${u.is_active ? 'text-emerald' : 'text-ghost'}`}>
                      {u.is_active ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    {u.is_active && (
                      <button
                        onClick={() => deactivate.mutate(u.id)}
                        className="text-ghost hover:text-crimson transition-colors p-1 rounded"
                        title="Deactivate user"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showInvite && (
        <InviteUserModal
          onClose={() => setShowInvite(false)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['admin', 'users'] })}
        />
      )}
    </div>
  );
}

// ─── Tab: FHIR Endpoints ──────────────────────────────────────────────────────

function FhirTab() {
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
        <button onClick={() => setShowAdd(true)} className="btn-primary btn-sm">
          <Plus size={13} />
          Add endpoint
        </button>
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

// ─── Tab: ETL & Database ──────────────────────────────────────────────────────

function EtlTab() {
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
          <button
            onClick={() => refreshMut.mutate()}
            disabled={refreshMut.isPending}
            className="btn-secondary btn-sm gap-1.5"
          >
            <RefreshCw size={12} className={refreshMut.isPending ? 'animate-spin' : ''} />
            Refresh mat views
          </button>
        </div>
        {isLoading ? (
          <p className="text-sm text-ghost">Loading...</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Table</th>
                <th className="text-right">Row count</th>
              </tr>
            </thead>
            <tbody>
              {starRows.map(({ table, rows }) => (
                <tr key={table}>
                  <td><span className="font-data text-xs text-dim">{table}</span></td>
                  <td className="text-right"><span className="font-data text-xs text-bright tabular-nums">{Number(rows).toLocaleString()}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ETL log */}
      <div className="surface p-5">
        <h3 className="text-xs font-semibold text-bright uppercase tracking-wider mb-4">Recent ETL Runs</h3>
        {etlLogs.length === 0 ? (
          <p className="text-sm text-ghost text-center py-4">No ETL runs recorded</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>System</th>
                <th>Status</th>
                <th>Rows inserted</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {etlLogs.map((log, i) => (
                <tr key={i}>
                  <td><span className="text-sm text-dim">{log.source_system}</span></td>
                  <td>
                    <span className={`text-xs font-medium ${log.load_status === 'success' ? 'text-emerald' : 'text-amber'}`}>
                      {log.load_status}
                    </span>
                  </td>
                  <td><span className="font-data text-xs text-bright tabular-nums">{Number(log.rows_inserted).toLocaleString()}</span></td>
                  <td><span className="font-data text-xs text-ghost">{fmtDateTime(log.created_at)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
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

// ─── Tab: Audit Log ───────────────────────────────────────────────────────────

const EVENT_TYPES = ['login', 'view', 'create', 'update', 'delete', 'etl_run'];

function AuditTab() {
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
        <table className="data-table">
          <thead>
            <tr>
              <th>Event</th>
              <th>Actor</th>
              <th>Target</th>
              <th>Description</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} className="text-center py-8 text-ghost">Loading...</td></tr>
            )}
            {!isLoading && logs.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-ghost">No events found</td></tr>
            )}
            {logs.map((log) => {
              const actorName = log.user_first_name
                ? `${log.user_first_name} ${log.user_last_name ?? ''}`.trim()
                : log.user_email ?? 'System';
              return (
                <tr key={log.audit_id}>
                  <td>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wide ${
                      log.event_type === 'login'         ? 'bg-[var(--primary-bg)] text-[var(--primary)]'
                      : log.event_type === 'phi_access'   ? 'bg-amber/10 text-amber'
                      : log.event_type === 'etl_run'      ? 'bg-violet/10 text-violet'
                      : log.event_type === 'user_modified'? 'bg-info/10 text-info'
                      : 'bg-s2 text-ghost'
                    }`}>
                      {log.event_type.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td><span className="text-xs text-dim">{actorName}</span></td>
                  <td><span className="font-data text-xs text-ghost">{log.target_type ?? '—'}</span></td>
                  <td><span className="text-xs text-dim truncate max-w-[200px] block">{log.description ?? '—'}</span></td>
                  <td><span className="font-data text-[11px] text-ghost whitespace-nowrap">{fmtDateTime(log.created_at)}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > LIMIT && (
        <div className="flex items-center justify-between text-xs text-ghost">
          <span>{offset + 1}–{Math.min(offset + LIMIT, total)} of {total.toLocaleString()}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setOffset(Math.max(0, offset - LIMIT))}
              disabled={offset === 0}
              className="btn-secondary btn-sm"
            >
              Previous
            </button>
            <button
              onClick={() => setOffset(offset + LIMIT)}
              disabled={offset + LIMIT >= total}
              className="btn-secondary btn-sm"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AdminPage ────────────────────────────────────────────────────────────────

export function AdminPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');

  // Role guard — redirect non-admins
  useEffect(() => {
    const role = (user as { role?: string } | null)?.role;
    if (user && role !== 'admin') {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  if ((user as { role?: string } | null)?.role !== 'admin') return null;

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <ShieldCheck size={20} className="text-[var(--primary)] flex-shrink-0" strokeWidth={1.5} />
        <div>
          <h1 className="text-2xl font-semibold text-bright">Admin Panel</h1>
          <p className="text-xs text-ghost mt-0.5">System administration and configuration</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-0.5 border-b border-edge/25">
        {ADMIN_TABS.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={[
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
                isActive
                  ? 'text-[var(--primary)] border-[var(--primary)]'
                  : 'text-ghost border-transparent hover:text-dim hover:border-edge/40',
              ].join(' ')}
            >
              <Icon size={14} strokeWidth={isActive ? 2 : 1.5} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'users'     && <UsersTab />}
        {activeTab === 'fhir'      && <FhirTab />}
        {activeTab === 'etl'       && <EtlTab />}
        {activeTab === 'audit'     && <AuditTab />}
      </div>
    </div>
  );
}
