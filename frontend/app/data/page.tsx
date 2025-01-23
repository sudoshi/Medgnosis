import { useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import {
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';

interface ImportJob {
  id: number;
  type: string;
  status: 'running' | 'completed' | 'failed';
  progress: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

function ImportSection() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [recentJobs, setRecentJobs] = useState<ImportJob[]>([
    {
      id: 1,
      type: 'Synthea Data',
      status: 'completed',
      progress: 100,
      startedAt: '2024-01-22T18:30:00',
      completedAt: '2024-01-22T18:35:00',
    },
    {
      id: 2,
      type: 'Patient Records',
      status: 'failed',
      progress: 45,
      startedAt: '2024-01-22T18:00:00',
      error: 'Invalid data format',
    },
  ]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    setImporting(true);
    // Simulated import process
    setTimeout(() => {
      setImporting(false);
      setSelectedFile(null);
      setRecentJobs([
        {
          id: Date.now(),
          type: selectedFile.name,
          status: 'completed',
          progress: 100,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
        ...recentJobs,
      ]);
    }, 3000);
  };

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4">Data Import</h2>
      
      {/* Import Form */}
      <div className="p-4 border border-dashed border-dark-border rounded-lg bg-dark-primary">
        <div className="flex items-center justify-center">
          <label className="flex flex-col items-center cursor-pointer">
            <ArrowUpTrayIcon className="h-12 w-12 text-dark-text-secondary" />
            <span className="mt-2 text-sm text-dark-text-secondary">
              {selectedFile ? selectedFile.name : 'Drop files here or click to upload'}
            </span>
            <input
              type="file"
              className="hidden"
              onChange={handleFileChange}
              accept=".csv,.json"
            />
          </label>
        </div>
      </div>

      {/* Import Options */}
      <div className="mt-4 flex items-center space-x-4">
        <button
          onClick={handleImport}
          disabled={!selectedFile || importing}
          className={`btn btn-primary ${
            importing ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {importing ? (
            <>
              <ArrowPathIcon className="h-5 w-5 mr-2 animate-spin" />
              Importing...
            </>
          ) : (
            'Start Import'
          )}
        </button>
        <button className="btn btn-secondary">
          Import from Synthea
        </button>
      </div>

      {/* Recent Jobs */}
      <div className="mt-6">
        <h3 className="text-sm font-medium text-dark-text-secondary mb-3">
          Recent Jobs
        </h3>
        <div className="space-y-3">
          {recentJobs.map((job) => (
            <div
              key={job.id}
              className="flex items-center justify-between p-3 rounded-lg bg-dark-primary"
            >
              <div className="flex items-center space-x-3">
                <DocumentTextIcon className="h-5 w-5 text-dark-text-secondary" />
                <div>
                  <p className="font-medium">{job.type}</p>
                  <p className="text-sm text-dark-text-secondary">
                    Started: {new Date(job.startedAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <div className="text-right">
                  <div
                    className={`text-sm font-medium ${
                      job.status === 'completed'
                        ? 'text-accent-success'
                        : job.status === 'failed'
                        ? 'text-accent-error'
                        : 'text-accent-primary'
                    }`}
                  >
                    {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                  </div>
                  {job.error && (
                    <p className="text-xs text-accent-error">{job.error}</p>
                  )}
                </div>
                <div className="w-24 bg-dark-secondary rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      job.status === 'completed'
                        ? 'bg-accent-success'
                        : job.status === 'failed'
                        ? 'bg-accent-error'
                        : 'bg-accent-primary'
                    }`}
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExportSection() {
  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4">Data Export</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button className="btn btn-secondary flex items-center justify-center">
          <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
          Export Patient Data
        </button>
        <button className="btn btn-secondary flex items-center justify-center">
          <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
          Export Analytics
        </button>
        <button className="btn btn-secondary flex items-center justify-center">
          <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
          Export Care Gaps
        </button>
        <button className="btn btn-secondary flex items-center justify-center">
          <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
          Export Risk Scores
        </button>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-medium text-dark-text-secondary mb-3">
          Scheduled Exports
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg bg-dark-primary">
            <div className="flex items-center space-x-3">
              <DocumentTextIcon className="h-5 w-5 text-dark-text-secondary" />
              <div>
                <p className="font-medium">Weekly Analytics Report</p>
                <p className="text-sm text-dark-text-secondary">
                  Every Monday at 00:00
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <span className="badge badge-success">Active</span>
              <button className="btn btn-secondary">Configure</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DataPage() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <ImportSection />
        <ExportSection />
      </div>
    </AdminLayout>
  );
}
