'use client';

import { HeroUIProvider } from "@heroui/system";
import { useRouter } from "next/navigation";
import type { ThemeProviderProps } from "next-themes";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import * as React from "react";

import { AuthProvider } from "@/lib/auth";

export interface ProvidersProps {
  children: React.ReactNode;
  themeProps?: ThemeProviderProps;
}

declare module "@react-types/shared" {
  interface RouterConfig {
    routerOptions: NonNullable<
      Parameters<ReturnType<typeof useRouter>["push"]>[1]
    >;
  }
}

export function Providers({ children, themeProps }: ProvidersProps) {
  const router = useRouter();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <HeroUIProvider navigate={router.push}>
      <NextThemesProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem={false}
        {...themeProps}
      >
        <AuthProvider>
          {children}
        </AuthProvider>
      </NextThemesProvider>
    </HeroUIProvider>
  );
}
