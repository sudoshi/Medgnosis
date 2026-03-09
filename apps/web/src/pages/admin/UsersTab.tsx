// =============================================================================
// Admin — Users Tab
// =============================================================================

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UserPlus,
  Trash2,
  CheckCircle2,
  XCircle,
  X,
} from 'lucide-react';
import { useToast } from '../../stores/ui.js';
import { api } from '../../services/api.js';
import { RoleBadge, fmtDate } from './helpers.js';
import type { AdminUser } from './types.js';

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

// ─── UsersTab ─────────────────────────────────────────────────────────────────

export function UsersTab() {
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
