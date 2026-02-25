// =============================================================================
// Medgnosis Web — App shell (sidebar + topbar layout)
// =============================================================================

import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  BarChart3,
  ListChecks,
  Bell,
  Settings,
  LogOut,
  Search,
  Menu,
} from 'lucide-react';
import { useAuthStore } from '../stores/auth.js';
import { useUiStore } from '../stores/ui.js';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/patients', icon: Users, label: 'Patients' },
  { to: '/measures', icon: BarChart3, label: 'Measures' },
  { to: '/care-lists', icon: ListChecks, label: 'Care Lists' },
  { to: '/alerts', icon: Bell, label: 'Alerts' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function AppShell() {
  const navigate = useNavigate();
  const { user, clearAuth } = useAuthStore();
  const { sidebarOpen, toggleSidebar, toggleSearch } = useUiStore();

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-16'
        } flex flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-200`}
      >
        <div className="flex items-center h-16 px-4 border-b border-gray-200 dark:border-gray-700">
          {sidebarOpen && (
            <span className="text-xl font-bold text-blue-600">Medgnosis</span>
          )}
        </div>

        <nav className="flex-1 py-4 space-y-1 px-2">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700/50'
                }`
              }
            >
              <Icon size={20} />
              {sidebarOpen && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700/50"
          >
            <LogOut size={20} />
            {sidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex items-center h-16 px-6 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <button onClick={toggleSidebar} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <Menu size={20} />
          </button>

          <button
            onClick={toggleSearch}
            className="ml-4 flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-sm text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <Search size={16} />
            <span>Search patients...</span>
            <kbd className="text-xs bg-gray-100 dark:bg-gray-600 px-1.5 py-0.5 rounded">Ctrl+K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-4">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {user?.first_name} {user?.last_name}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
