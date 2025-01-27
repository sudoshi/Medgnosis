"use client";

import { useState } from "react";
import {
  BellIcon,
  KeyIcon,
  UserIcon,
  CogIcon,
  CloudArrowUpIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";

import AdminLayout from "@/components/layout/AdminLayout";

interface SettingsSectionProps {
  title: string;
  description: string;
  icon: typeof CogIcon;
  children: React.ReactNode;
}

function SettingsSection({
  title,
  description,
  icon: Icon,
  children,
}: SettingsSectionProps) {
  return (
    <div className="bg-light-primary dark:bg-dark-primary rounded-lg border border-light-border dark:border-dark-border p-6 shadow-md">
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
          checked={enabled}
          className="sr-only"
          type="checkbox"
          onChange={(e) => onChange(e.target.checked)}
        />
        <div
          className={`block w-14 h-8 rounded-full transition-colors ${
            enabled
              ? "bg-accent-primary"
              : "bg-light-border dark:bg-dark-border"
          }`}
        />
        <div
          className={`absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${
            enabled ? "translate-x-6" : "translate-x-0"
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
      <div className="h-full overflow-y-auto">
        <div className="space-y-6 p-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-light-text-primary dark:text-dark-text-primary">
              Settings
            </h1>
          </div>

          {/* Notifications */}
          <SettingsSection
            description="Configure how you want to receive alerts and updates"
            icon={BellIcon}
            title="Notifications"
          >
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-light-text-primary dark:text-dark-text-primary">
                  Email Notifications
                </span>
                <Toggle
                  enabled={notifications.email}
                  onChange={(enabled) =>
                    setNotifications({ ...notifications, email: enabled })
                  }
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-light-text-primary dark:text-dark-text-primary">
                  Desktop Notifications
                </span>
                <Toggle
                  enabled={notifications.desktop}
                  onChange={(enabled) =>
                    setNotifications({ ...notifications, desktop: enabled })
                  }
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-light-text-primary dark:text-dark-text-primary">
                  Care Gap Alerts
                </span>
                <Toggle
                  enabled={notifications.careGaps}
                  onChange={(enabled) =>
                    setNotifications({ ...notifications, careGaps: enabled })
                  }
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-light-text-primary dark:text-dark-text-primary">
                  Risk Score Changes
                </span>
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
            description="Configure ETL processes and data handling"
            icon={CloudArrowUpIcon}
            title="Data Management"
          >
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <span className="block text-light-text-primary dark:text-dark-text-primary">
                    Auto-refresh Star Schema
                  </span>
                  <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                    Automatically refresh analytics data daily
                  </span>
                </div>
                <Toggle
                  enabled={etl.autoRefresh}
                  onChange={(enabled) =>
                    setEtl({ ...etl, autoRefresh: enabled })
                  }
                />
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <span className="block text-light-text-primary dark:text-dark-text-primary">
                    Daily Backup
                  </span>
                  <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                    Create daily backups of EDW data
                  </span>
                </div>
                <Toggle
                  enabled={etl.dailyBackup}
                  onChange={(enabled) =>
                    setEtl({ ...etl, dailyBackup: enabled })
                  }
                />
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <span className="block text-light-text-primary dark:text-dark-text-primary">
                    Data Compression
                  </span>
                  <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                    Compress historical data to save space
                  </span>
                </div>
                <Toggle
                  enabled={etl.compression}
                  onChange={(enabled) =>
                    setEtl({ ...etl, compression: enabled })
                  }
                />
              </div>
            </div>
          </SettingsSection>

          {/* Schedule Settings */}
          <SettingsSection
            description="Configure automated task scheduling"
            icon={ClockIcon}
            title="Schedule"
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-light-secondary/50 dark:bg-dark-secondary/50 rounded-lg border border-light-border dark:border-dark-border p-4">
                  <h4 className="font-medium mb-2 text-light-text-primary dark:text-dark-text-primary">
                    ETL Schedule
                  </h4>
                  <select className="w-full px-4 py-2 rounded-lg bg-light-primary dark:bg-dark-primary text-light-text-primary dark:text-dark-text-primary border border-light-border dark:border-dark-border focus:outline-none focus:ring-2 focus:ring-accent-primary transition-colors">
                    <option value="daily">Daily at midnight</option>
                    <option value="weekly">Weekly on Sunday</option>
                    <option value="custom">Custom Schedule</option>
                  </select>
                </div>
                <div className="bg-light-secondary/50 dark:bg-dark-secondary/50 rounded-lg border border-light-border dark:border-dark-border p-4">
                  <h4 className="font-medium mb-2 text-light-text-primary dark:text-dark-text-primary">
                    Report Generation
                  </h4>
                  <select className="w-full px-4 py-2 rounded-lg bg-light-primary dark:bg-dark-primary text-light-text-primary dark:text-dark-text-primary border border-light-border dark:border-dark-border focus:outline-none focus:ring-2 focus:ring-accent-primary transition-colors">
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
            description="Manage security settings and access controls"
            icon={KeyIcon}
            title="Security"
          >
            <div className="space-y-4">
              <div className="bg-light-secondary/50 dark:bg-dark-secondary/50 rounded-lg border border-light-border dark:border-dark-border p-4">
                <h4 className="font-medium mb-2 text-light-text-primary dark:text-dark-text-primary">
                  API Access
                </h4>
                <div className="flex items-center justify-between">
                  <input
                    readOnly
                    className="flex-1 mr-4 px-4 py-2 rounded-lg bg-light-primary dark:bg-dark-primary text-light-text-primary dark:text-dark-text-primary border border-light-border dark:border-dark-border focus:outline-none focus:ring-2 focus:ring-accent-primary transition-colors"
                    type="text"
                    value="sk_live_xxxxxxxxxxxxx"
                  />
                  <button className="px-4 py-2 rounded-lg bg-light-secondary dark:bg-dark-secondary text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-primary dark:hover:text-dark-text-primary border border-light-border dark:border-dark-border transition-colors">
                    Regenerate
                  </button>
                </div>
              </div>
              <div className="bg-light-secondary/50 dark:bg-dark-secondary/50 rounded-lg border border-light-border dark:border-dark-border p-4">
                <h4 className="font-medium mb-2 text-light-text-primary dark:text-dark-text-primary">
                  Two-Factor Authentication
                </h4>
                <button className="px-4 py-2 rounded-lg bg-accent-primary text-white hover:bg-accent-primary/90 focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 dark:focus:ring-offset-dark-primary transition-all">
                  Enable 2FA
                </button>
              </div>
            </div>
          </SettingsSection>

          {/* Profile Settings */}
          <SettingsSection
            description="Update your profile information"
            icon={UserIcon}
            title="Profile"
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    className="block text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1"
                    htmlFor="name"
                  >
                    Name
                  </label>
                  <input
                    className="w-full px-4 py-2 rounded-lg bg-light-primary dark:bg-dark-primary text-light-text-primary dark:text-dark-text-primary border border-light-border dark:border-dark-border focus:outline-none focus:ring-2 focus:ring-accent-primary transition-colors"
                    defaultValue="Dr. John Doe"
                    id="name"
                    type="text"
                  />
                </div>
                <div>
                  <label
                    className="block text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1"
                    htmlFor="email"
                  >
                    Email
                  </label>
                  <input
                    className="w-full px-4 py-2 rounded-lg bg-light-primary dark:bg-dark-primary text-light-text-primary dark:text-dark-text-primary border border-light-border dark:border-dark-border focus:outline-none focus:ring-2 focus:ring-accent-primary transition-colors"
                    defaultValue="john.doe@example.com"
                    id="email"
                    type="email"
                  />
                </div>
                <div>
                  <label
                    className="block text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1"
                    htmlFor="specialty"
                  >
                    Specialty
                  </label>
                  <input
                    className="w-full px-4 py-2 rounded-lg bg-light-primary dark:bg-dark-primary text-light-text-primary dark:text-dark-text-primary border border-light-border dark:border-dark-border focus:outline-none focus:ring-2 focus:ring-accent-primary transition-colors"
                    defaultValue="Primary Care"
                    id="specialty"
                    type="text"
                  />
                </div>
                <div>
                  <label
                    className="block text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1"
                    htmlFor="npi"
                  >
                    NPI Number
                  </label>
                  <input
                    className="w-full px-4 py-2 rounded-lg bg-light-primary dark:bg-dark-primary text-light-text-primary dark:text-dark-text-primary border border-light-border dark:border-dark-border focus:outline-none focus:ring-2 focus:ring-accent-primary transition-colors"
                    defaultValue="1234567890"
                    id="npi"
                    type="text"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button className="px-4 py-2 rounded-lg bg-accent-primary text-white hover:bg-accent-primary/90 focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 dark:focus:ring-offset-dark-primary transition-all">
                  Save Changes
                </button>
              </div>
            </div>
          </SettingsSection>
        </div>
      </div>
    </AdminLayout>
  );
}
