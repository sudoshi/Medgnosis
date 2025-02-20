"use client";

import { useState } from "react";
import {
  DocumentChartBarIcon,
  DocumentTextIcon,
  TableCellsIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";

interface ReportCard {
  title: string;
  description: string;
  icon: typeof DocumentChartBarIcon;
  comingSoon?: boolean;
}

const reports: ReportCard[] = [
  {
    title: "Quality Performance Summary",
    description:
      "Comprehensive overview of all quality measures performance with trends and comparisons",
    icon: DocumentChartBarIcon,
  },
  {
    title: "Care Gaps Analysis",
    description:
      "Detailed analysis of care gaps across all measures and patient populations",
    icon: TableCellsIcon,
  },
  {
    title: "Clinical Focus Reports",
    description:
      "Performance reports organized by clinical focus areas (Hypertension, Diabetes, etc.)",
    icon: DocumentTextIcon,
    comingSoon: true,
  },
];

function ReportCard({ report }: { report: ReportCard }) {
  const Icon = report.icon;
  const [isDownloading, setIsDownloading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      // Mock download delay
      await new Promise((resolve) => setTimeout(resolve, 2000));
      // TODO: Implement actual download logic
    } catch (error) {
      console.error("Download failed:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Mock export delay
      await new Promise((resolve) => setTimeout(resolve, 2000));
      // TODO: Implement actual export logic
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      aria-labelledby={`report-title-${report.title.toLowerCase().replace(/\s+/g, "-")}`}
      className="p-6 bg-light-primary dark:bg-dark-primary border border-light-border dark:border-dark-border rounded-lg transition-colors hover:border-accent-primary/20"
      role="article"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-2">
            <h3
              className="text-lg font-medium text-light-text-primary dark:text-dark-text-primary"
              id={`report-title-${report.title.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {report.title}
            </h3>
            {report.comingSoon && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-light-secondary dark:bg-dark-secondary text-light-text-secondary dark:text-dark-text-secondary">
                Coming Soon
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-light-text-secondary dark:text-dark-text-secondary">
            {report.description}
          </p>
        </div>
        <div className="ml-4">
          <Icon className="h-6 w-6 text-light-text-secondary dark:text-dark-text-secondary" />
        </div>
      </div>
      {!report.comingSoon && (
        <div className="mt-4 flex items-center space-x-4">
          <button
            aria-label={`Download ${report.title} as PDF`}
            className={`btn btn-secondary ${
              isDownloading ? "opacity-75 cursor-not-allowed" : ""
            }`}
            disabled={isDownloading}
            onClick={handleDownload}
          >
            <ArrowDownTrayIcon
              className={`h-5 w-5 mr-2 ${
                isDownloading ? "animate-bounce" : ""
              }`}
            />
            {isDownloading ? "Downloading..." : "Download PDF"}
          </button>
          <button
            aria-label={`Export ${report.title} to Excel`}
            className={`btn btn-secondary ${
              isExporting ? "opacity-75 cursor-not-allowed" : ""
            }`}
            disabled={isExporting}
            onClick={handleExport}
          >
            <TableCellsIcon
              className={`h-5 w-5 mr-2 ${isExporting ? "animate-bounce" : ""}`}
            />
            {isExporting ? "Exporting..." : "Export Excel"}
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
          <h1 className="text-2xl font-semibold text-light-text-primary dark:text-dark-text-primary">
            Reports
          </h1>
          <p className="text-light-text-secondary dark:text-dark-text-secondary mt-1">
            Download and export quality measure performance reports
          </p>
        </div>

        <div className="space-y-4">
          {reports.map((report) => (
            <ReportCard key={report.title} report={report} />
          ))}
        </div>
      </div>
    </div>
  );
}
