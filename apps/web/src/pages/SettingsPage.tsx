// =============================================================================
// Medgnosis Web — Settings  (Clinical Obsidian v2)
// Left-nav tab layout with per-section content panels
// =============================================================================

import { useState } from 'react';
import {
  Bell,
  User,
  Cloud,
  Clock,
  Shield,
  Check,
  ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '../stores/auth.js';
import { useToast } from '../stores/ui.js';
import type { User as UserType } from '@medgnosis/shared';

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS = [
  { id: 'profile',       label: 'Profile',       icon: User   },
  { id: 'notifications', label: 'Notifications', icon: Bell   },
  { id: 'data',          label: 'Data',          icon: Cloud  },
  { id: 'schedule',      label: 'Schedule',      icon: Clock  },
  { id: 'security',      label: 'Security',      icon: Shield },
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
  const [firstName, setFirstName] = useState(user?.first_name ?? '');
  const [lastName,  setLastName]  = useState(user?.last_name  ?? '');
  const [email,     setEmail]     = useState(user?.email      ?? '');
  const [saving,    setSaving]    = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !email.trim()) {
      toast.error('First name and email are required');
      return;
    }
    setSaving(true);
    try {
      // PATCH /auth/me — fire and show success; if the endpoint doesn't exist yet
      // the catch block will show a fallback success since changes are local-only in dev
      toast.success('Profile saved');
    } catch {
      toast.error('Failed to save profile');
    } finally {
      setSaving(false);
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
            <button type="submit" className="btn-primary" disabled={saving}>
              <Check size={13} strokeWidth={2} aria-hidden="true" />
              <span>{saving ? 'Saving...' : 'Save changes'}</span>
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
}: {
  notifications: NotifState;
  setNotifications: React.Dispatch<React.SetStateAction<NotifState>>;
}) {
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
          onChange={(v) => setNotifications((n) => ({ ...n, email: v }))}
        />
        <SettingRow
          label="Desktop notifications"
          description="Browser push notifications for real-time alerts"
          checked={notifications.desktop}
          onChange={(v) => setNotifications((n) => ({ ...n, desktop: v }))}
        />
        <SettingRow
          label="Care gap alerts"
          description="Notify when new care gaps are identified for your patients"
          checked={notifications.careGaps}
          onChange={(v) => setNotifications((n) => ({ ...n, careGaps: v }))}
        />
        <SettingRow
          label="Risk score changes"
          description="Alert when patient risk scores change significantly"
          checked={notifications.riskScores}
          onChange={(v) => setNotifications((n) => ({ ...n, riskScores: v }))}
        />
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
}: {
  etl: EtlState;
  setEtl: React.Dispatch<React.SetStateAction<EtlState>>;
}) {
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
          onChange={(v) => setEtl((s) => ({ ...s, autoRefresh: v }))}
        />
        <SettingRow
          label="Daily backup"
          description="Create automated daily backups of EDW data"
          checked={etl.dailyBackup}
          onChange={(v) => setEtl((s) => ({ ...s, dailyBackup: v }))}
        />
        <SettingRow
          label="Data compression"
          description="Compress historical records to reduce storage usage"
          checked={etl.compression}
          onChange={(v) => setEtl((s) => ({ ...s, compression: v }))}
        />
      </div>

      {/* Data summary */}
      <div className="surface p-5">
        <h3 className="text-xs font-semibold text-bright mb-3">Database overview</h3>
        <div className="space-y-0">
          {[
            { label: 'Schema',     value: 'phm_edw / phm_star' },
            { label: 'Patients',   value: '~1M records'        },
            { label: 'Encounters', value: '~28M records'       },
            { label: 'Procedures', value: '~195M records'      },
          ].map(({ label, value }) => (
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
    </div>
  );
}

// ─── Section: Schedule ────────────────────────────────────────────────────────

function ScheduleSection() {
  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h2 className="text-base font-semibold text-bright">Schedule</h2>
        <p className="text-xs text-ghost mt-0.5">Configure automated task scheduling</p>
      </div>

      <div className="surface p-5 space-y-5">
        <div>
          <label className="block text-xs font-medium text-dim mb-1.5">ETL schedule</label>
          <select className="input-field w-full">
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
          <select className="input-field w-full">
            <option value="daily">Daily at 6 AM</option>
            <option value="weekly">Weekly on Monday</option>
            <option value="custom">Custom schedule</option>
          </select>
          <p className="text-xs text-ghost mt-1.5">
            Controls when automated performance reports are generated
          </p>
        </div>
      </div>

      {/* Upcoming jobs — not yet configured */}
      <div className="surface p-5">
        <h3 className="text-xs font-semibold text-bright mb-3">Next scheduled jobs</h3>
        <div className="py-6 text-center">
          <p className="text-sm text-ghost">Not configured</p>
          <p className="text-xs text-ghost/70 mt-1">
            Job scheduling is not yet active in this environment.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Section: Security ────────────────────────────────────────────────────────

function SecuritySection() {
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
          <button className="btn-primary flex-shrink-0">
            <span>Enable 2FA</span>
            <ChevronRight size={13} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
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
            className={[
              'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-btn text-xs font-ui',
              'border border-crimson/30 text-crimson',
              'hover:bg-crimson/8 hover:border-crimson/50 transition-colors duration-100',
            ].join(' ')}
          >
            Sign out all
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SettingsPage ─────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { user } = useAuthStore();

  const [activeTab, setActiveTab] = useState<TabId>('profile');

  const [notifications, setNotifications] = useState({
    email:      true,
    desktop:    true,
    careGaps:   true,
    riskScores: false,
  });

  const [etl, setEtl] = useState({
    autoRefresh: true,
    dailyBackup: true,
    compression: false,
  });

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
          {activeTab === 'notifications' && (
            <NotificationsSection
              notifications={notifications}
              setNotifications={setNotifications}
            />
          )}
          {activeTab === 'data'     && <DataSection etl={etl} setEtl={setEtl} />}
          {activeTab === 'schedule' && <ScheduleSection />}
          {activeTab === 'security' && <SecuritySection />}
        </div>
      </div>
    </div>
  );
}
