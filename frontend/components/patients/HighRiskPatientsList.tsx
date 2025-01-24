import { useState } from 'react';
import type { PatientDetails, PatientAction } from '@/types/patient';
import PatientDetailModal from './PatientDetailModal';
import { ClockIcon } from '@heroicons/react/24/outline';

interface HighRiskPatientsListProps {
  loading?: boolean;
  patients?: PatientDetails[];
  onAction?: (action: PatientAction) => void;
}

export default function HighRiskPatientsList({
  loading,
  patients = [],
  onAction,
}: HighRiskPatientsListProps) {
  const [selectedPatient, setSelectedPatient] = useState<PatientDetails | null>(null);

  const handleAction = (action: PatientAction) => {
    if (onAction) {
      onAction(action);
    }
    // Keep the modal open after action
  };

  const handlePatientClick = (patient: PatientDetails) => {
    setSelectedPatient(patient);
  };

  return (
    <>
      <div className={`list-panel ${loading ? 'animate-pulse' : ''}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">High Risk Patients</h3>
          <button className="btn btn-secondary">View All</button>
        </div>
        <div className="space-y-4 h-[300px] overflow-y-auto scrollbar-thin">
          {patients.map((patient) => (
            <button
              key={patient.id}
              className="w-full text-left"
              onClick={() => handlePatientClick(patient)}
            >
              <div className="flex items-center justify-between p-3 rounded-lg bg-dark-primary hover:bg-dark-secondary transition-colors">
                <div>
                  <p className="font-medium">{patient.name}</p>
                  <div className="flex items-center space-x-2 mt-1">
                    {patient.conditions.map((condition, index) => (
                      <span
                        key={index}
                        className="inline-block px-2 py-1 text-xs rounded-full bg-dark-secondary text-dark-text-secondary"
                      >
                        {condition.name}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-accent-error">
                    {patient.riskFactors.score}%
                  </div>
                  {patient.encounters[0] && (
                    <div className="flex items-center justify-end space-x-1 text-sm text-dark-text-secondary">
                      <ClockIcon className="h-4 w-4" />
                      <span>
                        Last seen: {new Date(patient.encounters[0].date).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {selectedPatient && (
        <PatientDetailModal
          isOpen={true}
          onClose={() => setSelectedPatient(null)}
          patient={selectedPatient}
          onAction={handleAction}
        />
      )}
    </>
  );
}
