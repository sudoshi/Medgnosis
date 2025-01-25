'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import AdminLayout from '@/components/layout/AdminLayout';

const navigation = [
  { name: 'Quality Measures', href: '/measures' },
  { name: 'Cohort Creator', href: '/measures/cohort-creator' },
  { name: 'MIPS', href: '/measures/mips' },
  { name: 'Reports', href: '/measures/reports' },
];

export default function MeasuresLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AdminLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Sub Navigation */}
        <div className="border-b border-dark-border bg-dark-primary">
          <div className="px-6 py-3">
            <nav className="flex space-x-4">
              {navigation.map((item) => {
                const isActive =
                  item.href === '/measures'
                    ? pathname === '/measures'
                    : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      isActive
                        ? 'bg-accent-primary/10 text-accent-primary'
                        : 'text-dark-text-secondary hover:text-dark-text-primary hover:bg-dark-secondary'
                    }`}
                  >
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Page Content */}
        <div className="flex-1 overflow-hidden">{children}</div>
      </div>
    </AdminLayout>
  );
}
