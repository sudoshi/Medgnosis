// =============================================================================
// Dashboard — Shared helpers & small components
// =============================================================================

import { TrendingUp, TrendingDown } from 'lucide-react';

// ─── Constants ───────────────────────────────────────────────────────────────

export const RISK_BAR_COLOR: Record<string, string> = {
  critical: 'progress-crimson',
  high:     'progress-amber',
  moderate: 'progress-teal',
  low:      'progress-emerald',
};

// ─── TrendBadge ──────────────────────────────────────────────────────────────

export function TrendBadge({ value, label }: { value: number; label: string }) {
  if (value === 0) return <span className="text-xs text-ghost">{label}</span>;
  const up = value > 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${up ? 'text-emerald' : 'text-crimson'}`}>
      {up ? (
        <TrendingUp size={11} strokeWidth={2} aria-hidden="true" />
      ) : (
        <TrendingDown size={11} strokeWidth={2} aria-hidden="true" />
      )}
      <span className="font-data tabular-nums">{Math.abs(value)}%</span>
      <span className="text-ghost">{label}</span>
    </span>
  );
}

// ─── SectionDivider ──────────────────────────────────────────────────────────

export function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span className="text-xs font-semibold tracking-widest uppercase text-ghost whitespace-nowrap">
        {label}
      </span>
      <div
        className="flex-1 h-px"
        style={{ background: 'linear-gradient(90deg, rgba(30,68,120,0.55) 0%, transparent 100%)' }}
      />
    </div>
  );
}

// ─── Mock schedule ───────────────────────────────────────────────────────────

export const USE_MOCK_SCHEDULE = true;

function todayAt(h: number, m: number): string {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

export const MOCK_SCHEDULE = [
  { id: 1001, patient_id: 903,  patient_name: 'Sheldon Koelpin',   date_of_birth: '1995-02-05', gender: 'M', mrn: '003acd45', date: todayAt(8,  0),  type: 'Office Visit',  reason: 'Annual wellness exam',                  status: 'scheduled' },
  { id: 1002, patient_id: 203,  patient_name: 'Renato Sipes',      date_of_birth: '1999-04-27', gender: 'M', mrn: '000d1cbb', date: todayAt(8,  20), type: 'Office Visit',  reason: 'Anxiety and medication review',          status: 'scheduled' },
  { id: 1003, patient_id: 94,   patient_name: 'Brant Daugherty',   date_of_birth: '1973-12-07', gender: 'M', mrn: '0005fdbf', date: todayAt(8,  40), type: 'Follow-up',     reason: 'Type 2 diabetes management',            status: 'scheduled' },
  { id: 1004, patient_id: 1130, patient_name: 'Tayna Sawayn',      date_of_birth: '1974-10-10', gender: 'F', mrn: '0049f784', date: todayAt(9,  0),  type: 'Follow-up',     reason: 'Hypertension management',               status: 'scheduled' },
  { id: 1005, patient_id: 85,   patient_name: 'Ignacio Cole',      date_of_birth: '1973-01-29', gender: 'M', mrn: '00052aa4', date: todayAt(9,  20), type: 'Follow-up',     reason: 'COPD follow-up and pulmonary review',   status: 'scheduled' },
  { id: 1006, patient_id: 1210, patient_name: 'Vernon Dare',       date_of_birth: '1997-03-19', gender: 'M', mrn: '004fec78', date: todayAt(9,  40), type: 'Office Visit',  reason: 'Knee pain — sports-related',            status: 'scheduled' },
  { id: 1007, patient_id: 609,  patient_name: 'Leland Corkery',    date_of_birth: '1982-06-16', gender: 'M', mrn: '0026eb30', date: todayAt(10, 0),  type: 'Follow-up',     reason: 'Lab review — HbA1c results',            status: 'scheduled' },
  { id: 1008, patient_id: 638,  patient_name: 'Bill Hilpert',      date_of_birth: '1938-11-02', gender: 'M', mrn: '00285bfb', date: todayAt(10, 20), type: 'Follow-up',     reason: 'CHF management and medication review',  status: 'scheduled' },
  { id: 1009, patient_id: 1274, patient_name: 'Juliann Jacobs',    date_of_birth: '1989-05-15', gender: 'F', mrn: '005428c2', date: todayAt(10, 40), type: 'Preventive',    reason: 'Well-woman exam and cancer screening',  status: 'scheduled' },
  { id: 1010, patient_id: 319,  patient_name: 'Roderick Mann',     date_of_birth: '1961-07-02', gender: 'M', mrn: '00140a82', date: todayAt(11, 0),  type: 'Office Visit',  reason: 'Chest pain evaluation',                 status: 'scheduled' },
  { id: 1011, patient_id: 768,  patient_name: 'Lesa Schneider',    date_of_birth: '1955-08-29', gender: 'F', mrn: '0031231a', date: todayAt(11, 20), type: 'Follow-up',     reason: 'Osteoporosis management',               status: 'scheduled' },
  { id: 1012, patient_id: 705,  patient_name: 'Synthia Bode',      date_of_birth: '1945-03-10', gender: 'F', mrn: '002c98ad', date: todayAt(11, 40), type: 'Office Visit',  reason: 'Memory concerns / cognitive screening', status: 'scheduled' },
  { id: 1013, patient_id: 1139, patient_name: 'Nobuko Cummerata',  date_of_birth: '1956-04-05', gender: 'F', mrn: '004a83d8', date: todayAt(13, 0),  type: 'Follow-up',     reason: 'Chronic kidney disease follow-up',      status: 'scheduled' },
  { id: 1014, patient_id: 1137, patient_name: 'Lina Towne',        date_of_birth: '2001-03-24', gender: 'F', mrn: '004a741d', date: todayAt(13, 20), type: 'Preventive',    reason: 'Routine physical and immunizations',    status: 'scheduled' },
  { id: 1015, patient_id: 928,  patient_name: 'Marvin Dibbert',    date_of_birth: '1982-03-31', gender: 'M', mrn: '003c601f', date: todayAt(13, 40), type: 'Office Visit',  reason: 'Lower back pain and PT referral',       status: 'scheduled' },
  { id: 1016, patient_id: 465,  patient_name: 'Mireya Grant',      date_of_birth: '2001-12-02', gender: 'F', mrn: '001de7d1', date: todayAt(14, 0),  type: 'New Patient',   reason: 'New patient consultation',              status: 'scheduled' },
  { id: 1017, patient_id: 646,  patient_name: 'Machelle Huels',    date_of_birth: '1998-02-08', gender: 'F', mrn: '0028f2d8', date: todayAt(14, 20), type: 'Office Visit',  reason: 'Depression screening and follow-up',    status: 'scheduled' },
  { id: 1018, patient_id: 1246, patient_name: 'Theron Bruen',      date_of_birth: '2007-07-18', gender: 'M', mrn: '0051ee2b', date: todayAt(14, 40), type: 'Preventive',    reason: 'Sports physical / pre-participation',   status: 'scheduled' },
] as const;
