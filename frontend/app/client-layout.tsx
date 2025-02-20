'use client';

import { AuthProvider } from '@/lib/auth';

import { Providers } from './providers';

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <AuthProvider>
        {children}
      </AuthProvider>
    </Providers>
  );
}
