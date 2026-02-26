// =============================================================================
// Medgnosis — Patient Banner (sticky clinical header)
// Shows demographics, allergies, PCP, insurance at a glance
// =============================================================================

import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Shield,
  UserCheck,
  AlertTriangle,
  FileText,
} from 'lucide-react';
import { formatDate, calcAge } from '../../utils/time.js';
import { PatientAvatar, getInitialsFromParts } from '../PatientAvatar.js';

interface AllergyBrief {
  name: string;
  severity: string | null;
}

interface PatientBannerProps {
  patient: {
    id: number;
    first_name: string;
    last_name: string;
    mrn: string;
    date_of_birth: string;
    gender: string;
    race?: string | null;
    ethnicity?: string | null;
    primary_phone?: string | null;
    email?: string | null;
    pcp?: { name: string; specialty?: string | null; phone?: string | null } | null;
    insurance?: { payer_name?: string | null; plan_type?: string | null; payer?: string | null; policy?: string | null } | null;
    address?: { address_line1?: string | null; line1?: string | null; city?: string | null; state?: string | null; zip?: string | null } | null;
    allergies?: AllergyBrief[];
  };
  onNewNote?: () => void;
}

function formatGender(g: string) {
  if (!g) return '—';
  if (g.toUpperCase().startsWith('M')) return 'Male';
  if (g.toUpperCase().startsWith('F')) return 'Female';
  return g;
}

function allergySeverityBadge(severity: string | null) {
  const s = (severity || '').toLowerCase();
  if (s === 'severe' || s === 'high') return 'badge-crimson';
  if (s === 'moderate' || s === 'medium') return 'badge-amber';
  if (s === 'mild' || s === 'low') return 'badge-teal';
  return 'badge-dim';
}

export function PatientBanner({ patient, onNewNote }: PatientBannerProps) {
  const initials = getInitialsFromParts(patient.first_name, patient.last_name);
  const age = calcAge(patient.date_of_birth);
  const gender = formatGender(patient.gender);
  const allergies = patient.allergies ?? [];

  return (
    <div className="space-y-3">
      {/* Back link */}
      <Link
        to="/patients"
        className="inline-flex items-center gap-1.5 text-xs text-ghost hover:text-dim transition-colors font-ui"
      >
        <ArrowLeft size={13} strokeWidth={1.5} />
        All Patients
      </Link>

      {/* Main banner */}
      <div className="surface animate-fade-up stagger-1">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <PatientAvatar initials={initials} seed={patient.id} size="lg" />

          {/* Name + demographics row */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-bright leading-tight">
                {patient.last_name}, {patient.first_name}
              </h1>
              {onNewNote && (
                <button
                  onClick={onNewNote}
                  className="btn-secondary btn-sm gap-1.5"
                >
                  <FileText size={13} strokeWidth={1.5} />
                  New Note
                </button>
              )}
            </div>

            {/* Demographics strip */}
            <div className="flex flex-wrap items-center gap-x-0 gap-y-1 mt-1 text-sm text-dim">
              <span className="font-data text-xs tabular-nums">MRN {patient.mrn}</span>
              <span className="mx-1.5 text-ghost">·</span>
              <span>{gender}</span>
              {age !== null && (
                <>
                  <span className="mx-1.5 text-ghost">·</span>
                  <span className="font-data text-xs tabular-nums">{age} yrs</span>
                </>
              )}
              <span className="mx-1.5 text-ghost">·</span>
              <span className="text-ghost text-xs">DOB</span>
              <span className="ml-1 font-data text-xs tabular-nums">
                {formatDate(patient.date_of_birth)}
              </span>
              {patient.race && (
                <>
                  <span className="mx-1.5 text-ghost">·</span>
                  <span className="text-xs">{patient.race}</span>
                </>
              )}
            </div>

            {/* Info row: PCP, Insurance, Contact, Address */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-dim">
              {patient.pcp && (
                <span className="inline-flex items-center gap-1.5">
                  <UserCheck size={12} strokeWidth={1.5} className="text-teal" />
                  <span className="text-bright font-medium">{patient.pcp.name}</span>
                  {patient.pcp.specialty && (
                    <span className="text-ghost">({patient.pcp.specialty})</span>
                  )}
                </span>
              )}
              {patient.insurance && (patient.insurance.payer_name || patient.insurance.payer) && (
                <span className="inline-flex items-center gap-1.5">
                  <Shield size={12} strokeWidth={1.5} className="text-violet" />
                  <span>{patient.insurance.payer_name ?? patient.insurance.payer}</span>
                  {patient.insurance.plan_type && (
                    <span className="text-ghost">({patient.insurance.plan_type})</span>
                  )}
                </span>
              )}
              {patient.primary_phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone size={12} strokeWidth={1.5} className="text-ghost" />
                  <span className="font-data tabular-nums">{patient.primary_phone}</span>
                </span>
              )}
              {patient.email && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail size={12} strokeWidth={1.5} className="text-ghost" />
                  <span className="truncate max-w-[200px]">{patient.email}</span>
                </span>
              )}
              {patient.address && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={12} strokeWidth={1.5} className="text-ghost" />
                  <span>{patient.address.city}, {patient.address.state} {patient.address.zip}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Allergy bar */}
        {allergies.length > 0 && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-edge/20">
            <AlertTriangle size={13} strokeWidth={1.5} className="text-amber flex-shrink-0" />
            <span className="text-xs text-amber font-medium flex-shrink-0">Allergies:</span>
            <div className="flex flex-wrap gap-1.5 overflow-x-auto scrollbar-hidden">
              {allergies.map((a, i) => (
                <span key={i} className={allergySeverityBadge(a.severity)}>
                  {a.name}
                  {a.severity && (
                    <span className="ml-1 opacity-60">({a.severity})</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
        {allergies.length === 0 && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-edge/20">
            <span className="text-xs text-emerald font-medium">NKDA (No Known Drug Allergies)</span>
          </div>
        )}
      </div>
    </div>
  );
}
