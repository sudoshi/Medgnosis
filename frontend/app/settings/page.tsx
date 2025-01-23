import { useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import {
  BellIcon,
  KeyIcon,
  UserIcon,
  CogIcon,
  CloudArrowUpIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

interface SettingsSectionProps {
  title: string;
  description: string;
  icon: typeof CogIcon;
  children: React.ReactNode;
}

function SettingsSection({ title, description, icon: Icon, children }: SettingsSectionProps) {
  return (
    <div className="card">
      <div className="flex items-start space-x-4">
        <div className="rounded-lg bg-accent-primary/10 p-3">
          <Icon className="h-6 w-6 text-accent-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-sm text-dark-text-secondary mt-1">{description}</p>
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

interface ToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  label?: string;
}

function Toggle({ enabled, onChange, label }: ToggleProps) {
  return (
    <label className="flex items-center cursor-pointer">
      <div className="relative">
        <input
          type="checkbox"
          className="sr-only"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div
          className={`block w-14 h-8 rounded-full transition-colors ${
            enabled ? 'bg-accent-primary' : 'bg-dark-border'
          }`}
        />
        <div
          className={`absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-0'
          }`}
        />
      </div>
      {label && <span className="ml-3 text-sm">{label}</span>}
    </label>
  );
}

export default function SettingsPage() {
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
    <AdminLayout>
      <div className="space-y-6">
        {/* Notifications */}
        <SettingsSection
          title="Notifications"
          description="Configure how you want to receive alerts and updates"
          icon={BellIcon}
        >
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span>Email Notifications</span>
              <Toggle
                enabled={notifications.email}
                onChange={(enabled) =>
                  setNotifications({ ...notifications, email: enabled })
                }
              />
            </div>
            <div className="flex justify-between items-center">
              <span>Desktop Notifications</span>
              <Toggle
                enabled={notifications.desktop}
                onChange={(enabled) =>
                  setNotifications({ ...notifications, desktop: enabled })
                }
              />
            </div>
            <div className="flex justify-between items-center">
              <span>Care Gap Alerts</span>
              <Toggle
                enabled={notifications.careGaps}
                onChange={(enabled) =>
                  setNotifications({ ...notifications, careGaps: enabled })
                }
              />
            </div>
            <div className="flex justify-between items-center">
              <span>Risk Score Changes</span>
              <Toggle
                enabled={notifications.riskScores}
                onChange={(enabled) =>
                  setNotifications({ ...notifications, riskScores: enabled })
                }
              />
            </div>
          </div>
        </SettingsSection>

        {/* ETL Settings */}
        <SettingsSection
          title="Data Management"
          description="Configure ETL processes and data handling"
          icon={CloudArrowUpIcon}
        >
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <span className="block">Auto-refresh Star Schema</span>
                <span className="text-sm text-dark-text-secondary">
                  Automatically refresh analytics data daily
                </span>
              </div>
              <Toggle
                enabled={etl.autoRefresh}
                onChange={(enabled) => setEtl({ ...etl, autoRefresh: enabled })}
              />
            </div>
            <div className="flex justify-between items-center">
              <div>
                <span className="block">Daily Backup</span>
                <span className="text-sm text-dark-text-secondary">
                  Create daily backups of EDW data
                </span>
              </div>
              <Toggle
                enabled={etl.dailyBackup}
                onChange={(enabled) => setEtl({ ...etl, dailyBackup: enabled })}
              />
            </div>
            <div className="flex justify-between items-center">
              <div>
                <span className="block">Data Compression</span>
                <span className="text-sm text-dark-text-secondary">
                  Compress historical data to save space
                </span>
              </div>
              <Toggle
                enabled={etl.compression}
                onChange={(enabled) => setEtl({ ...etl, compression: enabled })}
              />
            </div>
          </div>
        </SettingsSection>

        {/* Schedule Settings */}
        <SettingsSection
          title="Schedule"
          description="Configure automated task scheduling"
          icon={ClockIcon}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="card bg-dark-primary">
                <h4 className="font-medium mb-2">ETL Schedule</h4>
                <select className="input">
                  <option value="daily">Daily at midnight</option>
                  <option value="weekly">Weekly on Sunday</option>
                  <option value="custom">Custom Schedule</option>
                </select>
              </div>
              <div className="card bg-dark-primary">
                <h4 className="font-medium mb-2">Report Generation</h4>
                <select className="input">
                  <option value="daily">Daily at 6 AM</option>
                  <option value="weekly">Weekly on Monday</option>
                  <option value="custom">Custom Schedule</option>
                </select>
              </div>
            </div>
          </div>
        </SettingsSection>

        {/* Security Settings */}
        <SettingsSection
          title="Security"
          description="Manage security settings and access controls"
          icon={KeyIcon}
        >
          <div className="space-y-4">
            <div className="card bg-dark-primary">
              <h4 className="font-medium mb-2">API Access</h4>
              <div className="flex items-center justify-between">
                <input
                  type="text"
                  value="sk_live_xxxxxxxxxxxxx"
                  readOnly
                  className="input flex-1 mr-4"
                />
                <button className="btn btn-secondary">Regenerate</button>
              </div>
            </div>
            <div className="card bg-dark-primary">
              <h4 className="font-medium mb-2">Two-Factor Authentication</h4>
              <button className="btn btn-primary">Enable 2FA</button>
            </div>
          </div>
        </SettingsSection>

        {/* Profile Settings */}
        <SettingsSection
          title="Profile"
          description="Update your profile information"
          icon={UserIcon}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium mb-1">
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  className="input"
                  defaultValue="Dr. John Doe"
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  className="input"
                  defaultValue="john.doe@example.com"
                />
              </div>
              <div>
                <label htmlFor="specialty" className="block text-sm font-medium mb-1">
                  Specialty
                </label>
                <input
                  id="specialty"
                  type="text"
                  className="input"
                  defaultValue="Primary Care"
                />
              </div>
              <div>
                <label htmlFor="npi" className="block text-sm font-medium mb-1">
                  NPI Number
                </label>
                <input
                  id="npi"
                  type="text"
                  className="input"
                  defaultValue="1234567890"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button className="btn btn-primary">Save Changes</button>
            </div>
          </div>
        </SettingsSection>
      </div>
    </AdminLayout>
  );
}
