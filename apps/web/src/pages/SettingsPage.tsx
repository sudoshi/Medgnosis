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
  Palette,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.js';
import { useToast } from '../stores/ui.js';
import { useUpdateProfile, useUserPreferences, useSavePreferences, useDbOverview, useProviderSchedule, useSaveProviderSchedule } from '../hooks/useApi.js';
import { api } from '../services/api.js';
import type { User as UserType } from '@medgnosis/shared';
import { PALETTES } from '../styles/palettes.js';
import { useThemeStore } from '../stores/theme.js';

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
              <input
                id="profile-first"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="input-field w-full"
                required
              />
            </div>
            <div>
              <label htmlFor="profile-last" className="block text-xs font-medium text-dim mb-1.5">
                Last name
              </label>
              <input
                id="profile-last"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="input-field w-full"
              />
            </div>
          </div>

          <div>
            <label htmlFor="profile-email" className="block text-xs font-medium text-dim mb-1.5">
              Email address
            </label>
            <input
              id="profile-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field w-full"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-dim mb-1.5">Role</label>
            <input
              type="text"
              defaultValue={(user as { role?: string } | null)?.role ?? 'Clinician'}
              className="input-field w-full opacity-60 cursor-not-allowed"
              readOnly
            />
          </div>

          <div className="flex justify-end pt-1">
            <button type="submit" className="btn-primary" disabled={updateProfile.isPending}>
              <Check size={13} strokeWidth={2} aria-hidden="true" />
              <span>{updateProfile.isPending ? 'Saving...' : 'Save changes'}</span>
            </button>
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
                            <input
                              type="time"
                              value={startTime}
                              onChange={(e) => updateSlot(slot.id, 'start_time', e.target.value)}
                              className="input-field w-[110px] text-xs font-data py-1.5"
                              aria-label={`${DAY_NAMES[day]} start time`}
                            />
                            <span className="text-ghost text-xs">–</span>
                            <input
                              type="time"
                              value={endTime}
                              onChange={(e) => updateSlot(slot.id, 'end_time', e.target.value)}
                              className="input-field w-[110px] text-xs font-data py-1.5"
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
                'bg-teal text-void hover:bg-teal/90',
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
          <select
            className="input-field w-full"
            onChange={(e) => onPersist('schedule', { etl: e.target.value })}
          >
            <option value="daily">Daily at midnight</option>
            <option value="weekly">Weekly on Sunday</option>
            <option value="custom">Custom schedule</option>
          </select>
          <p className="text-xs text-ghost mt-1.5">
            Controls when the star schema refresh runs
          </p>
        </div>

        <div className="border-t border-edge/15 pt-5">
          <label className="block text-xs font-medium text-dim mb-1.5">Report generation</label>
          <select
            className="input-field w-full"
            onChange={(e) => onPersist('schedule', { reports: e.target.value })}
          >
            <option value="daily">Daily at 6 AM</option>
            <option value="weekly">Weekly on Monday</option>
            <option value="custom">Custom schedule</option>
          </select>
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

function SecuritySection() {
  const toast = useToast();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const navigate = useNavigate();
  const [revoking, setRevoking] = useState(false);

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
          <div>
            <p className="text-sm font-semibold text-bright">Two-factor authentication</p>
            <p className="text-xs text-ghost mt-0.5 leading-relaxed">
              Add an extra layer of security to your account with an authenticator app
            </p>
          </div>
          <button className="btn-primary flex-shrink-0 opacity-60 cursor-not-allowed" disabled>
            <span>Enable 2FA</span>
            <ChevronRight size={13} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        <p className="text-xs text-ghost mt-3">
          Two-factor authentication setup is coming soon.
        </p>
      </div>

      {/* Session info */}
      <div className="surface p-5">
        <h3 className="text-xs font-semibold text-bright mb-3">Active session</h3>
        {[
          { label: 'Auth method', value: 'JWT Bearer'      },
          { label: 'Token type',  value: 'Access + Refresh' },
          { label: 'Session',     value: 'Secure (HTTPS)'   },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="flex items-center justify-between py-2.5 border-b border-edge/15 last:border-0"
          >
            <span className="text-sm text-dim">{label}</span>
            <span className="font-data text-xs text-bright">{value}</span>
          </div>
        ))}
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
            onClick={handleRevokeAll}
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
    </div>
  );
}

// ─── Section: Appearance (Palette Switcher) ───────────────────────────────────

function PaletteSection() {
  const toast = useToast();
  const paletteId = useThemeStore((s) => s.paletteId);
  const setPalette = useThemeStore((s) => s.setPalette);

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
        <p className="text-xs text-ghost mt-0.5">Choose a color palette for the interface</p>
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
                  style={isActive ? { boxShadow: 'inset 3px 0 0 #0DD9D9' } : undefined}
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
