import AdminLayout from '@/components/layout/AdminLayout';

function StatCardSkeleton() {
  return (
    <div className="stat-panel animate-pulse">
      <div className="flex items-start justify-between">
        <div className="space-y-3 flex-1">
          <div className="h-4 bg-dark-secondary rounded w-1/3"></div>
          <div className="h-8 bg-dark-secondary rounded w-1/2"></div>
          <div className="h-4 bg-dark-secondary rounded w-1/4"></div>
        </div>
        <div className="rounded-lg bg-dark-secondary h-12 w-12"></div>
      </div>
    </div>
  );
}

function CareListCardSkeleton() {
  return (
    <div className="w-full p-4 rounded-lg bg-dark-primary border border-dark-border animate-pulse">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-4">
          <div className="flex items-center space-x-2">
            <div className="h-6 bg-dark-secondary rounded w-1/4"></div>
            <div className="h-5 bg-dark-secondary rounded-full w-24"></div>
          </div>
          <div className="h-4 bg-dark-secondary rounded w-3/4"></div>
          <div className="flex items-center space-x-4">
            <div className="h-4 bg-dark-secondary rounded w-24"></div>
            <div className="h-4 bg-dark-secondary rounded w-24"></div>
            <div className="h-4 bg-dark-secondary rounded w-24"></div>
          </div>
          <div className="flex items-center space-x-2">
            <div className="h-5 bg-dark-secondary rounded-full w-16"></div>
            <div className="h-5 bg-dark-secondary rounded-full w-16"></div>
            <div className="h-5 bg-dark-secondary rounded-full w-16"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoadingCareListsPage() {
  return (
    <AdminLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div className="h-8 bg-dark-secondary rounded w-48 animate-pulse"></div>
          <div className="h-10 bg-dark-secondary rounded w-32 animate-pulse"></div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="h-10 bg-dark-secondary rounded w-full animate-pulse"></div>
          </div>
          <div className="flex gap-4">
            <div className="h-10 bg-dark-secondary rounded w-24 animate-pulse"></div>
            <div className="h-10 bg-dark-secondary rounded w-32 animate-pulse"></div>
          </div>
        </div>

        {/* Care Lists Grid */}
        <div className="grid grid-cols-1 gap-4">
          <CareListCardSkeleton />
          <CareListCardSkeleton />
          <CareListCardSkeleton />
          <CareListCardSkeleton />
        </div>
      </div>
    </AdminLayout>
  );
}
