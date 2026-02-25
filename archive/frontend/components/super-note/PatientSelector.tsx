"use client"

import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useState } from "react";

import { mockPatientsList } from "@/services/mockPatientData";
import type { Patient } from "@/types/patient";

interface PatientSelectorProps {
  onSelect: (patient: Patient) => void;
}

export function PatientSelector({ onSelect }: PatientSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [patients] = useState<Patient[]>(mockPatientsList);

  const filteredPatients = patients.filter((patient) =>
    `${patient.name.first} ${patient.name.last} ${patient.mrn}`
      .toLowerCase()
      .includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="relative">
      <div className="flex items-center space-x-2">
        <div className="relative flex-1">
          <input
            className="w-full px-4 py-2 rounded-lg bg-light-secondary/20 dark:bg-dark-secondary/20 border border-light-border/20 dark:border-dark-border/20 text-light-text-primary dark:text-dark-text-primary focus:border-accent-primary focus:ring-1 focus:ring-accent-primary outline-none transition-all duration-200 placeholder-light-text-secondary/70 dark:placeholder-dark-text-secondary/70"
            placeholder="Search patients by name or MRN..."
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
          />
          <MagnifyingGlassIcon className="absolute right-3 top-2.5 h-5 w-5 text-light-text-secondary dark:text-dark-text-secondary" />
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-light-primary/95 dark:bg-dark-primary/95 border border-light-border/20 dark:border-dark-border/20 rounded-lg shadow-lg backdrop-blur-sm">
          <div className="max-h-64 overflow-y-auto">
            {filteredPatients.length === 0 ? (
              <div className="p-4 text-center text-light-text-secondary dark:text-dark-text-secondary">
                No patients found
              </div>
            ) : (
              <div className="divide-y divide-light-border/20 dark:divide-dark-border/20">
                {filteredPatients.map((patient) => (
                  <button
                    key={patient.id}
                    className="w-full px-4 py-3 text-left hover:bg-light-secondary/20 dark:hover:bg-dark-secondary/20 text-light-text-primary dark:text-dark-text-primary transition-all duration-200"
                    onClick={() => {
                      onSelect(patient);
                      setIsOpen(false);
                      setSearchQuery(
                        `${patient.name.first} ${patient.name.last} (MRN: ${patient.mrn})`,
                      );
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-light-text-primary dark:text-dark-text-primary">
                          {patient.name.first} {patient.name.last}
                        </div>
                        <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                          MRN: {patient.mrn} • DOB:{" "}
                          {new Date(patient.dateOfBirth).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                        {patient.gender}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
      )}
    </div>
  );
}
