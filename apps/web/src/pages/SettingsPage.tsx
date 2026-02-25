// =============================================================================
// Medgnosis Web — Settings page
// =============================================================================

import { useState } from 'react';
import {
  Bell,
  Key,
  User,
  Cloud,
  Clock,
  Shield,
} from 'lucide-react';
import { useAuthStore } from '../stores/auth.js';

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
    <label className="flex items-center cursor-pointer">
      <div className="relative">
        <input
          checked={enabled}
          className="sr-only"
          type="checkbox"
          onChange={(e) => onChange(e.target.checked)}
        />
        <div
          className={`block w-14 h-8 rounded-full transition-colors ${
            enabled ? 'bg-accent-primary' : 'bg-light-border dark:bg-dark-border'
          }`}
        />
        <div
          className={`absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-0'
          }`}
        />
      </div>
      {label && (
        <span className="ml-3 text-sm text-light-text-primary dark:text-dark-text-primary">
          {label}
        </span>
      )}
    </label>
  );
}

function SettingsSection({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="panel-base">
      <div className="flex items-start space-x-4">
        <div className="rounded-lg bg-accent-primary/10 p-3">
          <Icon className="h-6 w-6 text-accent-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary">
            {title}
          </h3>
          <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mt-1">
            {description}
          </p>
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { user } = useAuthStore();

  const [notifications, setNotifications] = useState({
    email: true,
    desktop: true,
    careGaps: true,
    riskScores: false,
  });

  const [etl, setEtl] = useState({
    autoRefresh: true,
    dailyBackup: true,
    compression: false,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-light-text-primary dark:text-dark-text-primary">
        Settings
      </h1>

      {/* Notifications */}
      <SettingsSection
        title="Notifications"
        description="Configure how you want to receive alerts and updates"
        icon={Bell}
      >
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span>Email Notifications</span>
            <Toggle
              enabled={notifications.email}
              onChange={(v) => setNotifications({ ...notifications, email: v })}
            />
          </div>
          <div className="flex justify-between items-center">
            <span>Desktop Notifications</span>
            <Toggle
              enabled={notifications.desktop}
              onChange={(v) => setNotifications({ ...notifications, desktop: v })}
            />
          </div>
          <div className="flex justify-between items-center">
            <span>Care Gap Alerts</span>
            <Toggle
              enabled={notifications.careGaps}
              onChange={(v) => setNotifications({ ...notifications, careGaps: v })}
            />
          </div>
          <div className="flex justify-between items-center">
            <span>Risk Score Changes</span>
            <Toggle
              enabled={notifications.riskScores}
              onChange={(v) => setNotifications({ ...notifications, riskScores: v })}
            />
          </div>
        </div>
      </SettingsSection>

      {/* Data Management */}
      <SettingsSection
        title="Data Management"
        description="Configure ETL processes and data handling"
        icon={Cloud}
      >
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <span className="block">Auto-refresh Star Schema</span>
              <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                Automatically refresh analytics data daily
              </span>
            </div>
            <Toggle
              enabled={etl.autoRefresh}
              onChange={(v) => setEtl({ ...etl, autoRefresh: v })}
            />
          </div>
          <div className="flex justify-between items-center">
            <div>
              <span className="block">Daily Backup</span>
              <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                Create daily backups of EDW data
              </span>
            </div>
            <Toggle
              enabled={etl.dailyBackup}
              onChange={(v) => setEtl({ ...etl, dailyBackup: v })}
            />
          </div>
          <div className="flex justify-between items-center">
            <div>
              <span className="block">Data Compression</span>
              <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                Compress historical data to save space
              </span>
            </div>
            <Toggle
              enabled={etl.compression}
              onChange={(v) => setEtl({ ...etl, compression: v })}
            />
          </div>
        </div>
      </SettingsSection>

      {/* Schedule */}
      <SettingsSection
        title="Schedule"
        description="Configure automated task scheduling"
        icon={Clock}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-light-secondary/50 dark:bg-dark-secondary/50 border border-light-border dark:border-dark-border">
            <h4 className="font-medium mb-2">ETL Schedule</h4>
            <select className="w-full px-4 py-2 rounded-lg bg-light-primary dark:bg-dark-primary border border-light-border dark:border-dark-border focus:outline-none focus:ring-2 focus:ring-accent-primary transition-colors">
              <option value="daily">Daily at midnight</option>
              <option value="weekly">Weekly on Sunday</option>
              <option value="custom">Custom Schedule</option>
            </select>
          </div>
          <div className="p-4 rounded-lg bg-light-secondary/50 dark:bg-dark-secondary/50 border border-light-border dark:border-dark-border">
            <h4 className="font-medium mb-2">Report Generation</h4>
            <select className="w-full px-4 py-2 rounded-lg bg-light-primary dark:bg-dark-primary border border-light-border dark:border-dark-border focus:outline-none focus:ring-2 focus:ring-accent-primary transition-colors">
              <option value="daily">Daily at 6 AM</option>
              <option value="weekly">Weekly on Monday</option>
              <option value="custom">Custom Schedule</option>
            </select>
          </div>
        </div>
      </SettingsSection>

      {/* Security */}
      <SettingsSection
        title="Security"
        description="Manage security settings and access controls"
        icon={Shield}
      >
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-light-secondary/50 dark:bg-dark-secondary/50 border border-light-border dark:border-dark-border">
            <h4 className="font-medium mb-2">Two-Factor Authentication</h4>
            <button className="px-4 py-2 rounded-lg bg-accent-primary text-white hover:bg-accent-primary/90 transition-all text-sm">
              Enable 2FA
            </button>
          </div>
        </div>
      </SettingsSection>

      {/* Profile */}
      <SettingsSection
        title="Profile"
        description="Update your profile information"
        icon={User}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
                Name
              </label>
              <input
                type="text"
                defaultValue={user ? `${user.first_name} ${user.last_name}` : ''}
                className="w-full px-4 py-2 rounded-lg bg-light-primary dark:bg-dark-primary border border-light-border dark:border-dark-border focus:outline-none focus:ring-2 focus:ring-accent-primary transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
                Email
              </label>
              <input
                type="email"
                defaultValue={user?.email ?? ''}
                className="w-full px-4 py-2 rounded-lg bg-light-primary dark:bg-dark-primary border border-light-border dark:border-dark-border focus:outline-none focus:ring-2 focus:ring-accent-primary transition-colors"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button className="px-4 py-2 rounded-lg bg-accent-primary text-white hover:bg-accent-primary/90 transition-all text-sm">
              Save Changes
            </button>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
