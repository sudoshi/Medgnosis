'use client';

import { useState, useMemo } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import {
  CalendarIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { mockAnticipatoryPatients } from '@/services/mockAnticipatoryData';
import type { PatientDetails } from '@/types/patient';

interface TimeFrameStats {
  total: number;
  highRisk: number;
  careGaps: number;
  automated: number;
}

function TimeFrameSection({ 
  title, 
  patients,
  onAction
}: { 
  title: string;
  patients: PatientDetails[];
  onAction: (patientId: string, action: string) => void;
}) {
  return (
    <div className="panel-analytics">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-dark-text-primary">{title}</h3>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-dark-text-secondary">
            <ExclamationTriangleIcon className="h-5 w-5 text-accent-error" />
            <span>{patients.filter(p => p.riskFactors.level === 'high').length} High Risk</span>
          </div>
          <div className="flex items-center space-x-2 text-dark-text-secondary">
            <ClockIcon className="h-5 w-5 text-accent-warning" />
            <span>{patients.reduce((sum, p) => sum + p.careGaps.length, 0)} Care Gaps</span>
          </div>
        </div>
      </div>
      <div className="space-y-4">
        {patients.map((patient) => (
          <div key={patient.id} className="panel-detail p-4">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center space-x-2">
                  <h4 className="font-medium">
                    {patient.name.first} {patient.name.last}
                  </h4>
                  {patient.riskFactors.level !== 'low' && (
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                      patient.riskFactors.level === 'high' 
                        ? 'bg-accent-error/10 text-accent-error'
                        : 'bg-accent-warning/10 text-accent-warning'
                    }`}>
                      {patient.riskFactors.level === 'high' ? 'High' : 'Medium'} Risk
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm text-dark-text-secondary">
                  {patient.encounters[0]?.type} with {patient.encounters[0]?.provider}
                </div>
                <div className="mt-2 flex items-center space-x-4">
                  <div className="flex items-center space-x-1 text-sm">
                    <CalendarIcon className="h-4 w-4 text-dark-text-secondary" />
                    <span>
                      {new Date(patient.encounters[0]?.date || '').toLocaleDateString()}{' '}
                      {new Date(patient.encounters[0]?.date || '').toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1 text-sm">
                    <ClockIcon className="h-4 w-4 text-dark-text-secondary" />
                    <span>{patient.careGaps.length} gaps</span>
                  </div>
                </div>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => onAction(patient.id, 'automate')}
                  className="p-2 rounded-lg bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20 transition-colors group relative"
                  title="Automatically order tests and procedures for care gaps"
                >
                  <ArrowPathIcon className="h-5 w-5" />
                </button>
                <button
                  onClick={() => onAction(patient.id, 'complete')}
                  className="p-2 rounded-lg bg-accent-success/10 text-accent-success hover:bg-accent-success/20 transition-colors group relative"
                  title="Mark pre-visit planning as complete"
                >
                  <CheckCircleIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
            {patient.careGaps.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="text-sm font-medium text-dark-text-secondary">Care Gaps:</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {patient.careGaps.map((gap) => (
                    <div
                      key={gap.id}
                      className={`flex justify-between items-center text-sm px-3 py-2 rounded-lg ${
                        gap.priority === 'high'
                          ? 'bg-accent-error/10 text-accent-error'
                          : 'bg-accent-warning/10 text-accent-warning'
                      }`}
                    >
                      <div className="flex-1">
                        <div className="font-medium">{gap.measure}</div>
                        <div className="text-xs text-dark-text-secondary">
                          Due {new Date(gap.dueDate).toLocaleDateString()}
                        </div>
                        {gap.type && (
                          <div className="text-xs mt-1">
                            {gap.orderType}: {gap.orderCode}
                          </div>
                        )}
                      </div>
                      <div className="flex space-x-2 ml-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onAction(patient.id, `order_${gap.orderCode?.toLowerCase()}`);
                          }}
                          className="px-2 py-1 text-xs rounded bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20 transition-colors"
                          title={`Order ${gap.measure}`}
                        >
                          Order
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onAction(patient.id, `schedule_${gap.orderCode?.toLowerCase()}`);
                          }}
                          className="px-2 py-1 text-xs rounded bg-accent-success/10 text-accent-success hover:bg-accent-success/20 transition-colors"
                          title={`Schedule ${gap.measure}`}
                        >
                          Schedule
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AnticipatoryCarePage() {
  const [selectedTimeFrame, setSelectedTimeFrame] = useState<'day' | 'week' | 'month'>('day');
  
  // Filter patients based on their next encounter date
  const timeFrames = useMemo(() => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const nextMonth = new Date(now);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    const filterAndSortPatients = (endDate: Date) => {
      return mockAnticipatoryPatients
        .filter(patient => {
          const encounterDate = new Date(patient.encounters[0]?.date || '');
          return encounterDate <= endDate;
        })
        .sort((a, b) => {
          const dateA = new Date(a.encounters[0]?.date || '');
          const dateB = new Date(b.encounters[0]?.date || '');
          return dateA.getTime() - dateB.getTime();
        });
    };

    return {
      day: filterAndSortPatients(tomorrow),
      week: filterAndSortPatients(nextWeek),
      month: filterAndSortPatients(nextMonth)
    };
  }, []);

  const handleAction = (patientId: string, action: string) => {
    // In a real application, this would trigger API calls to:
    // 1. For order_*: Place specific orders (labs, imaging, procedures)
    // 2. For schedule_*: Schedule appointments/procedures
    // 3. For 'automate': Automatically order all applicable tests/procedures
    // 4. For 'complete': Mark the pre-visit planning as complete
    
    const patient = timeFrames[selectedTimeFrame].find(p => p.id === patientId);
    if (!patient) return;

    if (action.startsWith('order_')) {
      const orderCode = action.split('_')[1]?.toUpperCase();
      console.log(`Ordering ${orderCode} for patient ${patientId}`);
      // Here we would:
      // 1. Submit order to EHR/LIS/RIS
      // 2. Update care gap status
      // 3. Add to recentActions
    } else if (action.startsWith('schedule_')) {
      const orderCode = action.split('_')[1]?.toUpperCase();
      console.log(`Scheduling ${orderCode} for patient ${patientId}`);
      // Here we would:
      // 1. Check provider/facility availability
      // 2. Create appointment
      // 3. Update care gap status
      // 4. Add to recentActions
    } else if (action === 'automate') {
      console.log(`Automating orders for patient ${patientId}`);
      // Here we would:
      // 1. Analyze all care gaps
      // 2. Place appropriate orders
      // 3. Update care gap statuses
      // 4. Add to recentActions
    } else if (action === 'complete') {
      console.log(`Marking pre-visit planning complete for patient ${patientId}`);
      // Here we would:
      // 1. Update planning status
      // 2. Notify care team
      // 3. Add to recentActions
    }
  };

  const stats: Record<'day' | 'week' | 'month', TimeFrameStats> = {
    day: {
      total: timeFrames.day.length,
      highRisk: timeFrames.day.filter(p => p.riskFactors.level === 'high').length,
      careGaps: timeFrames.day.reduce((sum, p) => sum + p.careGaps.length, 0),
      automated: Math.floor(timeFrames.day.length * 0.6) // Simulated automation rate
    },
    week: {
      total: timeFrames.week.length,
      highRisk: timeFrames.week.filter(p => p.riskFactors.level === 'high').length,
      careGaps: timeFrames.week.reduce((sum, p) => sum + p.careGaps.length, 0),
      automated: Math.floor(timeFrames.week.length * 0.5)
    },
    month: {
      total: timeFrames.month.length,
      highRisk: timeFrames.month.filter(p => p.riskFactors.level === 'high').length,
      careGaps: timeFrames.month.reduce((sum, p) => sum + p.careGaps.length, 0),
      automated: Math.floor(timeFrames.month.length * 0.4)
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="panel-stat">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-dark-text-secondary text-sm font-medium">Total Encounters</p>
                <p className="mt-2 text-2xl font-semibold">{stats[selectedTimeFrame].total}</p>
              </div>
              <div className="rounded-lg bg-accent-primary/10 p-3">
                <CalendarIcon className="h-6 w-6 text-accent-primary" />
              </div>
            </div>
            <p className="mt-4 text-sm text-dark-text-secondary">
              Scheduled visits for selected period
            </p>
          </div>
          <div className="panel-stat">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-dark-text-secondary text-sm font-medium">High Risk Patients</p>
                <p className="mt-2 text-2xl font-semibold">{stats[selectedTimeFrame].highRisk}</p>
              </div>
              <div className="rounded-lg bg-accent-error/10 p-3">
                <ExclamationTriangleIcon className="h-6 w-6 text-accent-error" />
              </div>
            </div>
            <p className="mt-4 text-sm text-dark-text-secondary">
              Patients requiring immediate attention
            </p>
          </div>
          <div className="panel-stat">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-dark-text-secondary text-sm font-medium">Care Gaps</p>
                <p className="mt-2 text-2xl font-semibold">{stats[selectedTimeFrame].careGaps}</p>
              </div>
              <div className="rounded-lg bg-accent-warning/10 p-3">
                <ClockIcon className="h-6 w-6 text-accent-warning" />
              </div>
            </div>
            <p className="mt-4 text-sm text-dark-text-secondary">
              Open care gaps to be addressed
            </p>
          </div>
          <div className="panel-stat">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-dark-text-secondary text-sm font-medium">Automated Actions</p>
                <p className="mt-2 text-2xl font-semibold">{stats[selectedTimeFrame].automated}</p>
              </div>
              <div className="rounded-lg bg-accent-success/10 p-3">
                <ArrowPathIcon className="h-6 w-6 text-accent-success" />
              </div>
            </div>
            <p className="mt-4 text-sm text-dark-text-secondary">
              Care gaps addressed automatically
            </p>
          </div>
        </div>

        {/* Time Frame Selector */}
        <div className="flex space-x-4">
          <button
            onClick={() => setSelectedTimeFrame('day')}
            className={`px-4 py-2 rounded-lg font-medium ${
              selectedTimeFrame === 'day'
                ? 'bg-accent-primary text-white'
                : 'bg-dark-secondary text-dark-text-secondary hover:text-dark-text-primary'
            }`}
          >
            Next 24 Hours
          </button>
          <button
            onClick={() => setSelectedTimeFrame('week')}
            className={`px-4 py-2 rounded-lg font-medium ${
              selectedTimeFrame === 'week'
                ? 'bg-accent-primary text-white'
                : 'bg-dark-secondary text-dark-text-secondary hover:text-dark-text-primary'
            }`}
          >
            Next Week
          </button>
          <button
            onClick={() => setSelectedTimeFrame('month')}
            className={`px-4 py-2 rounded-lg font-medium ${
              selectedTimeFrame === 'month'
                ? 'bg-accent-primary text-white'
                : 'bg-dark-secondary text-dark-text-secondary hover:text-dark-text-primary'
            }`}
          >
            Next Month
          </button>
        </div>

        {/* Time Frame Section */}
        <TimeFrameSection
          title={`Encounters - ${
            selectedTimeFrame === 'day'
              ? 'Next 24 Hours'
              : selectedTimeFrame === 'week'
              ? 'Next Week'
              : 'Next Month'
          }`}
          patients={timeFrames[selectedTimeFrame]}
          onAction={handleAction}
        />
      </div>
    </AdminLayout>
  );
}
