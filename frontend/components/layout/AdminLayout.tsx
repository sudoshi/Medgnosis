"use client";

import type { ReactNode } from "react";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import {
  ChartBarSquareIcon,
  UserGroupIcon,
  UserIcon,
  BeakerIcon,
  CogIcon,
  ArrowLeftOnRectangleIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";

import { AbbyAssistant } from "../ai/AbbyAssistant";

interface AdminLayoutProps {
  children: ReactNode;
}

interface NavItem {
  name: string;
  href: string;
  icon: typeof ChartBarSquareIcon;
  children?: Array<{
    name: string;
    href: string;
  }>;
}

const navigation: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: ChartBarSquareIcon },
  { name: "Populations", href: "/populations", icon: UserGroupIcon },
  { name: "Patients", href: "/patients", icon: UserIcon },
  {
    name: "Measures Library",
    href: "/measures",
    icon: BeakerIcon,
    children: [
      { name: "Quality Measures", href: "/measures" },
      { name: "MIPS", href: "/measures/mips" },
      { name: "Reports", href: "/measures/reports" },
    ],
  },
  { name: "Care Lists", href: "/care-lists", icon: ClipboardDocumentListIcon },
  { name: "Anticipatory Care", href: "/anticipatory-care", icon: ClockIcon },
  { name: "Settings", href: "/settings", icon: CogIcon },
];

export default function AdminLayout({ children }: AdminLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();

  // Force dark mode
  useEffect(() => {
    document.documentElement.classList.add("dark");
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
              alt="Acumenus Logo"
              className="object-contain"
              height={40}
              src="/images/acumenus-logo.png"
              width={150}
            />
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-2 py-4">
            {navigation.map((item) => {
              const active = isActive(item.href);

              return (
                <div key={item.name}>
                  <Link
                    className={`group flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
                      active
                        ? "bg-accent-primary bg-opacity-10 text-accent-primary shadow-glow"
                        : "text-dark-text-secondary hover:bg-dark-secondary"
                    }`}
                    href={item.href}
                  >
                    <item.icon
                      aria-hidden="true"
                      className={`mr-3 h-5 w-5 flex-shrink-0 transition-colors ${
                        active
                          ? "text-accent-primary"
                          : "text-dark-text-secondary"
                      }`}
                    />
                    {item.name}
                  </Link>
                  {item.children && active && (
                    <div className="ml-8 mt-2 space-y-1">
                      {item.children.map((child) => (
                        <Link
                          key={child.name}
                          className={`block rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
                            pathname === child.href
                              ? "text-accent-primary"
                              : "text-dark-text-secondary hover:text-dark-text-primary hover:bg-dark-secondary"
                          }`}
                          href={child.href}
                        >
                          {child.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Abby Section */}
          <div className="border-t border-dark-border py-6">
            <div className="px-4">
              <AbbyAssistant />
            </div>
          </div>

          {/* User Section */}
          <div className="border-t border-dark-border p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-8 w-8 rounded-full bg-accent-primary bg-opacity-10 flex items-center justify-center">
                  <span className="text-accent-primary text-sm font-medium">
                    JD
                  </span>
                </div>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium">Dr. John Doe</p>
                <p className="text-xs text-dark-text-secondary">Primary Care</p>
              </div>
            </div>
            <button
              className="mt-4 flex w-full items-center rounded-lg px-3 py-2 text-sm text-dark-text-secondary hover:bg-dark-secondary"
              onClick={() => router.push("/login")}
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
              {navigation.find((item) => isActive(item.href))?.name ||
                "Dashboard"}
            </h1>
            <div className="flex items-center space-x-4">
              {/* Header actions */}
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
