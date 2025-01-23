'use client';

import { ReactNode, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  ChartBarIcon,
  UserGroupIcon,
  DocumentDuplicateIcon,
  CogIcon,
  ArrowLeftOnRectangleIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';

interface AdminLayoutProps {
  children: ReactNode;
}

interface NavItem {
  name: string;
  href: string;
  icon: typeof ChartBarIcon;
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: ChartBarIcon },
  { name: 'Patients', href: '/patients', icon: UserGroupIcon },
  { name: 'Data Management', href: '/data', icon: DocumentDuplicateIcon },
  { name: 'Settings', href: '/settings', icon: CogIcon },
];

export default function AdminLayout({ children }: AdminLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();

  // Force dark mode
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  const isActive = (href: string) => pathname.startsWith(href);

  return (
    <div className="min-h-screen bg-gradient-dark text-dark-text-primary">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-dark-border bg-dark-primary transition-transform">
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center justify-center border-b border-dark-border">
            <Image
              src="/images/acumenus-logo.png"
              alt="Acumenus Logo"
              width={150}
              height={40}
              className="object-contain"
            />
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-2 py-4">
            {navigation.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`group flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
                    active
                      ? 'bg-accent-primary bg-opacity-10 text-accent-primary shadow-glow'
                      : 'text-dark-text-secondary hover:bg-dark-secondary'
                  }`}
                >
                  <item.icon
                    className={`mr-3 h-5 w-5 flex-shrink-0 transition-colors ${
                      active ? 'text-accent-primary' : 'text-dark-text-secondary'
                    }`}
                    aria-hidden="true"
                  />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* User Section */}
          <div className="border-t border-dark-border p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-8 w-8 rounded-full bg-accent-primary bg-opacity-10 flex items-center justify-center">
                  <span className="text-accent-primary text-sm font-medium">JD</span>
                </div>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium">Dr. John Doe</p>
                <p className="text-xs text-dark-text-secondary">Primary Care</p>
              </div>
            </div>
            <button
              onClick={() => router.push('/login')}
              className="mt-4 flex w-full items-center rounded-lg px-3 py-2 text-sm text-dark-text-secondary hover:bg-dark-secondary"
            >
              <ArrowLeftOnRectangleIcon className="mr-2 h-5 w-5" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="pl-64">
        {/* Header */}
        <header className="sticky top-0 z-30 h-16 border-b border-dark-border bg-dark-primary/80 backdrop-blur">
          <div className="flex h-full items-center justify-between px-6">
            <h1 className="text-xl font-semibold">
              {navigation.find((item) => isActive(item.href))?.name || 'Dashboard'}
            </h1>
            <div className="flex items-center space-x-4">
              {/* Add header actions here */}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="min-h-[calc(100vh-4rem)] p-6 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
