'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { dashboard, auth } from '@/services/api';
import type { DashboardData } from '@/services/api';

interface PatientData {
  riskScore: {
    total: number;
  };
  factorBreakdown: Record<string, number>;
  trending: Array<{
    month: string;
    risk_score: number;
  }>;
}

interface MeasureData {
  historical_trend: Array<{
    month_name: string;
    compliance_rate: number;
  }>;
  current_rate: {
    rate: number;
  };
  improvement_opportunities: Array<{
    description: string;
    potential_impact: string;
  }>;
}

interface Alert {
  level: 'critical' | 'warning' | 'info';
  message: string;
  action_required?: string;
  contributing_factors?: Record<string, number>;
}

interface RiskStratificationCardProps {
  patientData: PatientData;
}

interface MeasureComplianceCardProps {
  measureData: MeasureData;
}

interface AlertsPanelProps {
  alerts: Alert[];
}

const RiskStratificationCard: React.FC<RiskStratificationCardProps> = ({ patientData }) => {
  const { riskScore, factorBreakdown, trending } = patientData;
  
  const getRiskColor = (score: number): string => {
    if (score >= 75) return 'bg-red-100 text-red-800';
    if (score >= 50) return 'bg-yellow-100 text-yellow-800';
    return 'bg-green-100 text-green-800';
  };

  return (
    <div className="w-full p-6 bg-white rounded-lg shadow">
      <div className="mb-4">
        <h2 className="text-xl font-semibold flex justify-between items-center">
          <span>Risk Stratification</span>
          <span className={`px-4 py-2 rounded-full ${getRiskColor(riskScore.total)}`}>
            {riskScore.total.toFixed(1)}
          </span>
        </h2>
      </div>
      <div className="p-4">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {Object.entries(factorBreakdown).map(([factor, score]) => (
              <div key={factor} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                <span className="capitalize">{factor.replace('_', ' ')}</span>
                <span className={`px-2 py-1 rounded ${getRiskColor(score)}`}>
                  {score.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
          
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trending}>
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Line 
                  type="monotone" 
                  dataKey="risk_score" 
                  stroke="#8884d8" 
                  strokeWidth={2} 
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

const MeasureComplianceCard: React.FC<MeasureComplianceCardProps> = ({ measureData }) => {
  const { historical_trend, current_rate, improvement_opportunities } = measureData;

  return (
    <div className="w-full p-6 bg-white rounded-lg shadow">
      <div className="mb-4">
        <h2 className="text-xl font-semibold">Measure Compliance</h2>
      </div>
      <div className="p-4">
        <div className="space-y-6">
          <div className="flex justify-center items-center">
            <div className="relative w-32 h-32">
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-3xl font-bold">
                  {current_rate.rate.toFixed(1)}%
                </span>
              </div>
              <svg className="transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  className="text-gray-200"
                  strokeWidth="8"
                  stroke="currentColor"
                  fill="transparent"
                  r="42"
                  cx="50"
                  cy="50"
                />
                <circle
                  className="text-blue-600"
                  strokeWidth="8"
                  stroke="currentColor"
                  fill="transparent"
                  r="42"
                  cx="50"
                  cy="50"
                  strokeDasharray={`${current_rate.rate * 2.64}, 264`}
                />
              </svg>
            </div>
          </div>

          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={historical_trend}>
                <XAxis dataKey="month_name" />
                <YAxis />
                <Tooltip />
                <Line 
                  type="monotone" 
                  dataKey="compliance_rate" 
                  stroke="#2563eb" 
                  strokeWidth={2} 
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-2">
            {improvement_opportunities.map((opportunity, index) => (
              <div key={index} className="p-4 bg-blue-50 rounded-lg">
                <h3 className="text-sm font-medium mb-1">
                  {opportunity.description}
                </h3>
                <p className="text-sm text-gray-600">
                  Potential Impact: {opportunity.potential_impact}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const AlertsPanel: React.FC<AlertsPanelProps> = ({ alerts }) => {
  const getAlertStyle = (level: string): string => {
    switch (level) {
      case 'critical':
        return 'bg-red-50 border-red-200';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200';
      default:
        return 'bg-blue-50 border-blue-200';
    }
  };

  return (
    <div className="space-y-4">
      {alerts.map((alert, index) => (
        <div 
          key={index}
          className={`p-4 ${getAlertStyle(alert.level)} border-l-4 rounded-lg`}
        >
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-medium">{alert.message}</h3>
            {alert.level === 'critical' && (
              <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-sm">
                Critical
              </span>
            )}
          </div>
          {alert.action_required && (
            <p className="mt-2 text-sm">
              Required Action: {alert.action_required}
            </p>
          )}
          {alert.contributing_factors && (
            <div className="mt-2">
              <p className="text-sm font-medium">Contributing Factors:</p>
              <ul className="ml-4 text-sm">
                {Object.entries(alert.contributing_factors).map(([factor, value]) => (
                  <li key={factor} className="mt-1">
                    {factor}: {value.toFixed(2)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default function PopulationHealthDashboard() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        await auth.user();
      } catch (err) {
        router.push('/login');
        return;
      }
    };
    checkAuth();
    const fetchDashboardData = async () => {
      try {
        const { data } = await dashboard.getData();
        setDashboardData(data);
        setError(null);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setError('Failed to load dashboard data. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-lg">
          <h3 className="text-red-800 font-medium">Error</h3>
          <p className="text-red-700 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (!dashboardData) {
    return null;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <RiskStratificationCard patientData={dashboardData.riskData} />
        <MeasureComplianceCard measureData={dashboardData.measureData} />
      </div>
      <AlertsPanel alerts={dashboardData.alerts} />
    </div>
  );
}
