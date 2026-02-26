// =============================================================================
// Medgnosis — Patient Detail Page (Phase 10 — Tabbed Clinical Chart)
// PatientBanner + TabBar + 7 clinical tab views
// =============================================================================

import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api } from '../services/api.js';
import { usePatientMedications } from '../hooks/useApi.js';
import { PatientBanner } from '../components/patient/PatientBanner.js';
import { TabBar, type Tab } from '../components/patient/TabBar.js';
import { OverviewTab } from '../components/patient/OverviewTab.js';
import { EncountersTab } from '../components/patient/EncountersTab.js';
import { ConditionsTab } from '../components/patient/ConditionsTab.js';
import { MedicationsTab } from '../components/patient/MedicationsTab.js';
import { LabsVitalsTab } from '../components/patient/LabsVitalsTab.js';
import { AllergiesTab } from '../components/patient/AllergiesTab.js';
import { CareGapsTab } from '../components/patient/CareGapsTab.js';
import { AbbyTab } from '../components/patient/AbbyTab.js';
import { Sparkles } from 'lucide-react';

// ─── Types matching enhanced /patients/:id response ──────────────────────────

interface PatientDetail {
  id: number;
  first_name: string;
  last_name: string;
  mrn: string;
  date_of_birth: string;
  gender: string;
  race: string | null;
  ethnicity: string | null;
  primary_phone: string | null;
  email: string | null;
  active_ind: string;
  pcp: { name: string; specialty: string | null } | null;
  insurance: { payer_name: string; plan_type: string | null } | null;
  address: {
    address_line1: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  } | null;
  allergies: Array<{
    name: string;
    severity: string | null;
  }>;
  conditions: Array<{
    id: number;
    code: string;
    name: string;
    status: string;
    onset_date: string;
  }>;
  encounters: Array<{
    id: number;
    date: string;
    type: string;
    reason: string | null;
  }>;
  observations: Array<{
    id: number;
    name: string;
    value: string | null;
    unit: string | null;
    date: string;
  }>;
  care_gaps: Array<{
    id: number;
    measure: string | null;
    status: string;
    identified_date: string;
    resolved_date: string | null;
  }>;
}

// ─── Tab definitions ─────────────────────────────────────────────────────────

type TabId = 'overview' | 'encounters' | 'conditions' | 'medications' | 'labs' | 'allergies' | 'care-gaps' | 'abby';

// ─── Component ───────────────────────────────────────────────────────────────

export function PatientDetailPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const { data, isLoading, error } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => api.get<PatientDetail>(`/patients/${patientId}`),
    enabled: !!patientId,
  });

  // Pre-fetch medications for overview tab (also used for OverviewTab)
  const { data: medsData } = usePatientMedications(patientId);

  const patient = data?.data;

  // ── Loading skeleton ─────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-4 w-24 rounded" />
        <div className="surface flex items-center gap-5">
          <div className="skeleton w-14 h-14 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-7 w-56 rounded" />
            <div className="skeleton h-3 w-72 rounded" />
          </div>
        </div>
        <div className="skeleton h-10 rounded-card" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="surface space-y-3">
              <div className="skeleton h-4 w-32 rounded" />
              <div className="skeleton h-20 rounded-card" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Not found / error ────────────────────────────────────────────────────
  if (error || !patient) {
    return (
      <div className="space-y-4">
        <Link
          to="/patients"
          className="inline-flex items-center gap-1.5 text-xs text-ghost hover:text-dim transition-colors"
        >
          <ArrowLeft size={13} strokeWidth={1.5} />
          All Patients
        </Link>
        <div className="empty-state py-20">
          <p className="empty-state-title">Patient not found</p>
          <p className="empty-state-desc">
            No patient with ID {patientId} exists or you don't have access.
          </p>
        </div>
      </div>
    );
  }

  // ── Derived counts for tab badges ──────────────────────────────────────
  const openGaps = (patient.care_gaps ?? []).filter(
    (g) => ['open', 'identified'].includes(g.status?.toLowerCase() ?? ''),
  );

  const tabs: Array<Tab & { id: TabId }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'encounters', label: 'Encounters', count: (patient.encounters ?? []).length },
    { id: 'conditions', label: 'Conditions', count: (patient.conditions ?? []).length },
    { id: 'medications', label: 'Medications' },
    { id: 'labs', label: 'Labs & Vitals' },
    { id: 'allergies', label: 'Allergies', count: (patient.allergies ?? []).length },
    { id: 'care-gaps', label: 'Care Gaps', count: openGaps.length || undefined },
    { id: 'abby', label: 'Abby', icon: <Sparkles size={13} strokeWidth={1.5} className="text-violet" /> },
  ];

  const handleNewNote = () => {
    navigate(`/patients/${patientId}/encounter-note`);
  };

  return (
    <div className="space-y-4">
      {/* Back link */}
      <Link
        to="/patients"
        className="inline-flex items-center gap-1.5 text-xs text-ghost hover:text-dim transition-colors font-ui"
      >
        <ArrowLeft size={13} strokeWidth={1.5} />
        All Patients
      </Link>

      {/* Patient Banner */}
      <PatientBanner patient={patient} onNewNote={handleNewNote} />

      {/* Tab Bar */}
      <TabBar
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as TabId)}
      />

      {/* Active Tab Panel */}
      <div
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        className="animate-fade-up"
      >
        {activeTab === 'overview' && (
          <OverviewTab
            patientId={String(patient.id)}
            conditions={patient.conditions}
            encounters={patient.encounters}
            observations={patient.observations.map((o) => ({ ...o, code: o.name }))}
            careGaps={patient.care_gaps}
            medications={(medsData?.data as Array<{ id: number; name: string; dosage: string | null; frequency: string | null; status: string | null }> | undefined) ?? []}
            onTabChange={(id) => setActiveTab(id as TabId)}
          />
        )}
        {activeTab === 'encounters' && (
          <EncountersTab patientId={patientId!} />
        )}
        {activeTab === 'conditions' && (
          <ConditionsTab conditions={patient.conditions ?? []} />
        )}
        {activeTab === 'medications' && (
          <MedicationsTab patientId={patientId!} />
        )}
        {activeTab === 'labs' && (
          <LabsVitalsTab patientId={patientId!} />
        )}
        {activeTab === 'allergies' && (
          <AllergiesTab patientId={patientId!} />
        )}
        {activeTab === 'care-gaps' && (
          <CareGapsTab patientId={patientId!} />
        )}
        {activeTab === 'abby' && (
          <AbbyTab patientId={patientId!} />
        )}
      </div>
    </div>
  );
}
