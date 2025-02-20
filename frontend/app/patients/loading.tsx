import { MagnifyingGlassIcon, FunnelIcon } from '@heroicons/react/24/outline';

import AdminLayout from '@/components/layout/AdminLayout';

function LoadingPulse() {
  return <div className="animate-pulse bg-dark-secondary rounded h-4" />;
}

function LoadingTable() {
  return (
    <div className="table-container">
      <table className="table">
        <thead>
          <tr>
            <th>
              <div className="w-32">
                <LoadingPulse />
              </div>
            </th>
            <th>
              <div className="w-24">
                <LoadingPulse />
              </div>
            </th>
            <th>
              <div className="w-28">
                <LoadingPulse />
              </div>
            </th>
            <th>
              <div className="w-20">
                <LoadingPulse />
              </div>
            </th>
            <th>
              <div className="w-24">
                <LoadingPulse />
              </div>
            </th>
            <th>
              <div className="w-24">
                <LoadingPulse />
              </div>
            </th>
            <th>
              <div className="w-32">
                <LoadingPulse />
              </div>
            </th>
            <th>
              <div className="w-20">
                <LoadingPulse />
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {[...Array(10)].map((_, i) => (
            <tr key={i} className="hover:bg-dark-secondary/50">
              <td>
                <div className="w-32">
                  <LoadingPulse />
                </div>
              </td>
              <td>
                <div className="w-24">
                  <LoadingPulse />
                </div>
              </td>
              <td>
                <div className="w-28">
                  <LoadingPulse />
                </div>
              </td>
              <td>
                <div className="w-20">
                  <LoadingPulse />
                </div>
              </td>
              <td>
                <div className="w-16 h-6 rounded-full bg-dark-secondary animate-pulse" />
              </td>
              <td>
                <div className="w-16 h-6 rounded-full bg-dark-secondary animate-pulse" />
              </td>
              <td>
                <div className="w-32">
                  <LoadingPulse />
                </div>
              </td>
              <td>
                <div className="w-16 h-6 rounded-full bg-dark-secondary animate-pulse" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LoadingPatients() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="h-8 w-32">
            <LoadingPulse />
          </div>
          <div className="h-10 w-32 rounded-md bg-dark-secondary animate-pulse" />
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-dark-text-secondary" />
              <div className="h-10 w-full rounded-md bg-dark-secondary animate-pulse" />
            </div>
          </div>
          <div className="flex gap-4">
            <button className="btn btn-secondary" disabled>
              <FunnelIcon className="h-5 w-5 mr-2" />
              Filters
            </button>
            <div className="h-10 w-[150px] rounded-md bg-dark-secondary animate-pulse" />
          </div>
        </div>

        {/* Patient Table */}
        <LoadingTable />

        {/* Pagination */}
        <div className="flex items-center justify-between">
          <div className="w-48">
            <LoadingPulse />
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-24 rounded-md bg-dark-secondary animate-pulse" />
            <div className="h-10 w-24 rounded-md bg-dark-secondary animate-pulse" />
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
