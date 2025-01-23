'use client';

import { Providers } from './providers';
import { AuthProvider } from '@/lib/auth';

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <AuthProvider>
        {children}
      </AuthProvider>
    </Providers>
  );
}
