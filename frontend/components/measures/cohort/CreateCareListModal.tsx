import { useState } from 'react';
import { Dialog } from '@headlessui/react';
import {
  ClipboardDocumentListIcon,
  XMarkIcon,
  UserGroupIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import type { QualityMeasure } from '@/types/measure';
import type { Patient } from '@/types/patient';

interface CreateCareListModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedMeasures: QualityMeasure[];
  cohortSize: number;
  matchingPatients: Patient[];
}

interface FormData {
  name: string;
  description: string;
  clinicalFocus: string;
}

export default function CreateCareListModal({
  isOpen,
  onClose,
  selectedMeasures,
  cohortSize,
}: CreateCareListModalProps) {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    clinicalFocus: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Here we would typically make an API call to create the care list
    console.log('Creating care list:', {
      ...formData,
      measures: selectedMeasures.map(m => m.id),
      patientCount: cohortSize,
    });
    onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      className="relative z-50"
    >
      {/* The backdrop, rendered as a fixed sibling to the panel container */}
      <div className="fixed inset-0 bg-black/50" aria-hidden="true" />

      {/* Full-screen container to center the panel */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="w-full max-w-2xl rounded-lg bg-dark-primary p-6 shadow-xl">
          {/* Header */}
          <div className="mb-6 flex items-start justify-between">
            <div>
              <Dialog.Title className="text-2xl font-semibold">
                Create Care List
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-dark-text-secondary">
                Create a new care list based on selected measures and cohort
              </Dialog.Description>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-dark-text-secondary hover:bg-dark-secondary"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Stats */}
          <div className="mb-6 grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-dark-secondary p-4">
              <div className="flex items-center space-x-2">
                <UserGroupIcon className="h-5 w-5 text-dark-text-secondary" />
                <span className="text-sm text-dark-text-secondary">Cohort Size</span>
              </div>
              <div className="mt-1 text-2xl font-semibold">{cohortSize}</div>
            </div>
            <div className="rounded-lg bg-dark-secondary p-4">
              <div className="flex items-center space-x-2">
                <ChartBarIcon className="h-5 w-5 text-dark-text-secondary" />
                <span className="text-sm text-dark-text-secondary">Measures</span>
              </div>
              <div className="mt-1 text-2xl font-semibold">
                {selectedMeasures.length}
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Form Fields */}
            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium mb-1">
                  List Name
                </label>
                <input
                  type="text"
                  id="name"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="input w-full"
                  placeholder="e.g., Hypertension Management"
                  required
                />
              </div>
              <div>
                <label htmlFor="description" className="block text-sm font-medium mb-1">
                  Description
                </label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="input w-full h-24"
                  placeholder="Describe the purpose and focus of this care list"
                  required
                />
              </div>
              <div>
                <label htmlFor="clinicalFocus" className="block text-sm font-medium mb-1">
                  Clinical Focus
                </label>
                <input
                  type="text"
                  id="clinicalFocus"
                  value={formData.clinicalFocus}
                  onChange={e => setFormData({ ...formData, clinicalFocus: e.target.value })}
                  className="input w-full"
                  placeholder="e.g., Hypertension, Diabetes, etc."
                  required
                />
              </div>
            </div>

            {/* Selected Measures */}
            <div>
              <h3 className="text-sm font-medium mb-2">Selected Measures</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {selectedMeasures.map(measure => (
                  <div
                    key={measure.id}
                    className="p-2 bg-dark-secondary rounded-lg text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span>{measure.title}</span>
                      <span className="text-dark-text-secondary">
                        {measure.implementation.category}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-4 pt-4 border-t border-dark-border">
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                <ClipboardDocumentListIcon className="h-5 w-5 mr-2" />
                Create Care List
              </button>
            </div>
          </form>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
