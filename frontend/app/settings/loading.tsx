import AdminLayout from '@/components/layout/AdminLayout';
import {
  BellIcon,
  KeyIcon,
  UserIcon,
  CloudArrowUpIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

function LoadingPulse() {
  return <div className="animate-pulse bg-dark-secondary rounded h-4" />;
}

interface LoadingSectionProps {
  icon: typeof BellIcon;
  items?: number;
}

function LoadingSection({ icon: Icon, items = 4 }: LoadingSectionProps) {
  return (
    <div className="card">
      <div className="flex items-start space-x-4">
        <div className="rounded-lg bg-accent-primary/10 p-3">
          <Icon className="h-6 w-6 text-accent-primary" />
        </div>
        <div className="flex-1">
          <div className="w-32 mb-1">
            <LoadingPulse />
          </div>
          <div className="w-64 mb-6">
            <LoadingPulse />
          </div>
          <div className="space-y-4">
            {[...Array(items)].map((_, i) => (
              <div key={i} className="flex justify-between items-center">
                <div className="w-48">
                  <LoadingPulse />
                </div>
                <div className="w-16 h-8 rounded-full bg-dark-secondary animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingProfileSection() {
  return (
    <div className="card">
      <div className="flex items-start space-x-4">
        <div className="rounded-lg bg-accent-primary/10 p-3">
          <UserIcon className="h-6 w-6 text-accent-primary" />
        </div>
        <div className="flex-1">
          <div className="w-32 mb-1">
            <LoadingPulse />
          </div>
          <div className="w-64 mb-6">
            <LoadingPulse />
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="w-24">
                    <LoadingPulse />
                  </div>
                  <div className="h-10 rounded-md bg-dark-secondary animate-pulse" />
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <div className="w-32 h-10 rounded-md bg-dark-secondary animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingScheduleSection() {
  return (
    <div className="card">
      <div className="flex items-start space-x-4">
        <div className="rounded-lg bg-accent-primary/10 p-3">
          <ClockIcon className="h-6 w-6 text-accent-primary" />
        </div>
        <div className="flex-1">
          <div className="w-32 mb-1">
            <LoadingPulse />
          </div>
          <div className="w-64 mb-6">
            <LoadingPulse />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="card bg-dark-primary space-y-2">
                <div className="w-32">
                  <LoadingPulse />
                </div>
                <div className="h-10 rounded-md bg-dark-secondary animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingSecuritySection() {
  return (
    <div className="card">
      <div className="flex items-start space-x-4">
        <div className="rounded-lg bg-accent-primary/10 p-3">
          <KeyIcon className="h-6 w-6 text-accent-primary" />
        </div>
        <div className="flex-1">
          <div className="w-32 mb-1">
            <LoadingPulse />
          </div>
          <div className="w-64 mb-6">
            <LoadingPulse />
          </div>
          <div className="space-y-4">
            <div className="card bg-dark-primary">
              <div className="w-24 mb-2">
                <LoadingPulse />
              </div>
              <div className="flex items-center space-x-4">
                <div className="flex-1 h-10 rounded-md bg-dark-secondary animate-pulse" />
                <div className="w-32 h-10 rounded-md bg-dark-secondary animate-pulse" />
              </div>
            </div>
            <div className="card bg-dark-primary">
              <div className="w-48 mb-2">
                <LoadingPulse />
              </div>
              <div className="w-32 h-10 rounded-md bg-dark-secondary animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoadingSettings() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <LoadingSection icon={BellIcon} items={4} />
        <LoadingSection icon={CloudArrowUpIcon} items={3} />
        <LoadingScheduleSection />
        <LoadingSecuritySection />
        <LoadingProfileSection />
      </div>
    </AdminLayout>
  );
}
