// =============================================================================
// Medgnosis Web — App Shell  (Clinical Obsidian v2)
// Sidebar (collapsible icon-rail) + Topbar + page outlet
// =============================================================================

import { Outlet, NavLink, useNavigate, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  BarChart3,
  ListChecks,
  Bell,
  Settings,
  LogOut,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '../stores/auth.js';
import { useUiStore } from '../stores/ui.js';

// ─── Nav configuration ────────────────────────────────────────────────────────

const mainNav = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/patients',  icon: Users,           label: 'Patients',  end: false },
  { to: '/measures',  icon: BarChart3,        label: 'Measures',  end: true },
  { to: '/care-lists',icon: ListChecks,       label: 'Care Lists',end: true },
  { to: '/alerts',    icon: Bell,             label: 'Alerts',    end: true },
] as const;

// ─── Avatar color — deterministic per user ────────────────────────────────────

const AVATAR_PALETTE = [
  'bg-teal/20 text-teal',
  'bg-violet/20 text-violet',
  'bg-amber/20 text-amber',
  'bg-emerald/20 text-emerald',
  'bg-crimson/20 text-crimson',
];

function avatarColor(seed: string) {
  const hash = seed.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

// ─── NavItem — single sidebar link ────────────────────────────────────────────

interface NavItemProps {
  to: string;
  icon: React.ElementType;
  label: string;
  end?: boolean;
  sidebarOpen: boolean;
}

function NavItem({ to, icon: Icon, label, end = true, sidebarOpen }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      title={!sidebarOpen ? label : undefined}
      className="block"
    >
      {({ isActive }) => (
        <span
          className={[
            'relative flex items-center rounded-card px-2.5 py-2.5 w-full transition-colors duration-150',
            isActive
              ? 'bg-s2 text-teal'
              : 'text-dim hover:bg-s2 hover:text-bright',
          ].join(' ')}
          style={isActive ? { boxShadow: 'inset 3px 0 0 #0DD9D9' } : undefined}
        >
          <Icon
            size={20}
            className="flex-shrink-0"
            strokeWidth={isActive ? 2 : 1.5}
          />
          {/* Label — slides in when sidebar is open */}
          <span
            className={[
              'ml-3 text-sm font-medium whitespace-nowrap overflow-hidden',
              'transition-all duration-200 ease-out',
              sidebarOpen
                ? 'max-w-[160px] opacity-100'
                : 'max-w-0 opacity-0',
            ].join(' ')}
          >
            {label}
          </span>
        </span>
      )}
    </NavLink>
  );
}

// ─── AppShell ─────────────────────────────────────────────────────────────────

export function AppShell() {
  const navigate = useNavigate();
  const { user, clearAuth } = useAuthStore();
  const { sidebarOpen, toggleSidebar, toggleSearch } = useUiStore();

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  // Derive user display info
  const initials = user
    ? `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase()
    : '?';
  const fullName  = user ? `${user.first_name} ${user.last_name}`.trim() : '';
  const userColor = avatarColor(user?.email ?? 'user');

  return (
    <div className="flex h-screen bg-void overflow-hidden">

      {/* ════════════════════════════════════════════════════════════
          SIDEBAR
          ════════════════════════════════════════════════════════════ */}
      <aside
        className={[
          'relative flex flex-col flex-shrink-0',
          'bg-s0 border-r border-edge/35',
          'transition-all duration-200 ease-out overflow-hidden',
          sidebarOpen ? 'w-[220px]' : 'w-[60px]',
        ].join(' ')}
      >
        {/* ── Logo / brand ────────────────────────────────────────── */}
        <div
          className="flex items-center h-14 px-3 border-b border-edge/25 cursor-pointer select-none flex-shrink-0"
          onClick={toggleSidebar}
          role="button"
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {/* MG monogram */}
          <div className="flex items-center justify-center w-8 h-8 rounded-card bg-teal/10 border border-teal/20 flex-shrink-0">
            <span className="font-ui font-bold text-xs text-teal leading-none tracking-tight">
              MG
            </span>
          </div>

          {/* Wordmark — visible only when expanded */}
          <span
            className={[
              'ml-3 font-ui font-semibold text-sm text-bright whitespace-nowrap',
              'overflow-hidden transition-all duration-200 ease-out',
              sidebarOpen ? 'max-w-[120px] opacity-100' : 'max-w-0 opacity-0',
            ].join(' ')}
          >
            Medgnosis
          </span>

          {/* Collapse/expand chevron — far right, visible on expand */}
          <span
            className={[
              'ml-auto text-ghost transition-all duration-200 ease-out flex-shrink-0',
              sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none',
            ].join(' ')}
          >
            {sidebarOpen ? (
              <ChevronLeft size={14} strokeWidth={1.5} />
            ) : (
              <ChevronRight size={14} strokeWidth={1.5} />
            )}
          </span>
        </div>

        {/* ── Main navigation ─────────────────────────────────────── */}
        <nav
          className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto scrollbar-hidden"
          aria-label="Main navigation"
        >
          {mainNav.map((item) => (
            <NavItem key={item.to} {...item} sidebarOpen={sidebarOpen} />
          ))}
        </nav>

        {/* ── Bottom section ──────────────────────────────────────── */}
        <div className="px-2 pt-3 pb-2 border-t border-edge/25 space-y-0.5 flex-shrink-0">
          {/* Settings */}
          <NavLink
            to="/settings"
            end
            title={!sidebarOpen ? 'Settings' : undefined}
            className="block"
          >
            {({ isActive }) => (
              <span
                className={[
                  'relative flex items-center rounded-card px-2.5 py-2.5 w-full transition-colors duration-150',
                  isActive
                    ? 'bg-s2 text-teal'
                    : 'text-dim hover:bg-s2 hover:text-bright',
                ].join(' ')}
                style={isActive ? { boxShadow: 'inset 3px 0 0 #0DD9D9' } : undefined}
              >
                <Settings size={20} className="flex-shrink-0" strokeWidth={isActive ? 2 : 1.5} />
                <span
                  className={[
                    'ml-3 text-sm font-medium whitespace-nowrap overflow-hidden',
                    'transition-all duration-200 ease-out',
                    sidebarOpen ? 'max-w-[160px] opacity-100' : 'max-w-0 opacity-0',
                  ].join(' ')}
                >
                  Settings
                </span>
              </span>
            )}
          </NavLink>

          {/* Logout */}
          <button
            onClick={handleLogout}
            title={!sidebarOpen ? 'Sign out' : undefined}
            className="flex items-center rounded-card px-2.5 py-2.5 w-full text-dim hover:bg-s2 hover:text-bright transition-colors duration-150"
          >
            <LogOut size={20} className="flex-shrink-0" strokeWidth={1.5} />
            <span
              className={[
                'ml-3 text-sm font-medium whitespace-nowrap overflow-hidden',
                'transition-all duration-200 ease-out',
                sidebarOpen ? 'max-w-[160px] opacity-100' : 'max-w-0 opacity-0',
              ].join(' ')}
            >
              Sign out
            </span>
          </button>
        </div>

        {/* ── User avatar ─────────────────────────────────────────── */}
        <div className="px-2 pb-3 pt-2 border-t border-edge/25 flex-shrink-0">
          <div className="flex items-center px-2.5 py-2 rounded-card">
            {/* Avatar circle */}
            <div
              className={[
                'flex-shrink-0 flex items-center justify-center',
                'w-7 h-7 rounded-full text-xs font-semibold font-ui',
                userColor,
              ].join(' ')}
              aria-label={fullName}
            >
              {initials}
            </div>

            {/* Name + role — slides in with sidebar */}
            <div
              className={[
                'ml-2.5 overflow-hidden transition-all duration-200 ease-out min-w-0',
                sidebarOpen ? 'max-w-[140px] opacity-100' : 'max-w-0 opacity-0',
              ].join(' ')}
            >
              <p className="text-xs font-medium text-bright whitespace-nowrap truncate leading-tight">
                {fullName}
              </p>
              <p className="text-xs text-ghost whitespace-nowrap truncate leading-tight capitalize">
                {(user as any)?.role ?? 'Clinician'}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* ════════════════════════════════════════════════════════════
          MAIN COLUMN  (topbar + content)
          ════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* ── Topbar ──────────────────────────────────────────────── */}
        <header className="flex items-center h-14 px-4 gap-4 bg-void/90 backdrop-blur-md border-b border-edge/35 flex-shrink-0 z-10">

          {/* Search trigger — styled as an input field */}
          <button
            onClick={toggleSearch}
            className={[
              'flex items-center gap-2 h-9 px-3 rounded-input text-left',
              'bg-s0 border border-edge/50 text-ghost',
              'hover:border-edge/75 hover:text-dim',
              'transition-colors duration-150 cursor-text',
              'flex-1 max-w-sm',
            ].join(' ')}
            aria-label="Search patients"
            aria-haspopup="dialog"
          >
            <Search size={14} strokeWidth={1.5} className="flex-shrink-0" />
            <span className="flex-1 text-sm font-ui">Search patients...</span>
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded border border-edge/40 font-data text-[10px] text-ghost bg-s1 leading-none">
              ⌘K
            </kbd>
          </button>

          {/* Push right */}
          <div className="flex-1" />

          {/* Live WebSocket indicator */}
          <div
            className="hidden sm:flex items-center gap-1.5"
            aria-label="Real-time connection active"
          >
            <span className="live-dot" aria-hidden="true" />
            <span className="text-xs font-ui text-ghost">Live</span>
          </div>

          {/* Alerts shortcut */}
          <Link
            to="/alerts"
            className="p-2 rounded-card text-dim hover:text-bright hover:bg-s1 transition-colors duration-150"
            aria-label="View alerts"
            title="Alerts"
          >
            <Bell size={18} strokeWidth={1.5} />
          </Link>

          {/* User display name */}
          <span className="hidden md:block text-sm font-ui text-dim select-none">
            {fullName}
          </span>
        </header>

        {/* ── Page content ────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto bg-void scrollbar-thin" id="main-content">
          <div className="p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
