import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from './components/ui/sonner.js';
import { AuthGuard } from './components/AuthGuard.js';
import { AppShell } from './components/AppShell.js';
import { CommandPalette } from './components/CommandPalette.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { useTheme } from './hooks/useTheme.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { useAlertSocket } from './hooks/useAlertSocket.js';
import { useUiStore } from './stores/ui.js';

const LoginPage = lazy(() => import('./pages/LoginPage.js').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('./pages/RegisterPage.js').then((m) => ({ default: m.RegisterPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage.js').then((m) => ({ default: m.DashboardPage })));
const PatientsPage = lazy(() => import('./pages/PatientsPage.js').then((m) => ({ default: m.PatientsPage })));
const PatientDetailPage = lazy(() => import('./pages/PatientDetailPage.js').then((m) => ({ default: m.PatientDetailPage })));
const EncounterNotePage = lazy(() => import('./pages/EncounterNotePage.js').then((m) => ({ default: m.EncounterNotePage })));
const MeasuresPage = lazy(() => import('./pages/MeasuresPage.js').then((m) => ({ default: m.MeasuresPage })));
const BundlesPage = lazy(() => import('./pages/BundlesPage.js').then((m) => ({ default: m.BundlesPage })));
const CareListsPage = lazy(() => import('./pages/CareListsPage.js').then((m) => ({ default: m.CareListsPage })));
const PopulationFinderPage = lazy(() => import('./pages/PopulationFinderPage.js').then((m) => ({ default: m.PopulationFinderPage })));
const CloseTheLoopPage = lazy(() => import('./pages/CloseTheLoopPage.js').then((m) => ({ default: m.CloseTheLoopPage })));
const AnticipatoryPage = lazy(() => import('./pages/AnticipatoryPage.js').then((m) => ({ default: m.AnticipatoryPage })));
const SurveillancePage = lazy(() => import('./pages/SurveillancePage.js').then((m) => ({ default: m.SurveillancePage })));
const SuperNotePage = lazy(() => import('./pages/SuperNotePage.js').then((m) => ({ default: m.SuperNotePage })));
const DataQualityPage = lazy(() => import('./pages/DataQualityPage.js').then((m) => ({ default: m.DataQualityPage })));
const CohortManagerPage = lazy(() => import('./pages/CohortManagerPage.js').then((m) => ({ default: m.CohortManagerPage })));
const CodingPage = lazy(() => import('./pages/CodingPage.js').then((m) => ({ default: m.CodingPage })));
const AlertsPage = lazy(() => import('./pages/AlertsPage.js').then((m) => ({ default: m.AlertsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage.js').then((m) => ({ default: m.SettingsPage })));
const AdminPage = lazy(() => import('./pages/AdminPage.js').then((m) => ({ default: m.AdminPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.js').then((m) => ({ default: m.NotFoundPage })));

function AppProviders({ children }: { children: ReactNode }) {
  useTheme();
  const toggleSearch = useUiStore((s) => s.toggleSearch);
  useKeyboardShortcuts({ onSearch: toggleSearch });
  useAlertSocket();
  return <>{children}</>;
}

export function App() {
  return (
    <AppProviders>
      <Toaster />
      <CommandPalette />
      <ErrorBoundary>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-s0">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        }
      >
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Protected - requires authenticated session */}
          <Route element={<AuthGuard />}>
            <Route element={<AppShell />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/patients" element={<PatientsPage />} />
              <Route path="/patients/:patientId" element={<PatientDetailPage />} />
              <Route path="/patients/:patientId/encounter-note" element={<EncounterNotePage />} />
              <Route path="/patients/:patientId/supernote" element={<SuperNotePage />} />
              <Route path="/measures" element={<MeasuresPage />} />
              <Route path="/bundles" element={<BundlesPage />} />
              <Route path="/care-lists" element={<CareListsPage />} />
              <Route path="/population-finder" element={<PopulationFinderPage />} />
              <Route path="/close-the-loop" element={<CloseTheLoopPage />} />
              <Route path="/anticipatory" element={<AnticipatoryPage />} />
              <Route path="/surveillance" element={<SurveillancePage />} />
              <Route path="/data-quality" element={<DataQualityPage />} />
              <Route path="/cohorts" element={<CohortManagerPage />} />
              <Route path="/coding" element={<CodingPage />} />
              <Route path="/alerts" element={<AlertsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/admin" element={<AdminPage />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
      </ErrorBoundary>
    </AppProviders>
  );
}
