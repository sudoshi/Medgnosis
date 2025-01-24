'use client';

import {
  DocumentChartBarIcon,
  DocumentTextIcon,
  TableCellsIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';

interface ReportCard {
  title: string;
  description: string;
  icon: typeof DocumentChartBarIcon;
  comingSoon?: boolean;
}

const reports: ReportCard[] = [
  {
    title: 'Quality Performance Summary',
    description: 'Comprehensive overview of all quality measures performance with trends and comparisons',
    icon: DocumentChartBarIcon,
  },
  {
    title: 'Care Gaps Analysis',
    description: 'Detailed analysis of care gaps across all measures and patient populations',
    icon: TableCellsIcon,
  },
  {
    title: 'Clinical Focus Reports',
    description: 'Performance reports organized by clinical focus areas (Hypertension, Diabetes, etc.)',
    icon: DocumentTextIcon,
    comingSoon: true,
  },
];

function ReportCard({ report }: { report: ReportCard }) {
  const Icon = report.icon;
  
  return (
    <div className="p-6 bg-dark-primary border border-dark-border rounded-lg">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-2">
            <h3 className="text-lg font-medium">{report.title}</h3>
            {report.comingSoon && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-dark-secondary text-dark-text-secondary">
                Coming Soon
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-dark-text-secondary">
            {report.description}
          </p>
        </div>
        <div className="ml-4">
          <Icon className="h-6 w-6 text-dark-text-secondary" />
        </div>
      </div>
      {!report.comingSoon && (
        <div className="mt-4 flex items-center space-x-4">
          <button className="btn btn-secondary">
            <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
            Download PDF
          </button>
          <button className="btn btn-secondary">
            <TableCellsIcon className="h-5 w-5 mr-2" />
            Export Excel
          </button>
        </div>
      )}
    </div>
  );
}

export default function MeasuresReportsPage() {
  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-dark-text-secondary mt-1">
            Download and export quality measure performance reports
          </p>
        </div>
        
        <div className="space-y-4">
          {reports.map((report, index) => (
            <ReportCard key={index} report={report} />
          ))}
        </div>
      </div>
    </div>
  );
}
