// =============================================================================
// Medgnosis Web — Patient detail page
// =============================================================================

import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  User,
  BarChart3,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { api } from '../services/api.js';

interface PatientDetail {
  patient: {
    patient_id: number;
    first_name: string;
    last_name: string;
    date_of_birth: string;
    gender: string;
    mrn: string;
    risk_score: number | null;
    risk_band: string | null;
  };
  conditions: Array<{
    condition_id: number;
    condition_name: string;
    onset_date: string;
    status: string;
  }>;
  encounters: Array<{
    encounter_id: number;
    encounter_type: string;
    encounter_date: string;
    provider_name: string;
  }>;
  observations: Array<{
    observation_id: number;
    observation_type: string;
    value_numeric: number | null;
    value_text: string | null;
    unit: string | null;
    observation_date: string;
  }>;
  care_gaps: Array<{
    care_gap_id: number;
    measure_id: string;
    gap_description: string;
    status: string;
    due_date: string;
  }>;
}

function TimelineEvent({
  type,
  title,
  description,
  date,
  status,
  value,
  unit,
}: {
  type: 'encounter' | 'observation' | 'condition' | 'care-gap';
  title: string;
  description: string;
  date: string;
  status?: string;
  value?: string;
  unit?: string;
}) {
  const dotColor: Record<string, string> = {
    encounter: 'bg-accent-primary',
    observation: 'bg-accent-success',
    condition: 'bg-accent-warning',
    'care-gap': 'bg-accent-error',
  };
  const statusColor: Record<string, string> = {
    completed: 'bg-accent-success/10 text-accent-success',
    active: 'bg-accent-warning/10 text-accent-warning',
    open: 'bg-accent-error/10 text-accent-error',
    resolved: 'bg-accent-success/10 text-accent-success',
  };

  return (
    <div className="relative pl-8">
      <div className="absolute left-0 top-1.5">
        <div className={`h-3 w-3 rounded-full ${dotColor[type]}`} />
      </div>
      <div className="flex flex-col space-y-1">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm">{title}</h3>
          <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
            {new Date(date).toLocaleDateString()}
          </span>
        </div>
        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
          {description}
        </p>
        {status && (
          <span
            className={`inline-flex w-fit items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              statusColor[status.toLowerCase()] ?? 'bg-gray-100 text-gray-600'
            }`}
          >
            {status}
          </span>
        )}
        {value && (
          <span className="text-sm font-medium">
            {value} {unit}
          </span>
        )}
      </div>
    </div>
  );
}

export function PatientDetailPage() {
  const { patientId } = useParams<{ patientId: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => api.get<PatientDetail>(`/patients/${patientId}`),
    enabled: !!patientId,
  });

  const detail = data?.data;
  const patient = detail?.patient;

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-dark-secondary/20 rounded" />
        <div className="grid grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-dark-secondary/20 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="text-center py-12">
        <p className="text-light-text-secondary dark:text-dark-text-secondary">
          Patient not found
        </p>
        <Link to="/patients" className="text-accent-primary hover:underline mt-2 inline-block">
          Back to patients
        </Link>
      </div>
    );
  }

  const age = patient.date_of_birth
    ? Math.floor(
        (Date.now() - new Date(patient.date_of_birth).getTime()) /
          (365.25 * 24 * 60 * 60 * 1000),
      )
    : null;

  // Build timeline from all events
  const timeline = [
    ...(detail?.encounters ?? []).map((e) => ({
      type: 'encounter' as const,
      title: e.encounter_type,
      description: `Provider: ${e.provider_name}`,
      date: e.encounter_date,
      status: 'Completed',
    })),
    ...(detail?.observations ?? []).map((o) => ({
      type: 'observation' as const,
      title: o.observation_type,
      description: '',
      date: o.observation_date,
      value: o.value_numeric?.toString() ?? o.value_text ?? '',
      unit: o.unit ?? '',
    })),
    ...(detail?.conditions ?? []).map((c) => ({
      type: 'condition' as const,
      title: c.condition_name,
      description: '',
      date: c.onset_date,
      status: c.status,
    })),
    ...(detail?.care_gaps ?? []).map((g) => ({
      type: 'care-gap' as const,
      title: g.gap_description || g.measure_id,
      description: `Due: ${new Date(g.due_date).toLocaleDateString()}`,
      date: g.due_date,
      status: g.status,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link
            to="/patients"
            className="p-2 rounded-lg border border-light-border dark:border-dark-border hover:bg-light-secondary dark:hover:bg-dark-secondary transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-light-text-primary dark:text-dark-text-primary">
              {patient.last_name}, {patient.first_name}
            </h1>
            <p className="text-light-text-secondary dark:text-dark-text-secondary text-sm">
              MRN: {patient.mrn}
            </p>
          </div>
        </div>
      </div>

      {/* Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="panel-base">
          <div className="flex items-center space-x-4">
            <div className="rounded-lg bg-accent-primary/10 p-3">
              <User className="h-6 w-6 text-accent-primary" />
            </div>
            <div>
              <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                Demographics
              </p>
              <p className="font-medium">
                {age != null ? `${age} years old` : '—'}, {patient.gender}
              </p>
              <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                DOB: {new Date(patient.date_of_birth).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>
        <div className="panel-base">
          <div className="flex items-center space-x-4">
            <div className="rounded-lg bg-accent-warning/10 p-3">
              <BarChart3 className="h-6 w-6 text-accent-warning" />
            </div>
            <div>
              <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                Risk Score
              </p>
              <p className="font-medium capitalize">
                {patient.risk_band ?? 'N/A'}{' '}
                {patient.risk_score != null && `(${patient.risk_score})`}
              </p>
            </div>
          </div>
        </div>
        <div className="panel-base">
          <div className="flex items-center space-x-4">
            <div className="rounded-lg bg-accent-error/10 p-3">
              <AlertTriangle className="h-6 w-6 text-accent-error" />
            </div>
            <div>
              <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                Care Gaps
              </p>
              <p className="font-medium">
                {detail?.care_gaps?.length ?? 0} Open Gaps
              </p>
            </div>
          </div>
        </div>
        <div className="panel-base">
          <div className="flex items-center space-x-4">
            <div className="rounded-lg bg-accent-success/10 p-3">
              <Clock className="h-6 w-6 text-accent-success" />
            </div>
            <div>
              <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                Last Encounter
              </p>
              <p className="font-medium">
                {detail?.encounters?.[0]
                  ? new Date(detail.encounters[0].encounter_date).toLocaleDateString()
                  : 'None'}
              </p>
              <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                {detail?.encounters?.[0]?.encounter_type ?? ''}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Three-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeline */}
        <div className="lg:col-span-2 panel-base">
          <h2 className="text-lg font-semibold mb-4">Timeline</h2>
          <div className="space-y-6">
            {timeline.length > 0 ? (
              timeline.slice(0, 20).map((event, i) => (
                <TimelineEvent key={i} {...event} />
              ))
            ) : (
              <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary text-center py-4">
                No events to display
              </p>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          {/* Risk Assessment */}
          <div className="panel-base">
            <h2 className="text-lg font-semibold mb-4">Risk Assessment</h2>
            <div className="flex items-center justify-between">
              <div>
                <p
                  className={`text-3xl font-bold ${
                    (patient.risk_score ?? 0) >= 70
                      ? 'text-accent-error'
                      : (patient.risk_score ?? 0) >= 40
                        ? 'text-accent-warning'
                        : 'text-accent-success'
                  }`}
                >
                  {patient.risk_score ?? '—'}
                </p>
                <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mt-1 capitalize">
                  {patient.risk_band ?? 'N/A'}
                </p>
              </div>
              <div
                className={`h-16 w-16 rounded-full border-4 flex items-center justify-center ${
                  (patient.risk_score ?? 0) >= 70
                    ? 'border-accent-error'
                    : (patient.risk_score ?? 0) >= 40
                      ? 'border-accent-warning'
                      : 'border-accent-success'
                }`}
              >
                <span className="text-lg font-semibold">
                  {patient.risk_score ?? '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Care Gaps */}
          <div className="panel-base">
            <h2 className="text-lg font-semibold mb-4">Care Gaps</h2>
            <div className="space-y-3">
              {(detail?.care_gaps ?? []).length > 0 ? (
                detail!.care_gaps.map((gap) => (
                  <div
                    key={gap.care_gap_id}
                    className="p-3 rounded-lg bg-light-secondary/50 dark:bg-dark-secondary/50"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-sm">
                          {gap.gap_description || gap.measure_id}
                        </h3>
                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                          Due: {new Date(gap.due_date).toLocaleDateString()}
                        </p>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          gap.status === 'open'
                            ? 'bg-accent-error/10 text-accent-error'
                            : 'bg-accent-success/10 text-accent-success'
                        }`}
                      >
                        {gap.status}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary text-center py-4">
                  No open care gaps
                </p>
              )}
            </div>
          </div>

          {/* Conditions */}
          <div className="panel-base">
            <h2 className="text-lg font-semibold mb-4">Active Conditions</h2>
            <div className="space-y-2">
              {(detail?.conditions ?? []).map((c) => (
                <div
                  key={c.condition_id}
                  className="flex items-center justify-between p-2 rounded-lg bg-light-secondary/50 dark:bg-dark-secondary/50"
                >
                  <span className="text-sm">{c.condition_name}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      c.status === 'active'
                        ? 'bg-accent-warning/10 text-accent-warning'
                        : 'bg-accent-success/10 text-accent-success'
                    }`}
                  >
                    {c.status}
                  </span>
                </div>
              ))}
              {(detail?.conditions ?? []).length === 0 && (
                <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary text-center py-2">
                  No conditions recorded
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
