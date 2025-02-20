import {
  ChartBarIcon,
  ExclamationTriangleIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline';
import { useState } from 'react';

import type { PatientDetails, PatientAction } from '@/types/patient';

import PatientDetailModal from './PatientDetailModal';

interface HighRiskPatientsListProps {
  patients: PatientDetails[];
  loading?: boolean;
  onAction?: (action: PatientAction) => void;
}

function PatientCard({ patient }: { patient: PatientDetails }) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowDetails(true)}
        className="w-full panel-detail relative hover:bg-dark-secondary/20 transition-all duration-200"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-lg font-medium">
                {`${patient.name.first} ${patient.name.last}`}
              </h3>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  patient.riskFactors.level === 'high'
                    ? 'bg-accent-error/10 text-accent-error'
                    : patient.riskFactors.level === 'medium'
                    ? 'bg-accent-warning/10 text-accent-warning'
                    : 'bg-accent-success/10 text-accent-success'
                }`}
              >
                {patient.riskFactors.level} risk
              </span>
            </div>
            <div className="mt-1 text-sm text-dark-text-secondary">
              {patient.conditions.map((condition, index) => (
                <span key={condition.id}>
                  {index > 0 && ' • '}
                  {condition.name}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <div className="text-sm text-dark-text-secondary">Risk Score</div>
              <div className="text-lg font-medium">{patient.riskFactors.score}</div>
            </div>
            <div className="flex flex-col items-end">
              <div className="text-sm text-dark-text-secondary">Care Gaps</div>
              <div className="text-lg font-medium">{patient.careGaps.length}</div>
            </div>
          </div>
        </div>
      </button>

      <PatientDetailModal
        isOpen={showDetails}
        onClose={() => setShowDetails(false)}
        patient={patient}
      />
    </>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="panel-stat relative">
            <div className="flex items-center space-x-2">
              <div className="h-5 w-5 bg-dark-secondary/30 rounded animate-pulse"></div>
              <div className="h-4 bg-dark-secondary/30 rounded w-24 animate-pulse"></div>
            </div>
            <div className="mt-2 h-8 bg-dark-secondary/30 rounded w-16 animate-pulse"></div>
          </div>
        ))}
      </div>

      {/* Patient List */}
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="panel-detail relative"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center space-x-2">
                  <div className="h-6 bg-dark-secondary/30 rounded w-48 animate-pulse"></div>
                  <div className="h-5 bg-dark-secondary/30 rounded w-24 animate-pulse"></div>
                </div>
                <div className="mt-1 h-4 bg-dark-secondary/30 rounded w-64 animate-pulse"></div>
              </div>
              <div className="flex items-center space-x-4">
                <div className="text-right">
                  <div className="h-4 bg-dark-secondary/30 rounded w-16 animate-pulse"></div>
                  <div className="mt-1 h-6 bg-dark-secondary/30 rounded w-12 animate-pulse"></div>
                </div>
                <div className="flex flex-col items-end">
                  <div className="h-4 bg-dark-secondary/30 rounded w-16 animate-pulse"></div>
                  <div className="mt-1 h-6 bg-dark-secondary/30 rounded w-8 animate-pulse"></div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HighRiskPatientsList({
  patients,
  loading = false,
}: HighRiskPatientsListProps) {
  if (loading) {
    return <LoadingState />;
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="panel-stat relative">
          <div className="flex items-center space-x-2">
            <div className="rounded-lg bg-accent-primary/10 p-2 transition-all duration-200 hover:bg-accent-primary/20">
              <ExclamationTriangleIcon className="h-5 w-5 text-accent-primary" />
            </div>
            <span className="text-dark-text-secondary font-medium">High Risk</span>
          </div>
          <div className="mt-2 text-2xl font-semibold text-dark-text-primary">
            {patients.filter(p => p.riskFactors.level === 'high').length}
          </div>
        </div>
        <div className="panel-stat relative">
          <div className="flex items-center space-x-2">
            <div className="rounded-lg bg-accent-primary/10 p-2 transition-all duration-200 hover:bg-accent-primary/20">
              <ChartBarIcon className="h-5 w-5 text-accent-primary" />
            </div>
            <span className="text-dark-text-secondary font-medium">Average Risk Score</span>
          </div>
          <div className="mt-2 text-2xl font-semibold text-dark-text-primary">
            {Math.round(
              patients.reduce((acc, p) => acc + p.riskFactors.score, 0) /
                patients.length
            )}
          </div>
        </div>
        <div className="panel-stat relative">
          <div className="flex items-center space-x-2">
            <div className="rounded-lg bg-accent-primary/10 p-2 transition-all duration-200 hover:bg-accent-primary/20">
              <ClipboardDocumentListIcon className="h-5 w-5 text-accent-primary" />
            </div>
            <span className="text-dark-text-secondary font-medium">Total Care Gaps</span>
          </div>
          <div className="mt-2 text-2xl font-semibold text-dark-text-primary">
            {patients.reduce((acc, p) => acc + p.careGaps.length, 0)}
          </div>
        </div>
      </div>

      {/* Patient List */}
      <div className="space-y-2">
        {patients.map(patient => (
          <PatientCard key={patient.id} patient={patient} />
        ))}
      </div>
    </div>
  );
}
