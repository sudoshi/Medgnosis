import { useState } from 'react';
import {
  ChevronUpDownIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import type { PatientDetails } from '@/types/patient';
import PatientDetailModal from '@/components/patients/PatientDetailModal';

interface Column {
  id: keyof PatientDetails | 'careGapsCount' | 'conditionsCount';
  label: string;
  sortable?: boolean;
  render: (patient: PatientDetails) => React.ReactNode;
}

interface PopulationGridProps {
  patients: PatientDetails[];
  loading?: boolean;
}

const columns: Column[] = [
  {
    id: 'name',
    label: 'Patient',
    sortable: true,
    render: (patient) => (
      <div>
        <p className="font-medium">{patient.name}</p>
        <p className="text-sm text-dark-text-secondary">
          {patient.demographics.age} years • {patient.demographics.gender}
        </p>
      </div>
    ),
  },
  {
    id: 'conditionsCount',
    label: 'Conditions',
    sortable: true,
    render: (patient) => (
      <div className="flex flex-wrap gap-1">
        {patient.conditions.map((condition) => (
          <span
            key={condition.id}
            className="inline-block px-2 py-1 text-xs rounded-full bg-dark-secondary text-dark-text-secondary"
          >
            {condition.name}
          </span>
        ))}
      </div>
    ),
  },
  {
    id: 'riskFactors',
    label: 'Risk Score',
    sortable: true,
    render: (patient) => (
      <div className="flex items-center space-x-2">
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            patient.riskFactors.level === 'high'
              ? 'bg-accent-error/10 text-accent-error'
              : patient.riskFactors.level === 'medium'
              ? 'bg-accent-warning/10 text-accent-warning'
              : 'bg-accent-success/10 text-accent-success'
          }`}
        >
          {patient.riskFactors.score}
        </span>
        {patient.riskFactors.trending === 'up' && (
          <ExclamationTriangleIcon className="h-4 w-4 text-accent-error" />
        )}
      </div>
    ),
  },
  {
    id: 'careGapsCount',
    label: 'Care Gaps',
    sortable: true,
    render: (patient) => (
      <div>
        {patient.careGaps.length > 0 ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-accent-error/10 text-accent-error">
            {patient.careGaps.length} open
          </span>
        ) : (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-accent-success/10 text-accent-success">
            None
          </span>
        )}
      </div>
    ),
  },
  {
    id: 'encounters',
    label: 'Last Encounter',
    sortable: true,
    render: (patient) => (
      <div className="flex items-center space-x-1 text-sm text-dark-text-secondary">
        <ClockIcon className="h-4 w-4" />
        <span>
          {new Date(patient.encounters[0]?.date).toLocaleDateString()}
        </span>
      </div>
    ),
  },
];

export default function PopulationGrid({ patients, loading }: PopulationGridProps) {
  const [sortConfig, setSortConfig] = useState<{
    key: keyof PatientDetails | 'careGapsCount' | 'conditionsCount';
    direction: 'asc' | 'desc';
  }>({ key: 'name', direction: 'asc' });
  const [selectedPatient, setSelectedPatient] = useState<PatientDetails | null>(null);

  const handleSort = (columnId: typeof sortConfig.key) => {
    setSortConfig((current) => ({
      key: columnId,
      direction:
        current.key === columnId && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const getSortedPatients = () => {
    const sorted = [...patients].sort((a, b) => {
      if (sortConfig.key === 'careGapsCount') {
        return (a.careGaps.length - b.careGaps.length) *
          (sortConfig.direction === 'asc' ? 1 : -1);
      }
      if (sortConfig.key === 'conditionsCount') {
        return (a.conditions.length - b.conditions.length) *
          (sortConfig.direction === 'asc' ? 1 : -1);
      }
      if (sortConfig.key === 'riskFactors') {
        return (a.riskFactors.score - b.riskFactors.score) *
          (sortConfig.direction === 'asc' ? 1 : -1);
      }
      if (sortConfig.key === 'encounters') {
        return (new Date(a.encounters[0]?.date).getTime() -
          new Date(b.encounters[0]?.date).getTime()) *
          (sortConfig.direction === 'asc' ? 1 : -1);
      }
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return aValue.localeCompare(bValue) *
          (sortConfig.direction === 'asc' ? 1 : -1);
      }
      return 0;
    });
    return sorted;
  };

  const SortIcon = ({ column }: { column: Column }) => {
    if (!column.sortable) return null;
    if (sortConfig.key !== column.id) {
      return <ChevronUpDownIcon className="h-4 w-4" />;
    }
    return sortConfig.direction === 'asc' ? (
      <ChevronUpIcon className="h-4 w-4" />
    ) : (
      <ChevronDownIcon className="h-4 w-4" />
    );
  };

  if (loading) {
    return <div className="animate-pulse">Loading population data...</div>;
  }

  return (
    <>
      <div className="analytics-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.id}
                    className={`px-4 py-3 text-left text-sm font-medium ${
                      column.sortable ? 'cursor-pointer hover:bg-dark-secondary/50' : ''
                    }`}
                    onClick={() =>
                      column.sortable ? handleSort(column.id) : undefined
                    }
                  >
                    <div className="flex items-center space-x-2">
                      <span>{column.label}</span>
                      {column.sortable && (
                        <span className="text-dark-text-secondary">
                          <SortIcon column={column} />
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {getSortedPatients().map((patient) => (
                <tr
                  key={patient.id}
                  onClick={() => setSelectedPatient(patient)}
                  className="hover:bg-dark-secondary/50 cursor-pointer"
                >
                  {columns.map((column) => (
                    <td key={column.id} className="px-4 py-3">
                      {column.render(patient)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedPatient && (
        <PatientDetailModal
          isOpen={true}
          onClose={() => setSelectedPatient(null)}
          patient={selectedPatient}
        />
      )}
    </>
  );
}
