// =============================================================================
// Admin — Users Tab
// =============================================================================

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardCopy,
  UserPlus,
  Trash2,
  CheckCircle2,
  XCircle,
  Mail,
  Ban,
} from 'lucide-react';
import { useToast } from '../../stores/ui.js';
import { api, apiErrorMessage } from '../../services/api.js';
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

interface InviteDelivery {
  user: {
    id: string;
    email: string;
    first_name: string;
    last_name?: string | null;
    role: string;
    is_active: boolean;
  };
  invite: {
    id: string;
    expires_at: string;
    activation_url: string;
    email_sent: boolean;
  };
}

// ─── Modal: Invite User ───────────────────────────────────────────────────────

function InviteUserModal({
  onClose,
  onSuccess,
  onInviteCreated,
}: {
  onClose(): void;
  onSuccess(): void;
  onInviteCreated(delivery: InviteDelivery): void;
}) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState('provider');

  const create = useMutation({
    mutationFn: (body: object) => api.post<InviteDelivery>('/admin/users', body),
    onSuccess: (res) => {
      if (res.data) {
        onInviteCreated(res.data);
      }
      toast.success(res.data?.invite.email_sent ? 'Invite email sent' : 'Invite created');
      onSuccess();
      onClose();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to create user')),
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

function InviteDeliveryModal({
  delivery,
  onClose,
}: {
  delivery: InviteDelivery;
  onClose(): void;
}) {
  const toast = useToast();

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(delivery.invite.activation_url);
      toast.success('Activation link copied');
    } catch {
      toast.error('Could not copy activation link');
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite ready</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-sm text-bright">
              {delivery.user.first_name} {delivery.user.last_name ?? ''}
            </p>
            <p className="font-data text-xs text-dim">{delivery.user.email}</p>
          </div>

          <div className="rounded-input border border-edge/50 bg-s1 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-dim">
                {delivery.invite.email_sent ? 'Email sent' : 'Manual delivery required'}
              </span>
              <span className="font-data text-[11px] text-ghost">
                Expires {fmtDate(delivery.invite.expires_at)}
              </span>
            </div>
            <div className="flex gap-2">
              <Input
                readOnly
                value={delivery.invite.activation_url}
                className="font-data text-xs"
                aria-label="Activation link"
              />
              <Button type="button" size="sm" variant="secondary" onClick={copyLink}>
                <ClipboardCopy />
                Copy
              </Button>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
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
  const [revokeInviteTarget, setRevokeInviteTarget] = useState<AdminUser | null>(null);
  const [inviteDelivery, setInviteDelivery] = useState<InviteDelivery | null>(null);

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

  const resendInvite = useMutation({
    mutationFn: (id: string) => api.post<InviteDelivery>(`/admin/users/${id}/resend-invite`),
    onSuccess: (res) => {
      if (res.data) {
        setInviteDelivery(res.data);
      }
      toast.success(res.data?.invite.email_sent ? 'Invite email resent' : 'Invite link created');
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to resend invite')),
  });

  const revokeInvite = useMutation({
    mutationFn: (id: string) => api.post(`/admin/users/${id}/revoke-invite`),
    onSuccess: () => {
      toast.success('Invite revoked');
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to revoke invite')),
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
              const inviteStatus = u.pending_invite?.status;
              const inactiveLabel = inviteStatus === 'expired'
                ? 'Invite expired'
                : inviteStatus === 'pending'
                  ? 'Invite pending'
                  : 'Inactive';
              return (
                <TableRow key={u.id} className={!u.is_active ? 'bg-s1/25' : ''}>
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
                    {u.is_active ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald">
                        <CheckCircle2 size={12} />
                        Active
                      </span>
                    ) : (
                      <div className="space-y-0.5">
                        <span className={`inline-flex items-center gap-1 text-xs ${inviteStatus === 'expired' ? 'text-amber' : 'text-ghost'}`}>
                          {inviteStatus === 'pending' ? <Mail size={12} /> : <XCircle size={12} />}
                          {inactiveLabel}
                        </span>
                        {u.pending_invite && (
                          <p className="font-data text-[11px] text-ghost">
                            Expires {fmtDate(u.pending_invite.expires_at)}
                          </p>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {u.is_active ? (
                      <button
                        onClick={() => setDeactivateTarget(u)}
                        className="text-ghost hover:text-crimson transition-colors p-1 rounded"
                        title="Deactivate user"
                        aria-label={`Deactivate ${fullName}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => resendInvite.mutate(u.id)}
                          className="text-ghost hover:text-teal transition-colors p-1 rounded disabled:cursor-not-allowed disabled:opacity-40"
                          title="Resend invite"
                          aria-label={`Resend invite to ${fullName}`}
                          disabled={resendInvite.isPending}
                        >
                          <Mail size={14} />
                        </button>
                        {u.pending_invite && (
                          <button
                            onClick={() => setRevokeInviteTarget(u)}
                            className="text-ghost hover:text-crimson transition-colors p-1 rounded disabled:cursor-not-allowed disabled:opacity-40"
                            title="Revoke invite"
                            aria-label={`Revoke invite for ${fullName}`}
                            disabled={revokeInvite.isPending}
                          >
                            <Ban size={14} />
                          </button>
                        )}
                      </div>
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
          onInviteCreated={setInviteDelivery}
        />
      )}

      {inviteDelivery && (
        <InviteDeliveryModal
          delivery={inviteDelivery}
          onClose={() => setInviteDelivery(null)}
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

      <ConfirmModal
        open={revokeInviteTarget !== null}
        title={`Revoke invite for ${`${revokeInviteTarget?.first_name ?? ''} ${revokeInviteTarget?.last_name ?? ''}`.trim()}?`}
        body="The current activation link will stop working immediately. You can create a fresh link with resend invite."
        confirmLabel="Revoke invite"
        confirmVariant="danger"
        onConfirm={() => {
          if (revokeInviteTarget) revokeInvite.mutate(revokeInviteTarget.id);
          setRevokeInviteTarget(null);
        }}
        onCancel={() => setRevokeInviteTarget(null)}
      />
    </div>
  );
}
