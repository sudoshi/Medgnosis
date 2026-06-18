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
} from 'lucide-react';
import { useToast } from '../../stores/ui.js';
import { api } from '../../services/api.js';
import { RoleBadge, fmtDate } from './helpers.js';
import type { AdminUser } from './types.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ConfirmModal } from '../../components/ConfirmModal.js';

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
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite User</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-dim mb-1.5">First name *</label>
              <Input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div>
              <label className="block text-xs text-dim mb-1.5">Last name</label>
              <Input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-dim mb-1.5">Email address *</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs text-dim mb-1.5">Role</label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="provider">Provider</SelectItem>
                <SelectItem value="analyst">Analyst</SelectItem>
                <SelectItem value="care_coordinator">Care Coordinator</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="super_admin">Super Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={create.isPending}>
              <UserPlus />
              {create.isPending ? 'Inviting...' : 'Invite user'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── UsersTab ─────────────────────────────────────────────────────────────────

export function UsersTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<AdminUser | null>(null);

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get('/admin/users'),
    staleTime: 30_000,
  });

  const users = (usersData as { data?: { users: AdminUser[] } })?.data?.users ?? [];

  const deactivate = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/users/${id}`),
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
        <Button size="sm" onClick={() => setShowInvite(true)}>
          <UserPlus />
          Invite user
        </Button>
      </div>

      <div className="surface p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-ghost">Loading users...</TableCell>
              </TableRow>
            )}
            {!isLoading && users.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-ghost">No users found</TableCell>
              </TableRow>
            )}
            {users.map((u) => {
              const initials = `${u.first_name[0] ?? ''}${u.last_name?.[0] ?? ''}`.toUpperCase();
              const fullName = `${u.first_name} ${u.last_name ?? ''}`.trim();
              return (
                <TableRow key={u.id} className={!u.is_active ? 'opacity-45' : ''}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-[var(--primary-bg)] text-[var(--primary)] text-xs font-semibold flex items-center justify-center flex-shrink-0">
                        {initials}
                      </div>
                      <span className="text-sm text-bright">{fullName}</span>
                    </div>
                  </TableCell>
                  <TableCell><span className="font-data text-xs text-dim">{u.email}</span></TableCell>
                  <TableCell><RoleBadge role={u.role} /></TableCell>
                  <TableCell><span className="font-data text-xs text-ghost">{fmtDate(u.last_login_at)}</span></TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center gap-1 text-xs ${u.is_active ? 'text-emerald' : 'text-ghost'}`}>
                      {u.is_active ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </TableCell>
                  <TableCell>
                    {u.is_active && (
                      <button
                        onClick={() => setDeactivateTarget(u)}
                        className="text-ghost hover:text-crimson transition-colors p-1 rounded"
                        title="Deactivate user"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {showInvite && (
        <InviteUserModal
          onClose={() => setShowInvite(false)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['admin', 'users'] })}
        />
      )}

      <ConfirmModal
        open={deactivateTarget !== null}
        title={`Deactivate ${`${deactivateTarget?.first_name ?? ''} ${deactivateTarget?.last_name ?? ''}`.trim()}?`}
        body="They will immediately lose access to Medgnosis. You can re-invite them later."
        confirmLabel="Deactivate"
        confirmVariant="danger"
        onConfirm={() => {
          if (deactivateTarget) deactivate.mutate(deactivateTarget.id);
          setDeactivateTarget(null);
        }}
        onCancel={() => setDeactivateTarget(null)}
      />
    </div>
  );
}
