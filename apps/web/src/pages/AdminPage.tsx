// =============================================================================
// Medgnosis Web — Admin Panel  (Clinical Obsidian v2)
// 5-tab admin interface: Dashboard | Users | FHIR | ETL & DB | Audit Log
// Access requires role === 'admin' — enforced at render time.
// =============================================================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAuthStore } from '../stores/auth.js';
import { ADMIN_TABS, type AdminTab } from './admin/helpers.js';
import { DashboardTab } from './admin/DashboardTab.js';
import { UsersTab } from './admin/UsersTab.js';
import { FhirTab } from './admin/FhirTab.js';
import { EhrIntegrationsTab } from './admin/EhrIntegrationsTab.js';
import { EtlTab } from './admin/EtlTab.js';
import { AuditTab } from './admin/AuditTab.js';

// ─── AdminPage ────────────────────────────────────────────────────────────────

export function AdminPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');

  // Role guard — redirect non-admins
  useEffect(() => {
    const role = (user as { role?: string } | null)?.role;
    if (user && role !== 'admin') {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  if ((user as { role?: string } | null)?.role !== 'admin') return null;

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <ShieldCheck size={20} className="text-[var(--primary)] flex-shrink-0" strokeWidth={1.5} />
        <div>
          <h1 className="text-2xl font-semibold text-bright">Admin Panel</h1>
          <p className="text-xs text-ghost mt-0.5">System administration and configuration</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-0.5 border-b border-edge/25">
        {ADMIN_TABS.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={[
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
                isActive
                  ? 'text-[var(--primary)] border-[var(--primary)]'
                  : 'text-ghost border-transparent hover:text-dim hover:border-edge/40',
              ].join(' ')}
            >
              <Icon size={14} strokeWidth={isActive ? 2 : 1.5} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'users'     && <UsersTab />}
        {activeTab === 'fhir'      && <FhirTab />}
        {activeTab === 'ehr'       && <EhrIntegrationsTab />}
        {activeTab === 'etl'       && <EtlTab />}
        {activeTab === 'audit'     && <AuditTab />}
      </div>
    </div>
  );
}
