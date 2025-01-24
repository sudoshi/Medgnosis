import { useState } from 'react';
import {
  ChartBarIcon,
  ExclamationTriangleIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline';
import type { PatientDetails } from '@/types/patient';
import PatientDetailModal from './PatientDetailModal';

interface PatientRowProps {
  patient: PatientDetails;
  onClick?: () => void;
}

export default function PatientRow({ patient, onClick }: PatientRowProps) {
  const [showDetails, setShowDetails] = useState(false);

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      setShowDetails(true);
    }
  };

  return (
    <>
      <tr
        onClick={handleClick}
        className="cursor-pointer hover:bg-dark-secondary"
      >
        <td className="px-6 py-4 whitespace-nowrap">
          <div className="flex items-center">
            <div>
              <div className="font-medium">
                {`${patient.name.first} ${patient.name.last}`}
              </div>
              <div className="text-sm text-dark-text-secondary">
                {patient.demographics.age} years • {patient.demographics.gender}
              </div>
            </div>
          </div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <div className="flex items-center space-x-2">
            <span
              className={`px-2 py-1 rounded-full text-xs font-medium ${
                patient.riskFactors.level === 'high'
                  ? 'bg-accent-error/10 text-accent-error'
                  : patient.riskFactors.level === 'medium'
                  ? 'bg-accent-warning/10 text-accent-warning'
                  : 'bg-accent-success/10 text-accent-success'
              }`}
            >
              {patient.riskFactors.level} risk
            </span>
            <span className="text-sm text-dark-text-secondary">
              Score: {patient.riskFactors.score}
            </span>
          </div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <div className="text-sm">
            {patient.conditions.map((condition, index) => (
              <span key={condition.id}>
                {index > 0 && ' • '}
                {condition.name}
              </span>
            ))}
          </div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <div className="flex items-center space-x-2">
            <span className="text-sm">{patient.careGaps.length}</span>
            {patient.careGaps.length > 0 && (
              <span
                className={`px-2 py-1 rounded-full text-xs font-medium ${
                  patient.careGaps.some(gap => gap.priority === 'high')
                    ? 'bg-accent-error/10 text-accent-error'
                    : patient.careGaps.some(gap => gap.priority === 'medium')
                    ? 'bg-accent-warning/10 text-accent-warning'
                    : 'bg-accent-success/10 text-accent-success'
                }`}
              >
                {patient.careGaps.some(gap => gap.priority === 'high')
                  ? 'High'
                  : patient.careGaps.some(gap => gap.priority === 'medium')
                  ? 'Medium'
                  : 'Low'} priority
              </span>
            )}
          </div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-dark-text-secondary">
          {patient.primaryCare.provider}
        </td>
      </tr>

      {!onClick && (
        <PatientDetailModal
          isOpen={showDetails}
          onClose={() => setShowDetails(false)}
          patient={patient}
        />
      )}
    </>
  );
}
