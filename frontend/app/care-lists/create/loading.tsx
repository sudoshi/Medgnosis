import { ArrowLeftIcon } from '@heroicons/react/24/outline';

import AdminLayout from '@/components/layout/AdminLayout';

export default function LoadingCreateCareListPage() {
  return (
    <AdminLayout>
      <div className="min-h-screen bg-gradient-dark">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div>
            <div className="flex items-center text-dark-text-secondary mb-4">
              <ArrowLeftIcon className="h-4 w-4 mr-1" />
              Back
            </div>
            <div className="h-8 bg-dark-secondary rounded w-48 animate-pulse"></div>
            <div className="h-4 bg-dark-secondary rounded w-96 mt-2 animate-pulse"></div>
          </div>

          <div className="space-y-8 max-w-3xl">
            {/* Basic Information */}
            <div className="space-y-4">
              <div className="h-6 bg-dark-secondary rounded w-32 animate-pulse"></div>
              <div className="space-y-4">
                <div>
                  <div className="h-4 bg-dark-secondary rounded w-24 mb-2 animate-pulse"></div>
                  <div className="h-10 bg-dark-secondary rounded w-full animate-pulse"></div>
                </div>
                <div>
                  <div className="h-4 bg-dark-secondary rounded w-24 mb-2 animate-pulse"></div>
                  <div className="h-24 bg-dark-secondary rounded w-full animate-pulse"></div>
                </div>
                <div>
                  <div className="h-4 bg-dark-secondary rounded w-24 mb-2 animate-pulse"></div>
                  <div className="h-10 bg-dark-secondary rounded w-full animate-pulse"></div>
                </div>
              </div>
            </div>

            {/* Selected Measures */}
            <div className="space-y-4">
              <div className="h-6 bg-dark-secondary rounded w-40 animate-pulse"></div>
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div
                    key={i}
                    className="p-4 bg-dark-primary border border-dark-border rounded-lg"
                  >
                    <div className="flex items-start">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center space-x-2">
                          <div className="h-6 bg-dark-secondary rounded w-64 animate-pulse"></div>
                          <div className="h-5 bg-dark-secondary rounded w-24 animate-pulse"></div>
                        </div>
                        <div className="h-4 bg-dark-secondary rounded w-48 animate-pulse"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Submit */}
            <div className="pt-4">
              <div className="h-10 bg-dark-secondary rounded w-40 animate-pulse"></div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
