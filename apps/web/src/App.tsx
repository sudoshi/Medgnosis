import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { PatientsPage } from './pages/PatientsPage.js';
import { PatientDetailPage } from './pages/PatientDetailPage.js';
import { EncounterNotePage } from './pages/EncounterNotePage.js';
import { MeasuresPage } from './pages/MeasuresPage.js';
import { BundlesPage } from './pages/BundlesPage.js';
import { CareListsPage } from './pages/CareListsPage.js';
import { PopulationFinderPage } from './pages/PopulationFinderPage.js';
import { CloseTheLoopPage } from './pages/CloseTheLoopPage.js';
import { AnticipatoryPage } from './pages/AnticipatoryPage.js';
import { AlertsPage } from './pages/AlertsPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { AdminPage } from './pages/AdminPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';
import { AuthGuard } from './components/AuthGuard.js';
import { AppShell } from './components/AppShell.js';
import { CommandPalette } from './components/CommandPalette.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { useTheme } from './hooks/useTheme.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { useAlertSocket } from './hooks/useAlertSocket.js';
import { useUiStore } from './stores/ui.js';

function AppProviders({ children }: { children: React.ReactNode }) {
  useTheme();
  const toggleSearch = useUiStore((s) => s.toggleSearch);
  useKeyboardShortcuts({ onSearch: toggleSearch });
  useAlertSocket();
  return <>{children}</>;
}

export function App() {
  return (
    <AppProviders>
      <CommandPalette />
      <ErrorBoundary>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Protected — requires authenticated session */}
        <Route element={<AuthGuard />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/patients" element={<PatientsPage />} />
            <Route path="/patients/:patientId" element={<PatientDetailPage />} />
            <Route path="/patients/:patientId/encounter-note" element={<EncounterNotePage />} />
            <Route path="/measures" element={<MeasuresPage />} />
            <Route path="/bundles" element={<BundlesPage />} />
            <Route path="/care-lists" element={<CareListsPage />} />
            <Route path="/population-finder" element={<PopulationFinderPage />} />
            <Route path="/close-the-loop" element={<CloseTheLoopPage />} />
            <Route path="/anticipatory" element={<AnticipatoryPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </ErrorBoundary>
    </AppProviders>
  );
}
