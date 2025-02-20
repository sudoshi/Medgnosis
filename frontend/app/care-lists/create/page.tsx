'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AdminLayout from '@/components/layout/AdminLayout';
import { mockMeasures } from '@/services/mockMeasures';
import type { QualityMeasure } from '@/types/measure';
import {
  ClipboardDocumentListIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/outline';

interface CareListFormData {
  name: string;
  description: string;
  clinicalFocus: string;
  measures: string[];
}

export default function CreateCareListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedMeasures, setSelectedMeasures] = useState<QualityMeasure[]>([]);
  const [formData, setFormData] = useState<CareListFormData>({
    name: '',
    description: '',
    clinicalFocus: '',
    measures: [],
  });

  // Load selected measures from URL params
  useEffect(() => {
    const measureIds = searchParams?.get('measures')?.split(',') || [];
    const measures = mockMeasures.filter(m => measureIds.includes(m.id));
    setSelectedMeasures(measures);
    setFormData(prev => ({ ...prev, measures: measureIds }));
  }, [searchParams]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Here we would typically make an API call to create the care list
    console.log('Creating care list:', formData);
    router.push('/care-lists');
  };

  return (
    <AdminLayout>
      <div className="min-h-screen bg-gradient-dark">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div>
            <button
              onClick={() => router.back()}
              className="flex items-center text-dark-text-secondary hover:text-dark-text-primary mb-4"
            >
              <ArrowLeftIcon className="h-4 w-4 mr-1" />
              Back
            </button>
            <h1 className="text-2xl font-semibold">Create Care List</h1>
            <p className="text-dark-text-secondary mt-1">
              Create a new care list based on selected quality measures
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8 max-w-3xl">
            {/* Basic Information */}
            <div className="space-y-4">
              <h2 className="text-lg font-medium">Basic Information</h2>
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
            </div>

            {/* Selected Measures */}
            <div className="space-y-4">
              <h2 className="text-lg font-medium">Selected Measures</h2>
              <div className="space-y-3">
                {selectedMeasures.map(measure => (
                  <div
                    key={measure.id}
                    className="p-4 bg-dark-primary border border-dark-border rounded-lg"
                  >
                    <div className="flex items-start">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <h3 className="text-lg font-medium">{measure.title}</h3>
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-dark-secondary text-dark-text-secondary">
                            {measure.implementation.category}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-dark-text-secondary">
                          {measure.implementation.code} • {measure.steward}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Submit */}
            <div className="pt-4">
              <button type="submit" className="btn btn-primary">
                <ClipboardDocumentListIcon className="h-5 w-5 mr-2" />
                Create Care List
              </button>
            </div>
          </form>
        </div>
      </div>
    </AdminLayout>
  );
}
