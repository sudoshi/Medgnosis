import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

import AdminLayout from '@/components/layout/AdminLayout';

function LoadingPulse() {
  return <div className="animate-pulse bg-dark-secondary rounded h-4" />;
}

function LoadingCard({ className = '' }: { className?: string }) {
  return (
    <div className={`card ${className}`}>
      <div className="flex items-center space-x-4">
        <div className="rounded-lg bg-dark-secondary p-3 h-12 w-12" />
        <div className="flex-1 space-y-2">
          <LoadingPulse />
          <LoadingPulse />
        </div>
      </div>
    </div>
  );
}

function LoadingTimelineEvent() {
  return (
    <div className="relative pl-8">
      <div className="absolute left-0 top-1.5">
        <div className="h-3 w-3 rounded-full bg-dark-secondary" />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="w-1/3">
            <LoadingPulse />
          </div>
          <div className="w-24">
            <LoadingPulse />
          </div>
        </div>
        <LoadingPulse />
        <div className="w-20">
          <LoadingPulse />
        </div>
      </div>
    </div>
  );
}

function LoadingTimeline() {
  return (
    <div className="card">
      <div className="h-6 w-32 mb-6">
        <LoadingPulse />
      </div>
      <div className="space-y-8">
        {[...Array(4)].map((_, i) => (
          <LoadingTimelineEvent key={i} />
        ))}
      </div>
    </div>
  );
}

function LoadingRiskScore() {
  return (
    <div className="card">
      <div className="h-6 w-32 mb-6">
        <LoadingPulse />
      </div>
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-2">
          <div className="h-8 w-16">
            <LoadingPulse />
          </div>
          <div className="h-4 w-24">
            <LoadingPulse />
          </div>
        </div>
        <div className="h-16 w-16 rounded-full border-4 border-dark-secondary" />
      </div>
      <div className="space-y-4">
        <div className="h-4 w-24">
          <LoadingPulse />
        </div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex justify-between items-center">
            <div className="h-4 w-20">
              <LoadingPulse />
            </div>
            <div className="h-4 w-12">
              <LoadingPulse />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LoadingCareGaps() {
  return (
    <div className="card">
      <div className="h-6 w-32 mb-6">
        <LoadingPulse />
      </div>
      <div className="space-y-4">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="p-3 rounded-lg bg-dark-primary">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-4 w-32">
                  <LoadingPulse />
                </div>
                <div className="h-4 w-48">
                  <LoadingPulse />
                </div>
              </div>
              <div className="h-6 w-24">
                <LoadingPulse />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LoadingPatientDetail() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/patients" className="btn btn-secondary">
              <ArrowLeftIcon className="h-5 w-5" />
            </Link>
            <div className="space-y-2">
              <div className="h-8 w-48">
                <LoadingPulse />
              </div>
              <div className="h-4 w-32">
                <LoadingPulse />
              </div>
            </div>
          </div>
        </div>

        {/* Patient Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <LoadingCard key={i} />
          ))}
        </div>

        {/* Three Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-6 lg:col-span-2">
            <LoadingTimeline />
          </div>
          <div className="space-y-6">
            <LoadingRiskScore />
            <LoadingCareGaps />
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
