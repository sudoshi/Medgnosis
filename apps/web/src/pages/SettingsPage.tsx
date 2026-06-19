// =============================================================================
// Medgnosis Web — Settings  (Clinical Obsidian v2)
// Left-nav tab layout with per-section content panels
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bell,
  User,
  Cloud,
  Clock,
  Shield,
  Check,
  ChevronRight,
  Copy,
  KeyRound,
  Palette,
  QrCode,
  LogOut,
  Monitor,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.js';
import { useToast } from '../stores/ui.js';
import { useUpdateProfile, useUserPreferences, useSavePreferences, useDbOverview, useProviderSchedule, useSaveProviderSchedule } from '../hooks/useApi.js';
import { api, apiErrorMessage } from '../services/api.js';
import type { User as UserType } from '@medgnosis/shared';
import { ConfirmModal } from '../components/ConfirmModal.js';
import { PALETTES } from '../styles/palettes.js';
import { useThemeStore } from '../stores/theme.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS = [
  { id: 'profile',       label: 'Profile',       icon: User    },
  { id: 'appearance',    label: 'Appearance',    icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell    },
  { id: 'data',          label: 'Data',          icon: Cloud   },
  { id: 'schedule',      label: 'Schedule',      icon: Clock   },
  { id: 'security',      label: 'Security',      icon: Shield  },
] as const;

type TabId = (typeof TABS)[number]['id'];

interface AuthSession {
  id: string;
  created_at: string;
  expires_at: string;
  revoked: boolean;
  revoked_at: string | null;
  last_used_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
  active: boolean;
  current: boolean;
}

interface MfaSetupData {
  manual_secret: string;
  otpauth_url: string;
  qr_code_data_url: string;
  expires_in: number;
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({
  enabled,
  onChange,
  label,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={() => onChange(!enabled)}
      className={[
        'relative flex-shrink-0 w-9 h-5 rounded-full',
        'transition-colors duration-200',
        'focus:outline-none focus:ring-1 focus:ring-teal/50 focus:ring-offset-1 focus:ring-offset-s0',
        enabled ? 'bg-teal' : 'bg-s2 border border-edge/40',
      ].join(' ')}
    >
      <span
        className={[
          'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm',
          'transition-transform duration-200',
          enabled ? 'translate-x-[18px]' : 'translate-x-0.5',
        ].join(' ')}
      />
    </button>
  );
}

// ─── SettingRow ───────────────────────────────────────────────────────────────

function SettingRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-3.5 border-b border-edge/15 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-bright leading-snug">{label}</p>
        {description && (
          <p className="text-xs text-ghost mt-0.5 leading-relaxed">{description}</p>
        )}
      </div>
      <Toggle enabled={checked} onChange={onChange} label={label} />
    </div>
  );
}

// ─── Section: Profile ─────────────────────────────────────────────────────────

function ProfileSection({ user }: { user: UserType | null }) {
  const toast = useToast();
  const setAuth = useAuthStore((s) => s.setAuth);
  const tokens = useAuthStore((s) => s.tokens);
  const updateProfile = useUpdateProfile();
  const [firstName, setFirstName] = useState(user?.first_name ?? '');
  const [lastName,  setLastName]  = useState(user?.last_name  ?? '');
  const [email,     setEmail]     = useState(user?.email      ?? '');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !email.trim()) {
      toast.error('First name and email are required');
      return;
    }
    try {
      const res = await updateProfile.mutateAsync({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
      });
      const updated = (res as { data?: Record<string, unknown> })?.data;
      if (updated && user && tokens) {
        setAuth(
          { ...user, first_name: String(updated.first_name), last_name: String(updated.last_name), email: String(updated.email) },
          tokens,
        );
      }
      toast.success('Profile saved');
    } catch {
      toast.error('Failed to save profile');
    }
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h2 className="text-base font-semibold text-bright">Profile</h2>
        <p className="text-xs text-ghost mt-0.5">Update your personal information</p>
      </div>

      <form onSubmit={handleSave}>
        <div className="surface p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="profile-first" className="block text-xs font-medium text-dim mb-1.5">
                First name
              </label>
              <Input
                id="profile-first"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="profile-last" className="block text-xs font-medium text-dim mb-1.5">
                Last name
              </label>
              <Input
                id="profile-last"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="profile-email" className="block text-xs font-medium text-dim mb-1.5">
              Email address
            </label>
            <Input
              id="profile-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-dim mb-1.5">Role</label>
            <Input
              type="text"
              defaultValue={(user as { role?: string } | null)?.role ?? 'Clinician'}
              className="opacity-60 cursor-not-allowed"
              readOnly
            />
          </div>

          <div className="flex justify-end pt-1">
            <Button type="submit" disabled={updateProfile.isPending}>
              <Check strokeWidth={2} aria-hidden="true" />
              <span>{updateProfile.isPending ? 'Saving...' : 'Save changes'}</span>
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ─── Section: Notifications ───────────────────────────────────────────────────

type NotifState = {
  email: boolean;
  desktop: boolean;
  careGaps: boolean;
  riskScores: boolean;
};

function NotificationsSection({
  notifications,
  setNotifications,
  onPersist,
}: {
  notifications: NotifState;
  setNotifications: React.Dispatch<React.SetStateAction<NotifState>>;
  onPersist: (key: string, value: Record<string, unknown>) => void;
}) {
  const handleToggle = (field: keyof NotifState, value: boolean) => {
    const next = { ...notifications, [field]: value };
    setNotifications(next);
    onPersist('notifications', next as unknown as Record<string, unknown>);
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h2 className="text-base font-semibold text-bright">Notifications</h2>
        <p className="text-xs text-ghost mt-0.5">Configure how and when you receive updates</p>
      </div>

      <div className="surface p-5">
        <SettingRow
          label="Email notifications"
          description="Receive clinical alerts and system updates via email"
          checked={notifications.email}
          onChange={(v) => handleToggle('email', v)}
        />
        <SettingRow
          label="Desktop notifications"
          description="Browser push notifications for real-time alerts"
          checked={notifications.desktop}
          onChange={(v) => handleToggle('desktop', v)}
        />
        <SettingRow
          label="Care gap alerts"
          description="Notify when new care gaps are identified for your patients"
          checked={notifications.careGaps}
          onChange={(v) => handleToggle('careGaps', v)}
        />
        <SettingRow
          label="Risk score changes"
          description="Alert when patient risk scores change significantly"
          checked={notifications.riskScores}
          onChange={(v) => handleToggle('riskScores', v)}
        />
      </div>
    </div>
  );
}

// ─── DbOverviewPanel ─────────────────────────────────────────────────────────

function DbOverviewPanel() {
  const { data: dbData } = useDbOverview();
  const overview = (dbData as { data?: Record<string, number> } | undefined)?.data;

  const fmt = (n: number | undefined) =>
    n !== undefined ? `${n.toLocaleString()} records` : '...';

  const rows = [
    { label: 'Schema',     value: 'phm_edw / phm_star' },
    { label: 'Patients',   value: fmt(overview?.patients)   },
    { label: 'Encounters', value: fmt(overview?.encounters) },
    { label: 'Procedures', value: fmt(overview?.procedures) },
    { label: 'Care Gaps',  value: fmt(overview?.care_gaps)  },
  ];

  return (
    <div className="surface p-5">
      <h3 className="text-xs font-semibold text-bright mb-3">Database overview</h3>
      <div className="space-y-0">
        {rows.map(({ label, value }) => (
          <div
            key={label}
            className="flex items-center justify-between py-2.5 border-b border-edge/15 last:border-0"
          >
            <span className="text-sm text-dim">{label}</span>
            <span className="font-data text-xs text-bright tabular-nums">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Section: Data ────────────────────────────────────────────────────────────

type EtlState = {
  autoRefresh: boolean;
  dailyBackup: boolean;
  compression: boolean;
};

function DataSection({
  etl,
  setEtl,
  onPersist,
}: {
  etl: EtlState;
  setEtl: React.Dispatch<React.SetStateAction<EtlState>>;
  onPersist: (key: string, value: Record<string, unknown>) => void;
}) {
  const handleToggle = (field: keyof EtlState, value: boolean) => {
    const next = { ...etl, [field]: value };
    setEtl(next);
    onPersist('data', next as unknown as Record<string, unknown>);
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h2 className="text-base font-semibold text-bright">Data Management</h2>
        <p className="text-xs text-ghost mt-0.5">Configure ETL processes and data handling</p>
      </div>

      <div className="surface p-5">
        <SettingRow
          label="Auto-refresh star schema"
          description="Automatically refresh analytics data daily at midnight"
          checked={etl.autoRefresh}
          onChange={(v) => handleToggle('autoRefresh', v)}
        />
        <SettingRow
          label="Daily backup"
          description="Create automated daily backups of EDW data"
          checked={etl.dailyBackup}
          onChange={(v) => handleToggle('dailyBackup', v)}
        />
        <SettingRow
          label="Data compression"
          description="Compress historical records to reduce storage usage"
          checked={etl.compression}
          onChange={(v) => handleToggle('compression', v)}
        />
      </div>

      {/* Data summary */}
      <DbOverviewPanel />
    </div>
  );
}

// ─── Section: Schedule ────────────────────────────────────────────────────────

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_ABBR  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const SCHEDULE_TYPE_STYLES: Record<string, string> = {
  clinic:     'bg-teal/10 text-teal border-teal/20',
  telehealth: 'bg-violet/10 text-violet border-violet/20',
  admin:      'bg-amber/10 text-amber border-amber/20',
  off:        'bg-s2 text-ghost border-edge/30',
};

interface ScheduleSlot {
  id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_duration_min: number;
  schedule_type: string;
  effective_date: string;
  end_date: string | null;
  notes: string | null;
}

interface ClinicResource {
  id: number;
  resource_name: string;
  resource_type: string;
  capacity: number;
  notes: string | null;
}

function ScheduleSection({ onPersist }: { onPersist: (key: string, value: Record<string, unknown>) => void }) {
  const toast = useToast();
  const { data: schedData, isLoading } = useProviderSchedule();
  const saveSchedule = useSaveProviderSchedule();

  const rawData = (schedData as { data?: { schedule?: ScheduleSlot[]; resources?: ClinicResource[] } } | undefined)?.data;
  const schedule = rawData?.schedule ?? [];
  const resources = rawData?.resources ?? [];

  // Local editable copies of schedule times
  const [edits, setEdits] = useState<Record<number, Partial<ScheduleSlot>>>({});

  const updateSlot = (id: number, field: keyof ScheduleSlot, value: string | number) => {
    setEdits((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  const hasEdits = Object.keys(edits).length > 0;

  const handleSave = async () => {
    const updates = Object.entries(edits).map(([id, changes]) => {
      const update: {
        id: number;
        start_time?: string;
        end_time?: string;
        slot_duration_min?: number;
        schedule_type?: string;
        notes?: string;
      } = { id: Number(id) };
      if (changes.start_time !== undefined) update.start_time = changes.start_time;
      if (changes.end_time !== undefined) update.end_time = changes.end_time;
      if (changes.slot_duration_min !== undefined) update.slot_duration_min = changes.slot_duration_min;
      if (changes.schedule_type !== undefined) update.schedule_type = changes.schedule_type;
      if (changes.notes !== undefined) update.notes = changes.notes ?? undefined;
      return update;
    });
    try {
      await saveSchedule.mutateAsync(updates);
      toast.success('Schedule saved');
      setEdits({});
    } catch {
      toast.error('Failed to save schedule');
    }
  };

  // Group schedule by day
  const byDay = new Map<number, ScheduleSlot[]>();
  for (const slot of schedule) {
    const day = slot.day_of_week;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(slot);
  }

  // Format time for display (HH:MM)
  const fmtTime = (t: string) => t?.slice(0, 5) ?? '';

  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h2 className="text-base font-semibold text-bright">Schedule</h2>
        <p className="text-xs text-ghost mt-0.5">Manage clinic hours and automated tasks</p>
      </div>

      {/* ── Weekly Clinic Hours ────────────────────────────────────────── */}
      <div className="surface p-5 space-y-4">
        <h3 className="text-xs font-semibold text-bright uppercase tracking-widest">Weekly Clinic Hours</h3>

        {isLoading && (
          <div className="py-6 text-center">
            <p className="text-sm text-ghost">Loading schedule...</p>
          </div>
        )}

        {!isLoading && schedule.length === 0 && (
          <div className="py-6 text-center">
            <p className="text-sm text-ghost">No schedule configured</p>
            <p className="text-xs text-ghost/70 mt-1">Contact your administrator to set up provider schedules.</p>
          </div>
        )}

        {!isLoading && schedule.length > 0 && (
          <div className="divide-y divide-edge/15">
            {[1, 2, 3, 4, 5, 6, 0].map((day) => {
              const slots = byDay.get(day);
              if (!slots || slots.length === 0) return null;
              return (
                <div key={day} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start gap-4">
                    {/* Day label */}
                    <div className="w-12 flex-shrink-0 pt-1">
                      <span className="text-xs font-semibold text-dim">{DAY_ABBR[day]}</span>
                    </div>

                    {/* Slots for this day */}
                    <div className="flex-1 space-y-2">
                      {slots.map((slot) => {
                        const edited = edits[slot.id] ?? {};
                        const startTime = (edited.start_time ?? fmtTime(slot.start_time)) as string;
                        const endTime = (edited.end_time ?? fmtTime(slot.end_time)) as string;
                        const type = (edited.schedule_type ?? slot.schedule_type) as string;
                        const typeStyle = SCHEDULE_TYPE_STYLES[type] ?? SCHEDULE_TYPE_STYLES.clinic;

                        return (
                          <div key={slot.id} className="flex items-center gap-3 flex-wrap">
                            {/* Time range */}
                            <Input
                              type="time"
                              value={startTime}
                              onChange={(e) => updateSlot(slot.id, 'start_time', e.target.value)}
                              className="w-[110px] py-1.5 font-data text-xs"
                              aria-label={`${DAY_NAMES[day]} start time`}
                            />
                            <span className="text-ghost text-xs">–</span>
                            <Input
                              type="time"
                              value={endTime}
                              onChange={(e) => updateSlot(slot.id, 'end_time', e.target.value)}
                              className="w-[110px] py-1.5 font-data text-xs"
                              aria-label={`${DAY_NAMES[day]} end time`}
                            />

                            {/* Type selector */}
                            <select
                              value={type}
                              onChange={(e) => updateSlot(slot.id, 'schedule_type', e.target.value)}
                              className={[
                                'px-2 py-1 rounded-btn text-[10px] font-ui font-medium border capitalize',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/50',
                                typeStyle,
                              ].join(' ')}
                              aria-label={`${DAY_NAMES[day]} schedule type`}
                            >
                              <option value="clinic">Clinic</option>
                              <option value="telehealth">Telehealth</option>
                              <option value="admin">Admin</option>
                              <option value="off">Off</option>
                            </select>

                            {/* Slot duration */}
                            <span className="text-[10px] text-ghost font-data tabular-nums">
                              {slot.slot_duration_min}min slots
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Save button */}
        {hasEdits && (
          <div className="flex justify-end pt-2 border-t border-edge/15">
            <button
              onClick={handleSave}
              disabled={saveSchedule.isPending}
              className={[
                'flex items-center gap-1.5 px-4 py-2 rounded-btn text-xs font-ui font-medium',
                'bg-teal text-accent-fg hover:bg-teal/90',
                'transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/50',
                saveSchedule.isPending ? 'opacity-50 cursor-not-allowed' : '',
              ].join(' ')}
            >
              <Check size={13} strokeWidth={2} aria-hidden="true" />
              {saveSchedule.isPending ? 'Saving...' : 'Save schedule'}
            </button>
          </div>
        )}
      </div>

      {/* ── System Scheduling (ETL + Reports) ──────────────────────────── */}
      <div className="surface p-5 space-y-5">
        <h3 className="text-xs font-semibold text-bright uppercase tracking-widest">Automated Tasks</h3>
        <div>
          <label className="block text-xs font-medium text-dim mb-1.5">ETL schedule</label>
          <Select defaultValue="daily" onValueChange={(v) => onPersist('schedule', { etl: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily at midnight</SelectItem>
              <SelectItem value="weekly">Weekly on Sunday</SelectItem>
              <SelectItem value="custom">Custom schedule</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-ghost mt-1.5">
            Controls when the star schema refresh runs
          </p>
        </div>

        <div className="border-t border-edge/15 pt-5">
          <label className="block text-xs font-medium text-dim mb-1.5">Report generation</label>
          <Select defaultValue="daily" onValueChange={(v) => onPersist('schedule', { reports: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily at 6 AM</SelectItem>
              <SelectItem value="weekly">Weekly on Monday</SelectItem>
              <SelectItem value="custom">Custom schedule</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-ghost mt-1.5">
            Controls when automated performance reports are generated
          </p>
        </div>
      </div>

      {/* ── Clinic Resources ───────────────────────────────────────────── */}
      {resources.length > 0 && (
        <div className="surface p-5">
          <h3 className="text-xs font-semibold text-bright uppercase tracking-widest mb-3">Clinic Resources</h3>
          <div className="divide-y divide-edge/15">
            {resources.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-dim">{r.resource_name}</span>
                <span
                  className={[
                    'px-2 py-0.5 rounded-btn text-[10px] font-ui font-medium border capitalize',
                    r.resource_type === 'telehealth' ? 'bg-violet/10 text-violet border-violet/20'
                      : r.resource_type === 'procedure_room' ? 'bg-amber/10 text-amber border-amber/20'
                      : r.resource_type === 'admin' ? 'bg-s2 text-ghost border-edge/30'
                      : 'bg-teal/10 text-teal border-teal/20',
                  ].join(' ')}
                >
                  {r.resource_type.replace(/_/g, ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section: Security ────────────────────────────────────────────────────────

function fmtSessionDate(value: string | null) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function sessionDeviceLabel(userAgent: string | null) {
  if (!userAgent) return 'Unknown device';
  const trimmed = userAgent.trim();
  if (!trimmed) return 'Unknown device';
  if (/playwright|chromium/i.test(trimmed)) return 'Chromium browser';
  if (/firefox/i.test(trimmed)) return 'Firefox browser';
  if (/safari/i.test(trimmed) && !/chrome|chromium/i.test(trimmed)) return 'Safari browser';
  if (/chrome|chromium/i.test(trimmed)) return 'Chrome browser';
  return trimmed.length > 54 ? `${trimmed.slice(0, 51)}...` : trimmed;
}

function SecuritySection() {
  const toast = useToast();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [revoking, setRevoking] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [sessionTarget, setSessionTarget] = useState<AuthSession | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupData, setSetupData] = useState<MfaSetupData | null>(null);
  const [setupCode, setSetupCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [disableOpen, setDisableOpen] = useState(false);
  const [disableCode, setDisableCode] = useState('');

  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: () => api.get<{ sessions: AuthSession[] }>('/auth/sessions'),
    staleTime: 30_000,
  });
  const sessions = sessionsData?.data?.sessions ?? [];
  const activeSessionCount = sessions.filter((session) => session.active).length;

  const revokeSession = useMutation({
    mutationFn: (id: string) => api.delete(`/auth/sessions/${id}`),
    onSuccess: () => {
      toast.success('Session revoked');
      qc.invalidateQueries({ queryKey: ['auth', 'sessions'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to revoke session')),
  });

  const startMfaSetup = useMutation({
    mutationFn: () => api.post<MfaSetupData>('/auth/mfa/setup'),
    onSuccess: (res) => {
      if (!res.data) return;
      setSetupData(res.data);
      setSetupCode('');
      setRecoveryCodes([]);
      setSetupOpen(true);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to start MFA setup')),
  });

  const confirmMfaSetup = useMutation({
    mutationFn: () => api.post<{ user: UserType; recovery_codes: string[] }>('/auth/mfa/confirm', {
      code: setupCode,
    }),
    onSuccess: (res) => {
      if (!res.data) return;
      setUser(res.data.user);
      setRecoveryCodes(res.data.recovery_codes);
      qc.invalidateQueries({ queryKey: ['auth', 'sessions'] });
      toast.success('Two-factor authentication enabled');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to verify authenticator code')),
  });

  const disableMfa = useMutation({
    mutationFn: () => api.post<{ user: UserType }>('/auth/mfa/disable', {
      code: disableCode,
    }),
    onSuccess: (res) => {
      if (res.data?.user) setUser(res.data.user);
      setDisableOpen(false);
      setDisableCode('');
      toast.success('Two-factor authentication disabled');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to disable MFA')),
  });

  const copyRecoveryCodes = async () => {
    await navigator.clipboard.writeText(recoveryCodes.join('\n'));
    toast.success('Recovery codes copied');
  };

  const handleRevokeAll = async () => {
    setRevoking(true);
    try {
      await api.post('/auth/logout');
      toast.success('All sessions revoked');
      clearAuth();
      navigate('/login');
    } catch {
      toast.error('Failed to revoke sessions');
      setRevoking(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h2 className="text-base font-semibold text-bright">Security</h2>
        <p className="text-xs text-ghost mt-0.5">Manage authentication and access controls</p>
      </div>

      {/* 2FA */}
      <div className="surface p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-bright">Two-factor authentication</p>
              {user?.mfa_enabled && (
                <span className="rounded-full border border-teal/20 bg-teal/10 px-2 py-0.5 text-[10px] font-medium text-teal">
                  Enabled
                </span>
              )}
            </div>
            <p className="text-xs text-ghost mt-0.5 leading-relaxed">
              Add an extra layer of security to your account with an authenticator app
            </p>
          </div>
          {user?.mfa_enabled ? (
            <Button
              className="flex-shrink-0"
              variant="outline"
              onClick={() => setDisableOpen(true)}
            >
              <span>Disable 2FA</span>
            </Button>
          ) : (
            <Button
              className="flex-shrink-0"
              onClick={() => startMfaSetup.mutate()}
              disabled={startMfaSetup.isPending}
            >
              <span>{startMfaSetup.isPending ? 'Preparing...' : 'Enable 2FA'}</span>
              <ChevronRight strokeWidth={2} aria-hidden="true" />
            </Button>
          )}
        </div>
        {user?.mfa_enabled && (
          <div className="mt-3 flex items-center gap-2 text-xs text-ghost">
            <KeyRound size={14} className="text-teal" aria-hidden="true" />
            <span>Authenticator verification is required for new sign-ins.</span>
          </div>
        )}
      </div>

      {/* Session info */}
      <div className="surface p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-xs font-semibold text-bright">Active sessions</h3>
          <span className="font-data text-[11px] text-ghost">{activeSessionCount} active</span>
        </div>

        {sessionsLoading && (
          <div className="py-3 text-sm text-ghost">Loading sessions...</div>
        )}

        {!sessionsLoading && sessions.length === 0 && (
          <div className="py-3 text-sm text-ghost">No active sessions found.</div>
        )}

        {!sessionsLoading && sessions.length > 0 && (
          <div className="divide-y divide-edge/15">
            {sessions.map((session) => (
              <div key={session.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Monitor size={14} className={session.active ? 'text-teal' : 'text-ghost'} aria-hidden="true" />
                    <p className="truncate text-sm font-medium text-bright">
                      {sessionDeviceLabel(session.user_agent)}
                    </p>
                    {session.current && (
                      <span className="rounded-full border border-teal/20 bg-teal/10 px-2 py-0.5 text-[10px] font-medium text-teal">
                        Current
                      </span>
                    )}
                    {!session.active && (
                      <span className="rounded-full border border-edge/30 bg-s2 px-2 py-0.5 text-[10px] font-medium text-ghost">
                        Revoked
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-data text-[11px] text-ghost">
                    <span>Last used {fmtSessionDate(session.last_used_at ?? session.created_at)}</span>
                    <span>IP {session.ip_address ?? 'unknown'}</span>
                    <span>Expires {fmtSessionDate(session.expires_at)}</span>
                  </div>
                </div>
                {session.active && !session.current && (
                  <button
                    type="button"
                    className="flex flex-shrink-0 items-center gap-1.5 rounded-btn border border-crimson/25 px-2.5 py-1.5 text-xs font-ui text-crimson transition-colors hover:bg-crimson/8 hover:border-crimson/50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={revokeSession.isPending}
                    onClick={() => setSessionTarget(session)}
                  >
                    <LogOut size={13} aria-hidden="true" />
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Danger zone */}
      <div className="surface p-5 border border-crimson/15">
        <h3 className="text-xs font-semibold text-crimson mb-3">Danger zone</h3>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-bright">Sign out all devices</p>
            <p className="text-xs text-ghost mt-0.5">
              Invalidate all active sessions across all devices
            </p>
          </div>
          <button
            onClick={() => setConfirmRevoke(true)}
            disabled={revoking}
            className={[
              'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-btn text-xs font-ui',
              'border border-crimson/30 text-crimson',
              'hover:bg-crimson/8 hover:border-crimson/50 transition-colors duration-100',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            ].join(' ')}
          >
            {revoking ? 'Revoking...' : 'Sign out all'}
          </button>
        </div>
      </div>

      <Dialog open={setupOpen} onOpenChange={(open) => {
        setSetupOpen(open);
        if (!open) {
          setSetupCode('');
          setSetupData(null);
          setRecoveryCodes([]);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Set up two-factor authentication</DialogTitle>
            <DialogDescription>
              {recoveryCodes.length > 0
                ? 'Recovery codes are shown once.'
                : 'Scan the QR code or enter the manual key in your authenticator app.'}
            </DialogDescription>
          </DialogHeader>

          {recoveryCodes.length > 0 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-2 rounded-panel border border-edge/30 bg-s1 p-3 font-data text-xs text-bright sm:grid-cols-2">
                {recoveryCodes.map((code) => (
                  <span key={code}>{code}</span>
                ))}
              </div>
              <Button type="button" variant="outline" onClick={copyRecoveryCodes} className="w-full">
                <Copy size={14} aria-hidden="true" />
                Copy codes
              </Button>
              <DialogFooter>
                <Button type="button" onClick={() => setSetupOpen(false)}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                confirmMfaSetup.mutate();
              }}
            >
              {setupData && (
                <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
                  <div className="flex h-44 w-44 items-center justify-center rounded-panel border border-edge/30 bg-white p-2">
                    <img
                      src={setupData.qr_code_data_url}
                      alt="Authenticator QR code"
                      className="h-full w-full"
                    />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-bright">
                      <QrCode size={16} className="text-teal" aria-hidden="true" />
                      Manual key
                    </div>
                    <p className="break-all rounded-panel border border-edge/30 bg-s1 p-3 font-data text-xs text-bright">
                      {setupData.manual_secret}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ghost" htmlFor="mfa-setup-code">
                  Authenticator code
                </label>
                <Input
                  id="mfa-setup-code"
                  name="one-time-code"
                  value={setupCode}
                  onChange={(event) => setSetupCode(event.target.value)}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  placeholder="123456"
                  disabled={confirmMfaSetup.isPending}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setSetupOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={confirmMfaSetup.isPending || setupCode.trim().length < 6}>
                  {confirmMfaSetup.isPending ? 'Verifying...' : 'Verify and enable'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={disableOpen} onOpenChange={(open) => {
        setDisableOpen(open);
        if (!open) setDisableCode('');
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Disable two-factor authentication?</DialogTitle>
            <DialogDescription>
              Enter an authenticator or recovery code to confirm this change.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              disableMfa.mutate();
            }}
          >
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ghost" htmlFor="mfa-disable-code">
                Verification code
              </label>
              <Input
                id="mfa-disable-code"
                name="one-time-code"
                value={disableCode}
                onChange={(event) => setDisableCode(event.target.value)}
                autoComplete="one-time-code"
                inputMode="text"
                placeholder="123456"
                disabled={disableMfa.isPending}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDisableOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={disableMfa.isPending || disableCode.trim().length < 6}>
                {disableMfa.isPending ? 'Disabling...' : 'Disable 2FA'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={confirmRevoke}
        title="Sign out of all devices?"
        body="This invalidates every active session across all devices. You will need to sign in again."
        confirmLabel="Sign out all"
        confirmVariant="danger"
        onConfirm={() => { setConfirmRevoke(false); handleRevokeAll(); }}
        onCancel={() => setConfirmRevoke(false)}
      />

      <ConfirmModal
        open={sessionTarget !== null}
        title="Revoke this session?"
        body="This device will lose refresh access and will need to sign in again."
        confirmLabel="Revoke session"
        confirmVariant="danger"
        onConfirm={() => {
          if (sessionTarget) revokeSession.mutate(sessionTarget.id);
          setSessionTarget(null);
        }}
        onCancel={() => setSessionTarget(null)}
      />
    </div>
  );
}

// ─── Section: Appearance (Palette Switcher) ───────────────────────────────────

function PaletteSection() {
  const toast = useToast();
  const paletteId = useThemeStore((s) => s.paletteId);
  const setPalette = useThemeStore((s) => s.setPalette);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  const handleSelect = (id: string) => {
    if (id === paletteId) return;
    setPalette(id);
    const palette = PALETTES.find((p) => p.id === id);
    toast.success(`Palette switched to ${palette?.name ?? id}`);
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h2 className="text-base font-semibold text-bright">Appearance</h2>
        <p className="text-xs text-ghost mt-0.5">Choose a theme and color palette for the interface</p>
      </div>

      {/* ── Theme mode (Auto / Dark / Light) ─────────────────────────────── */}
      <div className="surface p-5">
        <h3 className="text-xs font-semibold text-bright uppercase tracking-widest mb-4">Theme</h3>
        <div
          className="inline-flex rounded-card border border-edge/35 overflow-hidden"
          role="group"
          aria-label="Theme mode"
        >
          {(['auto', 'dark', 'light'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setTheme(m)}
              aria-pressed={theme === m}
              className={[
                'px-4 py-2 text-sm font-ui capitalize transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 focus-visible:relative',
                theme === m ? 'bg-teal/10 text-teal' : 'text-dim hover:bg-s2 hover:text-bright',
              ].join(' ')}
            >
              {m}
            </button>
          ))}
        </div>
        <p className="text-xs text-ghost mt-3">
          Auto follows your operating system. Saved locally and persists across sessions.
        </p>
      </div>

      <div className="surface p-5">
        <h3 className="text-xs font-semibold text-bright uppercase tracking-widest mb-4">Color Palette</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PALETTES.map((palette) => {
            const isActive = paletteId === palette.id;
            return (
              <button
                key={palette.id}
                onClick={() => handleSelect(palette.id)}
                className={[
                  'relative flex items-center gap-3 px-4 py-3 rounded-card border text-left',
                  'transition-all duration-150 cursor-pointer',
                  isActive
                    ? 'border-[var(--primary)] bg-[var(--primary-bg)]'
                    : 'border-edge/35 bg-s1 hover:border-edge/60 hover:bg-s2',
                ].join(' ')}
                aria-pressed={isActive}
                aria-label={`Select ${palette.name} palette`}
              >
                {/* Color swatches */}
                <div className="flex gap-1.5 flex-shrink-0">
                  <span
                    className="w-5 h-5 rounded-full border-2 border-black/20 flex-shrink-0"
                    style={{ backgroundColor: palette.primary }}
                    aria-hidden="true"
                  />
                  <span
                    className="w-5 h-5 rounded-full border-2 border-black/20 flex-shrink-0"
                    style={{ backgroundColor: palette.accent }}
                    aria-hidden="true"
                  />
                </div>

                {/* Name + description */}
                <div className="min-w-0 flex-1">
                  <p className={[
                    'text-sm font-medium leading-tight',
                    isActive ? 'text-[var(--primary)]' : 'text-bright',
                  ].join(' ')}>
                    {palette.name}
                  </p>
                  <p className="text-[10px] text-ghost mt-0.5 truncate">{palette.description}</p>
                </div>

                {/* Active checkmark */}
                {isActive && (
                  <Check size={14} strokeWidth={2.5} className="flex-shrink-0 text-[var(--primary)]" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-ghost mt-4">
          Palette preference is saved locally and persists across sessions.
        </p>
      </div>
    </div>
  );
}

// ─── SettingsPage ─────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { user } = useAuthStore();
  const { data: prefsData } = useUserPreferences();
  const savePrefs = useSavePreferences();

  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const hydrated = useRef(false);

  const [notifications, setNotifications] = useState<NotifState>({
    email:      true,
    desktop:    true,
    careGaps:   true,
    riskScores: false,
  });

  const [etl, setEtl] = useState<EtlState>({
    autoRefresh: true,
    dailyBackup: true,
    compression: false,
  });

  // Hydrate local state from server preferences on first load
  useEffect(() => {
    if (hydrated.current || !prefsData) return;
    const prefs = (prefsData as { data?: Record<string, unknown> })?.data;
    if (!prefs) return;
    hydrated.current = true;

    const notif = prefs.notifications as Partial<NotifState> | undefined;
    if (notif) {
      setNotifications((prev) => ({ ...prev, ...notif }));
    }
    const data = prefs.data as Partial<EtlState> | undefined;
    if (data) {
      setEtl((prev) => ({ ...prev, ...data }));
    }
  }, [prefsData]);

  // Debounced persist callback
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const persistPreference = useCallback(
    (key: string, value: Record<string, unknown>) => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        savePrefs.mutate({ [key]: value });
      }, 400);
    },
    [savePrefs],
  );

  return (
    <div className="space-y-5">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <h1 className="text-2xl font-semibold text-bright">Settings</h1>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex gap-6 items-start">

        {/* Left nav */}
        <div className="w-[196px] flex-shrink-0">
          <nav className="surface p-1.5 space-y-0.5" aria-label="Settings navigation">
            {TABS.map(({ id, label, icon: Icon }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={[
                    'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-card text-left',
                    'transition-colors duration-100 text-sm font-ui',
                    isActive
                      ? 'bg-teal/10 text-teal'
                      : 'text-dim hover:bg-s2 hover:text-bright',
                  ].join(' ')}
                  style={isActive ? { boxShadow: 'inset 3px 0 0 var(--primary)' } : undefined}
                >
                  <Icon
                    size={15}
                    strokeWidth={isActive ? 2 : 1.5}
                    className="flex-shrink-0"
                    aria-hidden="true"
                  />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Right content */}
        <div className="flex-1 min-w-0">
          {activeTab === 'profile'       && <ProfileSection user={user} />}
          {activeTab === 'appearance'    && <PaletteSection />}
          {activeTab === 'notifications' && (
            <NotificationsSection
              notifications={notifications}
              setNotifications={setNotifications}
              onPersist={persistPreference}
            />
          )}
          {activeTab === 'data'     && <DataSection etl={etl} setEtl={setEtl} onPersist={persistPreference} />}
          {activeTab === 'schedule' && <ScheduleSection onPersist={persistPreference} />}
          {activeTab === 'security' && <SecuritySection />}
        </div>
      </div>
    </div>
  );
}
