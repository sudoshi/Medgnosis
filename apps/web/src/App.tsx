import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { PatientsPage } from './pages/PatientsPage.js';
import { PatientDetailPage } from './pages/PatientDetailPage.js';
import { MeasuresPage } from './pages/MeasuresPage.js';
import { CareListsPage } from './pages/CareListsPage.js';
import { AlertsPage } from './pages/AlertsPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';
import { AuthGuard } from './components/AuthGuard.js';
import { AppShell } from './components/AppShell.js';
import { GlobalSearch } from './components/GlobalSearch.js';
import { useTheme } from './hooks/useTheme.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { useAlertSocket } from './hooks/useAlertSocket.js';

function AppProviders({ children }: { children: React.ReactNode }) {
  useTheme();
  useKeyboardShortcuts();
  useAlertSocket();
  return <>{children}</>;
}

export function App() {
  return (
    <AppProviders>
      <GlobalSearch />
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected — requires authenticated session */}
        <Route element={<AuthGuard />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/patients" element={<PatientsPage />} />
            <Route path="/patients/:patientId" element={<PatientDetailPage />} />
            <Route path="/measures" element={<MeasuresPage />} />
            <Route path="/care-lists" element={<CareListsPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppProviders>
  );
}
