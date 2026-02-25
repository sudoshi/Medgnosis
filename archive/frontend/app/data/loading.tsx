import {
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';

import AdminLayout from '@/components/layout/AdminLayout';

function LoadingPulse() {
  return <div className="animate-pulse bg-dark-secondary rounded h-4" />;
}

function LoadingImportSection() {
  return (
    <div className="card">
      <div className="h-6 w-32 mb-6">
        <LoadingPulse />
      </div>

      {/* Import Form */}
      <div className="p-4 border border-dashed border-dark-border rounded-lg bg-dark-primary">
        <div className="flex items-center justify-center">
          <div className="flex flex-col items-center">
            <ArrowUpTrayIcon className="h-12 w-12 text-dark-text-secondary" />
            <div className="mt-2 w-48">
              <LoadingPulse />
            </div>
          </div>
        </div>
      </div>

      {/* Import Options */}
      <div className="mt-4 flex items-center space-x-4">
        <div className="w-32 h-10 rounded-md bg-dark-secondary animate-pulse" />
        <div className="w-48 h-10 rounded-md bg-dark-secondary animate-pulse" />
      </div>

      {/* Recent Jobs */}
      <div className="mt-6">
        <div className="h-5 w-28 mb-4">
          <LoadingPulse />
        </div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-3 rounded-lg bg-dark-primary"
            >
              <div className="flex items-center space-x-3">
                <DocumentTextIcon className="h-5 w-5 text-dark-text-secondary" />
                <div className="space-y-2">
                  <div className="w-32">
                    <LoadingPulse />
                  </div>
                  <div className="w-48">
                    <LoadingPulse />
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <div className="w-24">
                  <LoadingPulse />
                </div>
                <div className="w-24 h-2 rounded-full bg-dark-secondary animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LoadingExportSection() {
  return (
    <div className="card">
      <div className="h-6 w-32 mb-6">
        <LoadingPulse />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="h-10 rounded-md bg-dark-secondary animate-pulse flex items-center justify-center"
          >
            <ArrowDownTrayIcon className="h-5 w-5 text-dark-text-secondary" />
          </div>
        ))}
      </div>

      <div className="mt-6">
        <div className="h-5 w-36 mb-4">
          <LoadingPulse />
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg bg-dark-primary">
            <div className="flex items-center space-x-3">
              <DocumentTextIcon className="h-5 w-5 text-dark-text-secondary" />
              <div className="space-y-2">
                <div className="w-48">
                  <LoadingPulse />
                </div>
                <div className="w-32">
                  <LoadingPulse />
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-16 h-6 rounded-full bg-dark-secondary animate-pulse" />
              <div className="w-24 h-8 rounded-md bg-dark-secondary animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoadingData() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <LoadingImportSection />
        <LoadingExportSection />
      </div>
    </AdminLayout>
  );
}
