'use client';

import AdminLayout from '../../components/layout/AdminLayout';

export default function Loading() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Time-based sections loading states */}
        {[1, 2, 3].map((section) => (
          <div key={section} className="panel-analytics animate-pulse">
            <div className="h-8 w-48 bg-dark-secondary/30 rounded mb-4" />
            <div className="space-y-4">
              {[1, 2, 3].map((item) => (
                <div key={item} className="panel-detail p-4">
                  <div className="flex justify-between items-start">
                    <div className="space-y-2">
                      <div className="h-5 w-32 bg-dark-secondary/30 rounded" />
                      <div className="h-4 w-24 bg-dark-secondary/30 rounded" />
                    </div>
                    <div className="h-8 w-8 bg-dark-secondary/30 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AdminLayout>
  );
}
